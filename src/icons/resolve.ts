/** Icon lookup, kept free of React so it can be unit-tested. */
import { isPlainLanguage } from '../highlight/languages'

export type FileIcons = typeof import('./file-icons.generated')

/** Picks the icon for a file name: exact name, then the longest extension. */
export function iconForFileName(icons: FileIcons, fileName: string): string | undefined {
  const base = fileName.trim().split(/[\\/]/).pop()?.toLowerCase() ?? ''
  if (!base) return undefined
  const byName = icons.FILE_NAME_ICONS[base]
  if (byName) return byName
  const parts = base.split('.')
  for (let i = 1; i < parts.length; i++) {
    const ext = parts.slice(i).join('.')
    const icon = icons.EXT_ICONS[ext]
    if (icon) return icon
  }
  return undefined
}

function iconForLanguage(icons: FileIcons, lang: string | undefined): string | undefined {
  const key = (lang ?? '').toLowerCase()
  return key ? (icons.LANG_ICONS[key] ?? icons.EXT_ICONS[key]) : undefined
}

/**
 * Icon of a block: the title's file name, then the fence language, then the
 * Shiki language it resolves to (so `golang` or a user alias gets the icon of
 * its language), then a generic icon.
 */
export function resolveFileIcon(icons: FileIcons, opts: { lang?: string; hlLang?: string; title?: string }): string {
  const lang = (opts.lang ?? '').toLowerCase()
  return (
    (opts.title ? iconForFileName(icons, opts.title) : undefined) ??
    iconForLanguage(icons, lang) ??
    (opts.hlLang !== 'text' ? iconForLanguage(icons, opts.hlLang) : undefined) ??
    (isPlainLanguage(lang) ? icons.TEXT_ICON : icons.DEFAULT_ICON)
  )
}
