import React, { useRef } from 'react'
import { FileTypeIcon } from '../../icons'
import type { BlockModel } from '../../model'

export interface TabsProps {
  labels: readonly string[]
  models: readonly BlockModel[]
  active: number
  onSelect: (index: number) => void
}

/** Index of the tab a key moves to, or -1 (WAI-ARIA tabs pattern). */
function nextTab(key: string, active: number, count: number): number {
  switch (key) {
    case 'ArrowRight':
      return (active + 1) % count
    case 'ArrowLeft':
      return (active - 1 + count) % count
    case 'Home':
      return 0
    case 'End':
      return count - 1
    default:
      return -1
  }
}

export const Tabs: React.FC<TabsProps & { dark: boolean }> = ({ labels, models, active, onSelect, dark }) => {
  const buttons = useRef<Array<HTMLButtonElement | null>>([])
  const onKeyDown = (e: React.KeyboardEvent) => {
    const next = nextTab(e.key, active, labels.length)
    if (next < 0) return
    e.preventDefault()
    onSelect(next)
    buttons.current[next]?.focus()
  }
  return (
    <div className="acb-tabs" role="tablist" onKeyDown={onKeyDown}>
      {labels.map((label, i) => (
        <button
          key={`${i}:${label}`}
          ref={el => {
            buttons.current[i] = el
          }}
          type="button"
          role="tab"
          aria-selected={i === active}
          tabIndex={i === active ? 0 : -1}
          className={`acb-tab${i === active ? ' is-active' : ''}`}
          onClick={() => onSelect(i)}
        >
          <FileTypeIcon
            lang={models[i]?.lang}
            hlLang={models[i]?.hlLang}
            title={models[i]?.title}
            dark={dark}
            size={14}
          />
          <span>{label}</span>
        </button>
      ))}
    </div>
  )
}
