import { own } from '../shared/record'
import { parseRangeList, type LineRange } from './ranges'

/**
 * Parser for the code fence "meta" string — everything after the language:
 *
 *     ```js title="app.js" {1,3-5} ins={7} "foo" /ba[rz]/ wrap showLineNumbers
 *
 * The syntax is a superset of:
 * - Expressive Code (`title=`, `frame=`, `{ranges}`, `mark=`/`ins=`/`del=`,
 *   labelled ranges, `"text"` and `/regex/` inline markers, `wrap`,
 *   `preserveIndent`, `hangingIndent`, `showLineNumbers`, `startLineNumber`,
 *   `collapse=`, `collapseStyle=`, `lang=` for diffs),
 * - Comark (`[file.ts]` as the title / tab label),
 * - Inkdrop's built-in code block meta (`title=`, `filename=`, `url=`,
 *   `line=`, `branch=`, `commit=`).
 *
 * The parser never throws: malformed pieces are ignored.
 */

export type MarkerType = 'mark' | 'ins' | 'del'

export interface LineMarker {
  type: MarkerType
  ranges: LineRange[]
}

export interface InlineMarker {
  type: MarkerType
  kind: 'text' | 'regex'
  /** Plain text to find, or the regex source. */
  value: string
  /** Regex flags (regex markers only). */
  flags?: string
}

export interface ParsedMeta {
  /** Scalar options: `key=value` (string) and bare flags (`true`). */
  options: Record<string, string | boolean>
  /** Line markers from `{...}`, `mark={...}`, `ins={...}`, `del={...}`. */
  lineMarkers: LineMarker[]
  /** Inline text/regex markers. */
  inlineMarkers: InlineMarker[]
  /** Ranges from `collapse={...}`. */
  collapse: LineRange[]
  /** Text inside `[...]` (Comark-style file name / tab label). */
  bracketTitle?: string
}

type Token =
  | { kind: 'option'; key: string; value: Value }
  | { kind: 'flag'; key: string }
  | { kind: 'value'; value: Value }
  | { kind: 'bracket'; value: string }

type Value =
  | { type: 'string'; value: string; quoted: boolean }
  | { type: 'range'; raw: string }
  | { type: 'regex'; source: string; flags: string }

const MARKER_KEYS: Record<string, MarkerType> = {
  mark: 'mark',
  highlight: 'mark',
  hl: 'mark',
  ins: 'ins',
  add: 'ins',
  del: 'del',
  remove: 'del'
}

const KEY_RE = /[A-Za-z_][\w-]*/y

export function tokenizeMeta(input: string): Token[] {
  const tokens: Token[] = []
  const s = input ?? ''
  let i = 0
  const n = s.length

  const skipWs = () => {
    while (i < n && /\s/.test(s[i]!)) i++
  }

  /** Reads a value starting at `i`. Returns null if nothing could be read. */
  const readValue = (): Value | null => {
    const ch = s[i]
    if (ch === undefined) return null
    if (ch === '"' || ch === "'" || ch === '`') {
      const str = readQuoted(ch)
      return { type: 'string', value: str, quoted: true }
    }
    if (ch === '{') {
      return { type: 'range', raw: readBalanced('{', '}') }
    }
    if (ch === '/') {
      const re = readRegex()
      if (re) return re
    }
    // Bare value: up to the next whitespace.
    const start = i
    while (i < n && !/\s/.test(s[i]!)) i++
    return { type: 'string', value: s.slice(start, i), quoted: false }
  }

  const readQuoted = (quote: string): string => {
    i++ // opening quote
    let out = ''
    while (i < n) {
      const ch = s[i]!
      if (ch === '\\' && i + 1 < n && (s[i + 1] === quote || s[i + 1] === '\\')) {
        out += s[i + 1]
        i += 2
        continue
      }
      if (ch === quote) {
        i++
        return out
      }
      out += ch
      i++
    }
    return out // unterminated: take the rest
  }

  const readBalanced = (open: string, close: string): string => {
    const start = i
    let depth = 0
    let quote: string | null = null
    while (i < n) {
      const ch = s[i]!
      if (quote) {
        if (ch === '\\') i++
        else if (ch === quote) quote = null
      } else if (ch === '"' || ch === "'" || ch === '`') {
        quote = ch
      } else if (ch === open) {
        depth++
      } else if (ch === close) {
        depth--
        if (depth === 0) {
          i++
          return s.slice(start, i)
        }
      }
      i++
    }
    return s.slice(start, i)
  }

  const readRegex = (): Value | null => {
    const start = i
    let j = i + 1
    let inClass = false
    while (j < n) {
      const ch = s[j]!
      if (ch === '\\') {
        j += 2
        continue
      }
      if (ch === '[') inClass = true
      else if (ch === ']') inClass = false
      else if (ch === '/' && !inClass) break
      j++
    }
    if (j >= n || j === start + 1) return null
    const source = s.slice(start + 1, j)
    j++
    const flagStart = j
    while (j < n && /[a-z]/i.test(s[j]!)) j++
    // A regex token must be followed by whitespace or end of input.
    if (j < n && !/\s/.test(s[j]!)) return null
    const flags = s.slice(flagStart, j)
    try {
      new RegExp(source, sanitizeFlags(flags))
    } catch {
      return null
    }
    i = j
    return { type: 'regex', source, flags }
  }

  while (i < n) {
    skipWs()
    if (i >= n) break
    const ch = s[i]!
    if (ch === '[') {
      const raw = readBalanced('[', ']')
      tokens.push({ kind: 'bracket', value: raw.slice(1, raw.endsWith(']') ? -1 : undefined).trim() })
      continue
    }
    if (ch === '{' || ch === '"' || ch === "'" || ch === '`' || ch === '/') {
      const before = i
      const value = readValue()
      if (value && i > before) {
        tokens.push({ kind: 'value', value })
        continue
      }
      i = before
    }
    KEY_RE.lastIndex = i
    const km = KEY_RE.exec(s)
    if (km) {
      const key = km[0]
      const after = i + key.length
      if (s[after] === '=') {
        i = after + 1
        const value = readValue()
        if (value) tokens.push({ kind: 'option', key, value })
        continue
      }
      if (after >= n || /\s/.test(s[after]!)) {
        i = after
        tokens.push({ kind: 'flag', key })
        continue
      }
    }
    // Unknown junk: skip to the next whitespace.
    while (i < n && !/\s/.test(s[i]!)) i++
  }
  return tokens
}

export function parseMeta(input: string | undefined | null): ParsedMeta {
  const result: ParsedMeta = { options: {}, lineMarkers: [], inlineMarkers: [], collapse: [] }
  if (!input) return result
  for (const token of tokenizeMeta(input)) {
    switch (token.kind) {
      case 'flag':
        result.options[token.key] = true
        break
      case 'bracket':
        if (token.value) result.bracketTitle = token.value
        break
      case 'value':
        addValue(result, 'mark', token.value)
        break
      case 'option': {
        const { key, value } = token
        const markerType = own(MARKER_KEYS, key)
        if (markerType) {
          addValue(result, markerType, value)
        } else if (key === 'collapse' && value.type === 'range') {
          result.collapse.push(...parseRangeList(value.raw))
        } else if (value.type === 'string') {
          result.options[key] = value.value
        } else if (value.type === 'range') {
          result.options[key] = value.raw
        } else {
          result.options[key] = `/${value.source}/${value.flags}`
        }
        break
      }
    }
  }
  return result
}

function addValue(result: ParsedMeta, type: MarkerType, value: Value) {
  if (value.type === 'range') {
    const ranges = parseRangeList(value.raw)
    if (ranges.length) result.lineMarkers.push({ type, ranges })
  } else if (value.type === 'regex') {
    result.inlineMarkers.push({ type, kind: 'regex', value: value.source, flags: value.flags })
  } else if (value.value) {
    // A bare unquoted value after `mark=` is treated as text, too.
    result.inlineMarkers.push({ type, kind: 'text', value: value.value })
  }
}

/**
 * Keeps the user-controllable `RegExp` flags (`i`, `m`, `s`, `u` / `v`). The
 * matcher adds `g` and `d` itself.
 */
const USER_FLAGS = new Set(['i', 'm', 's', 'u', 'v'])

export function sanitizeFlags(flags: string): string {
  const set = new Set<string>()
  for (const f of flags) if (USER_FLAGS.has(f)) set.add(f)
  if (set.has('u') && set.has('v')) set.delete('v')
  return [...set].join('')
}

// ---------------------------------------------------------------------------
// Typed option accessors
// ---------------------------------------------------------------------------

const FALSE_VALUES = new Set(['false', '0', 'no', 'off'])

/** A flag (`wrap`) or boolean option (`wrap=false`); any value but false/0/no/off is true. */
export function getBool(options: ParsedMeta['options'], key: string): boolean | undefined {
  const v = options[key]
  if (v === undefined || typeof v === 'boolean') return v
  return !FALSE_VALUES.has(v.toLowerCase())
}

export function getInt(options: ParsedMeta['options'], key: string): number | undefined {
  const v = options[key]
  if (typeof v !== 'string') return undefined
  const num = parseInt(v, 10)
  return Number.isFinite(num) ? num : undefined
}

export function getString(options: ParsedMeta['options'], key: string): string | undefined {
  const v = options[key]
  return typeof v === 'string' && v !== '' ? v : undefined
}
