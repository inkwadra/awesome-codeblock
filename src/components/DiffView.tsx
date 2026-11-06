import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { FileDiff, FileDiffOptions } from '@pierre/diffs'
import { loadDiffs, loadedDiffs, type DiffsApi } from '../diff/load'
import { parseDiff } from '../diff/parse'
import type { BlockModel, DiffViewStyle } from '../model'
import { log } from '../shared/log'

/**
 * Diff view for real diff files, rendered by `@pierre/diffs` (unified or split
 * columns, syntax and word-level change highlighting, both line numbers).
 *
 * diffs highlights with the plugin's own Shiki core (see `highlight/shiki.ts`),
 * so grammars and themes are shared with ordinary code blocks. The module is
 * the same chunk the highlighter already loaded; once it is in memory the view
 * mounts synchronously, before paint.
 *
 * diffs renders into a shadow root, which Inkdrop's exporter can't serialize,
 * so `CodeFrame` uses the classic rendering in print mode.
 */

export interface DiffViewProps {
  model: Pick<BlockModel, 'code' | 'title' | 'diffLang'>
  diffStyle: DiffViewStyle
  theme: string
  wrapped: boolean
  /** Show diffs' header (file name, +/- stats) above each file. */
  fileHeaders: boolean
  /** Shown while diffs loads, and instead of the view when it can't show the patch. */
  fallback: React.ReactNode
}

export const DiffView: React.FC<DiffViewProps> = ({ model, diffStyle, theme, wrapped, fileHeaders, fallback }) => {
  const [mod, setMod] = useState<DiffsApi | null>(loadedDiffs)
  /** The patch whose view failed, so an edited patch gets another try. */
  const [failedCode, setFailedCode] = useState<string | null>(null)
  const host = useRef<HTMLDivElement>(null)
  const views = useRef<Array<FileDiff>>([])
  const applied = useRef<FileDiffOptions<undefined, undefined> | null>(null)

  // A failed load is retried when the patch changes (`loadDiffs` doesn't cache failures).
  useEffect(() => {
    if (mod) return
    let cancelled = false
    const code = model.code
    loadDiffs().then(
      m => !cancelled && setMod(m),
      err => {
        log.error('failed to load @pierre/diffs:', err)
        if (!cancelled) setFailedCode(code)
      }
    )
    return () => {
      cancelled = true
    }
  }, [mod, model.code])

  const parsed = useMemo(
    () => (mod ? parseDiff(mod, model.code, { title: model.title, lang: model.diffLang }) : null),
    [mod, model.code, model.title, model.diffLang]
  )

  const options = useMemo<FileDiffOptions<undefined, undefined>>(
    () => ({
      theme,
      preferredHighlighter: 'shiki-js',
      diffStyle,
      overflow: wrapped ? 'wrap' : 'scroll',
      disableFileHeader: !fileHeaders
    }),
    [theme, diffStyle, wrapped, fileHeaders]
  )

  // Mount one FileDiff per file of the patch.
  useLayoutEffect(() => {
    const el = host.current
    if (!mod || !parsed || !el) return
    const list: FileDiff[] = []
    const cleanUp = () => {
      for (const v of list) v.cleanUp()
      list.length = 0
      views.current = []
      applied.current = null
    }
    try {
      for (const fileDiff of parsed.files) {
        const view = new mod.FileDiff(options)
        list.push(view)
        view.render({ fileDiff, containerWrapper: el })
      }
      views.current = list
      applied.current = options
    } catch (err) {
      log.error('diff view failed:', err)
      cleanUp()
      setFailedCode(model.code)
    }
    return cleanUp
    // `options` changes are applied by the effect below, without remounting.
  }, [mod, parsed])

  // Theme, layout and wrapping changes.
  useLayoutEffect(() => {
    if (!applied.current || applied.current === options) return
    applied.current = options
    for (const view of views.current) {
      view.setOptions(options)
      view.rerender()
    }
  }, [options])

  const ready = !!mod && !!parsed && failedCode !== model.code
  return (
    <>
      {!ready && fallback}
      <div className="acb-diffs" ref={host} hidden={!ready} />
    </>
  )
}
DiffView.displayName = 'AwesomeCodeblockDiffView'
