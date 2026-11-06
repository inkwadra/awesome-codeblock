import type { ElementContent } from 'hast'
import { sanitizeFlags, type InlineMarker, type MarkerType } from '../../meta/parse-meta'
import { h } from '../../shared/hast'

/** An inline highlight within one line's text. */
export interface InlineRange {
  start: number
  end: number
  type: MarkerType
}

/** Strongest first: decides overlapping inline ranges and the line background. */
export const MARKER_PRIORITY: Readonly<Record<MarkerType, number>> = { del: 3, ins: 2, mark: 1 }

/** Regex matches considered per line, so a pathological pattern can't stall rendering. */
const MAX_MATCHES_PER_LINE = 1000

/** Finds the spans of one marker in a line. */
type InlineMatcher = (text: string) => InlineRange[]

/**
 * Compiles a block's inline markers once; the matchers then run on each line.
 * Invalid regexes are skipped.
 */
export function compileInlineMarkers(markers: readonly InlineMarker[]): InlineMatcher[] {
  const matchers: InlineMatcher[] = []
  for (const marker of markers) {
    if (marker.kind === 'text') {
      if (marker.value) matchers.push(textMatcher(marker.value, marker.type))
      continue
    }
    try {
      matchers.push(regexMatcher(new RegExp(marker.value, `${sanitizeFlags(marker.flags ?? '')}gd`), marker.type))
    } catch {
      // Invalid pattern: ignored, like other malformed meta.
    }
  }
  return matchers
}

function textMatcher(value: string, type: MarkerType): InlineMatcher {
  return text => {
    const out: InlineRange[] = []
    for (let idx = text.indexOf(value); idx >= 0; idx = text.indexOf(value, idx + value.length)) {
      out.push({ start: idx, end: idx + value.length, type })
    }
    return out
  }
}

/** Marks the whole match, or only the capture groups when the regex has any. */
function regexMatcher(re: RegExp, type: MarkerType): InlineMatcher {
  return text => {
    const out: InlineRange[] = []
    let count = 0
    for (const match of text.matchAll(re)) {
      if (++count > MAX_MATCHES_PER_LINE) break
      const indices = match.indices
      if (!indices) continue
      const spans = match.length > 1 ? indices.slice(1) : [indices[0]]
      for (const span of spans) if (span && span[1] > span[0]) out.push({ start: span[0], end: span[1], type })
    }
    return out
  }
}

/** All inline ranges of a line, without overlaps: the stronger marker wins, then the earlier one. */
export function findInlineRanges(text: string, matchers: readonly InlineMatcher[]): InlineRange[] {
  if (matchers.length === 0) return []
  const candidates = matchers.flatMap(match => match(text))
  candidates.sort((a, b) => MARKER_PRIORITY[b.type] - MARKER_PRIORITY[a.type] || a.start - b.start)
  const accepted: InlineRange[] = []
  for (const c of candidates) {
    if (accepted.every(a => c.end <= a.start || c.start >= a.end)) accepted.push(c)
  }
  return accepted.sort((a, b) => a.start - b.start)
}

function wrapRange(range: InlineRange, piece: ElementContent, start: number, end: number): ElementContent {
  const className = ['acb-im', `acb-im-${range.type}`]
  if (start === range.start) className.push('acb-im-start')
  if (end === range.end) className.push('acb-im-end')
  return h('mark', { className }, [piece])
}

/**
 * Wraps the parts of a line's text nodes covered by `ranges` (sorted, not
 * overlapping) in `<mark>` elements. Offsets count the line's text.
 */
export function applyInlineRanges(nodes: readonly ElementContent[], ranges: readonly InlineRange[]): ElementContent[] {
  let offset = 0
  const visit = (list: readonly ElementContent[]): ElementContent[] => {
    const out: ElementContent[] = []
    for (const node of list) {
      if (node.type === 'element') {
        out.push({ ...node, children: visit(node.children) })
        continue
      }
      if (node.type !== 'text') {
        out.push(node)
        continue
      }
      const start = offset
      const end = start + node.value.length
      offset = end
      let cursor = start
      for (const range of ranges) {
        if (range.end <= start || range.start >= end) continue
        const s = Math.max(range.start, start)
        const e = Math.min(range.end, end)
        if (s > cursor) out.push({ type: 'text', value: node.value.slice(cursor - start, s - start) })
        out.push(wrapRange(range, { type: 'text', value: node.value.slice(s - start, e - start) }, s, e))
        cursor = e
      }
      if (cursor === start) out.push(node)
      else if (cursor < end) out.push({ type: 'text', value: node.value.slice(cursor - start) })
    }
    return out
  }
  return visit(nodes)
}
