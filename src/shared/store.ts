/**
 * Minimal observable value: the shape `useSyncExternalStore` expects
 * (`subscribe` + `get`), shared by the settings, theme, tab and icon stores.
 */
export interface Store<T> {
  readonly get: () => T
  /** Replaces the value; listeners run only when it actually changes. */
  readonly set: (next: T) => void
  readonly subscribe: (listener: () => void) => () => void
}

export function createStore<T>(initial: T, equals: (a: T, b: T) => boolean = Object.is): Store<T> {
  let value = initial
  const listeners = new Set<() => void>()
  return {
    get: () => value,
    set: next => {
      if (equals(value, next)) return
      value = next
      for (const listener of listeners) listener()
    },
    subscribe: listener => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    }
  }
}
