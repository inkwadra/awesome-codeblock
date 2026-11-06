/** Map with a size limit that evicts the least recently used entry. */
export class LruCache<K, V> {
  private readonly entries = new Map<K, V>()

  constructor(private readonly maxEntries: number) {}

  get(key: K): V | undefined {
    const value = this.entries.get(key)
    if (value !== undefined) this.touch(key, value)
    return value
  }

  set(key: K, value: V): V {
    this.touch(key, value)
    if (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next()
      if (!oldest.done) this.entries.delete(oldest.value)
    }
    return value
  }

  clear(): void {
    this.entries.clear()
  }

  get size(): number {
    return this.entries.size
  }

  private touch(key: K, value: V): void {
    // Map iteration follows insertion order: re-inserting marks it as newest.
    this.entries.delete(key)
    this.entries.set(key, value)
  }
}
