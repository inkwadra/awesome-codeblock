import { lazy } from '../shared/lazy'

/**
 * Lazy import of the diff view part of `@pierre/diffs`, loaded only when a
 * note shows a diff. (The shared highlighter has its own small chunk, see
 * `highlight/shiki.ts`.) Destructuring the dynamic import lets the bundler
 * keep only the exports listed here.
 */
async function importDiffs() {
  const { FileDiff, parsePatchFiles, setLanguageOverride } = await import('@pierre/diffs')
  return { FileDiff, parsePatchFiles, setLanguageOverride }
}

export type DiffsApi = Awaited<ReturnType<typeof importDiffs>>

const diffs = lazy(importDiffs)

export const loadDiffs = diffs.load

/** The API if it is already loaded, so views can mount synchronously. */
export function loadedDiffs(): DiffsApi | null {
  return diffs.peek() ?? null
}
