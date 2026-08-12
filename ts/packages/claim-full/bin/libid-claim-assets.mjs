#!/usr/bin/env node
// Copy @libid/claim-full's bundled proving assets into a static root:
//
//   libid-claim-assets <dest-dir>     e.g. libid-claim-assets public
//
// The layout under <dest-dir> matches @libid/claim's default same-origin
// asset URLs (tlsn_wasm* + spawn.js at the root, circuits/, wasm/).
import { copyAssets } from '../dist/index.js'

const dest = process.argv[2]
if (!dest || dest.startsWith('-')) {
  console.error('usage: libid-claim-assets <dest-dir>')
  process.exit(2)
}
for (const rel of copyAssets(dest)) console.log(`staged ${dest}/${rel}`)
