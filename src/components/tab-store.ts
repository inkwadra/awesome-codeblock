import { createStore } from '../shared/store'

/**
 * Selected-tab store for code groups. Groups sharing a `group="key"` switch
 * together (like Comark's `sync`) and the choice is persisted in localStorage.
 */

const PREFIX = 'awesome-codeblock:tab:'
/** Selections made or read in this session, by group key. */
const memory = new Map<string, string>()
/** Bumped on every selection, to notify subscribers. */
const version = createStore(0)

function storage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null
  } catch {
    return null
  }
}

export function getSelectedTab(key: string): string | undefined {
  if (memory.has(key)) return memory.get(key)
  const stored = storage()?.getItem(PREFIX + key) ?? undefined
  if (stored !== undefined) memory.set(key, stored)
  return stored
}

export function setSelectedTab(key: string, label: string): void {
  memory.set(key, label)
  try {
    storage()?.setItem(PREFIX + key, label)
  } catch {
    // Quota exceeded or storage disabled: kept in memory only.
  }
  version.set(version.get() + 1)
}

export const subscribeTabs = version.subscribe
