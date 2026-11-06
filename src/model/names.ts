import { isDiffLanguage, languageDisplayName } from '../highlight/languages'
import type { BlockModel } from './types'

/** The block's name in the header: "TypeScript", "TypeScript diff", "Shell". */
export function blockLanguageName(model: BlockModel): string {
  if (!isDiffLanguage(model.lang)) return languageDisplayName(model.hlLang, model.lang)
  // A real diff file is highlighted as `diff` itself: "Diff", not "Diff diff".
  return model.hlLang === 'text' || isDiffLanguage(model.hlLang)
    ? 'Diff'
    : `${languageDisplayName(model.hlLang, '')} diff`
}

/** Label of a block's tab in a code group. */
export function tabLabel(model: BlockModel, index: number): string {
  return model.tab ?? model.title ?? (model.lang || `Tab ${index + 1}`)
}
