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
 * The lines left once Shiki notation comments are removed: comment-only lines
 * disappear, trailing comments are cut.
 *
 * This is an estimate, for the rendering shown before Shiki is ready: what
 * Shiki takes for a comment depends on the grammar's tokens. `commentOnly` is
 * for code without a grammar, where a line is one token and so only a line that
 * is a comment from its start carries notations.
 */
export function notationFreeLines(code: string, commentOnly = false): SourceLine[] {
  const out: SourceLine[] = []
  code.split('\n').forEach((line, i) => {
    if (NOTATION_LINE_RE.test(line)) return
    out.push({ source: i + 1, text: commentOnly ? line : line.replace(NOTATION_TRAILING_RE, '') })
  })
  return out
}

/** Removes Shiki notation comments (`// [!code ++]`, …), as `notationFreeLines` estimates them. */
export function stripNotation(code: string, commentOnly = false): string {
  return notationFreeLines(code, commentOnly)
    .map(line => line.text)
    .join('\n')
}

/** True if rendering may remove notation comments, so the shown code can differ from `model.code`. */
export function mayHaveNotation(model: Pick<BlockModel, 'notation' | 'code'>): boolean {
  return model.notation && model.code.includes('[!code')
}

/** Whether the block is rendered without a grammar, one token per line. */
export function isSingleTokenLines(model: Pick<BlockModel, 'hlLang'>): boolean {
  return model.hlLang === 'text'
}

/**
 * Text placed on the clipboard by the copy button: the code without notation
 * comments. `rendered` is the code as the block shows it (see
 * `StructureOutput.text`), which is exact; without it the removal is estimated.
 */
export function getCopyText(model: BlockModel, rendered?: string): string {
  if (!mayHaveNotation(model)) return model.code
  return rendered ?? stripNotation(model.code, isSingleTokenLines(model))
}
