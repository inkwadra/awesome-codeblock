import { COLLAPSE_STYLES, DIFF_STYLES, oneOf, type Settings } from '../config'
import { summarizePatch } from '../diff/summary'
import { isDiffLanguage, resolveLanguage } from '../highlight/languages'
import { getBool, getInt, getString, parseMeta, type ParsedMeta } from '../meta/parse-meta'
import { shiftRanges } from '../meta/ranges'
import { findFileNameComment, isRealDiff, splitLangAndMeta, stripDiffPrefixes } from './source'
import type { BlockInfo, BlockModel, DiffViewStyle, ResolvedLineMarker } from './types'

/**
 * Builds a `BlockModel` from a fenced code block: the fence language, its
 * meta string and the code. A pipeline of small resolvers, each reading the
 * parsed meta and the plugin settings.
 *
 * Line numbers in the meta refer to the *source* lines. Lines removed from the
 * code (an extracted file-name comment) are tracked so markers and collapsed
 * sections can be re-mapped at the end.
 */

export interface BuildInput {
  lang?: string
  meta?: string
  code: string
}

type Options = ParsedMeta['options']

/** State shared by the resolvers while one block is built. */
interface Draft {
  lang: string
  lines: string[]
  /** 1-based source line numbers removed from the code. */
  removed: number[]
  markers: ResolvedLineMarker[]
}

export function buildModel(input: BuildInput, settings: Settings): BlockModel {
  const [rawLang, rawMeta] = splitLangAndMeta(input.lang, input.meta)
  const meta = parseMeta(rawMeta)
  const opts = meta.options
  const draft: Draft = {
    lang: rawLang.toLowerCase(),
    lines: normalizeNewlines(input.code).split('\n'),
    removed: [],
    markers: meta.lineMarkers.flatMap(({ type, ranges }) => ranges.map(range => ({ type, ...range })))
  }

  const frameOpt = getString(opts, 'frame')?.toLowerCase()
  const title = resolveTitle(draft, opts, meta.bracketTitle, frameOpt, settings)
  const diff = resolveDiff(draft, opts, settings)

  if (draft.removed.length) draft.lines = draft.lines.filter((_, i) => !draft.removed.includes(i + 1))
  const code = draft.lines.join('\n')

  // The diff view only for patches it can show; others (`3c3`, context diffs) stay classic.
  const diffFiles = diff.view ? summarizePatch(code, title?.trim() || 'file') : []
  const diffView = diffFiles.length > 0 ? diff.view : undefined

  const { info, startLine } = resolveSourceInfo(opts)
  const lineNumbersImplied = startLine !== undefined || getInt(opts, 'startLineNumber') !== undefined
  const url = getString(opts, 'url')
  const tab = getString(opts, 'tab')
  const group = getString(opts, 'group')

  return {
    lang: draft.lang,
    hlLang: resolveLanguage(diff.highlightAs),
    code,
    ...(title !== undefined && { title: title }),
    ...(url !== undefined && { url }),
    ...(info && { info }),
    frame: frameOpt === 'none' ? 'none' : 'code',
    lineMarkers: shiftRanges(draft.markers, draft.removed),
    inlineMarkers: meta.inlineMarkers,
    wrap: getBool(opts, 'wrap') ?? settings.wrap,
    preserveIndent: getBool(opts, 'preserveIndent') ?? true,
    hangingIndent: Math.max(0, getInt(opts, 'hangingIndent') ?? 0),
    lineNumbers:
      getBool(opts, 'showLineNumbers') ??
      getBool(opts, 'lineNumbers') ??
      getBool(opts, 'ln') ??
      (lineNumbersImplied || settings.showLineNumbers),
    startLineNumber: getInt(opts, 'startLineNumber') ?? startLine ?? 1,
    collapse: shiftRanges(meta.collapse, draft.removed),
    collapseStyle: oneOf(COLLAPSE_STYLES, getString(opts, 'collapseStyle')) ?? settings.collapseStyle,
    notation: getBool(opts, 'notation') ?? settings.notationComments,
    indentGuides: getBool(opts, 'indentGuides') ?? settings.indentGuides,
    tabSize: clamp(getInt(opts, 'tabSize') ?? settings.tabSize, 1, 16),
    maxLines: Math.max(0, getInt(opts, 'maxLines') ?? settings.maxLines),
    ...(tab !== undefined && { tab }),
    ...(group !== undefined && { group }),
    ...(diffView && {
      diffStyle: diffView,
      ...(diff.lang && { diffLang: diff.lang }),
      diffFiles
    })
  }
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n))

function normalizeNewlines(code: string): string {
  return code.replace(/\r\n?/g, '\n').replace(/\n$/, '')
}

/** `title=`, `[file]`, `filename=`, or a file-name comment (which is removed from the code). */
function resolveTitle(
  draft: Draft,
  opts: Options,
  bracketTitle: string | undefined,
  frameOpt: string | undefined,
  settings: Settings
): string | undefined {
  const explicit = getString(opts, 'title') ?? bracketTitle ?? getString(opts, 'filename')
  if (explicit !== undefined) return explicit
  const extract = frameOpt !== 'none' && (getBool(opts, 'extractFileName') ?? settings.extractFileNameFromCode)
  const found = extract ? findFileNameComment(draft.lines) : null
  if (!found) return undefined

  draft.removed.push(found.index + 1)
  // Also drop a single empty line right after the comment (unless it is the last line).
  const next = found.index + 1
  if (draft.lines[next]?.trim() === '' && next < draft.lines.length - 1) draft.removed.push(next + 1)
  return found.name
}

interface ResolvedDiff {
  /** Language passed to `resolveLanguage` for highlighting. */
  highlightAs: string
  view?: DiffViewStyle
  /** Language of the diffed code in a diff view. */
  lang?: string
}

/**
 * `diff` / `patch` fences: a real diff file keeps its headers and may get a
 * diff view; a hand-written one has its `+` / `-` prefixes turned into line
 * markers. `useDiffSyntax` does the latter for any language.
 */
function resolveDiff(draft: Draft, opts: Options, settings: Settings): ResolvedDiff {
  const target = getString(opts, 'lang')
  if (isDiffLanguage(draft.lang)) {
    if (isRealDiff(draft.lines)) {
      const style = oneOf(DIFF_STYLES, getString(opts, 'diffStyle')) ?? settings.diffStyle
      const lang = target ? resolveLanguage(target) : 'text'
      return {
        highlightAs: 'diff',
        ...(style !== 'classic' && { view: style }),
        ...(lang !== 'text' && { lang })
      }
    }
    applyDiffPrefixes(draft, true)
    return { highlightAs: target ?? 'text' }
  }
  if (getBool(opts, 'useDiffSyntax')) applyDiffPrefixes(draft, false)
  return { highlightAs: draft.lang }
}

function applyDiffPrefixes(draft: Draft, stripContext: boolean): void {
  const { lines, changes } = stripDiffPrefixes(draft.lines, stripContext)
  draft.lines = lines
  for (const { line, type } of changes) draft.markers.push({ type, from: line, to: line })
}

/** Inkdrop-compatible `line=`, `branch=`, `commit=`. */
function resolveSourceInfo(opts: Options): { info?: BlockInfo; startLine?: number } {
  const info: BlockInfo = {}
  let startLine: number | undefined
  const lineOpt = getString(opts, 'line')
  if (lineOpt) {
    const [from, to] = lineOpt.split('-').map(n => parseInt(n, 10))
    if (from !== undefined && Number.isFinite(from)) {
      startLine = from
      info.range = to !== undefined && Number.isFinite(to) && to !== from ? { from, to } : { from }
    }
  }
  const branch = getString(opts, 'branch')
  const commit = getString(opts, 'commit')
  if (branch) info.branch = branch
  if (commit) info.commit = commit.slice(0, 7)
  return { ...(Object.keys(info).length > 0 && { info }), ...(startLine !== undefined && { startLine }) }
}
