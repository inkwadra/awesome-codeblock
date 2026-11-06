import { bundledLanguagesInfo } from 'shiki/langs'

/**
 * Fence language → Shiki language resolution, and language classification.
 * Pure and synchronous: no grammar is loaded here.
 */

/** Languages rendered without tokenization. */
export const PLAIN_LANGS: ReadonlySet<string> = new Set(['', 'text', 'txt', 'plain', 'plaintext', 'none', 'unknown'])

export function isPlainLanguage(lang: string): boolean {
  return PLAIN_LANGS.has(lang)
}

/** `diff` and `patch` fences. */
export function isDiffLanguage(lang: string): boolean {
  return lang === 'diff' || lang === 'patch'
}

/** Pseudo-languages Shiki renders without a grammar. */
export function isGrammarless(lang: string): boolean {
  return lang === 'text' || lang === 'ansi'
}

/** Alias → canonical id, built from Shiki's language metadata. */
const aliasToId = new Map<string, string>()
for (const info of bundledLanguagesInfo) {
  aliasToId.set(info.id, info.id)
  for (const alias of info.aliases ?? []) aliasToId.set(alias, info.id)
}

/** Extra aliases commonly used in notes that Shiki doesn't ship. */
export const EXTRA_ALIASES: Readonly<Record<string, string>> = {
  'c++': 'cpp',
  'c#': 'csharp',
  'f#': 'fsharp',
  golang: 'go',
  dockerfile: 'docker',
  'shell-session': 'shellsession',
  terminal: 'shellsession',
  ps1: 'powershell',
  yml: 'yaml',
  zsh: 'shellscript',
  conf: 'ini',
  cfg: 'ini',
  htm: 'html',
  xhtml: 'html',
  svg: 'xml',
  plist: 'xml',
  patch: 'diff',
  sol: 'solidity',
  rs: 'rust',
  kt: 'kotlin',
  ex: 'elixir',
  exs: 'elixir',
  pl: 'perl',
  ml: 'ocaml',
  hs: 'haskell',
  clj: 'clojure',
  tex: 'latex',
  gql: 'graphql',
  proto: 'protobuf',
  rb: 'ruby',
  py3: 'python',
  node: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  mts: 'typescript',
  cts: 'typescript'
}

/** Maximum alias chain followed, which also guards against cycles. */
const MAX_ALIAS_DEPTH = 4

let userAliases: Readonly<Record<string, string>> = {}

/** User-defined `alias=language` pairs from the settings. */
export function setUserAliases(aliases: Readonly<Record<string, string>>): void {
  userAliases = aliases
}

/** Grammars that failed to load; blocks in these languages render as plain text. */
const unavailable = new Set<string>()

export function markLanguageUnavailable(id: string): void {
  unavailable.add(id)
}

/** Test helper. */
export function resetUnavailableLanguages(): void {
  unavailable.clear()
}

/**
 * Resolves a fence language to a Shiki language id, `'ansi'`, or `'text'` when
 * unknown. Never throws.
 */
export function resolveLanguage(lang: string | undefined | null): string {
  let name = (lang ?? '').trim().toLowerCase()
  if (PLAIN_LANGS.has(name)) return 'text'
  for (let i = 0; i < MAX_ALIAS_DEPTH && userAliases[name]; i++) name = userAliases[name]!
  if (name === 'ansi') return 'ansi'
  const id = aliasToId.get(name) ?? aliasToId.get(EXTRA_ALIASES[name] ?? '')
  return !id || unavailable.has(id) ? 'text' : id
}

const DISPLAY_NAMES: Readonly<Record<string, string>> = {
  text: 'Plain text',
  ansi: 'ANSI',
  shellscript: 'Shell',
  shellsession: 'Shell session'
}
const idToName = new Map(bundledLanguagesInfo.map(info => [info.id, info.name]))

/** Human-readable language name ("TypeScript", "Shell"), or the raw fence language. */
export function languageDisplayName(hlLang: string, fenceLang: string): string {
  if (hlLang === 'text') return fenceLang && !PLAIN_LANGS.has(fenceLang) ? fenceLang : DISPLAY_NAMES.text!
  return DISPLAY_NAMES[hlLang] ?? idToName.get(hlLang) ?? fenceLang
}
