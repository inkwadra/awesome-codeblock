import type { Environment } from '@inkdropapp/types'
import { actions } from 'inkdrop'
import type React from 'react'
import { log } from '../shared/log'
import { getEnv } from './env'

/**
 * Adapter for Inkdrop's markdown renderer: the only module that touches it.
 *
 * Documented API used: `rehypePlugins`, `remarkReactComponents`,
 * `remarkCodeComponents`, `Context`. Undocumented API (verified against
 * Inkdrop 6.3.0 and accessed defensively):
 *
 * - `markdownRenderer.ready` — promise of the built-in plugin setup. That setup
 *   *reassigns* `remarkReactComponents`, so we wait for it before patching.
 * - `markdownRenderer.invalidateProcessor()` — the unified processor is cached
 *   and plugins are read only when it is (re)built.
 * - `actions.preview.render()` — re-renders the open note's preview.
 * - The hast shape of code blocks: `div.codeblock > pre[lang][meta] > code`.
 * - Keys `default` / `inlineDefault` of `remarkCodeComponents` are Inkdrop's
 *   own renderers; any other key is a language owned by a plugin.
 */

export type Renderer = Environment['markdownRenderer'] & {
  ready?: Promise<unknown>
  invalidateProcessor?: () => void
}

function rendererOf(env: Environment | undefined): Renderer | undefined {
  return env?.markdownRenderer as Renderer | undefined
}

type AnchorComponent = React.ComponentType<React.AnchorHTMLAttributes<HTMLAnchorElement>>

/** Inkdrop's anchor component (opens external URLs in the browser), if available. */
export function linkComponent(): AnchorComponent | undefined {
  return rendererOf(getEnv())?.remarkReactComponents?.a as AnchorComponent | undefined
}

/** The part of the renderer's React context the plugin reads. */
export type PrintModeContext = React.Context<{ printMode?: boolean } | undefined>

/** The renderer's React context, which carries `printMode` (export / print). */
export function rendererContext(): PrintModeContext | undefined {
  return rendererOf(getEnv())?.Context as PrintModeContext | undefined
}

export interface RendererExtension {
  /** Created once the renderer is ready, so it can close over it. */
  rehypePlugin(renderer: Renderer): Renderer['rehypePlugins'][number]
  /** Custom hast tag → React component. */
  components: Record<string, React.ComponentType<any>>
}

/**
 * Registers a rehype plugin and the components rendering its custom tags,
 * then re-renders the preview. Resolves to a disposer that undoes all of it.
 */
export async function extendRenderer(env: Environment, extension: RendererExtension): Promise<() => void> {
  const renderer = rendererOf(env)
  if (!renderer) return () => {}
  try {
    await renderer.ready
  } catch {
    // The built-in setup failing is not ours to handle.
  }

  const plugin = extension.rehypePlugin(renderer)
  renderer.rehypePlugins.push(plugin)
  const components = renderer.remarkReactComponents
  Object.assign(components, extension.components)
  refreshPreview(env)

  let disposed = false
  return () => {
    if (disposed) return
    disposed = true
    const index = renderer.rehypePlugins.indexOf(plugin)
    if (index >= 0) renderer.rehypePlugins.splice(index, 1)
    // `remarkReactComponents` may have been reassigned meanwhile: clean up the current one.
    const current = renderer.remarkReactComponents
    for (const [tag, component] of Object.entries(extension.components)) {
      if (current[tag] === component) delete current[tag]
    }
    refreshPreview(env)
  }
}

/** Rebuilds the processor and re-renders the open preview. */
export function refreshPreview(env: Environment): void {
  try {
    rendererOf(env)?.invalidateProcessor?.()
  } catch (err) {
    log.warn('invalidateProcessor failed:', err)
  }
  try {
    const render = actions?.preview?.render
    if (typeof render === 'function') env.store.dispatch(render())
  } catch (err) {
    log.warn('preview re-render failed:', err)
  }
}
