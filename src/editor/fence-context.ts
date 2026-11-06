import { tokenizeMeta } from '../meta/parse-meta'

/**
 * Pure analysis of a code fence's opening line, used by the editor completion
 * source. All offsets are relative to the start of the line.
 */

export type FenceContext =
  | {
      kind: 'lang'
      /** Offset of the fence marks (``` or ~~~). */
      fenceStart: number
      fence: string
      /** Range of the language token to replace. */
      from: number
      to: number
      /** True when the fence is at column 0 (Inkdrop's own completion also fires). */
      atLineStart: boolean
    }
  | { kind: 'key'; fenceStart: number; from: number; lang: string; present: Set<string> }
  | { kind: 'value'; fenceStart: number; key: string; from: number; quote: string | null; lang: string }

// Optional blockquote markers, list marker and indentation, then the fence.
const FENCE_RE = /^((?:[ \t]*>)*[ \t]*(?:(?:[-*+]|\d{1,9}[.)])[ \t]+)?[ \t]*)(`{3,}|~{3,})/

export function analyzeFenceLine(line: string, cursor: number): FenceContext | null {
  const m = FENCE_RE.exec(line)
  if (!m) return null
  const fenceStart = m[1]!.length
  const fence = m[2]!
  const infoStart = m[0].length
  if (cursor < infoStart) return null
  const before = line.slice(infoStart, cursor)
  // A backtick fence's info string may not contain backticks.
  if (fence[0] === '`' && before.includes('`')) return null

  const leading = /^[ \t]*/.exec(before)![0].length
  const afterLeading = before.slice(leading)
  if (!/\s/.test(afterLeading)) {
    // Still typing the language.
    const rest = line.slice(infoStart + leading)
    const token = /^[^\s`]*/.exec(rest)![0]
    if (/[={["'/]/.test(afterLeading)) return null
    return {
      kind: 'lang',
      fenceStart,
      fence,
      from: infoStart + leading,
      to: infoStart + leading + token.length,
      atLineStart: fenceStart === 0 && fence.startsWith('```')
    }
  }

  const lang = /^\S+/
    .exec(afterLeading)![0]
    .replace(/[{[].*$/, '')
    .toLowerCase()
  const metaOffset = infoStart + leading + /^\S+/.exec(afterLeading)![0].length
  const meta = line.slice(metaOffset, cursor)

  // Scan the meta up to the cursor, tracking quotes and brackets.
  let quote: string | null = null
  let depthBrace = 0
  let depthBracket = 0
  let tokenStart = 0
  for (let i = 0; i < meta.length; i++) {
    const ch = meta[i]!
    if (quote) {
      if (ch === '\\') i++
      else if (ch === quote) quote = null
      continue
    }
    if (ch === '"' || ch === "'" || ch === '`') quote = ch
    else if (ch === '{') depthBrace++
    else if (ch === '}') depthBrace = Math.max(0, depthBrace - 1)
    else if (ch === '[') depthBracket++
    else if (ch === ']') depthBracket = Math.max(0, depthBracket - 1)
    else if (/\s/.test(ch) && depthBrace === 0 && depthBracket === 0) tokenStart = i + 1
  }
  if (depthBrace > 0 || depthBracket > 0) return null
  const token = meta.slice(tokenStart)
  const tokenFrom = metaOffset + tokenStart

  const eq = token.indexOf('=')
  if (eq > 0) {
    const key = token.slice(0, eq)
    if (!/^[A-Za-z_][\w-]*$/.test(key)) return null
    const valuePart = token.slice(eq + 1)
    const q = valuePart[0] === '"' || valuePart[0] === "'" ? valuePart[0] : null
    // Inside quotes only if the quote opened right after "=".
    if (quote && !q) return null
    if (!quote && q) return null // closed quoted value: nothing to complete
    if (!q && /[{/]/.test(valuePart[0] ?? '')) return null
    return { kind: 'value', fenceStart, key, from: tokenFrom + eq + 1 + (q ? 1 : 0), quote: q, lang }
  }
  if (quote) return null // inside a "text" marker
  if (!/^[A-Za-z_]?[\w-]*$/.test(token)) return null

  const present = new Set<string>()
  for (const t of tokenizeMeta(line.slice(metaOffset))) {
    if (t.kind === 'option' || t.kind === 'flag') present.add(t.key)
  }
  // The token being typed doesn't count as present.
  present.delete(token)
  return { kind: 'key', fenceStart, from: tokenFrom, lang, present }
}

/** Matches a notation comment being typed: `[!code ++`, `[!code wo`, … */
export function matchNotation(textBefore: string): { from: number; prefix: string } | null {
  const m = /\[!code\s+([\w:+-]*)$/.exec(textBefore)
  if (!m) return null
  return { from: textBefore.length - m[1]!.length, prefix: m[1]! }
}
