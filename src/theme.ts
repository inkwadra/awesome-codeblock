import type { Environment } from '@inkdropapp/types'
import { getSettings, subscribeSettings, type Settings } from './config'
import { FALLBACK_THEMES, isKnownTheme } from './highlight/shiki'
import { isDarkUi } from './inkdrop/platform'
import { DisposableBag } from './shared/disposables'
import { createStore } from './shared/store'

/** Decorations of Inkdrop theme package names around the Shiki theme name. */
const THEME_PREFIX = /^inkdrop-/
const THEME_SUFFIX = /-(?:ui|syntax|preview|theme)$/

/**
 * Picks the Shiki theme for the current Inkdrop appearance.
 *
 * With `matchInkdropTheme`, an Inkdrop theme whose name matches a bundled
 * Shiki theme (`catppuccin-mocha`, `nord`, `dracula`, `kanagawa-wave`, …) is
 * used as-is; common package-name decorations (`inkdrop-` prefix, `-ui`,
 * `-syntax`, `-preview`, `-theme` suffixes) are ignored.
 */
export function resolveShikiTheme(settings: Settings, inkdropThemes: readonly string[], dark: boolean): string {
  if (settings.matchInkdropTheme) {
    for (const name of inkdropThemes) {
      const normalized = name.toLowerCase().replace(THEME_PREFIX, '').replace(THEME_SUFFIX, '')
      if (isKnownTheme(normalized)) return normalized
    }
  }
  const preferred = dark ? settings.darkTheme : settings.lightTheme
  if (isKnownTheme(preferred)) return preferred
  return dark ? FALLBACK_THEMES.dark : FALLBACK_THEMES.light
}

const themeStore = createStore(resolveShikiTheme(getSettings(), [], false))

export const getActiveTheme = themeStore.get
export const subscribeTheme = themeStore.subscribe

/** Tracks Inkdrop's active themes, its dark/light appearance and the plugin settings. */
export function bindTheme(env: Environment): () => void {
  const recompute = () => {
    let names: string[] = []
    try {
      names = env.themes.getActiveThemeNames()
    } catch {
      // Older Inkdrop: theme matching is unavailable.
    }
    themeStore.set(resolveShikiTheme(getSettings(), names, isDarkUi()))
  }
  recompute()

  const bag = new DisposableBag()
  bag.add(subscribeSettings(recompute))
  try {
    const subscription = env.themes.onDidChangeActiveThemes(recompute)
    bag.add(() => subscription.dispose())
  } catch {
    // Older Inkdrop: theme changes are noticed through the body class only.
  }
  if (typeof MutationObserver !== 'undefined' && document.body) {
    // `dark-mode` / `light-mode` on <body> follow the appearance.
    const observer = new MutationObserver(recompute)
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] })
    bag.add(() => observer.disconnect())
  }
  return () => bag.dispose()
}
