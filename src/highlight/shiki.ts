import type { HighlighterCore, LanguageInput, ThemeInput } from 'shiki/core'
import { bundledLanguages } from 'shiki/langs'
import { bundledThemes, bundledThemesInfo } from 'shiki/themes'
import { keyedOnce, lazy } from '../shared/lazy'
import { log } from '../shared/log'
import { isGrammarless, markLanguageUnavailable, resetUnavailableLanguages } from './languages'

/**
 * The plugin's one Shiki highlighter, created lazily.
 *
 * Inkdrop's renderer CSP is `script-src 'self' 'unsafe-inline' blob:` — no
 * `wasm-unsafe-eval` — so the Oniguruma WASM engine cannot be compiled. We use
 * Shiki's JavaScript RegExp engine instead (in forgiving mode, so a grammar
 * with an unsupported pattern degrades instead of failing).
 *
 * Grammars and themes are dynamic imports, so only what a note actually uses
 * is ever loaded.
 */

export const FALLBACK_THEMES = { light: 'github-light', dark: 'github-dark' } as const

export function isKnownTheme(theme: string): boolean {
  return Object.hasOwn(bundledThemes, theme)
}

/**
 * The Shiki core inside `@pierre/diffs`' shared highlighter, or `null` if this
 * version of diffs no longer exposes it. Its `raw` field is private in the
 * typings but a plain property at runtime; the diffs version is pinned and a
 * test guards this.
 */
export function shikiCoreOf(shared: unknown): HighlighterCore | null {
  const raw = (shared as { raw?: Partial<HighlighterCore> } | null)?.raw
  return raw && typeof raw.codeToHast === 'function' && typeof raw.loadLanguage === 'function'
    ? (raw as HighlighterCore)
    : null
}

/** diffs' shared core, so code blocks and diff views load each grammar and theme once. */
async function sharedDiffsCore(): Promise<HighlighterCore | null> {
  try {
    const { getSharedHighlighter } = await import('acb-diffs-highlighter')
    const core = shikiCoreOf(await getSharedHighlighter({ preferredHighlighter: 'shiki-js', themes: [], langs: [] }))
    if (!core) log.warn('@pierre/diffs does not expose its Shiki core; using a separate one')
    return core
  } catch (err) {
    log.warn('@pierre/diffs highlighter unavailable; using a separate one:', err)
    return null
  }
}

async function privateCore(): Promise<HighlighterCore> {
  const [{ createHighlighterCore }, { createJavaScriptRegexEngine }] = await Promise.all([
    import('shiki/core'),
    import('shiki/engine/javascript')
  ])
  return createHighlighterCore({ engine: createJavaScriptRegexEngine({ forgiving: true }), themes: [], langs: [] })
}

/**
 * One Shiki core for the whole plugin: the one `@pierre/diffs` creates for its
 * shared highlighter (JavaScript engine, made forgiving at build time by
 * `scripts/diffs-build.mjs`). If diffs ever stops exposing its core we fall
 * back to a private one, so code blocks keep working (diff views then load
 * their own grammars).
 */
const highlighter = lazy(async () => (await sharedDiffsCore()) ?? (await privateCore()))

export function getHighlighter(): Promise<HighlighterCore> {
  return highlighter.load()
}

const languages = keyedOnce(
  async lang => {
    const loader = (bundledLanguages as Record<string, LanguageInput | undefined>)[lang]
    if (!loader) throw new Error(`Unknown language: ${lang}`)
    await (await getHighlighter()).loadLanguage(loader)
  },
  (lang, err) => {
    markLanguageUnavailable(lang)
    log.warn(`Failed to load grammar "${lang}":`, err)
  }
)

const themes = keyedOnce(
  async theme => {
    const loader = (bundledThemes as Record<string, ThemeInput | undefined>)[theme]
    if (!loader) throw new Error(`Unknown theme: ${theme}`)
    await (await getHighlighter()).loadTheme(loader)
  },
  (theme, err) => log.warn(`Failed to load theme "${theme}":`, err)
)

function needsGrammar(hl: HighlighterCore, lang: string): boolean {
  return !isGrammarless(lang) && !languages.failed(lang) && !hl.getLoadedLanguages().includes(lang)
}

/**
 * Makes sure the highlighter, the languages and the theme are loaded.
 * Resolves to the effective theme (a fallback if the requested one failed).
 */
export async function ensureLoaded(langs: readonly string[], theme: string): Promise<string> {
  const hl = await getHighlighter()
  await Promise.all([...new Set(langs)].filter(lang => needsGrammar(hl, lang)).map(lang => languages.run(lang)))
  if (!hl.getLoadedThemes().includes(theme)) await themes.run(theme)
  if (hl.getLoadedThemes().includes(theme)) return theme
  // Same appearance as the theme that failed.
  const fallback = themeType(theme) === 'light' ? FALLBACK_THEMES.light : FALLBACK_THEMES.dark
  await themes.run(fallback)
  return fallback
}

function themeType(theme: string): 'light' | 'dark' | undefined {
  return bundledThemesInfo.find(info => info.id === theme)?.type
}

/**
 * Returns the highlighter if everything needed is already loaded, so callers
 * can render synchronously; `null` otherwise.
 */
export function getLoadedHighlighter(langs: readonly string[], theme: string): HighlighterCore | null {
  const hl = highlighter.peek()
  if (!hl || !hl.getLoadedThemes().includes(theme)) return null
  return langs.some(lang => needsGrammar(hl, lang)) ? null : hl
}

/** The language actually usable for highlighting right now. */
export function effectiveLanguage(hl: HighlighterCore, lang: string): string {
  if (isGrammarless(lang)) return lang
  return hl.getLoadedLanguages().includes(lang) ? lang : 'text'
}

/** Test helper. */
export async function __resetHighlighterForTests(): Promise<void> {
  const { disposeHighlighter } = await import('acb-diffs-highlighter')
  await disposeHighlighter()
  highlighter.reset()
  languages.clear()
  themes.clear()
  resetUnavailableLanguages()
}
