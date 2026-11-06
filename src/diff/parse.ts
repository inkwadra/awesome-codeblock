import type { FileDiffMetadata, SupportedLanguages } from '@pierre/diffs'
import { hasFileHeader } from '../model/source'

export interface ParsedDiff {
  files: FileDiffMetadata[]
}

const HUNK_HEADER = /^@@ /m
const GIT_HEADER = /^diff --git /m

/**
 * Parses a `diff` / `patch` block for the diff view. Accepts git and unified
 * patches with one or more files, and bare `@@` hunks (given synthetic file
 * headers). Returns `null` for anything the view can't show, e.g. the
 * "normal" `3c3` format — the classic rendering is used then.
 */
export function parseDiff(
  diffs: Pick<typeof import('@pierre/diffs'), 'parsePatchFiles' | 'setLanguageOverride'>,
  code: string,
  opts: { title?: string; lang?: string } = {}
): ParsedDiff | null {
  // A `--- x` line inside a bare hunk is a removed `-- x`, not a header.
  const headerless = !GIT_HEADER.test(code) && !hasFileHeader(code.split('\n')) && HUNK_HEADER.test(code)
  let patch = code
  if (headerless) {
    const name = opts.title?.trim() || 'file'
    patch = `--- ${name}\n+++ ${name}\n${code}`
  } else if (!GIT_HEADER.test(code)) {
    // `diff -u` / hand-written patches with git's a/ b/ prefixes: without a
    // `diff --git` line diffs keeps them and shows "a/x → b/x" as a rename.
    patch = code.replace(/^(---|\+\+\+) [ab]\/(?=\S)/gm, '$1 ')
  }
  let files: FileDiffMetadata[]
  try {
    // Lenient: hand-written hunks often miscount lines; diffs then uses the
    // lines actually present.
    files = diffs.parsePatchFiles(patch, { throwOnError: false }).flatMap(p => p.files)
  } catch {
    return null
  }
  files = files.filter(f => f.hunks.length > 0)
  if (files.length === 0) return null
  if (opts.lang) files = files.map(f => diffs.setLanguageOverride(f, opts.lang as SupportedLanguages))
  return { files }
}
