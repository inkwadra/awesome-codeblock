import { bundledLanguagesInfo } from 'shiki/langs'
import type { CollapseStyle, DiffStyle } from '../config'
import { EXTRA_ALIASES, languageDisplayName } from '../highlight/languages'

/**
 * What the fence completion offers: languages, meta keys, their values and
 * `[!code …]` notations. Static data only; see `completion.ts` for the source.
 */

export interface LanguageItem {
  id: string
  name: string
  alias?: boolean
}

/** Shiki's languages and aliases, plus the plugin's extra aliases (`golang`, `yml`, …). */
export const LANGUAGES: readonly LanguageItem[] = (() => {
  const out: LanguageItem[] = [
    { id: 'text', name: 'Plain text' },
    { id: 'ansi', name: 'ANSI escape sequences' }
  ]
  const seen = new Set(out.map(l => l.id))
  const add = (item: LanguageItem) => {
    if (seen.has(item.id)) return
    seen.add(item.id)
    out.push(item)
  }
  for (const info of bundledLanguagesInfo) {
    add({ id: info.id, name: info.name })
    for (const alias of info.aliases ?? []) add({ id: alias, name: info.name, alias: true })
  }
  for (const [alias, id] of Object.entries(EXTRA_ALIASES))
    add({ id: alias, name: languageDisplayName(id, id), alias: true })
  return out
})()

export type KeySpec = {
  label: string
  /** Snippet template; defaults to the label. */
  template?: string
  detail: string
  info: string
  /** Reopen the completion list after inserting (value completion follows). */
  reopen?: boolean
  /** Can appear several times. */
  repeatable?: boolean
  /** Only offered for these fence languages. */
  langs?: string[]
  /** Not offered for these fence languages. */
  notLangs?: string[]
  /** Meta key used to detect presence (defaults to label). */
  key?: string
  /** Synonyms the parser also accepts; any of them counts as present. */
  aliases?: string[]
  boost?: number
}

export const KEYS: readonly KeySpec[] = [
  {
    label: 'title',
    template: 'title="${}"',
    detail: 'title="…"',
    info: 'Title shown in the header (also filename="…")',
    aliases: ['filename'],
    boost: 3
  },
  {
    label: '{…}',
    template: '{${}}',
    detail: 'mark lines',
    info: 'Mark lines: {1, 3-5}. Labels: {"A":5-7}',
    repeatable: true,
    key: '',
    boost: 2
  },
  {
    label: 'ins',
    template: 'ins={${}}',
    detail: 'inserted lines',
    info: 'Mark lines as inserted: ins={3-4}. Also ins="text" or ins=/regex/; add= is a synonym',
    repeatable: true,
    boost: 2
  },
  {
    label: 'del',
    template: 'del={${}}',
    detail: 'deleted lines',
    info: 'Mark lines as deleted: del={2}. Also del="text" or del=/regex/; remove= is a synonym',
    repeatable: true,
    boost: 2
  },
  {
    label: 'mark',
    template: 'mark={${}}',
    detail: 'marked lines',
    info: 'Same as a bare {…}; also highlight= / hl=',
    repeatable: true
  },
  {
    label: '"…"',
    template: '"${}"',
    detail: 'inline marker',
    info: 'Mark every occurrence of the text',
    repeatable: true,
    key: ''
  },
  {
    label: '/…/',
    template: '/${}/',
    detail: 'regex marker',
    info: 'Mark regex matches; with capture groups only the groups',
    repeatable: true,
    key: ''
  },
  { label: '[…]', template: '[${}]', detail: 'file name', info: 'Comark-style title: [src/app.ts]', key: '' },
  {
    label: 'frame',
    template: 'frame="${}"',
    detail: 'code | none',
    info: 'Frame type',
    reopen: true
  },
  {
    label: 'showLineNumbers',
    detail: 'flag',
    info: 'Show line numbers (also lineNumbers / ln)',
    aliases: ['lineNumbers', 'ln'],
    boost: 1
  },
  {
    label: 'startLineNumber',
    template: 'startLineNumber=${1:1}',
    detail: 'number',
    info: 'First line number (visual only)'
  },
  { label: 'wrap', detail: 'flag', info: 'Wrap long lines', boost: 1 },
  {
    label: 'tabSize',
    template: 'tabSize=${1:2}',
    detail: 'number',
    info: 'Width of a tab character, in spaces'
  },
  {
    label: 'preserveIndent',
    template: 'preserveIndent=false',
    detail: 'false',
    info: 'Do not indent wrapped lines like their original line'
  },
  {
    label: 'hangingIndent',
    template: 'hangingIndent=${1:2}',
    detail: 'number',
    info: 'Extra indent for wrapped continuation lines'
  },
  {
    label: 'collapse',
    template: 'collapse={${}}',
    detail: 'collapsed lines',
    info: 'Collapsible sections: collapse={1-5, 12-14}'
  },
  {
    label: 'collapseStyle',
    template: 'collapseStyle=',
    detail: 'github | collapsible-*',
    info: 'Style of collapsible sections',
    reopen: true
  },
  {
    label: 'lang',
    template: 'lang="${}"',
    detail: 'diff language',
    info: 'Highlight a diff as this language',
    reopen: true,
    langs: ['diff', 'patch'],
    boost: 4
  },
  {
    label: 'diffStyle',
    template: 'diffStyle=',
    detail: 'unified | split | classic',
    info: 'How a real diff file is shown',
    reopen: true,
    langs: ['diff', 'patch'],
    boost: 3
  },
  {
    label: 'useDiffSyntax',
    detail: 'flag',
    info: 'Treat leading +/- as inserted/deleted lines in any language',
    notLangs: ['diff', 'patch']
  },
  { label: 'tab', template: 'tab="${}"', detail: 'tab label', info: 'Adjacent blocks with tab= become a tabbed group' },
  {
    label: 'group',
    template: 'group=',
    detail: 'group key',
    info: 'Tab groups with the same key switch together',
    reopen: true
  },
  { label: 'maxLines', template: 'maxLines=${1:20}', detail: 'number', info: 'Cut the block with a "Show all" button' },
  { label: 'indentGuides', detail: 'flag', info: 'Render indentation guides' },
  {
    label: 'notation',
    template: 'notation=false',
    detail: 'false',
    info: 'Disable [!code …] notation comments for this block'
  },
  {
    label: 'extractFileName',
    template: 'extractFileName=${1:false}',
    detail: 'flag',
    info: 'Use (or, with =false, do not use) a file-name comment as the title'
  },
  { label: 'url', template: 'url="${}"', detail: 'Inkdrop', info: 'Turns the title into a link', boost: -1 },
  {
    label: 'line',
    template: 'line=${1:1}',
    detail: 'Inkdrop',
    info: 'Start line (line=10 or line=10-20); shows line numbers',
    boost: -1
  },
  { label: 'branch', template: 'branch=${}', detail: 'Inkdrop', info: 'Branch shown in the header', boost: -1 },
  { label: 'commit', template: 'commit=${}', detail: 'Inkdrop', info: 'Commit shown in the header', boost: -1 }
]

export interface ValueSpec {
  label: string
  info?: string
  detail?: string
}

/** One entry per value, so a new style can't be forgotten here. */
const valuesOf = <T extends string>(infos: Record<T, string>): ValueSpec[] =>
  Object.entries<string>(infos).map(([label, info]) => ({ label, info }))

/** Fixed values of enumerated keys. */
export const VALUES: Readonly<Record<string, readonly ValueSpec[]>> = {
  frame: [
    { label: 'code', info: 'Header with the title or language (default)' },
    { label: 'none', info: 'No header' }
  ],
  collapseStyle: valuesOf<CollapseStyle>({
    github: 'Expand once; the summary disappears',
    'collapsible-start': 'Toggle at the start of the section',
    'collapsible-end': 'Toggle at the end of the section',
    'collapsible-auto': 'End toggle for sections that end the block'
  }),
  diffStyle: valuesOf<DiffStyle>({
    unified: 'Diff view, one column',
    split: 'Diff view, old and new side by side',
    classic: 'Colored lines'
  })
}
export const BOOLEAN_KEYS: ReadonlySet<string> = new Set([
  'wrap',
  'showLineNumbers',
  'lineNumbers',
  'ln',
  'preserveIndent',
  'notation',
  'indentGuides',
  'useDiffSyntax',
  'extractFileName'
])

export const NOTATIONS: ReadonlyArray<{ label: string; template: string; info: string }> = [
  { label: '++', template: '++]', info: 'Inserted line' },
  { label: '--', template: '--]', info: 'Deleted line' },
  { label: 'highlight', template: 'highlight]', info: 'Highlighted line (also highlight:3 for the next 3 lines)' },
  { label: 'focus', template: 'focus]', info: 'Focus this line, blur the rest' },
  { label: 'error', template: 'error]', info: 'Error line' },
  { label: 'warning', template: 'warning]', info: 'Warning line' },
  { label: 'info', template: 'info]', info: 'Info line' },
  { label: 'word', template: 'word:${}]', info: 'Highlight a word: [!code word:foo]' }
]
