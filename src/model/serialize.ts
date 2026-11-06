/**
 * JSON of block models, memoized per object.
 *
 * A model is serialized once by the rehype plugin (into the custom element's
 * attribute) and the same string identifies it in the highlight cache. The
 * components parse that string back and register the result here, so cache
 * lookups never serialize the code again.
 */
const json = new WeakMap<object, string>()

export function serialize(value: object): string {
  let out = json.get(value)
  if (out === undefined) {
    out = JSON.stringify(value)
    json.set(value, out)
  }
  return out
}

/** Parses JSON written by `serialize`, remembering the string for the result. `null` if invalid. */
export function deserialize<T extends object>(text: unknown): T | null {
  if (typeof text !== 'string') return null
  try {
    const value: unknown = JSON.parse(text)
    if (typeof value !== 'object' || value === null) return null
    json.set(value, text)
    return value as T
  } catch {
    return null
  }
}
