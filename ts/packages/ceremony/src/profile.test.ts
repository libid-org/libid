import { describe, expect, it } from 'vitest'
import {
  attestationCount,
  GITHUB_V1,
  GOOGLE_V1,
  LAUNCH_PARAMETERS,
  LAUNCH_PROFILES,
  TokenExchangeError,
  type TokenExchangeRequestV1,
  validateTokenExchangeRequest,
  validateTokenExchangeResponse,
  X_V1,
} from './profile.js'

/// Expected values computed with `cast keccak`, independently of this module.
/// The same strings live in the Rust and Solidity profiles; a disagreement
/// rejects every genuine attestation with no error that says why.
describe('profile tags', () => {
  it('pins the platform ids, and they are distinct', () => {
    expect(GOOGLE_V1.platformId).toBe(
      '0x8f2f90d8304f6eb382d037c47a041d8c8b4d18bdd8b082fa32828e016a584ca7',
    )
    expect(X_V1.platformId).toBe(
      '0x7521d1cadbcfa91eec65aa16715b94ffc1c9654ba57ea2ef1a2127bca1127a83',
    )
    expect(GITHUB_V1.platformId).toBe(
      '0x07a17bd3c7c8d7b88e93a4d9007e3bc230b0a586a434de0bed6500e9f343deb7',
    )
    expect(new Set(LAUNCH_PROFILES.map((p) => p.platformId)).size).toBe(3)
  })
})

describe('profiles', () => {
  it('counts attestations from the session list', () => {
    // Google's path stops at the Platform Verifier and costs nothing; X and
    // GitHub each pay two Notary Fees per submission.
    expect(attestationCount(GOOGLE_V1)).toBe(0)
    expect(attestationCount(X_V1)).toBe(2)
    expect(attestationCount(GITHUB_V1)).toBe(2)
  })

  it('binds the digest by exactly one method per profile', () => {
    expect(GOOGLE_V1.digestBinding).toBe('public-proof-input')
    expect(X_V1.digestBinding).toBe('revealed-code-verifier')
    expect(GITHUB_V1.digestBinding).toBe('revealed-code-verifier')
  })

  it('gives GitHub two different authorities', () => {
    // The exchange is served by github.com, the identity read by
    // api.github.com. One pinned authority per profile would be wrong.
    expect(GITHUB_V1.tokenSession?.authority).toBe('github.com')
    expect(GITHUB_V1.identitySession?.authority).toBe('api.github.com')
  })

  it('keeps every authority and path canonical', () => {
    for (const profile of LAUNCH_PROFILES) {
      for (const session of [profile.tokenSession, profile.identitySession]) {
        if (!session) continue
        expect(session.authority).toBe(session.authority.toLowerCase())
        expect(session.authority.endsWith('.')).toBe(false)
        expect(session.authority).not.toMatch(/[/:]/)
        expect(session.path.startsWith('/')).toBe(true)
        expect(session.path).not.toContain('?')
      }
    }
  })

  it('carries the published launch parameters', () => {
    expect(LAUNCH_PARAMETERS).toEqual({
      proofLifetimeX: 3600n,
      proofLifetimeGithub: 3600n,
      maxFutureAttestationSkew: 300n,
    })
  })

  it('matches the published handle parameter table', () => {
    expect(GOOGLE_V1.handle).toEqual({
      maxLength: 62,
      stripLeadingAt: false,
      isEmail: true,
      allowUnderscore: false,
      allowHyphen: false,
    })
    expect(X_V1.handle.maxLength).toBe(15)
    expect(X_V1.handle.allowUnderscore).toBe(true)
    expect(GITHUB_V1.handle.maxLength).toBe(39)
    expect(GITHUB_V1.handle.allowHyphen).toBe(true)
  })
})

describe('token exchange', () => {
  const request = (): TokenExchangeRequestV1 => ({
    schema: 1,
    code: 'abc123',
    codeVerifier: 'iMSTNh6gQkRnBGlY1c0MUOsD7MCO4G8C7ph1_gIZs5I',
  })

  it('accepts a well-formed request', () => {
    expect(() => validateTokenExchangeRequest(request())).not.toThrow()
  })

  it('accepts the verifier the specification itself publishes', () => {
    // If it did not, the service would refuse a value §7 produces.
    expect(request().codeVerifier).toHaveLength(43)
  })

  it.each([
    ['', /empty/],
    ['a'.repeat(1025), /over the bound/],
    ['ab cd', /printable ASCII/],
    ['ab\tcd', /printable ASCII/],
    ['ab\ncd', /printable ASCII/],
  ])('refuses code %o', (code, message) => {
    expect(() => validateTokenExchangeRequest({ ...request(), code })).toThrow(message)
  })

  it.each([
    'short',
    'iMSTNh6gQkRnBGlY1c0MUOsD7MCO4G8C7ph1_gIZs5', // 42
    'iMSTNh6gQkRnBGlY1c0MUOsD7MCO4G8C7ph1+gIZs5I', // base64, not base64url
    'iMSTNh6gQkRnBGlY1c0MUOsD7MCO4G8C7ph1/gIZs5I',
  ])('refuses codeVerifier %o', (codeVerifier) => {
    expect(() => validateTokenExchangeRequest({ ...request(), codeVerifier })).toThrow(
      TokenExchangeError,
    )
  })

  it('bounds the response on decoded lengths, not encoded ones', () => {
    // base64url expands by 4/3, so bounding the string would bound the wrong
    // number and admit an oversized opening.
    const opening = 'A'.repeat(Math.ceil((257 * 4) / 3))
    expect(() =>
      validateTokenExchangeResponse({
        schema: 1,
        accessToken: 'token',
        tokenAttestation: 'AAAA',
        bearerOpening: opening,
      }),
    ).toThrow(/bearerOpening/)
  })

  it('accepts a 256-byte opening, which is the bound', () => {
    // 342 characters is what 256 bytes encodes to: 85 whole groups and a
    // remainder of two, which carries one byte.
    const opening = 'A'.repeat(342)
    expect(() =>
      validateTokenExchangeResponse({
        schema: 1,
        accessToken: 'token',
        tokenAttestation: 'AAAA',
        bearerOpening: opening,
      }),
    ).not.toThrow()
  })

  // The response arrives from the network and is checked as strictly as the
  // request. Every one of these failed much later before -- inside the prover,
  // or inside a verifier decoding the attestation -- where the reason is gone.
  const goodResponse = {
    schema: 1,
    accessToken: 'gho_16C7e42F292c6912E7710c838347Ae178B4a',
    tokenAttestation: 'AAAA',
    bearerOpening: 'AAAA',
  } as const

  it('rejects an empty accessToken', () => {
    expect(() => validateTokenExchangeResponse({ ...goodResponse, accessToken: '' })).toThrow(
      /accessToken is empty/,
    )
  })

  it('rejects an accessToken outside printable ASCII', () => {
    for (const token of ['gho_ab\r\ncd', 'gho_ab cd', 'gho_ab\u00e9']) {
      expect(() => validateTokenExchangeResponse({ ...goodResponse, accessToken: token })).toThrow(
        /printable ASCII/,
      )
    }
  })

  it('rejects base64url fields outside the alphabet', () => {
    expect(() =>
      validateTokenExchangeResponse({ ...goodResponse, tokenAttestation: 'AA+/' }),
    ).toThrow(/tokenAttestation is not unpadded base64url/)
    expect(() => validateTokenExchangeResponse({ ...goodResponse, bearerOpening: 'AAA=' })).toThrow(
      /bearerOpening is not unpadded base64url/,
    )
  })

  it('rejects a base64url length no encoder produces', () => {
    // Four characters carry three bytes, so a remainder of one is unreachable.
    expect(() =>
      validateTokenExchangeResponse({ ...goodResponse, tokenAttestation: 'AAAAA' }),
    ).toThrow(/length no encoder produces/)
  })

  it('rejects empty base64url fields', () => {
    expect(() => validateTokenExchangeResponse({ ...goodResponse, bearerOpening: '' })).toThrow(
      /bearerOpening is empty/,
    )
  })
})
