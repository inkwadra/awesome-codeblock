import type { Element, ElementContent } from 'hast'
import type { ShikiTransformer } from 'shiki/core'
import type { CollapseStyle } from '../../config'
import type { LineRange } from '../../meta/ranges'
import type { BlockModel, ResolvedLineMarker } from '../../model'
import { addClass, classList, h, hasClass, textContent } from '../../shared/hast'
import { applyInlineRanges, compileInlineMarkers, findInlineRanges, MARKER_PRIORITY } from './inline-markers'

/**
 * Turns Shiki's `pre > code > span.line` into the plugin's structure:
 *
 *     pre.acb-pre > code.acb-code > span.line.acb-line > [span.acb-gutter] span.acb-lc
 *
 * with line markers, labels, inline markers, wrap indentation
 * and collapsible `<details>` sections.
 */

/** Output collected while rendering. */
export interface StructureOutput {
  /** Rendered lines. */
  lineCount: number
  /** Rows shown before anything is expanded: a closed collapsed section counts as one. */
  visibleRows: number
}

export function isLine(node: ElementContent): node is Element {
  return node.type === 'element' && hasClass(node, 'line')
}

/** Leading whitespace width in columns. */
export function indentColumns(text: string, tabSize: number): number {
  let col = 0
  for (const ch of text) {
    if (ch === ' ') col++
    else if (ch === '\t') col += tabSize - (col % tabSize)
    else break
  }
  return col
}

/** Largest indentation step taken into account; wider jumps are alignment, not nesting. */
const MAX_INDENT_STEP = 8

/**
 * Indentation step of the code, in columns: the most common increase in
 * indentation between consecutive non-blank lines (ties go to the smaller
 * step). One-column steps (` * ` lines of doc comments) and wide alignment
 * jumps are ignored. `tabSize` when nothing is left, e.g. tab-indented code.
 */
export function detectIndentStep(code: string, tabSize: number): number {
  const counts = new Map<number, number>()
  let prev: number | undefined
  for (const line of code.split('\n')) {
    if (!line.trim()) continue
    const col = indentColumns(line, tabSize)
    const step = prev === undefined ? 0 : col - prev
    if (step > 1 && step <= MAX_INDENT_STEP) counts.set(step, (counts.get(step) ?? 0) + 1)
    prev = col
  }
  let best = tabSize
  let bestCount = 0
  for (const [step, count] of counts) {
    if (count > bestCount || (count === bestCount && step < best)) {
      best = step
      bestCount = count
    }
  }
  return best
}

/** Line number gutter width, in characters (the widest of the first and last number). */
export function gutterChars(startLineNumber: number, lineCount: number): number {
  const last = startLineNumber + Math.max(lineCount, 1) - 1
  return Math.max(String(startLineNumber).length, String(last).length, 2)
}

const lineWord = (n: number) => (n === 1 ? 'line' : 'lines')

/** Clamps ranges to `1..max`, sorts them and merges overlapping or adjacent ones. */
export function mergeRanges(ranges: readonly Pick<LineRange, 'from' | 'to'>[], max: number): LineRange[] {
  const sorted = ranges
    .map(r => ({ from: Math.max(1, r.from), to: Math.min(max, r.to) }))
    .filter(r => r.from <= r.to)
    .sort((a, b) => a.from - b.from)
  const out: LineRange[] = []
  for (const r of sorted) {
    const last = out.at(-1)
    if (last && r.from <= last.to + 1) last.to = Math.max(last.to, r.to)
    else out.push({ ...r })
  }
  return out
}

/** Per-line lookups, computed once per block instead of once per line. */
interface LineIndex {
  /** Strongest marker covering each source line (index = source line number − 1). */
  strongest: Array<ResolvedLineMarker | undefined>
  /** Strongest labelled marker starting on each source line. */
  labels: Map<number, ResolvedLineMarker>
}

/** On ties the earlier marker wins. */
const stronger = (marker: ResolvedLineMarker, current: ResolvedLineMarker | undefined) =>
  !current || MARKER_PRIORITY[marker.type] > MARKER_PRIORITY[current.type]

function indexLineMarkers(markers: readonly ResolvedLineMarker[], sourceLines: number): LineIndex {
  const strongest: LineIndex['strongest'] = Array.from({ length: sourceLines }, () => undefined)
  const labels = new Map<number, ResolvedLineMarker>()
  for (const marker of markers) {
    if (marker.label !== undefined && stronger(marker, labels.get(marker.from))) labels.set(marker.from, marker)
    for (let n = Math.max(1, marker.from); n <= Math.min(sourceLines, marker.to); n++) {
      if (stronger(marker, strongest[n - 1])) strongest[n - 1] = marker
    }
  }
  return { strongest, labels }
}

/** diffs' chevron (`diffs-icon-expand`), pointing down. */
const CHEVRON =
  'M3.47 5.47a.75.75 0 0 1 1.06 0L8 8.94l3.47-3.47a.75.75 0 1 1 1.06 1.06l-4 4a.75.75 0 0 1-1.06 0l-4-4a.75.75 0 0 1 0-1.06'

/**
 * Separator icons, from @pierre/diffs' sprite so collapsed sections match its
 * hunk separators. diffs has no "collapse" icon: it's its chevron twice,
 * both pointing at the middle.
 */
const ICONS: Record<'expand' | 'expandAll' | 'collapse', Array<{ d: string; transform?: string }>> = {
  expand: [{ d: CHEVRON }],
  expandAll: [
    {
      d: 'M11.47 9.47a.75.75 0 1 1 1.06 1.06l-4 4a.75.75 0 0 1-1.06 0l-4-4a.75.75 0 1 1 1.06-1.06L8 12.94zM7.526 1.418a.75.75 0 0 1 1.004.052l4 4a.75.75 0 1 1-1.06 1.06L8 3.06 4.53 6.53a.75.75 0 1 1-1.06-1.06l4-4z'
    }
  ],
  collapse: [
    { d: CHEVRON, transform: 'translate(0 -4)' },
    { d: CHEVRON, transform: 'matrix(1 0 0 -1 0 20)' }
  ]
}

function icon(name: keyof typeof ICONS, className: string): Element {
  return h(
    'svg',
    { className: ['acb-collapse-icon', className], viewBox: '0 0 16 16', width: 16, height: 16, ariaHidden: 'true' },
    ICONS[name].map(path => h('path', path))
  )
}

/** Which way the hidden lines lie from the separator, as in diffs: up at the block start, down at its end. */
type ExpandDirection = 'up' | 'down' | 'both'

function expandDirection(atStart: boolean, atEnd: boolean): ExpandDirection {
  return atStart === atEnd ? 'both' : atStart ? 'up' : 'down'
}

/** Icon cell + label: the two pills of a diffs hunk separator. */
function separatorParts(icons: Element[], label: Record<string, string>): Element[] {
  return [
    h('span', { className: ['acb-collapse-button'] }, icons),
    h('span', { className: ['acb-collapse-label'], ...label })
  ]
}

function collapseSection(
  group: ElementContent[],
  count: number,
  style: CollapseStyle,
  direction: ExpandDirection
): Element {
  const collapsed = `${count} collapsed ${lineWord(count)}`
  const collapse = `Collapse ${count} ${lineWord(count)}`
  const expandIcon = icon(direction === 'both' ? 'expandAll' : 'expand', `acb-collapse-icon-${direction}`)
  // Only collapsible-start keeps its summary while open; it then offers to collapse again.
  const summaryIcons =
    style === 'collapsible-start' ? [expandIcon, icon('collapse', 'acb-collapse-icon-close')] : [expandIcon]
  return h('details', { className: ['acb-collapse', `acb-collapse-${style}`] }, [
    h(
      'summary',
      { className: ['acb-collapse-summary'] },
      separatorParts(summaryIcons, { dataCollapsed: collapsed, dataCollapse: collapse })
    ),
    ...group,
    ...(style === 'collapsible-end'
      ? [
          h(
            'span',
            { className: ['acb-collapse-end'], role: 'button' },
            separatorParts([icon('collapse', 'acb-collapse-icon-close')], { dataCollapse: collapse })
          )
        ]
      : [])
  ])
}

/**
 * Wraps the lines of each collapsed range in a `<details>` section. Ranges
 * refer to source lines; `sources[i]` is the source line of rendered line `i`
 * (lines removed by notation comments have none).
 */
function wrapCollapsed(
  lines: readonly Element[],
  sources: readonly number[],
  sourceLines: number,
  model: BlockModel,
  output: StructureOutput
): ElementContent[] {
  const ranges = mergeRanges(model.collapse, sourceLines)
  output.visibleRows = lines.length
  if (ranges.length === 0) return [...lines]
  const out: ElementContent[] = []
  let r = 0
  for (let i = 0; i < lines.length;) {
    while (r < ranges.length && ranges[r]!.to < sources[i]!) r++
    const range = ranges[r]
    if (!range || sources[i]! < range.from) {
      out.push(lines[i++]!)
      continue
    }
    const start = i
    while (i < lines.length && sources[i]! <= range.to) i++
    const count = i - start
    const atStart = start === 0
    const atEnd = i === lines.length
    const style =
      model.collapseStyle === 'collapsible-auto'
        ? atEnd
          ? 'collapsible-end'
          : 'collapsible-start'
        : model.collapseStyle
    out.push(collapseSection(lines.slice(start, i), count, style, expandDirection(atStart, atEnd)))
    // A closed section takes one row instead of its lines.
    output.visibleRows -= count - 1
    r++
  }
  return out
}

/** Property carrying a line's source line number from the `line` hook to the `code` hook. */
export const SOURCE_LINE = 'dataAcbSrc'

/** `pre` part of the structure, shared with the plain rendering. */
export function structurePre(node: Element, model: BlockModel): void {
  node.properties = { className: ['acb-pre', ...classList(node).filter(c => c !== 'shiki')] }
  if (model.lineNumbers) addClass(node, 'acb-has-ln')
}

/**
 * `code` part of the structure, shared with the plain rendering. Each line
 * element may carry its source line number in `SOURCE_LINE`; otherwise lines
 * are taken to be the source lines in order.
 */
export function structureCode(code: Element, model: BlockModel, output: StructureOutput): void {
  const matchers = compileInlineMarkers(model.inlineMarkers)
  const lines = code.children.filter(isLine)
  const sources = lines.map((line, i) => {
    const src = Number(line.properties?.[SOURCE_LINE])
    if (line.properties) delete line.properties[SOURCE_LINE]
    return Number.isInteger(src) && src > 0 ? src : i + 1
  })
  output.lineCount = lines.length
  code.properties = {
    ...code.properties,
    className: ['acb-code'],
    style: `--acb-ln-chars:${gutterChars(model.startLineNumber, lines.length)}`
  }

  const sourceLines = sources.reduce((max, src) => Math.max(max, src), 0)
  const { strongest, labels } = indexLineMarkers(model.lineMarkers, sourceLines)
  lines.forEach((line, i) => {
    const src = sources[i]!
    const marker = strongest[src - 1]
    const label = labels.get(src)
    const text = textContent(line)
    const indent = (model.preserveIndent ? indentColumns(text, model.tabSize) : 0) + model.hangingIndent

    const ranges = findInlineRanges(text, matchers)

    const content = h(
      'span',
      { className: ['acb-lc'], ...(indent > 0 && { style: `--acb-indent:${indent}` }) },
      ranges.length ? applyInlineRanges(line.children, ranges) : line.children
    )
    if (label) {
      content.children.unshift(
        h('span', {
          className: ['acb-label', `acb-label-${label.type}`],
          ariaHidden: 'true',
          dataLabel: label.label!
        })
      )
    }
    const gutter = model.lineNumbers
      ? [h('span', { className: ['acb-gutter'], ariaHidden: 'true', dataLn: String(model.startLineNumber + i) })]
      : []

    addClass(line, 'acb-line', ...(marker ? [`acb-${marker.type}`] : []))
    line.children = [...gutter, content]
  })

  // Lines are display:block: the "\n" text nodes between them are dropped.
  code.children = wrapCollapsed(lines, sources, sourceLines, model, output)
}

export function structureTransformer(model: BlockModel, output: StructureOutput): ShikiTransformer {
  return {
    name: 'awesome-codeblock:structure',
    enforce: 'post',
    // Line hooks run before notation transformers remove comment-only lines in
    // their `code` hooks, so each line remembers where it came from.
    line(node, line) {
      node.properties[SOURCE_LINE] = line
    },
    pre(node) {
      structurePre(node, model)
    },
    code(code) {
      structureCode(code, model, output)
    }
  }
}
