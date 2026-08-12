import { afterEach, describe, expect, it, vi } from 'vitest'
import { clientLinkSupported, LINK_CHANNEL, parseLinkMessage } from './channel.js'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('LINK_CHANNEL', () => {
  it('is the libid channel, not the product it was extracted from', () => {
    expect(LINK_CHANNEL).toBe('libid_link')
  })
})

describe('clientLinkSupported', () => {
  it('requires BroadcastChannel and PKCE-challenge digest', () => {
    const digest = vi.fn()

    vi.stubGlobal('BroadcastChannel', class {})
    vi.stubGlobal('crypto', { subtle: { digest } })
    expect(clientLinkSupported()).toBe(true)

    vi.stubGlobal('crypto', {})
    expect(clientLinkSupported()).toBe(false)

    vi.stubGlobal('crypto', { subtle: { digest } })
    vi.stubGlobal('BroadcastChannel', undefined)
    expect(clientLinkSupported()).toBe(false)
  })
})

describe('parseLinkMessage', () => {
  it('accepts well-formed messages and strips unknown fields', () => {
    // The wire carries no platform (the parent knows which flow a jobId
    // belongs to): a stale sender's platform field is stripped like any
    // other junk.
    expect(
      parseLinkMessage({
        kind: 'oauth_callback',
        jobId: 'j',
        platform: 'gmail',
        code: 'c',
        state: 'j~r',
        evil: 'x',
      }),
    ).toEqual({ kind: 'oauth_callback', jobId: 'j', code: 'c', state: 'j~r' })

    expect(
      parseLinkMessage({ kind: 'oauth_callback', jobId: 'j', code: 'c', state: 'j~r' }),
    ).toEqual({
      kind: 'oauth_callback',
      jobId: 'j',
      code: 'c',
      state: 'j~r',
    })

    expect(
      parseLinkMessage({
        kind: 'oauth_callback',
        jobId: 'j',
        platform: 'gmail',
        idToken: 'jwt',
        state: 'j~r',
      }),
    ).toEqual({ kind: 'oauth_callback', jobId: 'j', idToken: 'jwt', state: 'j~r' })

    expect(parseLinkMessage({ kind: 'failed', jobId: 'j', platform: 'x', error: 'boom' })).toEqual({
      kind: 'failed',
      jobId: 'j',
      error: 'boom',
    })

    // ack carries only jobId — junk is stripped.
    expect(parseLinkMessage({ kind: 'ack', jobId: 'j', extra: 'dropped' })).toEqual({
      kind: 'ack',
      jobId: 'j',
    })
  })

  it('rejects malformed envelopes', () => {
    expect(parseLinkMessage(null)).toBeNull()
    expect(parseLinkMessage('proof')).toBeNull()
    expect(parseLinkMessage({})).toBeNull()
    // no state
    expect(parseLinkMessage({ kind: 'oauth_callback', jobId: 'j', code: 'c' })).toBeNull()
    // neither credential
    expect(parseLinkMessage({ kind: 'oauth_callback', jobId: 'j', state: 'j~r' })).toBeNull()
    // both credentials
    expect(
      parseLinkMessage({
        kind: 'oauth_callback',
        jobId: 'j',
        state: 'j~r',
        code: 'c',
        idToken: 'jwt',
      }),
    ).toBeNull()
    // no jobId
    expect(parseLinkMessage({ kind: 'ack' })).toBeNull()
    expect(parseLinkMessage({ kind: 'nonsense', jobId: 'j' })).toBeNull()
    expect(parseLinkMessage({ kind: 'failed', error: 'e' })).toBeNull()
  })
})
