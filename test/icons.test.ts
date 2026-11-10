import { describe, expect, it } from 'vite-plus/test'
import * as icons from '../src/icons/file-icons.generated'
import { resolveFileIcon } from '../src/icons/resolve'

const resolve = (lang?: string, title?: string, hlLang?: string) => resolveFileIcon(icons, { lang, hlLang, title })

describe('file icons', () => {
  it('maps languages and aliases', () => {
    expect(resolve('ts')).toBe('lang-typescript-duo')
    expect(resolve('typescript')).toBe('lang-typescript-duo')
    expect(resolve('tsx')).toBe('react')
    expect(resolve('sh')).toBe('bash-duo')
    expect(resolve('diff')).toBe('ui-SymbolDiffstatDuo')
  })
  it('prefers the title file name', () => {
    expect(resolve('json', 'package.json')).toBe('npm')
    expect(resolve('js', 'vite.config.js')).toBe('vite')
    expect(resolve('', 'Dockerfile')).toBe('docker')
    expect(resolve('txt', 'src/app.ts')).toBe('lang-typescript-duo')
  })
  it('falls back to the resolved language', () => {
    expect(resolve('golang', undefined, 'go')).toBe('lang-go')
    expect(resolve('nope', undefined, 'text')).toBe(icons.DEFAULT_ICON)
  })
  it('falls back to generic icons', () => {
    expect(resolve('java')).toBe(icons.DEFAULT_ICON)
    expect(resolve('')).toBe(icons.TEXT_ICON)
    expect(resolve('text')).toBe(icons.TEXT_ICON)
  })
  it('does not take Object.prototype members for icons', () => {
    expect(resolve('constructor')).toBe(icons.DEFAULT_ICON)
    expect(resolve('js', 'constructor')).toBe('lang-javascript-duo')
    expect(resolve('nope', 'a.constructor', 'text')).toBe(icons.DEFAULT_ICON)
  })
  it('has SVG data for every mapped icon', () => {
    const names = new Set([
      ...Object.values(icons.LANG_ICONS),
      ...Object.values(icons.EXT_ICONS),
      ...Object.values(icons.FILE_NAME_ICONS),
      icons.DEFAULT_ICON,
      icons.TEXT_ICON
    ])
    for (const n of names) expect(icons.FILE_ICON_SVG[n], n).toBeDefined()
  })
})
