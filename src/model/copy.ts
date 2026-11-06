import { COMMENT_CLOSE, COMMENT_OPEN } from './source'
import type { BlockModel } from './types'

/** The notations Shiki's transformers understand (`[!code ++]`, `[!code word:foo:2]`, …). */
const NOTATION = String.raw`\[!code (?:\+\+|--|highlight|hl|focus|error|warning|info|word:(?:\\.|[^:\]])+)(?::\d+)?\]`
const NOTATIONS = String.raw`${COMMENT_OPEN}\s*${NOTATION}(?:\s*${NOTATION})*\s*${COMMENT_CLOSE}?\s*$`
const NOTATION_LINE_RE = new RegExp(String.raw`^\s*${NOTATIONS}`)
const NOTATION_TRAILING_RE = new RegExp(String.raw`\s*${NOTATIONS}`)

/** A line of code with notation comments removed, and its 1-based source line. */
export interface SourceLine {
  source: number
  text: string
}

/**
 * The lines left once Shiki notation comments are removed like the renderer
 * does: comment-only lines disappear, trailing comments are cut.
 */
export function notationFreeLines(code: string): SourceLine[] {
  const out: SourceLine[] = []
  code.split('\n').forEach((line, i) => {
    if (!NOTATION_LINE_RE.test(line)) out.push({ source: i + 1, text: line.replace(NOTATION_TRAILING_RE, '') })
  })
  return out
}

/** Removes Shiki notation comments (`// [!code ++]`, …) like the renderer does. */
export function stripNotation(code: string): string {
  return notationFreeLines(code)
    .map(line => line.text)
    .join('\n')
}

/** Text placed on the clipboard by the copy button. */
export function getCopyText(model: BlockModel): string {
  return model.notation && model.code.includes('[!code') ? stripNotation(model.code) : model.code
}
