import { describe, expect, it } from 'vitest'
import { b64url, newOAuthState, pkceChallenge, randomB64url } from './oauth.js'

describe('b64url', () => {
  it('is url-safe and unpadded', () => {
    // 0xfb 0xff encodes to '+/' territory in plain base64.
    expect(b64url(new Uint8Array([0xfb, 0xef, 0xbe]))).toBe('----')
    expect(b64url(new Uint8Array([0xff]))).toBe('_w')
    expect(b64url(new Uint8Array([]))).toBe('')
  })
})

describe('randomB64url', () => {
  it('encodes nBytes of entropy into the expected length', () => {
    // 32 bytes → ceil(32*8/6) = 43 chars, no padding.
    const v = randomB64url(32)
    expect(v).toHaveLength(43)
    expect(v).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(randomB64url(32)).not.toBe(v)
  })
})

describe('pkceChallenge', () => {
  it('matches the RFC 7636 appendix B vector', async () => {
    // Verifier and its S256 challenge, straight from the RFC.
    expect(await pkceChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe(
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    )
  })
})

describe('newOAuthState', () => {
  it('prefixes the jobId so the relay can route the callback', () => {
    const state = newOAuthState('job-1')
    expect(state.startsWith('job-1~')).toBe(true)
    // The suffix is entropy: two states for the same job differ.
    expect(newOAuthState('job-1')).not.toBe(state)
    // The relay parses with split('~', 1).
    expect(state.split('~', 1)[0]).toBe('job-1')
  })
})
