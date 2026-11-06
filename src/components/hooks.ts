import { createContext, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { getSettings, subscribeSettings, type Settings } from '../config'
import type { RenderResult } from '../highlight/render'
import { cacheKey, highlight, highlightSync, type HighlightRequest } from '../highlight/service'
import { rendererContext, type PrintModeContext } from '../inkdrop/renderer'
import { deserialize, type BlockModel } from '../model'
import { log } from '../shared/log'
import { getActiveTheme, subscribeTheme } from '../theme'

export function useSettings(): Settings {
  return useSyncExternalStore(subscribeSettings, getSettings, getSettings)
}

export function useActiveTheme(): string {
  return useSyncExternalStore(subscribeTheme, getActiveTheme, getActiveTheme)
}

const FALLBACK_CONTEXT: PrintModeContext = createContext<{ printMode?: boolean } | undefined>(undefined)

/** `printMode` from Inkdrop's markdown renderer context (true when exporting/printing). */
export function usePrintMode(): boolean {
  return !!useContext(rendererContext() ?? FALLBACK_CONTEXT)?.printMode
}

/** The JSON a custom element carries in `data-acb`, parsed once per string. */
export function useElementData<T extends object>(props: { 'data-acb'?: string; dataAcb?: string }): T | null {
  const json = props['data-acb'] ?? props.dataAcb
  return useMemo(() => deserialize<T>(json), [json])
}

/**
 * Highlighted rendering of a block. Synchronous when the cache (pre-warmed by
 * the rehype plugin) or the loaded highlighter can serve it; otherwise loads
 * asynchronously and returns `undefined` meanwhile. While switching themes the
 * previous rendering of the *same* code is kept to avoid a flash.
 */
export function useHighlight(model: BlockModel, theme: string): RenderResult | undefined {
  const request = useMemo<HighlightRequest>(() => ({ model, theme }), [model, theme])
  const key = useMemo(() => cacheKey(request), [request])
  // Keyed by value (`key`), not identity: an equal model in a new object reuses the result.
  const sync = useMemo(() => highlightSync(request), [key])
  const [loaded, setLoaded] = useState<{ key: string; result: RenderResult } | null>(null)
  const last = useRef<{ code: string; result: RenderResult } | null>(null)

  useEffect(() => {
    if (sync) return
    let cancelled = false
    highlight(request).then(
      result => !cancelled && setLoaded({ key, result }),
      (err: unknown) => log.error('highlight failed:', err)
    )
    return () => {
      cancelled = true
    }
  }, [key])

  const result = sync ?? (loaded?.key === key ? loaded.result : undefined)
  if (result) {
    last.current = { code: model.code, result }
    return result
  }
  return last.current?.code === model.code ? last.current.result : undefined
}
