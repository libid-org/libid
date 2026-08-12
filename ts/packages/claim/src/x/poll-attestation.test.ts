import { describe, expect, it } from 'vitest'
import {
  pollTokenAttestation,
  pollMeAttestation,
  type TokenAttestationWire,
  type MeAttestationWire,
} from './poll-attestation.js'

function mkTokenResponse(body: Partial<TokenAttestationWire> = {}): TokenAttestationWire {
  return {
    bearer_hash: Array.from({ length: 32 }, (_, i) => i),
    bearer_range_start: 0,
    bearer_range_end: 32,
    sent_revealed: [0x61, 0x62, 0x63],
    timestamp: 1_700_000_000,
    notary_signature: Array.from({ length: 65 }, () => 0x42),
    ...body,
  }
}

function mkMeResponse(body: Partial<MeAttestationWire> = {}): MeAttestationWire {
  return {
    bearer_hash: Array.from({ length: 32 }, (_, i) => i),
    bearer_range_start: 64,
    bearer_range_end: 96,
    sent_revealed: [0x47, 0x45, 0x54],
    sent_prefix_end: 64,
    sent_suffix_end: 132,
    recv_revealed: [0x7b, 0x7d],
    handle: 'alice',
    user_id: '12345',
    session_addr: '0x000000000000000000000000000000000000beef',
    timestamp: 1_700_000_000,
    notary_signature: Array.from({ length: 65 }, () => 0x42),
    ...body,
  }
}

describe('pollTokenAttestation', () => {
  it('returns attestation on first 200 OK', async () => {
    const wire = mkTokenResponse()
    let calls = 0
    const result = await pollTokenAttestation('http://notary', 'sid', {
      fetchImpl: async (url) => {
        calls++
        expect(url).toContain('session_type=token')
        expect(url).toContain('/zk/proxy/attestation/sid')
        return new Response(JSON.stringify(wire), { status: 200 })
      },
      sleepMs: async () => {},
    })
    expect(calls).toBe(1)
    expect(result.bearer_range_start).toBe(0)
    expect(result.notary_signature).toHaveLength(65)
  })

  it('retries on transient 5xx then succeeds', async () => {
    const wire = mkTokenResponse()
    let calls = 0
    const result = await pollTokenAttestation('http://notary', 'sid', {
      fetchImpl: async () => {
        calls++
        if (calls < 3) return new Response('', { status: 503 })
        return new Response(JSON.stringify(wire), { status: 200 })
      },
      sleepMs: async () => {},
    })
    expect(calls).toBe(3)
    expect(result.timestamp).toBe(1_700_000_000)
  })

  it('throws on 404 (session lost) without further retries', async () => {
    let calls = 0
    await expect(
      pollTokenAttestation('http://notary', 'missing-sid', {
        fetchImpl: async () => {
          calls++
          return new Response('', { status: 404 })
        },
        sleepMs: async () => {},
      }),
    ).rejects.toThrow(/Notary lost session missing-sid/)
    expect(calls).toBe(1)
  })

  it('surfaces persistent 5xx after max retries with body slice', async () => {
    let calls = 0
    await expect(
      pollTokenAttestation('http://notary', 'sid', {
        fetchImpl: async () => {
          calls++
          return new Response('upstream timeout', { status: 502 })
        },
        max5xxRetries: 2,
        sleepMs: async () => {},
      }),
    ).rejects.toThrow(/Notary attestation fetch keeps returning 502/)
    expect(calls).toBeGreaterThan(2)
  })
})

describe('pollMeAttestation', () => {
  it('URL-encodes handle + sessionAddr query params', async () => {
    const wire = mkMeResponse({ handle: 'weird name' })
    let observedUrl = ''
    const result = await pollMeAttestation(
      'http://notary',
      'sid',
      {
        handle: 'weird name',
        userId: '999',
        sessionAddr: '0x000000000000000000000000000000000000BEEF',
      },
      {
        fetchImpl: async (url) => {
          observedUrl = url as string
          return new Response(JSON.stringify(wire), { status: 200 })
        },
        sleepMs: async () => {},
      },
    )
    expect(observedUrl).toContain('session_type=me')
    expect(observedUrl).toContain('handle=weird%20name')
    expect(observedUrl).toContain('session_addr=0x000000000000000000000000000000000000BEEF')
    expect(result.handle).toBe('weird name')
  })

  it('returns me-shape attestation on 200', async () => {
    const wire = mkMeResponse()
    const result = await pollMeAttestation(
      'http://notary',
      'sid',
      {
        handle: 'alice',
        userId: '12345',
        sessionAddr: '0x000000000000000000000000000000000000beef',
      },
      {
        fetchImpl: async () => new Response(JSON.stringify(wire), { status: 200 }),
        sleepMs: async () => {},
      },
    )
    expect(result.handle).toBe('alice')
    expect(result.sent_prefix_end).toBe(64)
    expect(result.sent_suffix_end).toBe(132)
  })
})
