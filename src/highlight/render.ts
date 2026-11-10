import type { Root } from 'hast'
import type { HighlighterCore, ShikiTransformer } from 'shiki/core'
import { hastToHtml } from 'shiki/core'
import { isSingleTokenLines, notationFreeLines, type BlockModel } from '../model'
import { h } from '../shared/hast'
import { log } from '../shared/log'
import { effectiveLanguage } from './shiki'
import { themeVars } from './theme-vars'
import { indentGuidesTransformer, NOTATION_TRANSFORMERS } from './transformers/notation'
import {
  detectIndentStep,
  SOURCE_LINE,
  structureCode,
  structurePre,
  structureTransformer,
  type StructureOutput
} from './transformers/structure'

/** Markup of a block, without the theme. */
export interface PlainRender extends StructureOutput {
  /** HTML of the `<pre>` element. */
  html: string
}

export interface RenderResult extends PlainRender {
  /** CSS custom properties derived from the theme. */
  vars: Record<string, string>
  /** Whether the theme is dark. */
  dark: boolean
}

function transformersFor(model: BlockModel, output: StructureOutput): ShikiTransformer[] {
  return [
    ...(model.notation ? NOTATION_TRANSFORMERS : []),
    ...(model.indentGuides ? [indentGuidesTransformer(detectIndentStep(model.code, model.tabSize))] : []),
    structureTransformer(model, output)
  ]
}

const emptyOutput = (): StructureOutput => ({ lineCount: 0, visibleRows: 0 })

/**
 * Unhighlighted hast with the same structure as a highlighted block: line
 * markers, labels, inline markers, collapsed sections. Notation comments are
 * removed (but not applied), as closely as that can be told without tokens.
 */
function plainRoot(model: BlockModel, output: StructureOutput): Root {
  const lines = model.notation
    ? notationFreeLines(model.code, isSingleTokenLines(model))
    : model.code.split('\n').map((text, i) => ({ source: i + 1, text }))
  const code = h(
    'code',
    {},
    lines.map(line =>
      h(
        'span',
        { className: ['line'], [SOURCE_LINE]: line.source },
        line.text ? [{ type: 'text', value: line.text }] : []
      )
    )
  )
  const pre = h('pre', {}, [code])
  structurePre(pre, model)
  structureCode(code, model, output)
  return { type: 'root', children: [pre] }
}

/** Highlights a block with a loaded highlighter. Falls back to plain text if the grammar throws. */
export function renderBlock(hl: HighlighterCore, model: BlockModel, theme: string): RenderResult {
  let output = emptyOutput()
  let root: Root
  try {
    root = hl.codeToHast(model.code, {
      lang: effectiveLanguage(hl, model.hlLang),
      theme,
      transformers: transformersFor(model, output),
      tabindex: false
    })
  } catch (err) {
    log.warn('highlight failed, falling back to plain text:', err)
    output = emptyOutput()
    root = plainRoot(model, output)
  }
  const { vars, dark } = themeVars(hl, theme)
  return { html: hastToHtml(root), vars, dark, ...output }
}

/** Plain, unhighlighted rendering with the same structure, used before Shiki is ready. */
export function renderPlain(model: BlockModel): PlainRender {
  const output = emptyOutput()
  const html = hastToHtml(plainRoot(model, output))
  return { html, ...output }
}
