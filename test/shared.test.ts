import { describe, expect, it, vi } from 'vite-plus/test'
import { DisposableBag } from '../src/shared/disposables'
import { keyedOnce, lazy } from '../src/shared/lazy'
import { LruCache } from '../src/shared/lru'
import { createStore } from '../src/shared/store'

describe('createStore', () => {
  it('notifies only on change and stops after unsubscribe', () => {
    const store = createStore(1)
    const listener = vi.fn()
    const unsubscribe = store.subscribe(listener)
    store.set(1)
    expect(listener).not.toHaveBeenCalled()
    store.set(2)
    expect(listener).toHaveBeenCalledTimes(1)
    expect(store.get()).toBe(2)
    unsubscribe()
    store.set(3)
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('accepts a custom equality', () => {
    const store = createStore({ n: 1 }, (a, b) => a.n === b.n)
    const listener = vi.fn()
    store.subscribe(listener)
    store.set({ n: 1 })
    expect(listener).not.toHaveBeenCalled()
  })
})

describe('lazy', () => {
  it('loads once, shares the pending promise and exposes the value', async () => {
    const factory = vi.fn(async () => 42)
    const value = lazy(factory)
    expect(value.peek()).toBeUndefined()
    const [a, b] = await Promise.all([value.load(), value.load()])
    expect([a, b, value.peek()]).toEqual([42, 42, 42])
    expect(factory).toHaveBeenCalledTimes(1)
  })

  it('retries after a failure', async () => {
    const factory = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce('ok')
    const value = lazy<string>(factory)
    await expect(value.load()).rejects.toThrow('offline')
    await expect(value.load()).resolves.toBe('ok')
    expect(factory).toHaveBeenCalledTimes(2)
  })
})

describe('keyedOnce', () => {
  it('runs a key once at a time and remembers failures', async () => {
    const onError = vi.fn()
    const task = vi.fn(async (key: string) => {
      if (key === 'bad') throw new Error('nope')
    })
    const once = keyedOnce(task, onError)
    await Promise.all([once.run('a'), once.run('a'), once.run('bad')])
    expect(task.mock.calls.map(c => c[0])).toEqual(['a', 'bad'])
    expect(onError).toHaveBeenCalledWith('bad', expect.any(Error))
    expect(once.failed('bad')).toBe(true)
    await once.run('bad')
    expect(task).toHaveBeenCalledTimes(2) // failed keys are not retried
    once.clear()
    expect(once.failed('bad')).toBe(false)
  })
})

describe('LruCache', () => {
  it('evicts the least recently used entry', () => {
    const cache = new LruCache<string, number>(2)
    cache.set('a', 1)
    cache.set('b', 2)
    cache.get('a') // `b` is now the oldest
    cache.set('c', 3)
    expect([cache.get('a'), cache.get('b'), cache.get('c'), cache.size]).toEqual([1, undefined, 3, 2])
  })
})

describe('DisposableBag', () => {
  it('disposes in reverse order, once, and survives a failing disposer', () => {
    const calls: string[] = []
    const bag = new DisposableBag()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    bag.add(
      () => calls.push('first'),
      () => {
        throw new Error('boom')
      }
    )
    bag.add(() => calls.push('last'))
    bag.dispose()
    bag.dispose()
    expect(calls).toEqual(['last', 'first'])
    expect(warn).toHaveBeenCalledTimes(1)
    warn.mockRestore()
  })
})
