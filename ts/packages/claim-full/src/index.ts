/// @libid/claim plus batteries: the npm tarball carries every static asset
/// the claim flows load at runtime, laid out exactly as @libid/claim's
/// default same-origin URLs expect once copied into a static root:
///
///   tlsn_wasm.js, tlsn_wasm_bg.wasm, spawn.js   → /tlsn_wasm.js …
///   circuits/dyaka_noir_token.json (X)          → /circuits/dyaka_noir_token.json
///   circuits/jwt_email.json (Google)            → /circuits/jwt_email.json
///   wasm/acvm_js_bg.wasm, noirc_abi_wasm_bg.wasm → /wasm/…
///
/// Two ways to consume:
///
///   1. `copyAssets('public')` (or `pnpm exec libid-claim-assets public`)
///      copies the tree into your static root. Works everywhere.
///   2. Subpath imports for per-call URL overrides where the bundler
///      supports them, e.g. vite:
///        import circuitUrl from '@libid/claim-full/assets/circuits/jwt_email.json?url'
///
/// Provenance: the `libid` field in package.json names the notary and
/// circuits release tags; circuits/manifest.json is the (sha256-verifying)
/// release manifest itself.

import { copyFileSync, mkdirSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Absolute path of the bundled assets directory. */
export function assetsDir(): string {
  return fileURLToPath(new URL('../assets/', import.meta.url))
}

/** Every asset file, as a path relative to {@link assetsDir} (posix `/`). */
export function listAssets(): string[] {
  const out: string[] = []
  const walk = (dir: string, prefix: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue // .stamp.json is build metadata
      if (entry.isDirectory()) walk(join(dir, entry.name), `${prefix}${entry.name}/`)
      else out.push(`${prefix}${entry.name}`)
    }
  }
  walk(assetsDir(), '')
  return out.sort()
}

/** Copy the whole assets tree into `destDir` (a vite `public/`, a next.js
 *  `public/`, any static root), creating directories as needed. Returns the
 *  relative paths copied. */
export function copyAssets(destDir: string): string[] {
  const src = assetsDir()
  const files = listAssets()
  for (const rel of files) {
    const dest = join(destDir, ...rel.split('/'))
    mkdirSync(join(dest, '..'), { recursive: true })
    copyFileSync(join(src, ...rel.split('/')), dest)
  }
  return files
}
