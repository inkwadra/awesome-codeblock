import type { HighlighterCore } from 'shiki/core'

/**
 * CSS custom properties for a frame, taken from the Shiki theme's VS Code
 * colors. Each property lists its candidate colors in order of preference.
 */
type VarSource = (theme: {
  fg: string
  bg: string
  colors: Record<string, string | undefined>
}) => Array<string | undefined>

const VARS: Record<string, VarSource> = {
  '--acb-fg': t => [t.fg],
  '--acb-ln-fg': t => [t.colors['editorLineNumber.foreground']],
  '--acb-ln-active-fg': t => [t.colors['editorLineNumber.activeForeground']],
  '--acb-selection': t => [t.colors['editor.selectionBackground']],
  '--acb-indent-guide': t => [t.colors['editorIndentGuide.background1'], t.colors['editorIndentGuide.background']],
  '--acb-accent': t => [t.colors['focusBorder'], t.colors['tab.activeBorderTop'], t.colors['textLink.foreground']],
  '--acb-bg': t => [t.bg]
}

export interface ThemeVars {
  vars: Record<string, string>
  dark: boolean
}

const cache = new Map<string, ThemeVars>()

export function themeVars(hl: HighlighterCore, theme: string): ThemeVars {
  let result = cache.get(theme)
  if (result) return result
  const registration = hl.getTheme(theme)
  const source = { fg: registration.fg, bg: registration.bg, colors: registration.colors ?? {} }
  const vars: Record<string, string> = {}
  for (const [name, candidates] of Object.entries(VARS)) {
    const value = candidates(source).find(Boolean)
    if (value) vars[name] = value
  }
  result = { vars, dark: registration.type === 'dark' }
  cache.set(theme, result)
  return result
}
