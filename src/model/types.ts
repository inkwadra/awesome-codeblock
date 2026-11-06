import type { CollapseStyle, DiffStyle } from '../config'
import type { DiffFileSummary } from '../diff/summary'
import type { InlineMarker, MarkerType } from '../meta/parse-meta'
import type { LineRange } from '../meta/ranges'

export type FrameType = 'code' | 'none'

/** A diff view layout (`classic` is rendered as an ordinary code block). */
export type DiffViewStyle = Exclude<DiffStyle, 'classic'>

/** Where the code comes from (Inkdrop's `line=`, `branch=`, `commit=`). */
export interface BlockInfo {
  /** Source line range from `line=10-20`, shown next to the file name. */
  range?: { from: number; to?: number }
  branch?: string
  /** Short commit hash. */
  commit?: string
}

export interface ResolvedLineMarker extends LineRange {
  type: MarkerType
}

/**
 * Normalized, serializable description of one code block. Produced by the
 * rehype plugin, passed to the React components as JSON, and used as the
 * highlight cache key.
 */
export interface BlockModel {
  /** Language as written in the fence (lowercased), `''` if none. */
  lang: string
  /** Shiki language id used for highlighting (`'text'` if unknown). */
  hlLang: string
  /** Code to highlight and copy. No trailing newline. */
  code: string
  title?: string
  /** Inkdrop compat: link for the title (`url=`). */
  url?: string
  /** Inkdrop compat: info shown in the header (`line=`, `branch=`, `commit=`). */
  info?: BlockInfo
  frame: FrameType
  lineMarkers: ResolvedLineMarker[]
  inlineMarkers: InlineMarker[]
  wrap: boolean
  preserveIndent: boolean
  hangingIndent: number
  lineNumbers: boolean
  startLineNumber: number
  collapse: LineRange[]
  collapseStyle: CollapseStyle
  notation: boolean
  indentGuides: boolean
  tabSize: number
  maxLines: number
  /** Tab label when the block is part of a code group. */
  tab?: string
  /** Code group key (`group=`); groups with the same key switch together. */
  group?: string
  /**
   * Set for a real diff file shown as a diff view (`@pierre/diffs`). The
   * classic rendering stays available for export and printing.
   */
  diffStyle?: DiffViewStyle
  /** Shiki language of the diffed code (`lang=`), overriding the file names. */
  diffLang?: string
  /** Files and +/- counts of a diff-view patch, for the header. */
  diffFiles?: DiffFileSummary[]
}

/** Consecutive blocks with `tab=` / `group=`, rendered as one tabbed frame. */
export interface GroupData {
  /** The `group=` key shared by groups that switch together. */
  key?: string
  models: BlockModel[]
}
