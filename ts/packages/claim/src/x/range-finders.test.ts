/**
 * Pure-function tests for the byte-range helpers in
 * x/range-finders.ts. These power the worker's TLSN commit-range
 * extraction; off-by-one bugs here translate into circuit witness mismatch.
 */
import { describe, it, expect } from 'vitest'
import {
  asciiBytes,
  countSubrange,
  findSubrange,
  findJsonKeyValueRange,
  findObjectEnd,
  findClientIdParamRange,
} from './range-finders.js'

const enc = (s: string) => new TextEncoder().encode(s)

describe('findSubrange', () => {
  it('finds substring at start', () => {
    expect(findSubrange(enc('hello world'), enc('hello'))).toEqual({
      start: 0,
      end: 5,
    })
  })
  it('finds substring in middle', () => {
    expect(findSubrange(enc('foo bar baz'), enc('bar'))).toEqual({
      start: 4,
      end: 7,
    })
  })
  it('finds substring at end', () => {
    expect(findSubrange(enc('foo bar'), enc('bar'))).toEqual({
      start: 4,
      end: 7,
    })
  })
  it('returns null on miss', () => {
    expect(findSubrange(enc('foo bar'), enc('qux'))).toBeNull()
  })
  it('returns first match if multiple', () => {
    expect(findSubrange(enc('abcabc'), enc('abc'))).toEqual({
      start: 0,
      end: 3,
    })
  })
  it('needle longer than haystack returns null', () => {
    expect(findSubrange(enc('abc'), enc('abcdef'))).toBeNull()
  })
  it('empty needle matches at 0 (boundary)', () => {
    // empty needle: loop runs once, inner loop has 0 iters, returns match at 0.
    expect(findSubrange(enc('abc'), new Uint8Array(0))).toEqual({
      start: 0,
      end: 0,
    })
  })
  it('fromIndex skips earlier matches', () => {
    // M1: anchoring past a marker selects the LATER occurrence.
    expect(findSubrange(enc('abcabc'), enc('abc'), 1)).toEqual({
      start: 3,
      end: 6,
    })
  })
})

describe('countSubrange', () => {
  it('counts non-overlapping occurrences', () => {
    expect(countSubrange(enc('{"id":"1","id":"2"}'), asciiBytes('"id":"'))).toBe(2)
  })
  it('returns 1 for a single occurrence (the contract uniqueness invariant)', () => {
    expect(countSubrange(enc('{"data":{"id":"123","username":"a"}}'), asciiBytes('"id":"'))).toBe(1)
  })
  it('returns 0 when absent', () => {
    expect(countSubrange(enc('{"username":"a"}'), asciiBytes('"id":"'))).toBe(0)
  })
})

describe('findObjectEnd', () => {
  it('bounds a simple object', () => {
    const pt = enc('{"a":1}')
    expect(findObjectEnd(pt, 0)).toBe(pt.length)
  })
  it('bounds a nested data object inside the response (M1r)', () => {
    // The /me id-uniqueness count must stop at the data object's close, not
    // run to end-of-transcript where a stray `"id":"…"` could falsely reject.
    const pt = enc('{"data":{"id":"123","username":"a"},"id":"999"}')
    const marker = findSubrange(pt, asciiBytes('"data":{'))!
    const end = findObjectEnd(pt, marker.end - 1)!
    const dataObj = pt.slice(marker.end, end)
    // Exactly one id inside the data object; the trailing top-level id is excluded.
    expect(countSubrange(dataObj, asciiBytes('"id":"'))).toBe(1)
    expect(countSubrange(pt.slice(marker.end), asciiBytes('"id":"'))).toBe(2)
  })
  it('ignores braces inside string values', () => {
    const pt = enc('{"name":"a}b{c","x":1}')
    expect(findObjectEnd(pt, 0)).toBe(pt.length)
  })
  it('ignores escaped quotes inside strings', () => {
    const pt = enc('{"name":"a\\"}b","x":1}')
    expect(findObjectEnd(pt, 0)).toBe(pt.length)
  })
  it('returns null when not pointed at an open brace', () => {
    expect(findObjectEnd(enc('x{"a":1}'), 0)).toBeNull()
  })
  it('returns null when unterminated', () => {
    expect(findObjectEnd(enc('{"a":1'), 0)).toBeNull()
  })
})

describe('findJsonKeyValueRange', () => {
  const prefix = asciiBytes('"username":"')

  it('extracts simple value', () => {
    const pt = enc('{"username":"alice"}')
    const r = findJsonKeyValueRange(pt, prefix)
    expect(r).not.toBeNull()
    expect(r!.range).toEqual({ start: 1, end: 19 })
    expect(new TextDecoder().decode(r!.value)).toBe('alice')
    expect(r!.valueLen).toBe(5)
  })
  it('returns null when key missing', () => {
    const pt = enc('{"other":"val"}')
    expect(findJsonKeyValueRange(pt, prefix)).toBeNull()
  })
  it('returns null when no closing quote', () => {
    const pt = enc('{"username":"unterminated')
    expect(findJsonKeyValueRange(pt, prefix)).toBeNull()
  })
  it('handles empty value', () => {
    const pt = enc('{"username":""}')
    const r = findJsonKeyValueRange(pt, prefix)!
    expect(r.valueLen).toBe(0)
    expect(r.value.length).toBe(0)
  })
  it('finds first occurrence only', () => {
    const pt = enc('{"username":"a","username":"b"}')
    const r = findJsonKeyValueRange(pt, prefix)!
    expect(new TextDecoder().decode(r.value)).toBe('a')
  })
  it('fromIndex anchors past a marker (M1 /me id selection)', () => {
    // Pick the id inside the `data` object, not a stray earlier "id":"…".
    const pt = enc('{"id":"stray","data":{"id":"123","username":"a"}}')
    const marker = findSubrange(pt, asciiBytes('"data":{'))!
    const r = findJsonKeyValueRange(pt, asciiBytes('"id":"'), marker.end)!
    expect(new TextDecoder().decode(r.value)).toBe('123')
  })
  it('valueRange covers bytes between the quotes (used for /token commit)', () => {
    // /token commits SHA256 over the bearer-value bytes (NOT including
    // quotes), so the worker pulls bytes via `valueRange`. Pin its shape.
    const pt = enc('{"access_token":"XYZ","other":1}')
    const r = findJsonKeyValueRange(pt, asciiBytes('"access_token":"'))!
    expect(new TextDecoder().decode(pt.slice(r.valueRange.start, r.valueRange.end))).toBe('XYZ')
    expect(r.valueRange.start).toBe(r.range.end - r.valueLen - 1)
    expect(r.valueRange.end).toBe(r.range.end - 1)
  })
  it('stops at first raw quote even if value contains a JSON-escape sequence', () => {
    // The finder is byte-level — it doesn't unescape. `\"` inside a value
    // ends the match early. Documents real X serializer interaction: any
    // bearer value with a literal `"` byte (impossible for base64url) would
    // truncate; expected.
    const pt = enc('{"username":"al\\"ice"}')
    const r = findJsonKeyValueRange(pt, prefix)!
    expect(new TextDecoder().decode(r.value)).toBe('al\\')
  })
})

describe('findClientIdParamRange', () => {
  it('finds at start of body (no &)', () => {
    const body = enc('client_id=ABC123&grant_type=foo')
    const r = findClientIdParamRange(body)!
    expect(r.range).toEqual({ start: 0, end: 16 }) // up to but not including '&'
    expect(new TextDecoder().decode(body.slice(r.range.start, r.range.end))).toBe(
      'client_id=ABC123',
    )
  })
  it('finds in middle of body (with &)', () => {
    const body = enc('grant_type=foo&client_id=XYZ&code=bar')
    const r = findClientIdParamRange(body)!
    expect(new TextDecoder().decode(body.slice(r.range.start, r.range.end))).toBe('client_id=XYZ')
  })
  it('terminates on & not at EOS', () => {
    const body = enc('client_id=AB&rest')
    const r = findClientIdParamRange(body)!
    expect(body[r.range.end]).toBe(0x26)
  })
  it('terminates at EOS when last param', () => {
    const body = enc('grant_type=foo&client_id=END')
    const r = findClientIdParamRange(body)!
    expect(r.range.end).toBe(body.length)
  })
  it('returns null when client_id absent', () => {
    const body = enc('grant_type=foo&code=bar')
    expect(findClientIdParamRange(body)).toBeNull()
  })
})
