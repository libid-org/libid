// First-principles correctness tests for the id_token → `jwt_email`
// circuit-input conversion.
//
// Each fixture under ./fixtures/ is INPUT-only: a synthetic RS256 JWT
// signed with a locally generated RSA-2048 key (nothing real), plus the
// JWK modulus, holder nonce, client id, chain id, and registry address.
// The tests recompute every property the circuit relies on independently
// — with `Buffer` base64url, `node:crypto` SHA-256, and plain BigInt —
// and check the conversion's output against those, not against any
// recorded output:
//
//   - the 18 little-endian 120-bit limbs of signature/modulus recompose
//     to the exact BigInts of the raw JWT signature and JWK modulus
//   - redc equals floor(2^(2·2048+6) / n) computed directly
//   - signing_input / payload_json are the actual JWT bytes, zero-padded
//     to 1280 / 768, with correct lengths
//   - every scanned offset points at the exact claim bytes in the payload
//     JSON (`"email":"…"`, `"nonce":"…"`, `"sub":"…"`, `"aud":"…"`,
//     `"iss":"https://accounts.google.com"`, `"email_verified":true`,
//     and the `"exp":` digit run)
//   - the packed Fields unpack back to the padded claim buffers
//     (62 B → 2 Fields, 31 B → 1 Field, big-endian)
//   - the two audience_hash halves recompose to the real SHA-256 of the
//     client id
//   - chain id / registry address pass through (lowercased address)
//
// The final judge that the circuit accepts these inputs is the harness's
// end-to-end Google claim run.
//
// Fixture spread: email/sub/audience at their circuit maximums, payload
// byte lengths hitting every base64url padding class (len % 3 ∈ {0,1,2}),
// signing-input lengths crossing SHA-256 block boundaries (len % 64 ∈
// {0, 55, 63, …}), a 9-digit exp, and u64::MAX chain id with an all-0xff
// registry address (plus a leading-zero-byte address in the rest).

import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { b64urlDecode, buildOidcProverInputs, parseJwt } from './circuitInputs.js'

const FIXTURES = join(__dirname, 'fixtures')

// Circuit-bound sizes (mirrored in the implementation; fixed by jwt_email).
const SIGNING_INPUT_MAX = 1280
const PAYLOAD_JSON_MAX = 768
const EMAIL_MAX = 62
const NONCE_MAX = 62
const SUB_MAX = 31
const AUDIENCE_MAX = 128
const NUM_LIMBS = 18

interface Fixture {
  name: string
  input: {
    idToken: string
    jwkN: string
    nonce: string
    clientId: string
    chainId: string
    registryAddr: string
  }
}

const fixtureFiles = readdirSync(FIXTURES).filter((f) => f.endsWith('.json'))
const loadFixture = (file: string) =>
  JSON.parse(readFileSync(join(FIXTURES, file), 'utf8')) as Fixture

const run = (fx: Fixture) =>
  buildOidcProverInputs(
    fx.input.idToken,
    fx.input.jwkN,
    fx.input.nonce,
    fx.input.clientId,
    BigInt(fx.input.chainId),
    fx.input.registryAddr,
  )

// ---- independent reference helpers (Buffer / node:crypto / BigInt) --------

/** Node's own base64url decode — independent of the implementation's. */
const refB64url = (s: string) => new Uint8Array(Buffer.from(s, 'base64url'))

const beBytesToBigInt = (bytes: Uint8Array) => {
  let acc = 0n
  for (const b of bytes) acc = (acc << 8n) | BigInt(b)
  return acc
}

/** sum(limb_i · 2^(120·i)) — recompose little-endian 120-bit limbs. */
const recomposeLimbs = (limbs: string[]) => {
  let acc = 0n
  for (let i = limbs.length - 1; i >= 0; i--) acc = (acc << 120n) | BigInt(limbs[i])
  return acc
}

/** Unpack a big-endian 31-bytes-per-Field packing back into bytes. */
const unpackFields = (fields: string[]) => {
  const out: number[] = []
  for (const f of fields) {
    let v = BigInt(f)
    const bytes = new Array<number>(31)
    for (let i = 30; i >= 0; i--) {
      bytes[i] = Number(v & 0xffn)
      v >>= 8n
    }
    expect(v).toBe(0n) // a packed Field never exceeds 31 bytes
    out.push(...bytes)
  }
  return out
}

const ascii = (s: string) => Array.from(new TextEncoder().encode(s))
const zeroPad = (bytes: number[], size: number) =>
  bytes.concat(new Array<number>(size - bytes.length).fill(0))

/** Assert `offset` points at exactly `pattern` inside the payload bytes. */
const expectAtOffset = (payload: number[], offset: string, pattern: string) => {
  const want = ascii(pattern)
  expect(payload.slice(Number(offset), Number(offset) + want.length), pattern).toEqual(want)
}

describe('buildOidcProverInputs — every transform, from first principles', () => {
  it('has the full fixture set', () => {
    expect(fixtureFiles.length).toBeGreaterThanOrEqual(14)
  })

  for (const file of fixtureFiles) {
    it(file.replace(/\.json$/, ''), async () => {
      const fx = loadFixture(file)
      const got = await run(fx)

      const [headerB64, payloadB64, sigB64] = fx.input.idToken.split('.')
      const signingInputAscii = ascii(`${headerB64}.${payloadB64}`)
      const payloadBytes = Array.from(refB64url(payloadB64))
      const claims = JSON.parse(Buffer.from(payloadB64, 'base64url').toString()) as Record<
        string,
        unknown
      >

      // -- signing input / payload: the actual JWT bytes, zero-padded --
      expect(got.signing_input).toEqual(zeroPad(signingInputAscii, SIGNING_INPUT_MAX))
      expect(got.signing_input_len).toBe(String(signingInputAscii.length))
      expect(got.header_b64_len).toBe(String(headerB64.length))
      expect(got.payload_json).toEqual(zeroPad(payloadBytes, PAYLOAD_JSON_MAX))
      expect(got.payload_json_len).toBe(String(payloadBytes.length))

      // -- scanned offsets point at the exact claim bytes --
      const email = claims.email as string
      const sub = claims.sub as string
      const exp = String(claims.exp)
      expectAtOffset(payloadBytes, got.email_offset, `"email":"${email}"`)
      expectAtOffset(payloadBytes, got.nonce_offset, `"nonce":"${fx.input.nonce}"`)
      expectAtOffset(payloadBytes, got.sub_offset, `"sub":"${sub}"`)
      expectAtOffset(payloadBytes, got.aud_offset, `"aud":"${fx.input.clientId}"`)
      expectAtOffset(payloadBytes, got.email_verified_offset, '"email_verified":true')
      expectAtOffset(payloadBytes, got.iss_offset, '"iss":"https://accounts.google.com"')
      expectAtOffset(payloadBytes, got.exp_offset, `"exp":${exp}`)
      expect(got.exp_len).toBe(String(exp.length))
      expect(got.exp).toBe(exp)

      // -- claim byte buffers: claim bytes then zeros, with byte lengths --
      expect(got.email_bytes).toEqual(zeroPad(ascii(email), EMAIL_MAX))
      expect(got.email_len).toBe(String(ascii(email).length))
      expect(got.nonce_bytes).toEqual(zeroPad(ascii(fx.input.nonce), NONCE_MAX))
      expect(got.nonce_len).toBe(String(ascii(fx.input.nonce).length))
      expect(got.sub_bytes).toEqual(zeroPad(ascii(sub), SUB_MAX))
      expect(got.sub_len).toBe(String(ascii(sub).length))
      expect(got.audience_bytes).toEqual(zeroPad(ascii(fx.input.clientId), AUDIENCE_MAX))
      expect(got.audience_len).toBe(String(ascii(fx.input.clientId).length))

      // -- limb decomposition recomposes to the raw big integers --
      const n = beBytesToBigInt(refB64url(fx.input.jwkN))
      const sig = beBytesToBigInt(refB64url(sigB64))
      expect(got.modulus).toHaveLength(NUM_LIMBS)
      expect(got.signature).toHaveLength(NUM_LIMBS)
      expect(got.redc).toHaveLength(NUM_LIMBS)
      for (const limb of [...got.modulus, ...got.signature, ...got.redc]) {
        expect(BigInt(limb)).toBeLessThan(1n << 120n)
      }
      expect(recomposeLimbs(got.modulus)).toBe(n)
      expect(recomposeLimbs(got.signature)).toBe(sig)

      // -- Barrett parameter, computed directly --
      expect(recomposeLimbs(got.redc)).toBe((1n << BigInt(2 * 2048 + 6)) / n)

      // -- packed Fields unpack back to the padded claim buffers --
      expect(got.email_packed).toHaveLength(2)
      expect(unpackFields(got.email_packed)).toEqual(got.email_bytes)
      expect(got.nonce_packed).toHaveLength(2)
      expect(unpackFields(got.nonce_packed)).toEqual(got.nonce_bytes)
      expect(got.sub_packed).toHaveLength(1)
      expect(unpackFields(got.sub_packed)).toEqual(got.sub_bytes)

      // -- audience hash halves recompose to the real SHA-256(client_id) --
      const digest = createHash('sha256').update(fx.input.clientId, 'utf8').digest()
      expect(got.audience_hash).toHaveLength(2)
      expect((BigInt(got.audience_hash[0]) << 128n) | BigInt(got.audience_hash[1])).toBe(
        beBytesToBigInt(new Uint8Array(digest)),
      )

      // -- deployment binding passes through --
      expect(got.chain_id).toBe(fx.input.chainId)
      expect(got.registry_addr).toBe(fx.input.registryAddr.toLowerCase())
    })
  }
})

// ---- rejection paths ------------------------------------------------------

const b64urlJson = (o: Record<string, unknown>) =>
  Buffer.from(JSON.stringify(o)).toString('base64url')

/** Unsigned synthetic token — parseJwt never verifies the signature, it
 *  only requires 256 bytes of it. */
const makeToken = (
  header: Record<string, unknown>,
  payload: Record<string, unknown>,
  sigLen = 256,
) => `${b64urlJson(header)}.${b64urlJson(payload)}.${Buffer.alloc(sigLen, 7).toString('base64url')}`

const NONCE = '0x1111111111111111111111111111111111111111'
const CLIENT = 'client-id.apps.googleusercontent.com'
const goodPayload = {
  iss: 'https://accounts.google.com',
  aud: CLIENT,
  sub: '123456789012345678901',
  email: 'alice@example.com',
  email_verified: true,
  nonce: NONCE,
  exp: 4102444800,
}
const goodHeader = { alg: 'RS256', kid: 'k1' }

describe('parseJwt rejects everything the circuit could not prove', () => {
  const cases: Array<[string, () => string, RegExp]> = [
    ['malformed token', () => 'not.a-jwt', /3 parts/],
    ['non-RS256 alg', () => makeToken({ alg: 'ES256', kid: 'k1' }, goodPayload), /RS256/],
    ['missing kid', () => makeToken({ alg: 'RS256' }, goodPayload), /kid/],
    ['missing email', () => makeToken(goodHeader, { ...goodPayload, email: undefined }), /email/],
    [
      'email_verified false',
      () => makeToken(goodHeader, { ...goodPayload, email_verified: false }),
      /email_verified is false/,
    ],
    [
      'nonce mismatch',
      () => makeToken(goodHeader, { ...goodPayload, nonce: '0x' + '2'.repeat(40) }),
      /nonce mismatch/,
    ],
    [
      'sub too long',
      () => makeToken(goodHeader, { ...goodPayload, sub: '9'.repeat(32) }),
      /SUB_MAX/,
    ],
    [
      'audience mismatch',
      () => makeToken(goodHeader, { ...goodPayload, aud: 'someone-else' }),
      /audience mismatch/,
    ],
    ['short signature', () => makeToken(goodHeader, goodPayload, 128), /256 bytes/],
  ]
  for (const [name, token, err] of cases) {
    it(name, () => {
      expect(() => parseJwt(token(), NONCE, CLIENT)).toThrow(err)
    })
  }

  it('accepts the good token', () => {
    const jwt = parseJwt(makeToken(goodHeader, goodPayload), NONCE, CLIENT)
    expect(jwt.email).toBe('alice@example.com')
    expect(jwt.exp).toBe(4102444800n)
  })
})

describe('buildOidcProverInputs input validation', () => {
  const token = makeToken(goodHeader, goodPayload)
  it('rejects a modulus that is not ~2048 bits', async () => {
    await expect(
      buildOidcProverInputs(token, 'AQAB', NONCE, CLIENT, 1n, '0x' + '1'.repeat(40)),
    ).rejects.toThrow(/not ~2048 bits/)
  })
  it('rejects a chain id beyond u64', async () => {
    const n2048 = Buffer.alloc(256, 0xff).toString('base64url')
    await expect(
      buildOidcProverInputs(token, n2048, NONCE, CLIENT, 1n << 64n, '0x' + '1'.repeat(40)),
    ).rejects.toThrow(/u64/)
  })
  it('rejects a bad registry address', async () => {
    const n2048 = Buffer.alloc(256, 0xff).toString('base64url')
    await expect(buildOidcProverInputs(token, n2048, NONCE, CLIENT, 1n, '0x1234')).rejects.toThrow(
      /20 bytes/,
    )
  })
})

describe('b64urlDecode is strict', () => {
  it('decodes canonical input', () => {
    expect(Array.from(b64urlDecode('AQAB'))).toEqual([1, 0, 1])
    expect(Array.from(b64urlDecode('_-8'))).toEqual([0xff, 0xef])
    expect(Array.from(b64urlDecode(''))).toEqual([])
  })
  it('rejects padding, bad chars, bad length, non-canonical trailing bits', () => {
    expect(() => b64urlDecode('AQ==')).toThrow()
    expect(() => b64urlDecode('A+AB')).toThrow()
    expect(() => b64urlDecode('AAAAA')).toThrow()
    expect(() => b64urlDecode('_-9')).toThrow() // trailing bits set
  })
})
