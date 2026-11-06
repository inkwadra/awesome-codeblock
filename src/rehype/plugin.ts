import type { Element, ElementContent, Root, RootContent } from 'hast'
import { getSettings, parseList } from '../config'
import { resolveLanguage } from '../highlight/languages'
import { highlight } from '../highlight/service'
import { buildModel, serialize, type BlockModel, type GroupData } from '../model'
import { classList, hasClass, isElement, propertyString, textContent } from '../shared/hast'
import { log } from '../shared/log'
import { getActiveTheme } from '../theme'

/**
 * Rehype plugin that replaces Inkdrop's code block hast
 *
 *     div.codeblock[line-start][line-end] > pre[lang][meta] > code.language-X
 *
 * (produced by Inkdrop's custom mdast `code` handler) with
 *
 *     acb-block[data-acb=<BlockModel JSON>][line-start][line-end]
 *
 * which `remarkReactComponents['acb-block']` renders. Consecutive blocks with
 * `tab=`/`group=` become one `acb-group`, and so does a lone block with `tab=`.
 *
 * Blocks whose language has a dedicated `remarkCodeComponents[lang]` (mermaid,
 * math, …) are left untouched, so those plugins keep working. The check runs
 * on every render, so plugins activated later are respected too.
 */

export const BLOCK_TAG = 'acb-block'
export const GROUP_TAG = 'acb-group'

export interface PluginDeps {
  /** True if another plugin renders this language. */
  isForeignLanguage(lang: string): boolean
}

/** Longest the processor waits for highlighting, so a slow grammar never stalls the preview. */
const PREWARM_TIMEOUT_MS = 3000

type Child = RootContent | ElementContent

interface Converted {
  node: Element
  model: BlockModel
}

/** Per-run context, so settings are read once per render rather than per block. */
interface Context {
  deps: PluginDeps
  settings: ReturnType<typeof getSettings>
  ignored: IgnoredLanguages
  models: BlockModel[]
}

/** `ignoredLanguages` as written and as Shiki ids, so a language and its aliases match each other. */
interface IgnoredLanguages {
  names: ReadonlySet<string>
  ids: ReadonlySet<string>
}

function ignoredLanguages(value: string): IgnoredLanguages {
  const names = new Set(parseList(value))
  // Unknown names resolve to `text`, which must not ignore every unknown language.
  const ids = new Set([...names].map(name => resolveLanguage(name)).filter(id => id !== 'text'))
  return { names, ids }
}

function isCodeBlock(node: Child): node is Element {
  return isElement(node) && node.tagName === 'div' && hasClass(node, 'codeblock')
}

/** Inkdrop's scroll-sync attributes. */
function lineAttributes(start: Element, end: Element = start) {
  return { 'line-start': start.properties?.['line-start'], 'line-end': end.properties?.['line-end'] }
}

function isLeftAlone(lang: string, ctx: Context): boolean {
  if (!lang) return false
  if (ctx.deps.isForeignLanguage(lang)) return true
  const base = lang.split(/[{[]/)[0]!.toLowerCase()
  if (!base) return false
  return ctx.deps.isForeignLanguage(base) || ctx.ignored.names.has(base) || ctx.ignored.ids.has(resolveLanguage(base))
}

function convert(div: Element, ctx: Context): Converted | null {
  const pre = div.children.find(isElement)
  if (pre?.tagName !== 'pre') return null
  const code = pre.children.find(isElement)
  if (code?.tagName !== 'code') return null

  const langClass = classList(code).find(c => c.startsWith('language-'))
  const lang = propertyString(pre.properties?.lang) ?? langClass?.slice('language-'.length) ?? ''
  if (isLeftAlone(lang, ctx)) return null

  const meta = propertyString(code.properties?.meta) ?? propertyString(pre.properties?.meta) ?? ''
  const model = buildModel({ lang, meta, code: code.children.map(textContent).join('') }, ctx.settings)
  const node: Element = {
    type: 'element',
    tagName: BLOCK_TAG,
    properties: { ...lineAttributes(div), dataAcb: serialize(model) },
    children: [],
    ...(div.position && { position: div.position })
  }
  return { node, model }
}

/** Blocks with the same key in a row form one group. */
function groupKey(model: BlockModel): string | null {
  if (model.group !== undefined) return `g:${model.group}`
  if (model.tab !== undefined) return 't:'
  return null
}

function makeGroup(items: readonly Converted[]): Element {
  const key = items[0]!.model.group
  const data: GroupData = { ...(key !== undefined && { key }), models: items.map(i => i.model) }
  return {
    type: 'element',
    tagName: GROUP_TAG,
    properties: { ...lineAttributes(items[0]!.node, items.at(-1)!.node), dataAcb: serialize(data) },
    children: [],
    ...(items[0]!.node.position &&
      items.at(-1)!.node.position && {
        position: { start: items[0]!.node.position.start, end: items.at(-1)!.node.position!.end }
      })
  }
}

function tryConvert(node: Element, ctx: Context): Converted | null {
  try {
    return convert(node, ctx)
  } catch (err) {
    log.error('failed to convert code block:', err)
    return null
  }
}

/** Transforms `parent.children` in place, collecting the converted models. */
function transformChildren(parent: Root | Element, ctx: Context): void {
  const out: Child[] = []
  let run: Converted[] = []
  let runKey: string | null = null
  let gap: Child[] = [] // whitespace after the current run, kept unless the run continues

  const flush = () => {
    // A lone block is a group only with a `tab=` label to show.
    if (run.length > 1 || (run.length === 1 && run[0]!.model.tab !== undefined)) out.push(makeGroup(run))
    else if (run.length === 1) out.push(run[0]!.node)
    out.push(...gap)
    run = []
    runKey = null
    gap = []
  }

  for (const child of parent.children as Child[]) {
    const converted = isCodeBlock(child) ? tryConvert(child, ctx) : null
    if (converted) {
      ctx.models.push(converted.model)
      const key = groupKey(converted.model)
      if (key !== null && key === runKey) {
        gap = [] // whitespace between tabs is dropped
        run.push(converted)
        continue
      }
      flush()
      if (key === null) out.push(converted.node)
      else {
        run = [converted]
        runKey = key
      }
      continue
    }
    if (run.length && child.type === 'text' && child.value.trim() === '') {
      gap.push(child)
      continue
    }
    flush()
    if (isElement(child)) transformChildren(child, ctx)
    out.push(child)
  }
  flush()
  parent.children = out as typeof parent.children
}

/**
 * Pre-warms the highlight cache so components render highlighted code
 * synchronously. Bounded by `PREWARM_TIMEOUT_MS`.
 */
async function prewarm(models: readonly BlockModel[]): Promise<void> {
  const theme = getActiveTheme()
  const jobs = Promise.all(models.map(model => highlight({ model, theme }).catch(() => undefined)))
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<void>(resolve => {
    timer = setTimeout(resolve, PREWARM_TIMEOUT_MS)
  })
  try {
    await Promise.race([jobs, timeout])
  } finally {
    clearTimeout(timer)
  }
}

export function createRehypePlugin(deps: PluginDeps) {
  return function rehypeAwesomeCodeblock() {
    return async function transformer(tree: Root): Promise<void> {
      const settings = getSettings()
      const ctx: Context = { deps, settings, ignored: ignoredLanguages(settings.ignoredLanguages), models: [] }
      try {
        transformChildren(tree, ctx)
      } catch (err) {
        log.error('rehype transform failed:', err)
        return
      }
      if (ctx.models.length) await prewarm(ctx.models)
    }
  }
}
