import React, { useCallback, useMemo, useState, useSyncExternalStore } from 'react'
import { tabLabel, type BlockModel, type GroupData } from '../model'
import { CodeFrame } from './CodeFrame'
import { Guarded, PlainCode } from './ErrorBoundary'
import { useElementData, usePrintMode } from './hooks'
import { getSelectedTab, setSelectedTab, subscribeTabs } from './tab-store'

/**
 * Props as produced by Inkdrop's hast → React conversion of the custom
 * elements emitted by the rehype plugin.
 */
type HostProps = {
  'data-acb'?: string
  dataAcb?: string
  'line-start'?: string | number
  'line-end'?: string | number
}

/** Preserves Inkdrop's `line-start` / `line-end` attributes used for scroll sync. */
function lineAttributes(props: HostProps): Record<string, string> {
  const out: Record<string, string> = {}
  if (props['line-start'] !== undefined) out['line-start'] = String(props['line-start'])
  if (props['line-end'] !== undefined) out['line-end'] = String(props['line-end'])
  return out
}

/** `<acb-block>`: one code block. */
export const AcbBlock: React.FC<HostProps> = props => {
  const model = useElementData<BlockModel>(props)
  if (!model) return null
  return (
    <div className="acb-root" {...lineAttributes(props)}>
      <Guarded code={model.code} resetKey={model}>
        <CodeFrame model={model} />
      </Guarded>
    </div>
  )
}
AcbBlock.displayName = 'AwesomeCodeblock'

const NO_MODELS: readonly BlockModel[] = []
const noSubscription = () => () => {}

/**
 * The active tab of a group. Groups with a `group=` key follow the shared,
 * persisted selection (by label); others keep their own state.
 */
function useActiveTab(key: string | undefined, labels: readonly string[]): [number, (index: number) => void] {
  const synced = useSyncExternalStore(
    key ? subscribeTabs : noSubscription,
    () => (key ? getSelectedTab(key) : undefined),
    () => undefined
  )
  const [local, setLocal] = useState(0)
  const select = useCallback(
    (index: number) => {
      setLocal(index)
      const label = labels[index]
      if (key && label !== undefined) setSelectedTab(key, label)
    },
    [key, labels]
  )
  const syncedIndex = synced === undefined ? -1 : labels.indexOf(synced)
  const active = syncedIndex >= 0 ? syncedIndex : local
  return [active < labels.length ? active : 0, select]
}

/** A group whose frame failed: plain tab buttons, so the other tabs stay reachable. */
const GroupFallback: React.FC<{
  labels: readonly string[]
  active: number
  onSelect: (index: number) => void
  code: string
}> = ({ labels, active, onSelect, code }) => (
  <div className="acb-fallback-group">
    <div className="acb-fallback-tabs" role="tablist">
      {labels.map((label, i) => (
        <button
          key={`${i}:${label}`}
          type="button"
          role="tab"
          aria-selected={i === active}
          className={i === active ? 'is-active' : undefined}
          onClick={() => onSelect(i)}
        >
          {label}
        </button>
      ))}
    </div>
    <PlainCode code={code} />
  </div>
)

/** `<acb-group>`: consecutive blocks with `tab=` / `group=`, shown as tabs. */
export const AcbGroup: React.FC<HostProps> = props => {
  const data = useElementData<GroupData>(props)
  const printMode = usePrintMode()
  const models = data?.models ?? NO_MODELS
  const labels = useMemo(() => models.map(tabLabel), [models])
  const [active, onSelect] = useActiveTab(data?.key, labels)
  // Static output (export / print) shows every tab, titled with its label.
  const titled = useMemo(
    () => (printMode ? models.map((m, i) => ({ ...m, title: m.title ?? labels[i] })) : NO_MODELS),
    [printMode, models, labels]
  )

  if (models.length === 0) return null

  if (printMode) {
    return (
      <div className="acb-root acb-group-print" {...lineAttributes(props)}>
        {titled.map((model, i) => (
          <Guarded key={i} code={model.code} resetKey={model}>
            <CodeFrame model={model} />
          </Guarded>
        ))}
      </div>
    )
  }

  const model = models[active]!
  return (
    <div className="acb-root acb-group" {...lineAttributes(props)}>
      <Guarded
        code={model.code}
        resetKey={model}
        fallback={<GroupFallback labels={labels} active={active} onSelect={onSelect} code={model.code} />}
      >
        <CodeFrame model={model} tabs={{ labels, models, active, onSelect }} />
      </Guarded>
    </div>
  )
}
AcbGroup.displayName = 'AwesomeCodeblockGroup'
