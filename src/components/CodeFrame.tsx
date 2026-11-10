import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { isPlainLanguage } from '../highlight/languages'
import { renderPlain } from '../highlight/render'
import { UiIcon } from '../icons'
import { isDarkUi } from '../inkdrop/platform'
import type { BlockModel } from '../model'
import { DiffView } from './DiffView'
import { Actions } from './header/Actions'
import { Heading } from './header/Heading'
import { Tabs, type TabsProps } from './header/Tabs'
import { useActiveTheme, useHighlight, usePrintMode, useSettings } from './hooks'

export interface CodeFrameProps {
  model: BlockModel
  /** When the frame is the body of a code group. */
  tabs?: TabsProps
}

const classNames = (...names: Array<string | false | undefined>) => names.filter(Boolean).join(' ')

/** Closes an open `collapsible-end` section from the "Collapse" handle at its end. */
function onCollapseHandleClick(e: React.MouseEvent): void {
  const handle = (e.target as HTMLElement).closest?.('.acb-collapse-end')
  if (!handle) return
  e.preventDefault()
  handle.closest('details')?.removeAttribute('open')
}

/** One code block: header (title or tabs, actions), highlighted body and "Show more". */
export const CodeFrame: React.FC<CodeFrameProps> = ({ model, tabs }) => {
  const settings = useSettings()
  const theme = useActiveTheme()
  const printMode = usePrintMode()
  const result = useHighlight(model, theme)
  const plain = useMemo(() => (result ? undefined : renderPlain(model)), [result, model])
  const rendering = result ?? plain!
  const dark = result ? result.dark : isDarkUi()

  const [wrapped, setWrapped] = useState(model.wrap)
  useEffect(() => setWrapped(model.wrap), [model.wrap])
  const toggleWrap = useCallback(() => setWrapped(w => !w), [])
  // A different block (another tab, an edited note) starts cut again.
  const [expanded, setExpanded] = useState(false)
  useEffect(() => setExpanded(false), [model])

  // Real diffs get the diff view, except in exports and print (see DiffView).
  const diffStyle = printMode ? undefined : model.diffStyle

  const { lineCount, visibleRows } = rendering
  // One hidden row would cost as much room as the button: clamp only from two.
  const clampable = !printMode && !diffStyle && model.maxLines > 0 && visibleRows > model.maxLines + 1
  const clamped = clampable && !expanded

  const { frame } = model
  // A group always shows its tabs, or the other tabs couldn't be reached.
  const showHeader =
    !!tabs ||
    (frame !== 'none' &&
      (!!model.title ||
        !!model.url ||
        !!model.info ||
        !!model.diffFiles?.length ||
        (settings.showLanguage && !!model.lang && !isPlainLanguage(model.lang))))

  const actions = printMode ? null : (
    <Actions model={model} renderedText={rendering.text} wrapped={wrapped} onToggleWrap={toggleWrap} />
  )
  const classes = classNames(
    'acb-frame',
    `acb-frame-${frame}`,
    showHeader ? 'has-header' : 'is-minimal',
    wrapped && 'is-wrapped',
    clamped && 'is-clamped',
    dark ? 'is-dark' : 'is-light',
    !result && 'is-pending',
    tabs && 'is-group'
  )
  const style = {
    ...result?.vars,
    '--acb-tab-size': String(model.tabSize),
    ...(clamped && { '--acb-max-lines': String(model.maxLines) })
  } as React.CSSProperties

  const code = (
    <div className="acb-scroll" onClick={onCollapseHandleClick} dangerouslySetInnerHTML={{ __html: rendering.html }} />
  )
  return (
    <div className={classes} style={style} data-lang={model.lang || undefined}>
      {showHeader && (
        <div className="acb-header">
          {tabs ? <Tabs {...tabs} dark={dark} /> : <Heading model={model} dark={dark} />}
          {actions}
        </div>
      )}
      <div className="acb-body">
        {diffStyle ? (
          <DiffView
            model={model}
            diffStyle={diffStyle}
            theme={theme}
            wrapped={wrapped}
            // Our header names a single file; diffs' per-file headers are for
            // multi-file patches (and frames without a header).
            fileHeaders={!showHeader || !!tabs || (model.diffFiles?.length ?? 0) > 1}
            fallback={code}
          />
        ) : (
          code
        )}
        {!showHeader && actions && <div className="acb-float">{actions}</div>}
      </div>
      {clampable && (
        <button type="button" className="acb-more" onClick={() => setExpanded(e => !e)} aria-expanded={expanded}>
          <UiIcon name={expanded ? 'chevronUp' : 'chevronDown'} size={12} />
          {expanded ? 'Show fewer lines' : `Show all ${lineCount} lines`}
        </button>
      )}
    </div>
  )
}
