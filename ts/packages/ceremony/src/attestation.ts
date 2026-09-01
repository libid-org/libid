/// The attestation format of ceremony-common section 9.1.
///
/// This mirrors `solidity/contracts/ceremony/CeremonyAttestation.sol` and
/// `libid-rs/crates/libid-ceremony` byte for byte. The browser needs the
/// decoder as much as the chain does: REQ-PLAT-44 has the Canonical Runtime
/// verify the token-exchange attestation locally, against the profile's pinned
/// notary key and this format, before it spends a `/user` session on it.
///
/// Every boundary is derivable from the bytes before it, so decoding is one
/// forward pass and two different attestations cannot share one preimage by
/// shifting a boundary (REQ-COMMON-48).

import { type Hex, keccak256, toHex } from 'viem'

/// The authority, `createdAt`, and the two transcript lengths.
export const HEADER_LEN = 48

/// Offsets are zero-based into that direction's complete transcript, `start`
/// inclusive and `end` exclusive.
export interface RevealedRange {
  start: number
  end: number
  bytes: Uint8Array
}

/// A hidden range, carried as its offsets and a blinded commitment. The
/// plaintext of a committed range never appears in the attested data.
export interface RangeCommitment {
  start: number
  end: number
  commitment: Uint8Array
}

export interface DirectionBlock {
  revealed: RevealedRange[]
  commitments: RangeCommitment[]
}

/// The signed bytes.
///
/// The attested data describes the observed session and says nothing about
/// where the evidence will be spent: no chain, no verifier identity.
export interface AttestedData {
  authorityId: Uint8Array
  createdAt: bigint
  sentTranscriptLength: number
  recvTranscriptLength: number
  sent: DirectionBlock
  received: DirectionBlock
}

export class AttestationError extends Error {}

/// Derive a 32-byte tag from a libID-namespaced ASCII string.
export function tag(namespaced: string): Uint8Array {
  return hexToBytes(keccak256(new TextEncoder().encode(namespaced)))
}

function hexToBytes(value: Hex): Uint8Array {
  const body = value.slice(2)
  const out = new Uint8Array(body.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(body.slice(i * 2, i * 2 + 2), 16)
  return out
}

class Writer {
  private parts: Uint8Array[] = []
  push(bytes: Uint8Array) {
    this.parts.push(bytes)
  }
  uint(value: number | bigint, width: number) {
    const out = new Uint8Array(width)
    let v = BigInt(value)
    for (let i = width - 1; i >= 0; i--) {
      out[i] = Number(v & 0xffn)
      v >>= 8n
    }
    if (v !== 0n) throw new AttestationError(`value does not fit ${width} bytes`)
    this.parts.push(out)
  }
  finish(): Uint8Array {
    const total = this.parts.reduce((n, p) => n + p.length, 0)
    const out = new Uint8Array(total)
    let at = 0
    for (const p of this.parts) {
      out.set(p, at)
      at += p.length
    }
    return out
  }
}

class Reader {
  constructor(
    private readonly bytes: Uint8Array,
    public at = 0,
  ) {}
  take(n: number, field: string): Uint8Array {
    if (n < 0 || this.at + n > this.bytes.length) {
      throw new AttestationError(`attested data ends inside the ${field} field`)
    }
    const out = this.bytes.subarray(this.at, this.at + n)
    this.at += n
    return out
  }
  uint(width: number, field: string): number {
    const raw = this.take(width, field)
    let out = 0
    for (const b of raw) out = out * 256 + b
    return out
  }
  bigUint(width: number, field: string): bigint {
    const raw = this.take(width, field)
    let out = 0n
    for (const b of raw) out = (out << 8n) | BigInt(b)
    return out
  }
}

function checkSpan(
  direction: string,
  kind: string,
  start: number,
  end: number,
  length: number,
  previousEnd: number,
): void {
  if (end <= start)
    throw new AttestationError(`${kind} of the ${direction} direction is empty at ${start}`)
  if (start < previousEnd) {
    throw new AttestationError(
      `${kind} of the ${direction} direction starts at ${start}, behind the previous end ${previousEnd}`,
    )
  }
  if (end > length) {
    throw new AttestationError(
      `${kind} of the ${direction} direction ends at ${end}, past the signed transcript length ${length}`,
    )
  }
}

/// Reject a shape the Platform Verifier must refuse: ranges out of order,
/// overlapping, empty, or ending past the signed transcript length
/// (REQ-COMMON-59, REQ-COMMON-60).
function validateDirection(block: DirectionBlock, direction: string, length: number): void {
  let previousEnd = 0
  for (const range of block.revealed) {
    checkSpan(direction, 'revealed range', range.start, range.end, length, previousEnd)
    if (range.bytes.length !== range.end - range.start) {
      throw new AttestationError(
        `revealed range ${range.start}..${range.end} of the ${direction} direction carries ${range.bytes.length} bytes`,
      )
    }
    previousEnd = range.end
  }

  previousEnd = 0
  for (const commitment of block.commitments) {
    checkSpan(direction, 'commitment', commitment.start, commitment.end, length, previousEnd)
    previousEnd = commitment.end
    if (commitment.commitment.length !== 32) {
      throw new AttestationError(`a commitment of the ${direction} direction is not 32 bytes`)
    }
    for (const range of block.revealed) {
      if (commitment.start < range.end && range.start < commitment.end) {
        throw new AttestationError(
          `a commitment of the ${direction} direction overlaps a revealed range at ${commitment.start}..${commitment.end}`,
        )
      }
    }
  }
}

/// Require the revealed ranges and commitments of one direction to tile
/// `[0, length)` exactly, with no gap and no overlap (REQ-COMMON-35).
///
/// Only for a direction whose profile demands exact coverage. The rule is
/// conditional: REQ-COMMON-43 withholds it from a credential committed in a
/// request body, which is GitHub's `client_secret`, so `validate` does not
/// apply it and a caller asks for it where the profile does.
///
/// A gap is where a prover hides bytes. Exact coverage leaves the committed
/// range as the only region the verifier cannot read.
export function requireExactCoverage(
  block: DirectionBlock,
  direction: string,
  length: number,
): void {
  const spans: Array<[number, number]> = [
    ...block.revealed.map((r): [number, number] => [r.start, r.end]),
    ...block.commitments.map((c): [number, number] => [c.start, c.end]),
  ].sort((a, b) => a[0] - b[0])

  let at = 0
  for (const [start, end] of spans) {
    // Overlap is `validate`'s job, but a caller may build a block by hand.
    if (start < at) {
      throw new AttestationError(`spans of the ${direction} direction overlap at ${start}`)
    }
    if (start !== at) {
      throw new AttestationError(
        `transcript bytes ${at}..${start} of the ${direction} direction are covered by nothing`,
      )
    }
    at = end
  }
  if (at !== length) {
    throw new AttestationError(
      `transcript bytes ${at}..${length} of the ${direction} direction are covered by nothing`,
    )
  }
}

/// `\r\nauthorization: Bearer ` — the raw bytes REQ-COMMON-40 requires
/// immediately before the committed range.
export const BEARER_PREFIX = '\r\nauthorization: Bearer '
/// And immediately after it.
export const BEARER_SUFFIX = '\r\n'
/// The normalized, line-anchored needle REQ-COMMON-39 counts.
export const AUTHORIZATION_NEEDLE = '\r\nauthorization:bearer'

const ascii = (b: Uint8Array) => Array.from(b, (c) => String.fromCharCode(c)).join('')

/// Lowercase ASCII and drop every space and horizontal tab, keeping CR and LF
/// (REQ-COMMON-39). Field names and the scheme token are case-insensitive and
/// the colon admits whitespace, so a literal search over raw bytes is evadable.
function normalizeHeaderBytes(raw: Uint8Array): string {
  let out = ''
  for (const b of raw) {
    if (b === 0x20 || b === 0x09) continue
    out += String.fromCharCode(b >= 0x41 && b <= 0x5a ? b + 0x20 : b)
  }
  return out
}

function countNeedle(haystack: string): number {
  let count = 0
  for (
    let i = haystack.indexOf(AUTHORIZATION_NEEDLE);
    i !== -1;
    i = haystack.indexOf(AUTHORIZATION_NEEDLE, i + 1)
  ) {
    count++
  }
  return count
}

/// Read `[from, to)` of the transcript out of the revealed ranges, or `null` if
/// any byte of it is not revealed.
function revealedSlice(block: DirectionBlock, from: number, to: number): string | null {
  let out = ''
  let at = from
  while (at < to) {
    const range = block.revealed.find((r) => r.start <= at && at < r.end)
    if (!range) return null
    const offset = at - range.start
    const take = Math.min(range.bytes.length - offset, to - at)
    out += ascii(range.bytes.subarray(offset, offset + take))
    at += take
  }
  return out
}

/// Every check REQ-COMMON-35, -39 and -40 require of an identity-session
/// request that commits a credential in an HTTP `Authorization` header.
///
/// At launch that is X's `/2/users/me` and GitHub's `/user`, and nothing else:
/// REQ-COMMON-43 forbids applying these to a credential committed in a request
/// body, which is GitHub's `client_secret`.
///
/// The three are one call because they are one property, and two are worthless
/// alone. The uniqueness scan counts the needle across REVEALED bytes only, so
/// a byte covered by nothing is a byte it never reads: without coverage a
/// prover hides a second authorization header in a gap and the count stays at
/// one.
///
/// The chain runs this too. Here it lets the runtime fail before it spends a
/// submission, and nothing on chain depends on that repeat.
export function requireBearerHeaderRequest(block: DirectionBlock, length: number): RangeCommitment {
  if (block.commitments.length !== 1) {
    throw new AttestationError(
      `the direction holds ${block.commitments.length} commitments, not one`,
    )
  }
  const commitment = block.commitments[0]!

  requireExactCoverage(block, 'sent', length)

  // Obsolete line folding is illegal in HTTP/1.1 and defeats the needle:
  // `authorization:\r\n Bearer x` normalizes to `authorization:\r\nbearer`,
  // because normalization strips the space but keeps the CRLF the fold added.
  const revealed = block.revealed.map((r) => ascii(r.bytes)).join('')
  for (let i = 0; i + 2 < revealed.length; i++) {
    if (
      revealed[i] === '\r' &&
      revealed[i + 1] === '\n' &&
      (revealed[i + 2] === ' ' || revealed[i + 2] === '\t')
    ) {
      throw new AttestationError(`the revealed bytes carry an obsolete line fold at ${i}`)
    }
  }

  // Every LF must be part of a CRLF. Otherwise
  // `...\nauthorization: Bearer <victim>\r\n` starts a header line the
  // CRLF-anchored needle never counts, while a lenient platform parser honours
  // it.
  for (let i = 0; i < revealed.length; i++) {
    if (revealed[i] === '\n' && (i === 0 || revealed[i - 1] !== '\r')) {
      throw new AttestationError(`the revealed bytes carry a bare line feed at ${i}`)
    }
  }

  // Counted over the CONCATENATION, not per range. Per range was wrong in the
  // unsafe direction: the prover picks where the reveals are cut, so cutting
  // one through a second `\r\nauthorization:` makes neither half contain the
  // needle. A seam can only over-count, which fails closed.
  const joined = new Uint8Array(block.revealed.reduce((n, r) => n + r.bytes.length, 0))
  let at = 0
  for (const r of block.revealed) {
    joined.set(r.bytes, at)
    at += r.bytes.length
  }
  const count = countNeedle(normalizeHeaderBytes(joined))
  if (count !== 1) {
    throw new AttestationError(
      `the revealed bytes hold ${count} authorization header lines, not one`,
    )
  }

  // Framing, on RAW bytes at known offsets.
  const before =
    commitment.start >= BEARER_PREFIX.length
      ? revealedSlice(block, commitment.start - BEARER_PREFIX.length, commitment.start)
      : null
  const after = revealedSlice(block, commitment.end, commitment.end + BEARER_SUFFIX.length)
  if (before !== BEARER_PREFIX || after !== BEARER_SUFFIX) {
    throw new AttestationError('the committed range is not framed by an authorization header line')
  }

  return commitment
}

/// The one commitment framed by exactly these revealed bytes.
///
/// For a direction that is NOT exactly covered, where several ranges are hidden
/// and only the anchors around one of them are revealed. The token response is
/// that case: the bearer is committed and every other byte is too, so without
/// the anchors the committed range is indistinguishable from a `refresh_token`
/// value (REQ-PLAT-57, REQ-PLAT-58).
///
/// The chain runs this in `_tokenSession`. A runtime that skips it locally
/// finds out by losing two Notary Fees.
export function requireFramedCommitment(
  block: DirectionBlock,
  prefix: string,
  suffix: string,
): RangeCommitment {
  let found: RangeCommitment | null = null
  for (const commitment of block.commitments) {
    const before =
      commitment.start >= prefix.length
        ? revealedSlice(block, commitment.start - prefix.length, commitment.start)
        : null
    if (before !== prefix) continue
    if (revealedSlice(block, commitment.end, commitment.end + suffix.length) !== suffix) continue
    // Two framed commitments frame nothing: the anchors must name one range.
    if (found !== null) {
      throw new AttestationError('more than one commitment is framed by those bytes')
    }
    found = commitment
  }
  if (found === null) {
    throw new AttestationError('no commitment is framed by those bytes')
  }
  return found
}

export function validate(attested: AttestedData): void {
  validateDirection(attested.sent, 'sent', attested.sentTranscriptLength)
  validateDirection(attested.received, 'received', attested.recvTranscriptLength)
}

function requireTag(value: Uint8Array, field: string): Uint8Array {
  if (value.length !== 32) throw new AttestationError(`${field} must be 32 bytes`)
  return value
}

/// Serialize exactly the byte concatenation of section 9.1.
export function encodeAttestedData(attested: AttestedData): Uint8Array {
  validate(attested)
  const w = new Writer()
  w.push(requireTag(attested.authorityId, 'authorityId'))
  w.uint(attested.createdAt, 8)
  w.uint(attested.sentTranscriptLength, 4)
  w.uint(attested.recvTranscriptLength, 4)
  for (const block of [attested.sent, attested.received]) {
    w.uint(block.revealed.length, 8)
    for (const range of block.revealed) {
      w.uint(range.start, 4)
      // The range's length is its bytes; `end` is arithmetic, never encoded.
      w.uint(range.bytes.length, 8)
      w.push(range.bytes)
    }
    w.uint(block.commitments.length, 8)
    for (const commitment of block.commitments) {
      w.uint(commitment.start, 4)
      w.uint(commitment.end, 4)
      w.push(commitment.commitment)
    }
  }
  return w.finish()
}

function decodeDirection(r: Reader): DirectionBlock {
  const revealedCount = r.uint(8, 'revealed range count')
  const revealed: RevealedRange[] = []
  for (let i = 0; i < revealedCount; i++) {
    const start = r.uint(4, 'revealed range start')
    // The range's length is its bytes. There is no separate `end` to disagree
    // with it, so `end` here is arithmetic rather than a claim.
    const len = r.uint(8, 'revealed range length')
    revealed.push({ start, end: start + len, bytes: r.take(len, 'revealed range bytes') })
  }

  const commitmentCount = r.uint(8, 'commitment count')
  const commitments: RangeCommitment[] = []
  for (let i = 0; i < commitmentCount; i++) {
    commitments.push({
      start: r.uint(4, 'commitment start'),
      end: r.uint(4, 'commitment end'),
      commitment: r.take(32, 'commitment value'),
    })
  }
  return { revealed, commitments }
}

/// Parse and validate. Trailing bytes are refused: the layout accounts for
/// every byte, so a suffix is a second message hiding behind the first.
export function decodeAttestedData(bytes: Uint8Array): AttestedData {
  const r = new Reader(bytes)
  const attested: AttestedData = {
    authorityId: r.take(32, 'authorityId'),
    createdAt: r.bigUint(8, 'createdAt'),
    sentTranscriptLength: r.uint(4, 'sentTranscriptLength'),
    recvTranscriptLength: r.uint(4, 'recvTranscriptLength'),
    sent: { revealed: [], commitments: [] },
    received: { revealed: [], commitments: [] },
  }
  attested.sent = decodeDirection(r)
  attested.received = decodeDirection(r)
  if (r.at !== bytes.length) {
    throw new AttestationError(
      `${bytes.length - r.at} bytes remain after the received direction block`,
    )
  }
  validate(attested)
  return attested
}

/// `keccak256(attestedData)` — the only preimage the notary signs.
export function attestationDigest(attested: AttestedData): Hex {
  return keccak256(toHex(encodeAttestedData(attested)))
}
