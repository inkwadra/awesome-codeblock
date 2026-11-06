/**
 * Pure analysis of a code block's fence and source text.
 */

/** Splits fences written without a space, e.g. ```` ```js{1,3} ```` or ```` ```ts[app.ts] ````. */
export function splitLangAndMeta(lang: string | undefined, meta: string | undefined): [lang: string, meta: string] {
  let l = (lang ?? '').trim()
  let m = (meta ?? '').trim()
  const glued = /^([^{[\s]+)([{[].*)$/.exec(l)
  if (glued) {
    l = glued[1]!
    m = `${glued[2]} ${m}`.trim()
  }
  return [l, m]
}

/** Opening / closing comment delimiters of common languages. */
export const COMMENT_OPEN = String.raw`(?:\/\/+|#+|--|;+|%+|<!--|\/\*+|\{\{!--)`
export const COMMENT_CLOSE = String.raw`(?:-->|\*+\/|--\}\})`

const FILE_NAME = String.raw`(?:[\w@~$.\\/-]*[\w-]\.[\w-]+|Dockerfile|Makefile|Gemfile|Rakefile|Procfile|Justfile|Brewfile|Vagrantfile|Caddyfile|\.[\w.-]+)`
// `(*` / `*)`: OCaml / Pascal comments, accepted for file names only.
const FILE_COMMENT_RE = new RegExp(
  String.raw`^\s*(?:${COMMENT_OPEN}|\(\*)\s*(?:[\w ]{1,20}:\s*)?(${FILE_NAME})\s*(?:${COMMENT_CLOSE}|\*\))?\s*$`
)

/** Lines searched for a file-name comment. */
const FILE_COMMENT_SEARCH_LINES = 4

/**
 * Finds a file-name comment in the first lines (Expressive Code behaviour).
 * Returns the 0-based line index and the file name.
 */
export function findFileNameComment(lines: readonly string[]): { index: number; name: string } | null {
  for (let i = 0; i < Math.min(lines.length, FILE_COMMENT_SEARCH_LINES); i++) {
    const line = lines[i]!
    if (line.startsWith('#!') || line.trim() === '') continue // shebang / blank
    const m = FILE_COMMENT_RE.exec(line)
    return m ? { index: i, name: m[1]! } : null // first meaningful line decides
  }
  return null
}

/** Lines that only a diff file has, on their own. */
const DIFF_LINE = /^(?:diff --git |index [0-9a-f]{4,}\.\.[0-9a-f]{4,}|@@ -\d+(?:,\d+)? \+\d+(?:,\d+)? @@)/
/** "Normal" diff command (`3c3`, `5,7d4`), real only next to `<` / `>` lines. */
const NORMAL_COMMAND = /^\d+(?:,\d+)?[acd]\d+(?:,\d+)?$/
const NORMAL_LINE = /^[<>] /

/**
 * True when `lines` contain a file header pair: `--- old` directly followed by
 * `+++ new` (unified) or `*** old` by `--- new` (context). A lone `--- x` is a
 * hand-written removal of `-- x` (an SQL / Lua comment), not a header.
 */
export function hasFileHeader(lines: readonly string[]): boolean {
  return lines.some(
    (line, i) =>
      (line.startsWith('--- ') && lines[i + 1]?.startsWith('+++ ')) ||
      (line.startsWith('*** ') && lines[i + 1]?.startsWith('--- '))
  )
}

/** True for a "real" diff file (headers, hunks), which is left untouched. */
export function isRealDiff(lines: readonly string[]): boolean {
  return (
    hasFileHeader(lines) ||
    lines.some(line => DIFF_LINE.test(line)) ||
    (lines.some(line => NORMAL_COMMAND.test(line)) && lines.some(line => NORMAL_LINE.test(line)))
  )
}

export interface DiffPrefixResult {
  lines: string[]
  /** `+` / `-` lines in source order (1-based). */
  changes: Array<{ line: number; type: 'ins' | 'del' }>
}

/**
 * Strips the `+` / `-` prefixes of a hand-written diff and records the lines
 * they marked. With `stripContext`, the leading space of context lines is
 * dropped as well (`diff` fences); otherwise it is code (`useDiffSyntax`).
 */
export function stripDiffPrefixes(lines: readonly string[], stripContext: boolean): DiffPrefixResult {
  const changes: DiffPrefixResult['changes'] = []
  const out = lines.map((line, i) => {
    const prefix = line[0]
    if (prefix === '+' || prefix === '-') {
      changes.push({ line: i + 1, type: prefix === '+' ? 'ins' : 'del' })
      return line.slice(1)
    }
    return stripContext && prefix === ' ' ? line.slice(1) : line
  })
  return { lines: out, changes }
}
