import type { Environment } from '@inkdropapp/types'

/**
 * Which code block languages other plugins render, read from the renderer's
 * `remarkCodeComponents`. Keys `default` / `inlineDefault` are Inkdrop's own
 * renderers; any other key is a language owned by a plugin.
 */

type CodeComponents = Pick<Environment['markdownRenderer'], 'remarkCodeComponents'>

const BUILTIN_CODE_KEYS = new Set(['default', 'inlineDefault'])

/** True if another plugin renders code blocks of this language (mermaid, math, …). */
export function isForeignLanguage(renderer: CodeComponents, lang: string): boolean {
  if (!lang || BUILTIN_CODE_KEYS.has(lang)) return false
  const components = renderer.remarkCodeComponents ?? {}
  return Object.hasOwn(components, lang) && !!components[lang]
}

/** Languages whose code blocks other plugins render, for editor completion. */
export function pluginLanguages(renderer: CodeComponents | undefined): string[] {
  if (!renderer) return []
  return Object.keys(renderer.remarkCodeComponents ?? {}).filter(
    key => !key.startsWith('inline') && isForeignLanguage(renderer, key)
  )
}
