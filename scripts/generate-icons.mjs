#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const root = resolve(dirname(new URL(import.meta.url).pathname), '..')
const pkgDir = name => join(root, 'node_modules', name)
const vscodeDir = pkgDir('@pierre/vscode-icons')
const uiDir = join(pkgDir('@pierre/icons'), 'svg')
const load = async rel => (await import(pathToFileURL(join(vscodeDir, rel)).href)).default
const { bundledLanguagesInfo } = await import(pathToFileURL(join(root, 'node_modules/shiki/dist/langs.mjs')).href)

const tiers = [
  ...(await load('scripts/themes/minimal.mjs')),
  ...(await load('scripts/themes/default.mjs')),
  ...(await load('scripts/themes/complete.mjs'))
]

const LANG_KEYS = {
  text: 'txt',
  txt: 'txt',
  plain: 'txt',
  plaintext: 'txt',
  typescript: 'ts',
  javascript: 'js',
  python: 'py',
  rust: 'rs',
  ruby: 'rb',
  markdown: 'md',
  shellscript: 'sh',
  shell: 'sh',
  shellsession: 'sh',
  console: 'sh',
  terminal: 'sh',
  nushell: 'sh',
  nu: 'sh',
  powershell: 'ui:Terminal',
  ps: 'ui:Terminal',
  ps1: 'ui:Terminal',
  pwsh: 'ui:Terminal',
  bat: 'ui:Terminal',
  batch: 'ui:Terminal',
  cmd: 'ui:Terminal',
  ansi: 'ui:Terminal',
  csharp: 'cs',
  'c#': 'cs',
  'objective-c': 'm',
  objc: 'm',
  'objective-cpp': 'mm',
  yaml: 'yml',
  terraform: 'tf',
  hcl: 'tf',
  docker: 'file:dockerfile',
  dockerfile: 'file:dockerfile',
  'git-commit': 'file:.gitignore',
  'git-rebase': 'file:.gitignore',
  'html-derivative': 'html',
  'vue-html': 'vue',
  dotenv: 'env',
  diff: 'ui:SymbolDiffstatDuo',
  patch: 'ui:SymbolDiffstatDuo',
  regexp: 'ui:Regex',
  regex: 'ui:Regex',
  mermaid: 'ui:Workflow',
  latex: 'ui:Function',
  tex: 'ui:Function',
  math: 'ui:Function',
  http: 'ui:Globe',
  nginx: 'ui:Server',
  apache: 'ui:Server',
  make: 'ui:Wrench',
  makefile: 'ui:Wrench',
  cmake: 'ui:Wrench',
  toml: 'svg:gear',
  ini: 'svg:gear',
  properties: 'svg:gear',
  log: 'ui:Logs'
}

const UI_ICONS = {
  copy: 'Copy',
  check: 'Check',
  wrap: 'WordWrap',
  chevronDown: 'Chevron',
  chevronUp: ['Chevron', 'rotate(180 8 8)'],
  chevronRight: ['Chevron', 'rotate(-90 8 8)'],
  file: 'File',
  branch: 'Branch',
  commit: 'Commit',
  link: 'ArrowUpRight',
  lines: 'ListOrdered'
}

const DEFAULT_ICON = 'code'
const TEXT_ICON = 'file-text-duo'

function parseSvg(raw) {
  const viewBox = /viewBox="([^"]+)"/.exec(raw)?.[1] ?? '0 0 16 16'
  const body = raw
    .replace(/^[\s\S]*?<svg[^>]*>/, '')
    .replace(/<\/svg>\s*$/, '')
    .replace(/="(black|#000|#000000)"/g, '="currentColor"')
    .replace(/\s*\n\s*/g, ' ')
    .replace(/>\s+</g, '><')
    .trim()
  return [viewBox, body]
}

const readVscodeSvg = name => parseSvg(readFileSync(join(vscodeDir, 'svgs', `${name}.svg`), 'utf8'))
const readUiSvg = name => parseSvg(readFileSync(join(uiDir, `Icon${name}.svg`), 'utf8'))

const defs = new Map()
const extMap = {}
const fileNameMap = {}
for (const icon of tiers) {
  defs.set(icon.name, icon)
  for (const ext of icon.fileExtensions ?? []) extMap[ext.toLowerCase()] = icon.name
  for (const fn of icon.fileNames ?? []) fileNameMap[fn.toLowerCase()] = icon.name
}

const used = new Set([DEFAULT_ICON, TEXT_ICON, ...Object.values(extMap), ...Object.values(fileNameMap)])
const uiGlyphs = new Set()

function resolveKey(key) {
  if (key.startsWith('ui:')) {
    uiGlyphs.add(key.slice(3))
    return `ui-${key.slice(3)}`
  }
  if (key.startsWith('svg:')) return key.slice(4)
  if (key.startsWith('file:')) return fileNameMap[key.slice(5)]
  return extMap[key]
}

const langMap = {}
const langNames = new Set(Object.keys(LANG_KEYS))
for (const info of bundledLanguagesInfo) {
  langNames.add(info.id)
  for (const a of info.aliases ?? []) langNames.add(a)
}
const lookup = name => (LANG_KEYS[name] ? resolveKey(LANG_KEYS[name]) : extMap[name])
for (const name of langNames) {
  let icon = lookup(name)
  if (!icon) {
    const info = bundledLanguagesInfo.find(i => i.id === name || (i.aliases ?? []).includes(name))
    if (info) icon = [info.id, ...(info.aliases ?? [])].map(lookup).find(Boolean)
  }
  if (icon) {
    langMap[name] = icon
    used.add(icon)
  }
}

const byCodeUnit = (a, b) => (a < b ? -1 : a > b ? 1 : 0)

const svg = {}
for (const name of [...used].sort(byCodeUnit)) {
  if (name.startsWith('ui-')) continue
  const def = defs.get(name)
  const [viewBox, body] = readVscodeSvg(def?.svgName ?? name)
  const c = def?.color
  const colors = c ? (c.fg ? [c.fg.dark, c.fg.light, c.bg.dark, c.bg.light] : [c.dark, c.light]) : 0
  const entry = [viewBox, body]
  if (colors || def?.opacity) entry.push(colors)
  if (def?.opacity) entry.push(def.opacity)
  svg[name] = entry
}
for (const glyph of [...uiGlyphs].sort(byCodeUnit)) svg[`ui-${glyph}`] = readUiSvg(glyph)

const ui = {}
for (const [key, spec] of Object.entries(UI_ICONS)) {
  const [name, transform] = Array.isArray(spec) ? spec : [spec]
  const [viewBox, body] = readUiSvg(name)
  ui[key] = [viewBox, transform ? `<g transform="${transform}">${body}</g>` : body]
}

const sortObj = o => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)))
const files = `/* eslint-disable */

export type FileIconData = readonly [string, string, (0 | readonly string[])?, number?]

export const DEFAULT_ICON = ${JSON.stringify(DEFAULT_ICON)}
export const TEXT_ICON = ${JSON.stringify(TEXT_ICON)}

export const LANG_ICONS: Record<string, string> = ${JSON.stringify(sortObj(langMap))}

export const EXT_ICONS: Record<string, string> = ${JSON.stringify(sortObj(extMap))}

export const FILE_NAME_ICONS: Record<string, string> = ${JSON.stringify(sortObj(fileNameMap))}

export const FILE_ICON_SVG: Record<string, FileIconData> = ${JSON.stringify(svg)}
`
const uiOut = `/* eslint-disable */
export type SvgData = readonly [viewBox: string, body: string]

export const UI_ICON_SVG = ${JSON.stringify(ui)} as const satisfies Record<string, SvgData>
`
writeFileSync(join(root, 'src/icons/file-icons.generated.ts'), files)
writeFileSync(join(root, 'src/icons/ui-icons.generated.ts'), uiOut)
console.log(
  `icons: ${Object.keys(svg).length} file icons, ${Object.keys(langMap).length} languages, ${Object.keys(extMap).length} extensions, ${Object.keys(fileNameMap).length} file names; ${(files.length / 1024).toFixed(1)} KB + ${(uiOut.length / 1024).toFixed(1)} KB`
)
