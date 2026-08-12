// The bundle is only worth shipping if it is bit-for-bit the release
// artifacts and provably usable by the pinned prover:
//
//   - every asset the claim flows load is present
//   - the circuit JSONs hash to exactly what the libid-circuits release
//     manifest records
//   - copyAssets() reproduces the tree at a destination
//   - THE TOOLCHAIN TIE: the pinned @aztec/bb.js derives, from the released
//     circuits, verification keys whose sha256 equal the manifest's vk
//     hashes. The on-chain verifiers are generated from those exact vk
//     bytes, so this passing means proofs from this bb.js verify on-chain.
//     Bump bb.js without recutting the circuits release (or vice versa) and
//     this test fails. (Stable bb.js 5.0.x/5.1.x cannot even deserialize
//     beta.20 ACIR — hence the nightly pin.)

import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Barretenberg, UltraHonkBackend } from '@aztec/bb.js'
import { afterAll, describe, expect, it } from 'vitest'

import { assetsDir, copyAssets, listAssets } from './index.js'

const sha256 = (b: Uint8Array | string) => createHash('sha256').update(b).digest('hex')

const EXPECTED = [
  'circuits/dyaka_noir_token.json',
  'circuits/jwt_email.json',
  'circuits/manifest.json',
  'spawn.js',
  'tlsn_wasm.js',
  'tlsn_wasm_bg.wasm',
  'wasm/acvm_js_bg.wasm',
  'wasm/noirc_abi_wasm_bg.wasm',
]

interface Manifest {
  tag: string
  toolchain: { nargo: string; bb: string }
  tarballs: Record<string, { sha256: string; files: Record<string, string> }>
}

const manifest = (): Manifest =>
  JSON.parse(readFileSync(join(assetsDir(), 'circuits', 'manifest.json'), 'utf8'))

const manifestEntry = (m: Manifest, circuit: string) => {
  const entry = Object.values(m.tarballs).find((t) => circuit in t.files)
  if (!entry) throw new Error(`${circuit} not in the release manifest`)
  return entry
}

describe('bundled assets', () => {
  it('ship the complete tree', () => {
    expect(listAssets()).toEqual(EXPECTED)
  })

  it('circuit JSONs hash to the release manifest values', () => {
    const m = manifest()
    for (const circuit of ['dyaka_noir_token.json', 'jwt_email.json']) {
      const bytes = readFileSync(join(assetsDir(), 'circuits', circuit))
      expect(sha256(bytes), circuit).toBe(manifestEntry(m, circuit).files[circuit])
    }
  })

  it('manifest tag matches the pinned circuits release', () => {
    const pkg = JSON.parse(readFileSync(join(assetsDir(), '..', 'package.json'), 'utf8'))
    expect(manifest().tag).toBe(pkg.libid.circuitsRelease)
  })

  it('copyAssets reproduces the tree', () => {
    const dest = mkdtempSync(join(tmpdir(), 'claim-full-copy-'))
    try {
      expect(copyAssets(dest)).toEqual(EXPECTED)
      for (const rel of EXPECTED) {
        const a = readFileSync(join(assetsDir(), ...rel.split('/')))
        const b = readFileSync(join(dest, ...rel.split('/')))
        expect(sha256(b), rel).toBe(sha256(a))
      }
    } finally {
      rmSync(dest, { recursive: true, force: true })
    }
  })
})

describe('toolchain tie: pinned bb.js reproduces the released vks', () => {
  const api = Barretenberg.new({ threads: 4 })
  afterAll(async () => {
    await (await api).destroy()
  })

  for (const circuit of ['dyaka_noir_token.json', 'jwt_email.json']) {
    it(`${circuit} vk derived by the pinned bb.js == release vk`, async () => {
      const m = manifest()
      const { bytecode } = JSON.parse(
        readFileSync(join(assetsDir(), 'circuits', circuit), 'utf8'),
      ) as { bytecode: string }
      const backend = new UltraHonkBackend(bytecode, await api)
      // verifierTarget 'evm': the keccak/ZK-Honk flavor the on-chain
      // verifiers were generated from (same option the prover worker uses).
      const vk = await backend.getVerificationKey({ verifierTarget: 'evm' })
      expect(sha256(vk), `${circuit} vk`).toBe(manifestEntry(m, circuit).files.vk)
    })
  }
})
