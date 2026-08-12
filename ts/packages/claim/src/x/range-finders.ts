/**
 * Pure byte-range helpers locating the structured substrings the /me and
 * /token TLSN commit ranges must wrap. Extracted from `prover.worker.ts` so
 * they unit-test in node without the worker-globals dependency.
 */

export function asciiBytes(s: string): Uint8Array {
  return new TextEncoder().encode(s)
}

export function findSubrange(
  haystack: Uint8Array,
  needle: Uint8Array,
  fromIndex = 0,
): { start: number; end: number } | null {
  outer: for (let i = Math.max(0, fromIndex); i <= haystack.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) continue outer
    }
    return { start: i, end: i + needle.length }
  }
  return null
}

/** Count non-overlapping occurrences of `needle` in `haystack`. */
export function countSubrange(haystack: Uint8Array, needle: Uint8Array): number {
  if (needle.length === 0) return 0
  let count = 0
  let from = 0
  for (;;) {
    const m = findSubrange(haystack, needle, from)
    if (!m) break
    count++
    from = m.end
  }
  return count
}

/** Find the index just past the closing `}` of a JSON object that opens at
 *  `openBraceIndex` (which MUST point at the `{`). String-aware: braces inside
 *  quoted values (and `\"`-escaped quotes) are ignored so nested objects and
 *  string contents don't confuse the depth count. Returns `null` if the object
 *  is unterminated. Used to bound `/me` `"id":"` uniqueness to the `data`
 *  object instead of scanning to end-of-transcript. */
export function findObjectEnd(plaintext: Uint8Array, openBraceIndex: number): number | null {
  if (plaintext[openBraceIndex] !== 0x7b /* { */) return null
  let depth = 0
  let inString = false
  for (let i = openBraceIndex; i < plaintext.length; i++) {
    const c = plaintext[i]
    if (inString) {
      if (c === 0x5c /* \ */) {
        i++ // skip the escaped byte
      } else if (c === 0x22 /* " */) {
        inString = false
      }
      continue
    }
    if (c === 0x22 /* " */) {
      inString = true
    } else if (c === 0x7b /* { */) {
      depth++
    } else if (c === 0x7d /* } */) {
      depth--
      if (depth === 0) return i + 1
    }
  }
  return null
}

/** Extract the full `"<key>":"<value>"` byte range in JSON-like plaintext.
 *  `fromIndex` lets the caller anchor the search past a preceding marker
 *  (e.g. the X `/me` `"data":{` object) so the FIRST matching key isn't
 *  picked out of an unrelated part of the transcript. */
export function findJsonKeyValueRange(
  plaintext: Uint8Array,
  keyPrefixBytes: Uint8Array,
  fromIndex = 0,
): {
  /// Full JSON snippet range: `"key":"value"` including key + quotes.
  range: { start: number; end: number }
  /// Value-only range: bytes BETWEEN the value's surrounding quotes. Use
  /// this for TLSN hash-commit when the circuit hashes the value alone.
  valueRange: { start: number; end: number }
  value: Uint8Array
  valueLen: number
} | null {
  const keyMatch = findSubrange(plaintext, keyPrefixBytes, fromIndex)
  if (!keyMatch) return null
  let end = keyMatch.end
  while (end < plaintext.length && plaintext[end] !== 0x22 /* " */) end++
  if (end >= plaintext.length) return null
  return {
    range: { start: keyMatch.start, end: end + 1 },
    valueRange: { start: keyMatch.end, end },
    value: plaintext.slice(keyMatch.end, end),
    valueLen: end - keyMatch.end,
  }
}

/** Locate the bearer plaintext range inside the sent transcript. The
 * Registry contract pairs this commit with a revealed `sent[0..bearer_start]`
 * prefix that ends in `authorization: Bearer ` — adjacency is enforced via
 * the notary-attested range positions. */
export function findBearerValueRange(
  plaintext: Uint8Array,
): { range: { start: number; end: number }; bearer: Uint8Array } | null {
  const prefix = asciiBytes('authorization: Bearer ')
  const match = findSubrange(plaintext, prefix)
  if (!match) return null
  let end = match.end
  while (end < plaintext.length - 1) {
    if (plaintext[end] === 0x0d && plaintext[end + 1] === 0x0a) break
    end++
  }
  if (end >= plaintext.length - 1) return null
  return {
    range: { start: match.end, end },
    bearer: plaintext.slice(match.end, end),
  }
}

/** Extract the `client_id=<value>` substring (terminated by `&` or EOS).
 *
 *  X /token form bodies are urlencoded `key=val&key=val...`. The parameter
 *  is either preceded by `&` (mid-body) or starts at position 0 of the
 *  form-body region. Anything else (e.g. `client_id=` inside a percent-
 *  encoded value) is not a real parameter — anchor the bare-prefix match
 *  to offset 0 only to avoid false positives. */
export function findClientIdParamRange(
  plaintext: Uint8Array,
): { range: { start: number; end: number } } | null {
  const withAmp = asciiBytes('&client_id=')
  const ampMatch = findSubrange(plaintext, withAmp)
  let start: number
  let valueStart: number
  if (ampMatch) {
    start = ampMatch.start + 1
    valueStart = ampMatch.end
  } else {
    // Bare `client_id=` only valid as the first parameter of the body.
    const noAmp = asciiBytes('client_id=')
    if (plaintext.length < noAmp.length) return null
    for (let j = 0; j < noAmp.length; j++) {
      if (plaintext[j] !== noAmp[j]) return null
    }
    start = 0
    valueStart = noAmp.length
  }
  let end = valueStart
  while (end < plaintext.length && plaintext[end] !== 0x26 /* & */) end++
  return { range: { start, end } }
}
