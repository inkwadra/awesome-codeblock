import { describe, expect, it } from 'vite-plus/test'
import { isCatastrophicRegex } from '../src/meta/regex-safety'
import { parseMeta, tokenizeMeta } from '../src/meta/parse-meta'
import { parseRangeList, shiftRanges } from '../src/meta/ranges'

describe('parseRangeList', () => {
  it('parses numbers, ranges and lists', () => {
    expect(parseRangeList('{4}')).toEqual([{ from: 4, to: 4 }])
    expect(parseRangeList('{1, 4, 7-8}')).toEqual([
      { from: 1, to: 1 },
      { from: 4, to: 4 },
      { from: 7, to: 8 }
    ])
  })
  it('normalizes reversed ranges and drops junk', () => {
    expect(parseRangeList('{8-4, x, 0, -3}')).toEqual([{ from: 4, to: 8 }])
  })
  it('parses labels, including commas inside quotes', () => {
    expect(parseRangeList(`{"1":5, 'a, b':7-8}`)).toEqual([
      { from: 5, to: 5, label: '1' },
      { from: 7, to: 8, label: 'a, b' }
    ])
  })
})

describe('shiftRanges', () => {
  it('re-maps ranges after removed lines', () => {
    expect(shiftRanges([{ from: 3, to: 5 }], [1])).toEqual([{ from: 2, to: 4 }])
    expect(shiftRanges([{ from: 1, to: 1 }], [1])).toEqual([])
    expect(shiftRanges([{ from: 1, to: 3 }], [1, 2])).toEqual([{ from: 1, to: 1 }])
  })
})

describe('tokenizeMeta', () => {
  it('handles all token kinds', () => {
    const tokens = tokenizeMeta(`title="a b.js" {1,3} [file.ts] "txt" /re[g/]x/i wrap del={2} startLineNumber=5`)
    expect(tokens.map(t => t.kind)).toEqual([
      'option',
      'value',
      'bracket',
      'value',
      'value',
      'flag',
      'option',
      'option'
    ])
  })
  it('does not treat a lone slash path as regex', () => {
    const meta = parseMeta('url=https://github.com/a/b')
    expect(meta.options.url).toBe('https://github.com/a/b')
  })
})

describe('parseMeta', () => {
  it('parses expressive-code syntax', () => {
    const meta = parseMeta(
      `title="line-markers.js" del={2} ins={3-4} {6} "return true;" ins="inserted" del=/de(let)ed/g`
    )
    expect(meta.options.title).toBe('line-markers.js')
    expect(meta.lineMarkers).toEqual([
      { type: 'del', ranges: [{ from: 2, to: 2 }] },
      { type: 'ins', ranges: [{ from: 3, to: 4 }] },
      { type: 'mark', ranges: [{ from: 6, to: 6 }] }
    ])
    expect(meta.inlineMarkers).toEqual([
      { type: 'mark', kind: 'text', value: 'return true;' },
      { type: 'ins', kind: 'text', value: 'inserted' },
      { type: 'del', kind: 'regex', value: 'de(let)ed', flags: 'g' }
    ])
  })
  it('parses labelled ranges', () => {
    const meta = parseMeta(`{"1":5} del={"2":7-8}`)
    expect(meta.lineMarkers[0]!.ranges[0]).toEqual({ from: 5, to: 5, label: '1' })
    expect(meta.lineMarkers[1]!.ranges[0]).toEqual({ from: 7, to: 8, label: '2' })
  })
  it('parses flags, booleans and collapse', () => {
    const meta = parseMeta('wrap preserveIndent=false hangingIndent=2 collapse={1-5, 12-14} showLineNumbers')
    expect(meta.options).toMatchObject({
      wrap: true,
      preserveIndent: 'false',
      hangingIndent: '2',
      showLineNumbers: true
    })
    expect(meta.collapse).toEqual([
      { from: 1, to: 5 },
      { from: 12, to: 14 }
    ])
  })
  it('parses comark [file] titles and inkdrop meta', () => {
    const meta = parseMeta('[src/zoom.ts] line=10-20 branch=main')
    expect(meta.bracketTitle).toBe('src/zoom.ts')
    expect(meta.options).toMatchObject({ line: '10-20', branch: 'main' })
  })
  it('supports escaped quotes', () => {
    expect(parseMeta(String.raw`title="say \"hi\""`).options.title).toBe('say "hi"')
  })
  it('treats Object.prototype names as ordinary keys', () => {
    const meta = parseMeta('constructor={1} toString="a" valueOf __proto__=x')
    expect(meta.lineMarkers).toEqual([])
    expect(meta.inlineMarkers).toEqual([])
    expect(meta.options).toMatchObject({ constructor: '{1}', toString: 'a', valueOf: true })
  })
  it('never throws on garbage', () => {
    for (const s of ['{', '"', '/', '[', '=', 'a=', '{"x":}', '/(/', '\\', 'key="unterminated']) {
      expect(() => parseMeta(s)).not.toThrow()
    }
  })
})

describe('isCatastrophicRegex', () => {
  it('refuses repeated groups that can match the same text in several ways', () => {
    for (const source of [
      '(a+)+$',
      '(a*)*',
      String.raw`(\w+\s*)+$`,
      '(a?a?)+',
      '(.*,)+',
      String.raw`(a\w+)+`,
      '(a+|b)+',
      String.raw`(\w+=\w+)+`,
      '(?:a{2,3})+',
      String.raw`(,\w+|\w+;)+`,
      '(?=(a+)+b)x',
      '((a+)+)'
    ]) {
      expect(isCatastrophicRegex(source), source).toBe(true)
    }
    expect(isCatastrophicRegex('(A+a)+', 'i')).toBe(true)
  })
  it('accepts repetitions pinned by a literal, and ordinary patterns', () => {
    for (const source of [
      String.raw`(\d+\.)+\d+`,
      String.raw`(?:\w+\.)*\w+`,
      String.raw`\w+(,\s*\w+)*`,
      String.raw`(\w+::)*\w+`,
      '(a+b)+',
      '(foo|bar)+',
      '(ab?)+',
      String.raw`(a+,|b+;)+`,
      String.raw`api\/(v\d)`,
      String.raw`user(Id)`,
      'ba[rz]',
      String.raw`\bconst\b`,
      String.raw`(a+){2}`,
      String.raw`[(a+)+]`,
      String.raw`\(a+\)+`,
      'a{2}{'
    ]) {
      expect(isCatastrophicRegex(source), source).toBe(false)
    }
  })
})
