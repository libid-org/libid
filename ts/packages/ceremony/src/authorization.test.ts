import { keccak256 } from 'viem'
import { describe, expect, it } from 'vitest'
import {
  type AuthorizationPreimage,
  authorizationDigest,
  authorizationPreimage,
  base64UrlNoPad,
  chainId,
  evmChainId,
  codeChallenge,
  codeVerifier,
  operationDomain,
  PKCE_LEN,
  PREIMAGE_FIXED_LEN,
  pkceDomain,
  verifierHash,
} from './authorization.js'

/// Every expected value is transcribed from ceremony-common, not produced by
/// this module. A test that rebuilt them here would agree with any
/// implementation, including a wrong one.
const DIGEST = '0xb318fb559e16a179b853ed2853576cda16032d93b0839bb81a55135d334c0af5'
const PKCE_NONCE = `0x${'44'.repeat(32)}` as const

const VECTOR: AuthorizationPreimage = {
  operationDomain: operationDomain('libid.claim-identity'),
  platformVerifierVersion: 1,
  chainId: chainId(new TextEncoder().encode('example:1')),
  authorizationNonce: `0x${'55'.repeat(32)}`,
  transactionData: '0x00010203',
}

describe('authorization digest', () => {
  it('derives the constants the specification publishes', () => {
    expect(operationDomain('libid.claim-identity')).toBe(
      '0xcb29bed0428519ef88a3d670e8203db76e06f41aca3e684e2c63b516c9b93e1b',
    )
    expect(chainId(new TextEncoder().encode('example:1'))).toBe(
      '0x38064d82f31db40935cc75f2a0d07dcfb448d7c08e7484fc30f5de95484a4066',
    )
    expect(pkceDomain()).toBe('0x3961dfe56cd0f2d94e72a15b96df889fbb46968cdb37518830fc0077b0730a01')
  })

  /// @dev The one form an EVM chain's verifier recomputes. Deriving it any
  ///      other way builds a digest the chain disagrees with, and the
  ///      submission dies on `code_verifier` after both fees are charged.
  it('mirrors CeremonyProofVerifier.chainId for an EVM chain', () => {
    // keccak256(abi.encode(uint256(1))) -- 32 bytes, big-endian, left-padded.
    expect(evmChainId(1)).toBe(keccak256(`0x${'00'.repeat(31)}01`))
    expect(evmChainId(1n)).toBe(evmChainId(1))
    expect(() => evmChainId(-1)).toThrow(/uint256/)
  })

  it('reproduces the published preimage', () => {
    expect(authorizationPreimage(VECTOR)).toBe(
      '0xcb29bed0428519ef88a3d670e8203db76e06f41aca3e684e2c63b516c9b93e1b' +
        '0001' +
        '38064d82f31db40935cc75f2a0d07dcfb448d7c08e7484fc30f5de95484a4066' +
        '5555555555555555555555555555555555555555555555555555555555555555' +
        '00000004' +
        '00010203',
    )
  })

  it('reproduces the published digest', () => {
    expect(authorizationDigest(VECTOR)).toBe(DIGEST)
  })

  it('lays the fixed part out in 102 bytes', () => {
    const empty = authorizationPreimage({ ...VECTOR, transactionData: '0x' })
    expect((empty.length - 2) / 2).toBe(PREIMAGE_FIXED_LEN)
  })

  it('binds every field', () => {
    const base = authorizationDigest(VECTOR)
    expect(authorizationDigest({ ...VECTOR, platformVerifierVersion: 2 })).not.toBe(base)
    expect(authorizationDigest({ ...VECTOR, transactionData: '0x0001020304' })).not.toBe(base)
    expect(authorizationDigest({ ...VECTOR, authorizationNonce: `0x${'56'.repeat(32)}` })).not.toBe(
      base,
    )
    expect(
      authorizationDigest({ ...VECTOR, chainId: chainId(new TextEncoder().encode('example:2')) }),
    ).not.toBe(base)
    expect(
      authorizationDigest({ ...VECTOR, operationDomain: operationDomain('libid.other') }),
    ).not.toBe(base)
  })

  it('separates a shifted boundary with the length prefix', () => {
    expect(authorizationDigest({ ...VECTOR, transactionData: '0x0001' })).not.toBe(
      authorizationDigest({ ...VECTOR, transactionData: '0x00010000' }),
    )
  })

  it('refuses a version that does not fit two bytes', () => {
    expect(() => authorizationPreimage({ ...VECTOR, platformVerifierVersion: 0x10000 })).toThrow(
      /two bytes/,
    )
  })

  it('refuses a mis-sized fixed field', () => {
    expect(() => authorizationPreimage({ ...VECTOR, chainId: '0x1234' })).toThrow(/32 bytes/)
  })
})

describe('pkce', () => {
  it('reproduces the published triple', () => {
    expect(verifierHash(DIGEST, PKCE_NONCE)).toBe(
      '0x88c493361ea0424467046958d5cd0c50eb03ecc08ee06f02ee9875fe0219b392',
    )
    const verifier = codeVerifier(DIGEST, PKCE_NONCE)
    expect(verifier).toBe('iMSTNh6gQkRnBGlY1c0MUOsD7MCO4G8C7ph1_gIZs5I')
    expect(codeChallenge(verifier)).toBe('BhFqYIY1YnHafYOrrblUswFnjxFF97UvGjSgqugPQvA')
  })

  it('produces 43 unpadded base64url characters', () => {
    const verifier = codeVerifier(DIGEST, PKCE_NONCE)
    const challenge = codeChallenge(verifier)
    for (const value of [verifier, challenge]) {
      expect(value).toHaveLength(PKCE_LEN)
      expect(value).toMatch(/^[A-Za-z0-9_-]{43}$/)
    }
  })

  it('changes with the digest, which is the whole binding', () => {
    const other = `0x${'00'.repeat(32)}` as const
    expect(codeVerifier(DIGEST, PKCE_NONCE)).not.toBe(codeVerifier(other, PKCE_NONCE))
  })

  it('changes with the nonce, so a retry is unpredictable', () => {
    const other = `0x${'45'.repeat(32)}` as const
    expect(codeVerifier(DIGEST, PKCE_NONCE)).not.toBe(codeVerifier(DIGEST, other))
  })
})

describe('base64url', () => {
  /// RFC 4648 section 10, with `+` and `/` substituted. Covers all three tail
  /// lengths, which is where a padded encoder differs.
  it.each([
    ['', ''],
    ['f', 'Zg'],
    ['fo', 'Zm8'],
    ['foo', 'Zm9v'],
    ['foob', 'Zm9vYg'],
    ['fooba', 'Zm9vYmE'],
    ['foobar', 'Zm9vYmFy'],
  ])('encodes %o as %o', (input, expected) => {
    expect(base64UrlNoPad(new TextEncoder().encode(input))).toBe(expected)
  })

  it('uses the url alphabet, never + or /', () => {
    // 0xfb 0xff reaches index 62 and 63, which are `-` and `_` here.
    expect(base64UrlNoPad(new Uint8Array([0xfb, 0xff, 0xfe]))).toBe('-__-')
  })
})
