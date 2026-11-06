import type { ConfigSchema, Environment } from '@inkdropapp/types'
import { bundledThemesInfo } from 'shiki/themes'
import { createStore } from './shared/store'

export const PACKAGE_NAME = 'awesome-codeblock'

export const COLLAPSE_STYLES = ['github', 'collapsible-start', 'collapsible-end', 'collapsible-auto'] as const
export type CollapseStyle = (typeof COLLAPSE_STYLES)[number]

/** How real diffs (`diff` / `patch` files with headers or hunks) are shown. */
export const DIFF_STYLES = ['unified', 'split', 'classic'] as const
export type DiffStyle = (typeof DIFF_STYLES)[number]

/** Narrows a user-supplied string to one of `values`, or `undefined`. */
export function oneOf<T extends string>(values: readonly T[], value: string | undefined): T | undefined {
  return values.includes(value as T) ? (value as T) : undefined
}

export interface Settings {
  // Themes
  lightTheme: string
  darkTheme: string
  matchInkdropTheme: boolean
  // Block defaults (each can be overridden in the fence meta)
  showLineNumbers: boolean
  wrap: boolean
  indentGuides: boolean
  tabSize: number
  maxLines: number
  collapseStyle: CollapseStyle
  diffStyle: DiffStyle
  // Code processing
  extractFileNameFromCode: boolean
  notationComments: boolean
  // Header
  showLanguage: boolean
  copyButton: boolean
  wrapButton: boolean
  // Languages
  ignoredLanguages: string
  languageAliases: string
  // Editor
  editorCompletion: boolean
}

const themeIds = (type: 'light' | 'dark') => bundledThemesInfo.filter(t => t.type === type).map(t => t.id)

/**
 * Plugin settings shown under Preferences → Plugins → awesome-codeblock, in
 * this order: themes, block defaults, code processing, header, languages,
 * editor. A setting that a block can override names the meta option.
 * Inkdrop shows descriptions as plain text, so they use no Markdown.
 */
export const configSchema: Record<keyof Settings, ConfigSchema> = {
  lightTheme: {
    title: 'Light theme',
    description: 'Shiki theme used when Inkdrop is in light mode',
    type: 'string',
    default: 'github-light',
    enum: themeIds('light'),
    order: 1
  },
  darkTheme: {
    title: 'Dark theme',
    description: 'Shiki theme used when Inkdrop is in dark mode',
    type: 'string',
    default: 'github-dark',
    enum: themeIds('dark'),
    order: 2
  },
  matchInkdropTheme: {
    title: 'Match Inkdrop theme',
    description:
      'When the active Inkdrop theme has the same name as a Shiki theme (e.g. catppuccin-mocha, nord, dracula, kanagawa-wave), use it instead of the light and dark themes above',
    type: 'boolean',
    default: true,
    order: 3
  },
  showLineNumbers: {
    title: 'Line numbers',
    description: 'Show line numbers. Per block: showLineNumbers / showLineNumbers=false',
    type: 'boolean',
    default: false,
    order: 4
  },
  wrap: {
    title: 'Wrap long lines',
    description: 'Per block: wrap / wrap=false',
    type: 'boolean',
    default: false,
    order: 5
  },
  indentGuides: {
    title: 'Indent guides',
    description:
      'Draw a guide at each indentation level; the step is detected from the code. Per block: indentGuides / indentGuides=false',
    type: 'boolean',
    default: false,
    order: 6
  },
  tabSize: {
    title: 'Tab size',
    description: 'Width of a tab character, in spaces. Per block: tabSize=2',
    type: 'integer',
    default: 4,
    minimum: 1,
    maximum: 16,
    order: 7
  },
  maxLines: {
    title: 'Max visible lines',
    description:
      'Cut longer blocks with a "Show all N lines" button. 0 = no limit. Per block: maxLines=20. Diff views, exports and printing show all lines',
    type: 'integer',
    default: 0,
    minimum: 0,
    order: 8
  },
  collapseStyle: {
    title: 'Collapsed sections style',
    description: 'How collapse={…} sections open and close. Per block: collapseStyle=collapsible-start',
    type: 'string',
    default: 'github',
    enum: [...COLLAPSE_STYLES],
    order: 9
  },
  diffStyle: {
    title: 'Diff view',
    description:
      'How real diffs (diff / patch blocks with file headers or @@ hunks) are shown: unified or split diff view with syntax and word-level highlighting, or classic (colored lines). Per block: diffStyle=split. Exports and printing always use classic',
    type: 'string',
    default: 'unified',
    enum: [...DIFF_STYLES],
    order: 10
  },
  extractFileNameFromCode: {
    title: 'File name from code',
    description:
      'Use a file-name comment in the first lines (e.g. // src/app.ts) as the title and remove it from the code. Per block: extractFileName / extractFileName=false',
    type: 'boolean',
    default: true,
    order: 11
  },
  notationComments: {
    title: 'Notation comments',
    description:
      'Support Shiki notation comments: // [!code ++], [!code --], [!code highlight], [!code focus], [!code error], [!code warning], [!code info], [!code word:foo]. Per block: notation / notation=false',
    type: 'boolean',
    default: true,
    order: 12
  },
  showLanguage: {
    title: 'Language in header',
    description:
      'Give blocks without a title a header with the language icon and name. When off, blocks without a title, link, source info or diff header show only the floating buttons',
    type: 'boolean',
    default: true,
    order: 13
  },
  copyButton: {
    title: 'Copy button',
    description: 'Copies the code without diff markers, notation comments or the extracted file-name comment',
    type: 'boolean',
    default: true,
    order: 14
  },
  wrapButton: {
    title: 'Wrap button',
    description: 'Toggles line wrapping of a block',
    type: 'boolean',
    default: true,
    order: 15
  },
  ignoredLanguages: {
    title: 'Ignored languages',
    description:
      'Comma-separated languages left to Inkdrop’s built-in renderer, aliases included (js also skips javascript). Languages owned by other plugins (mermaid, math, …) are always skipped',
    type: 'string',
    default: '',
    order: 16
  },
  languageAliases: {
    title: 'Language aliases',
    description: 'Comma-separated alias=language pairs, e.g. conf=ini, gql=graphql. Editor completion offers them too',
    type: 'string',
    default: '',
    order: 17
  },
  editorCompletion: {
    title: 'Editor completion',
    description:
      'Suggest languages, meta options (title, frame, {…}, ins/del, collapse, …) and their values on code fence lines, and [!code …] notations inside code',
    type: 'boolean',
    default: true,
    order: 18
  }
}

/** Settings that only affect the editor. */
const EDITOR_ONLY_SETTINGS = new Set<keyof Settings>(['editorCompletion'])

/**
 * Settings the preview components read live (theme, header buttons). Changing
 * them re-renders the frames on their own, without rebuilding the note.
 */
const LIVE_SETTINGS = new Set<keyof Settings>([
  'lightTheme',
  'darkTheme',
  'matchInkdropTheme',
  'showLanguage',
  'copyButton',
  'wrapButton'
])

function defaults(): Settings {
  return Object.fromEntries(Object.entries(configSchema).map(([key, schema]) => [key, schema.default])) as Settings
}

// ---------------------------------------------------------------------------
// Settings store (observable snapshot, consumable via useSyncExternalStore)
// ---------------------------------------------------------------------------

const settingsStore = createStore<Settings>(defaults())

export const getSettings = settingsStore.get
export const subscribeSettings = settingsStore.subscribe

/** For tests and for non-Inkdrop hosts. */
export function setSettings(patch: Partial<Settings>): void {
  settingsStore.set({ ...settingsStore.get(), ...patch })
}

/**
 * True if the two snapshots differ in a setting that is baked into the block
 * models, so the preview has to be rebuilt.
 */
export function modelSettingsChanged(a: Settings, b: Settings): boolean {
  return (Object.keys(configSchema) as (keyof Settings)[]).some(
    key => !EDITOR_ONLY_SETTINGS.has(key) && !LIVE_SETTINGS.has(key) && a[key] !== b[key]
  )
}

/**
 * Mirrors `awesome-codeblock.*` from Inkdrop's config into the store.
 * Returns a disposer.
 */
export function bindSettings(env: Environment): () => void {
  const read = () => {
    const next: Record<string, unknown> = { ...defaults() }
    for (const key of Object.keys(configSchema)) {
      const value: unknown = env.config.get(`${PACKAGE_NAME}.${key}`)
      if (value !== undefined && value !== null) next[key] = value
    }
    settingsStore.set(next as unknown as Settings)
  }
  read()
  const subscription = env.config.onDidChange(PACKAGE_NAME, read)
  return () => subscription.dispose()
}

/** `"a, B ,c"` → `['a', 'b', 'c']`. */
export function parseList(value: string): string[] {
  return value
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean)
}

/** `"conf=ini, gql=graphql"` → `{ conf: 'ini', gql: 'graphql' }`. */
export function parseAliases(value: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const pair of value.split(',')) {
    const [alias, lang] = pair.split('=').map(s => s.trim().toLowerCase())
    if (alias && lang) out[alias] = lang
  }
  return out
}
