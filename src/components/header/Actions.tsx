import React, { useCallback, useEffect, useRef, useState } from 'react'
import { UiIcon } from '../../icons'
import { writeClipboard } from '../../inkdrop/platform'
import { getCopyText, type BlockModel } from '../../model'
import { log } from '../../shared/log'
import { useSettings } from '../hooks'

/** How long the "Copied" state is shown. */
const COPIED_FEEDBACK_MS = 1800

/** Runs a handler without letting the click reach Inkdrop's preview (which would e.g. start editing). */
const isolated = (handler: () => void) => (e: React.MouseEvent) => {
  e.preventDefault()
  e.stopPropagation()
  handler()
}

const CopyButton: React.FC<{ getText: () => string }> = ({ getText }) => {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])

  const copy = useCallback(() => {
    writeClipboard(getText()).then(
      () => {
        setCopied(true)
        clearTimeout(timer.current)
        timer.current = setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS)
      },
      (err: unknown) => log.error('copy failed:', err)
    )
  }, [getText])

  const label = copied ? 'Copied' : 'Copy'
  return (
    <button
      type="button"
      className={`acb-action acb-copy${copied ? ' is-copied' : ''}`}
      title={label}
      aria-label={label}
      onClick={isolated(copy)}
    >
      <span className="acb-sr-only" aria-live="polite">
        {copied ? 'Copied' : ''}
      </span>
      <UiIcon name={copied ? 'check' : 'copy'} />
    </button>
  )
}

export interface ActionsProps {
  model: BlockModel
  /** The code as the block shows it, when that differs from `model.code` (see `StructureOutput.text`). */
  renderedText?: string
  wrapped: boolean
  onToggleWrap: () => void
}

/** Wrap toggle and copy button, each enabled by a setting. */
export const Actions: React.FC<ActionsProps> = ({ model, renderedText, wrapped, onToggleWrap }) => {
  const { wrapButton, copyButton } = useSettings()
  const getText = useCallback(() => getCopyText(model, renderedText), [model, renderedText])
  if (!wrapButton && !copyButton) return null
  return (
    <div className="acb-actions">
      {wrapButton && (
        <button
          type="button"
          className={`acb-action acb-wrap-toggle${wrapped ? ' is-active' : ''}`}
          title={wrapped ? "Don't wrap lines" : 'Wrap lines'}
          aria-label="Wrap lines"
          aria-pressed={wrapped}
          onClick={isolated(onToggleWrap)}
        >
          <UiIcon name="wrap" />
        </button>
      )}
      {copyButton && <CopyButton getText={getText} />}
    </div>
  )
}
