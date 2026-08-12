import { sha256, toBytes } from 'viem'
import { describe, expect, it } from 'vitest'
import {
  BLINDER_LEN,
  buildXTokenWitness,
  computeBearerHash,
  MAX_BEARER_LEN,
  witnessToNoirInputMap,
} from './witness-token.js'

const bearer = new TextEncoder().encode('AAAAtoken-bytes-here')
const blinderA = new Uint8Array(BLINDER_LEN).fill(1)
const blinderB = new Uint8Array(BLINDER_LEN).fill(2)
const wallet = new Uint8Array(20).fill(0xaa)
const session = new Uint8Array(20).fill(0xbb)

describe('computeBearerHash', () => {
  it('is SHA256(bearer[0..len] || blinder), ignoring the padding', () => {
    const padded = new Uint8Array(MAX_BEARER_LEN)
    padded.set(bearer)
    const expected = toBytes(sha256(new Uint8Array([...bearer, ...blinderA])))
    expect(computeBearerHash(padded, bearer.length, blinderA)).toEqual(expected)
  })

  it('rejects a wrong-size blinder', () => {
    expect(() => computeBearerHash(bearer, bearer.length, new Uint8Array(8))).toThrow(
      /blinder must be/,
    )
  })
})

describe('buildXTokenWitness', () => {
  it('pads the bearer and derives both commit hashes + the nullifier', () => {
    const w = buildXTokenWitness({
      bearer,
      blinderToken: blinderA,
      blinderMe: blinderB,
      walletAddress: wallet,
      sessionAddr: session,
    })
    expect(w.bearer).toHaveLength(MAX_BEARER_LEN)
    expect(Array.from(w.bearer.slice(0, bearer.length))).toEqual(Array.from(bearer))
    expect(w.bearerLen).toBe(bearer.length)
    // The two blinders produce two DIFFERENT public hashes of the same
    // private bearer — that is the dual-blinder binding the circuit proves.
    expect(w.bearerHashToken).toEqual(computeBearerHash(w.bearer, w.bearerLen, blinderA))
    expect(w.bearerHashMe).toEqual(computeBearerHash(w.bearer, w.bearerLen, blinderB))
    expect(w.bearerHashToken).not.toEqual(w.bearerHashMe)
    expect(w.nullifier).toHaveLength(32)
  })

  it('rejects oversized bearers and wrong-size addresses', () => {
    expect(() =>
      buildXTokenWitness({
        bearer: new Uint8Array(MAX_BEARER_LEN + 1),
        blinderToken: blinderA,
        blinderMe: blinderB,
        walletAddress: wallet,
        sessionAddr: session,
      }),
    ).toThrow(/> cap/)
    expect(() =>
      buildXTokenWitness({
        bearer,
        blinderToken: blinderA,
        blinderMe: blinderB,
        walletAddress: new Uint8Array(19),
        sessionAddr: session,
      }),
    ).toThrow(/walletAddress/)
  })
})

describe('witnessToNoirInputMap', () => {
  it('mirrors the circuit main params as decimal-string byte arrays', () => {
    const w = buildXTokenWitness({
      bearer,
      blinderToken: blinderA,
      blinderMe: blinderB,
      walletAddress: wallet,
      sessionAddr: session,
    })
    const map = witnessToNoirInputMap(w) as Record<string, string | string[]>
    expect(Object.keys(map).sort()).toEqual([
      'bearer',
      'bearer_hash_me',
      'bearer_hash_token',
      'bearer_len',
      'blinder_me',
      'blinder_token',
      'nullifier',
      'session_addr',
      'wallet_address',
    ])
    expect(map.bearer_len).toBe(String(bearer.length))
    expect(map.bearer).toHaveLength(MAX_BEARER_LEN)
    expect((map.bearer as string[])[0]).toBe(String(bearer[0]))
    expect(map.wallet_address).toHaveLength(20)
  })
})
