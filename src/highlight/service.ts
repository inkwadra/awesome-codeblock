import { serialize, type BlockModel } from '../model'
import { LruCache } from '../shared/lru'
import { log } from '../shared/log'
import { renderBlock, type RenderResult } from './render'
import { ensureLoaded, getLoadedHighlighter } from './shiki'

/**
 * Highlight cache shared by the rehype plugin (which pre-warms it while
 * Inkdrop's processor runs) and the React components (which read from it
 * synchronously, so a note renders highlighted on the first paint and the
 * exporter captures highlighted HTML).
 */

const MAX_ENTRIES = 400
const cache = new LruCache<string, RenderResult>(MAX_ENTRIES)

export interface HighlightRequest {
  model: BlockModel
  theme: string
}

export function cacheKey({ model, theme }: HighlightRequest): string {
  return `${theme}|${serialize(model)}`
}

/**
 * Returns the rendering if it is cached or can be produced synchronously
 * (highlighter, grammar and theme already loaded). Otherwise `undefined`.
 */
export function highlightSync(req: HighlightRequest): RenderResult | undefined {
  const key = cacheKey(req)
  const hit = cache.get(key)
  if (hit) return hit
  const hl = getLoadedHighlighter([req.model.hlLang], req.theme)
  if (!hl) return undefined
  try {
    return cache.set(key, renderBlock(hl, req.model, req.theme))
  } catch (err) {
    log.error('render failed:', err)
    return undefined
  }
}

/** Loads whatever is needed and renders. Never rejects for grammar errors. */
export async function highlight(req: HighlightRequest): Promise<RenderResult> {
  const sync = highlightSync(req)
  if (sync) return sync
  const theme = await ensureLoaded([req.model.hlLang], req.theme)
  const effective = theme === req.theme ? req : { ...req, theme }
  const result = highlightSync(effective)
  if (!result) throw new Error('[awesome-codeblock] highlighter not ready')
  // A fallback theme was used: serve it for the requested theme, too.
  if (effective !== req) cache.set(cacheKey(req), result)
  return result
}

export function clearHighlightCache(): void {
  cache.clear()
}
