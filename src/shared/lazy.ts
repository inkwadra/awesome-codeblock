/**
 * A value loaded asynchronously at most once. A failed load is not cached, so
 * the next `load()` retries. `peek()` returns the value once it is loaded, for
 * code that wants to render synchronously when it can.
 */
export interface Lazy<T> {
  readonly load: () => Promise<T>
  readonly peek: () => T | undefined
  /** Forgets the value (tests, disposal). */
  readonly reset: () => void
}

export function lazy<T>(factory: () => Promise<T>): Lazy<T> {
  let value: T | undefined
  let pending: Promise<T> | null = null
  return {
    load: () => {
      pending ??= factory().then(
        result => (value = result),
        (err: unknown) => {
          pending = null
          throw err
        }
      )
      return pending
    },
    peek: () => value,
    reset: () => {
      value = undefined
      pending = null
    }
  }
}

/**
 * Runs `task(key)` at most once per key until it settles: concurrent callers
 * share one promise. Keys whose task failed are remembered so they are not
 * retried (e.g. a grammar that does not compile).
 */
export interface KeyedOnce {
  readonly run: (key: string) => Promise<void>
  readonly failed: (key: string) => boolean
  readonly clear: () => void
}

export function keyedOnce(
  task: (key: string) => Promise<void>,
  onError: (key: string, err: unknown) => void
): KeyedOnce {
  const pending = new Map<string, Promise<void>>()
  const failures = new Set<string>()
  return {
    run: key => {
      if (failures.has(key)) return Promise.resolve()
      let promise = pending.get(key)
      if (!promise) {
        promise = Promise.resolve()
          .then(() => task(key))
          .catch((err: unknown) => {
            failures.add(key)
            onError(key, err)
          })
          .finally(() => pending.delete(key))
        pending.set(key, promise)
      }
      return promise
    },
    failed: key => failures.has(key),
    clear: () => {
      pending.clear()
      failures.clear()
    }
  }
}
