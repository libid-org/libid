import { describe, expect, it } from 'vitest'
import {
  AttestationError,
  type AttestedData,
  attestationDigest,
  decodeAttestedData,
  encodeAttestedData,
  HEADER_LEN,
  requireBearerHeaderRequest,
  requireFramedCommitment,
  requireExactCoverage,
  tag,
} from './attestation.js'

/// The exact bytes `libid-rs/crates/libid-ceremony` encodes and
/// `solidity/contracts/ceremony/test/CeremonyAttestation.t.sol` decodes. All
/// three carry this fixture: a divergence would have the notary sign a
/// preimage the chain rebuilds differently, deriving a key nobody trusts and
/// rejecting every genuine attestation.
const FIXTURE =
  '4930142f5283d4a8eab0d24c588f00b21213ae2a47e7ed6c1dc6a57044f1655d' +
  '0000000069800e800000003c0000002800000000000000020000000000000000' +
  '0000001461616161616161616161616161616161616161610000002800000000' +
  '0000001462626262626262626262626262626262626262620000000000000001' +
  '0000001400000028070707070707070707070707070707070707070707070707' +
  '0707070707070707000000000000000100000000000000000000000a63636363' +
  '63636363636300000000000000010000000a0000002809090909090909090909' +
  '09090909090909090909090909090909090909090909'

const FIXTURE_DIGEST = '0x48162f05bdb27b19b3544bf2aae608745861bf357bb31e07f536b6fb50e95936'

function bytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return out
}

function sample(): AttestedData {
  return {
    authorityId: tag('api.x.com'),
    createdAt: 1_770_000_000n,
    sentTranscriptLength: 60,
    recvTranscriptLength: 40,
    sent: {
      revealed: [
        { start: 0, end: 20, bytes: new Uint8Array(20).fill(0x61) },
        { start: 40, end: 60, bytes: new Uint8Array(20).fill(0x62) },
      ],
      commitments: [{ start: 20, end: 40, commitment: new Uint8Array(32).fill(7) }],
    },
    received: {
      revealed: [{ start: 0, end: 10, bytes: new Uint8Array(10).fill(0x63) }],
      commitments: [{ start: 10, end: 40, commitment: new Uint8Array(32).fill(9) }],
    },
  }
}

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')

describe('attested data', () => {
  it('agrees with the Rust encoder and the Solidity decoder', () => {
    expect(hex(encodeAttestedData(sample()))).toBe(FIXTURE)
    expect(attestationDigest(sample())).toBe(FIXTURE_DIGEST)
  })

  it('round trips', () => {
    const decoded = decodeAttestedData(bytes(FIXTURE))
    expect(hex(encodeAttestedData(decoded))).toBe(FIXTURE)
    expect(decoded.createdAt).toBe(1_770_000_000n)
    expect(decoded.sentTranscriptLength).toBe(60)
    expect(decoded.sent.revealed).toHaveLength(2)
    expect(decoded.sent.commitments).toHaveLength(1)
    expect(new TextDecoder().decode(decoded.received.revealed[0]!.bytes)).toBe('cccccccccc')
  })

  it('lays the header out in 48 bytes', () => {
    expect(HEADER_LEN).toBe(48)
  })

  it('separates the two sessions by what the notary observed', () => {
    // Nothing in the record labels which session it covers. What separates
    // them is the request line, which is a revealed range the notary recorded
    // rather than a tag it was handed.
    const token = sample()
    const first = token.sent.revealed[0]
    const line = new TextEncoder().encode('POST /2/oauth2/token ').slice(0, first.bytes.length)
    token.sent.revealed[0] = { ...first, bytes: line }
    expect(attestationDigest(token)).not.toBe(attestationDigest(sample()))
  })

  // The chain rejects both of these. A dry run that does not is worse than no
  // dry run: the runtime spends a second session on a session already lost.
  it('refuses a bare line feed in the revealed request', () => {
    const head = new TextEncoder().encode(
      'GET /2/users/me HTTP/1.1\r\nhost: api.x.com\nauthorization: Bearer VICTIM\r\nauthorization: Bearer ',
    )
    const tail = new TextEncoder().encode('\r\n\r\n')
    const start = head.length
    const end = start + 16
    expect(() =>
      requireBearerHeaderRequest(
        {
          revealed: [
            { start: 0, end: start, bytes: head },
            { start: end, end: end + tail.length, bytes: tail },
          ],
          commitments: [{ start, end, commitment: new Uint8Array(32) }],
        },
        end + tail.length,
      ),
    ).toThrow(AttestationError)
  })

  it('refuses a needle split across adjacent revealed ranges', () => {
    const enc = new TextEncoder()
    const head = enc.encode('GET /2/users/me HTTP/1.1\r\nhost: api.x.com\r\n')
    const victim = enc.encode('\r\nauthorization: Bearer VICTIMTOKENVICTIM')
    const own = enc.encode('\r\nauthorization: Bearer ')
    const tail = enc.encode('\r\nconnection: close\r\n\r\n')

    // The cut falls six bytes into the victim's needle, so neither half of the
    // pair holds a whole one.
    const a = new Uint8Array([...head, ...victim.slice(0, 6)])
    const b = new Uint8Array([...victim.slice(6), ...own])
    const bearerStart = a.length + b.length
    const bearerEnd = bearerStart + 16
    const total = bearerEnd + tail.length

    expect(() =>
      requireBearerHeaderRequest(
        {
          revealed: [
            { start: 0, end: a.length, bytes: a },
            { start: a.length, end: bearerStart, bytes: b },
            { start: bearerEnd, end: total, bytes: tail },
          ],
          commitments: [{ start: bearerStart, end: bearerEnd, commitment: new Uint8Array(32) }],
        },
        total,
      ),
    ).toThrow(AttestationError)
  })

  it('finds the one commitment framed by the given bytes', () => {
    const prefix = new TextEncoder().encode('"access_token":"')
    const suffix = new TextEncoder().encode('"')
    const start = prefix.length
    const end = start + 20
    const block = {
      revealed: [
        { start: 0, end: start, bytes: prefix },
        { start: end, end: end + 1, bytes: suffix },
      ],
      commitments: [{ start, end, commitment: new Uint8Array(32).fill(7) }],
    }
    expect(requireFramedCommitment(block, '"access_token":"', '"').start).toBe(start)
    expect(() => requireFramedCommitment(block, '"refresh_token":"', '"')).toThrow(AttestationError)
  })

  it('refuses trailing bytes', () => {
    expect(() => decodeAttestedData(bytes(FIXTURE + '00'))).toThrow(AttestationError)
  })

  it('refuses every truncation', () => {
    const full = bytes(FIXTURE)
    for (let cut = 0; cut < full.length; cut++) {
      expect(() => decodeAttestedData(full.subarray(0, cut))).toThrow(AttestationError)
    }
  })

  it('refuses a count that outruns the buffer', () => {
    const tampered = bytes(FIXTURE)
    tampered[HEADER_LEN] = 0xff
    tampered[HEADER_LEN + 1] = 0xff
    expect(() => decodeAttestedData(tampered)).toThrow(AttestationError)
  })

  it('refuses out-of-order ranges', () => {
    const a = sample()
    a.sent.revealed.reverse()
    expect(() => encodeAttestedData(a)).toThrow(/behind the previous end/)
  })

  it('refuses an empty range', () => {
    const a = sample()
    a.sent.revealed[0] = { start: 0, end: 0, bytes: new Uint8Array(0) }
    expect(() => encodeAttestedData(a)).toThrow(/is empty/)
  })

  it('refuses a range past the signed transcript length', () => {
    // The signed length is what makes bytes past the last revealed range
    // visible at all (REQ-COMMON-36).
    const a = { ...sample(), sentTranscriptLength: 50 }
    expect(() => encodeAttestedData(a)).toThrow(/past the signed transcript length/)
  })

  it('refuses a commitment overlapping a revealed range', () => {
    const a = sample()
    a.sent.commitments[0]!.start = 10
    expect(() => encodeAttestedData(a)).toThrow(/overlaps a revealed range/)
  })

  it('refuses a range whose bytes disagree with its offsets', () => {
    const a = sample()
    a.sent.revealed[0]!.bytes = new Uint8Array(19)
    expect(() => encodeAttestedData(a)).toThrow(/carries 19 bytes/)
  })

  it('accepts an exact tiling', () => {
    const a = sample()
    expect(() => requireExactCoverage(a.sent, 'sent', a.sentTranscriptLength)).not.toThrow()
  })

  it('rejects a gap, which validate accepts on purpose', () => {
    // Coverage is conditional under REQ-COMMON-43, so the shape check passes
    // and the identity-session verifier is what must refuse this.
    const a = sample()
    a.sent.commitments[0]!.start = 21
    expect(() => encodeAttestedData(a)).not.toThrow()
    expect(() => requireExactCoverage(a.sent, 'sent', a.sentTranscriptLength)).toThrow(
      /bytes 20\.\.21 .* covered by nothing/,
    )
  })

  it('rejects a trailing gap', () => {
    // Bytes past the last range are invisible without the signed length.
    const a = sample()
    expect(() => requireExactCoverage(a.sent, 'sent', 80)).toThrow(/bytes 60\.\.80/)
  })
})

describe('identity-session request', () => {
  const BEARER = 'AAAAbbbbCCCCdddd'
  const enc = (s: string) => new TextEncoder().encode(s)

  /// A real `/2/users/me` request: bearer committed, everything else revealed,
  /// tiled exactly.
  function request(extraHeader: string, bearerPrefix: string) {
    const head = `GET /2/users/me HTTP/1.1\r\naccept: application/json\r\nhost: api.x.com\r\n${extraHeader}${bearerPrefix}`
    const tail = '\r\nconnection: close\r\n\r\n'
    const start = head.length
    const end = start + BEARER.length
    const length = end + tail.length
    const block = {
      revealed: [
        { start: 0, end: start, bytes: enc(head) },
        { start: end, end: length, bytes: enc(tail) },
      ],
      commitments: [{ start, end, commitment: new Uint8Array(32).fill(5) }],
    }
    return { block, length }
  }

  const honest = () => request('', '\r\nauthorization: Bearer ')

  it('accepts an honest request', () => {
    const { block, length } = honest()
    expect(requireBearerHeaderRequest(block, length).commitment[0]).toBe(5)
  })

  it('rejects a second authorization header', () => {
    const { block, length } = request(
      'authorization: Bearer stolen\r\n',
      '\r\nauthorization: Bearer ',
    )
    expect(() => requireBearerHeaderRequest(block, length)).toThrow(/2 authorization header lines/)
  })

  it('rejects a case and whitespace evaded second header', () => {
    // A literal search over raw bytes would miss this one.
    const { block, length } = request(
      'AuThOrIzAtIoN:\tBeArEr stolen\r\n',
      '\r\nauthorization: Bearer ',
    )
    expect(() => requireBearerHeaderRequest(block, length)).toThrow(/2 authorization header lines/)
  })

  it('rejects an obsolete line fold', () => {
    // `authorization:\r\n Bearer x` normalizes to `authorization:\r\nbearer`,
    // so the needle never matches and the header is never counted.
    const { block, length } = request(
      'authorization:\r\n Bearer stolen\r\n',
      '\r\nauthorization: Bearer ',
    )
    expect(() => requireBearerHeaderRequest(block, length)).toThrow(/obsolete line fold/)
  })

  it('rejects a request with no authorization header', () => {
    const { block, length } = request('', '\r\nx-other: ')
    expect(() => requireBearerHeaderRequest(block, length)).toThrow(/0 authorization header lines/)
  })

  it('rejects a gap the scan would never read', () => {
    const { block, length } = honest()
    block.revealed[0]!.end -= 1
    block.revealed[0]!.bytes = block.revealed[0]!.bytes.subarray(
      0,
      block.revealed[0]!.bytes.length - 1,
    )
    expect(() => requireBearerHeaderRequest(block, length)).toThrow(/covered by nothing/)
  })

  it('rejects a commitment that is not the header value', () => {
    // Framing alone: the header is whole and revealed, coverage is exact, but
    // the committed range sits in `host` instead.
    const head =
      'GET /2/users/me HTTP/1.1\r\naccept: application/json\r\nauthorization: Bearer TOKEN123\r\nhost: '
    const committed = 'api.'
    const tail = 'x.com\r\nconnection: close\r\n\r\n'
    const start = head.length
    const end = start + committed.length
    const length = end + tail.length
    const block = {
      revealed: [
        { start: 0, end: start, bytes: enc(head) },
        { start: end, end: length, bytes: enc(tail) },
      ],
      commitments: [{ start, end, commitment: new Uint8Array(32).fill(5) }],
    }
    expect(() => requireBearerHeaderRequest(block, length)).toThrow(
      /not framed by an authorization header/,
    )
  })

  it('rejects more than one commitment', () => {
    const { block, length } = honest()
    block.commitments.unshift({ start: 0, end: 1, commitment: new Uint8Array(32).fill(6) })
    expect(() => requireBearerHeaderRequest(block, length)).toThrow(/2 commitments, not one/)
  })
})
