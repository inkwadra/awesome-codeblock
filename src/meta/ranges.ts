/**
 * Line range parsing for meta options such as `{1,3-5}`, `del={2}` or
 * `ins={"Label":5-7}`.
 *
 * Line numbers are 1-based and refer to the lines of the *source* code block
 * (before any title comment or diff marker is removed — see `model.ts`).
 */

export interface LineRange {
  /** First line, 1-based, inclusive. */
  from: number
  /** Last line, 1-based, inclusive. */
  to: number
  /** Optional label rendered next to the first line of the range. */
  label?: string
}

const RANGE_ITEM = /^(\d+)\s*(?:-\s*(\d+))?$/

/**
 * Parses the inside of a `{...}` range list.
 *
 * Accepts numbers (`4`), ranges (`4-8`), and labelled entries (`"A":4-8` or
 * `'A':4`). Invalid entries are skipped rather than throwing, because a typo in
 * a note must never break the preview.
 */
export function parseRangeList(input: string): LineRange[] {
  const body = input.trim().replace(/^\{/, '').replace(/\}$/, '')
  const out: LineRange[] = []
  for (const rawItem of splitTopLevel(body)) {
    const item = rawItem.trim()
    if (!item) continue
    let label: string | undefined
    let range = item
    const labelled = /^(["'`])((?:\\.|(?!\1).)*)\1\s*:\s*(.+)$/.exec(item)
    if (labelled) {
      label = labelled[2]!.replace(/\\(.)/g, '$1')
      range = labelled[3]!.trim()
    }
    const m = RANGE_ITEM.exec(range)
    if (!m) continue
    const a = Number(m[1])
    const b = m[2] !== undefined ? Number(m[2]) : a
    if (!Number.isFinite(a) || !Number.isFinite(b) || a < 1 || b < 1) continue
    out.push({ from: Math.min(a, b), to: Math.max(a, b), ...(label !== undefined && { label }) })
  }
  return out
}

/** Splits on commas that are not inside quotes. */
function splitTopLevel(input: string): string[] {
  const parts: string[] = []
  let quote: string | null = null
  let current = ''
  for (let i = 0; i < input.length; i++) {
    const ch = input[i]!
    if (quote) {
      current += ch
      if (ch === '\\' && i + 1 < input.length) {
        current += input[++i]
      } else if (ch === quote) {
        quote = null
      }
      continue
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch
      current += ch
    } else if (ch === ',') {
      parts.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  parts.push(current)
  return parts
}

/** Returns true if `line` (1-based) lies inside any of the ranges. */
export function inRanges(line: number, ranges: readonly LineRange[]): boolean {
  return ranges.some(r => line >= r.from && line <= r.to)
}

/**
 * Re-maps source line ranges after lines were removed from the code
 * (e.g. an extracted file-name comment). `removed` holds the removed
 * 1-based source line numbers.
 */
export function shiftRanges<R extends LineRange>(ranges: readonly R[], removed: readonly number[]): R[] {
  if (removed.length === 0) return ranges.slice()
  const map = (line: number) => line - removed.filter(r => r < line).length
  const out: R[] = []
  for (const r of ranges) {
    let from = r.from
    let to = r.to
    // Drop removed lines at the edges of the range.
    while (from <= to && removed.includes(from)) from++
    while (to >= from && removed.includes(to)) to--
    if (from > to) continue
    out.push({ ...r, from: map(from), to: map(to) })
  }
  return out
}
