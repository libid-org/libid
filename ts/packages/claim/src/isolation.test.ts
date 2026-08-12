// The isolation guard, ported from dyaka's idea: this library was extracted
// from a wallet product, and the one way that extraction rots is a stray
// import reaching back into it. Nothing in src/ may import anything from
// the @webwallet or @dyaka namespaces (or dyaka's internal aliases), and
// runtime imports must stay inside the small allowed set.

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const SRC = dirname(fileURLToPath(import.meta.url))

function tsFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...tsFiles(full))
    else if (/\.tsx?$/.test(entry)) out.push(full)
  }
  return out
}

function importsOf(file: string): string[] {
  const text = readFileSync(file, 'utf8')
  const specs: string[] = []
  const patterns = [
    /from\s+['"]([^'"]+)['"]/g,
    /import\s*\(\s*(?:\/\*[^*]*\*\/\s*)?['"]([^'"]+)['"]\s*\)/g,
  ]
  for (const re of patterns) {
    for (const m of text.matchAll(re)) specs.push(m[1])
  }
  return specs
}

describe('wallet-product isolation', () => {
  const files = tsFiles(SRC)

  it('scans a plausible file set', () => {
    expect(files.length).toBeGreaterThan(10)
  })

  it('imports nothing from @webwallet / @dyaka / dyaka aliases', () => {
    const forbidden = /^(@webwallet|@dyaka|@identity|dyaka)([/-]|$)/
    for (const file of files) {
      for (const spec of importsOf(file)) {
        expect(spec, `${file} imports ${spec}`).not.toMatch(forbidden)
      }
    }
  })

  it('keeps runtime bare imports inside the declared dependency set', () => {
    const allowed = /^(node:|@libid\/contracts|@noir-lang\/|@aztec\/bb\.js|viem|vitest)([/]|$)?/
    for (const file of files) {
      for (const spec of importsOf(file)) {
        if (spec.startsWith('.')) continue
        expect(spec, `${file} imports ${spec}`).toMatch(allowed)
      }
    }
  })
})
