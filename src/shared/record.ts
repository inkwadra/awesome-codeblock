/**
 * Reads `record[key]` only if it is the record's own property. Keys here come
 * from notes and settings (fence languages, meta options, file names), so a
 * plain lookup would hand out `Object.prototype` members for `constructor`,
 * `toString` or `__proto__`.
 */
export function own<T>(record: Readonly<Record<string, T>>, key: string): T | undefined {
  return Object.hasOwn(record, key) ? record[key] : undefined
}
