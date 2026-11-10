/** One file of a patch, as shown in the frame header. */
export interface DiffFileSummary {
  /** Path after the change (before it, for a deleted file). */
  name: string
  /** Path before a rename. */
  prevName?: string
  additions: number
  deletions: number
}

const GIT = /^diff --git (.+)$/
// `diff -u` puts a tab and a timestamp after the path; git puts nothing.
const OLD = /^--- ([^\t]+)/
const NEW = /^\+\+\+ ([^\t]+)/
const RENAME_FROM = /^rename from (.+)$/
const RENAME_TO = /^rename to (.+)$/
const HUNK = /^@@ /
const DEV_NULL = '/dev/null'

const strip = (path: string, prefix: string) => (path.startsWith(prefix) ? path.slice(prefix.length) : path)

/** A path as git writes it: quoted when it has special characters. */
const unquote = (path: string) => {
  const trimmed = path.trim()
  return trimmed.length > 1 && trimmed.startsWith('"') && trimmed.endsWith('"') ? trimmed.slice(1, -1) : trimmed
}

/**
 * The two paths of a `diff --git` line. Paths are not delimited (`a/my file.txt
 * b/my file.txt`), so the common case of one path given twice is tried first;
 * a rename is split at ` b/`. The `---` / `+++` and `rename` lines that follow
 * are exact and replace this guess.
 */
function gitPaths(rest: string): [old: string, new: string] {
  const quoted = /^"(?:a\/)?(.+)" "(?:b\/)?(.+)"$/.exec(rest)
  if (quoted) return [quoted[1]!, quoted[2]!]
  const same = /^a\/(.+) b\/\1$/.exec(rest) ?? /^(.+) \1$/.exec(rest)
  if (same) return [same[1]!, same[1]!]
  const renamed = /^a\/(.+?) b\/(.+)$/.exec(rest) ?? /^(\S+) (\S+)$/.exec(rest)
  if (renamed) return [renamed[1]!, renamed[2]!]
  return [rest, rest]
}

/**
 * Files and +/- counts of a git or unified patch, computed without loading
 * the diff view (the header needs them synchronously, also in print mode).
 *
 * Lenient like the view: hunk line counts are not trusted. A `--- x` line is a
 * file header only when `+++ y` follows; otherwise it is a removed line.
 * Bare `@@` hunks make one file named `fallbackName`. Files without hunks
 * (renames, mode changes, binaries) are left out, as the diff view leaves them.
 */
export function summarizePatch(code: string, fallbackName = 'file'): DiffFileSummary[] {
  const lines = code.split('\n')
  const files: DiffFileSummary[] = []
  let file: DiffFileSummary | undefined
  let fromGit = false // `file` was opened by `diff --git`, not yet by ---/+++
  let inHunk = false
  const withHunks = new Set<DiffFileSummary>()

  const open = (name: string, prevName?: string) => {
    file = { name, additions: 0, deletions: 0 }
    files.push(file)
    rename(name, prevName)
  }
  /** Names the current file, with its previous path when that differs. */
  const rename = (name: string, prevName?: string) => {
    if (!file) return
    file.name = name
    if (prevName && prevName !== name) file.prevName = prevName
    else delete file.prevName
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    const git = GIT.exec(line)
    if (git) {
      const [oldPath, newPath] = gitPaths(git[1]!)
      open(newPath, oldPath)
      fromGit = true
      inHunk = false
      continue
    }
    if (fromGit && file) {
      // git's extended headers give a rename's paths exactly.
      const from = RENAME_FROM.exec(line)
      if (from) {
        rename(file.name, unquote(from[1]!))
        continue
      }
      const to = RENAME_TO.exec(line)
      if (to) {
        rename(unquote(to[1]!), file.prevName)
        continue
      }
    }
    const old = OLD.exec(line)
    const next = NEW.exec(lines[i + 1] ?? '')
    if (old && next) {
      i++
      inHunk = false
      const oldName = unquote(old[1]!)
      const newName = unquote(next[1]!)
      const oldPath = oldName === DEV_NULL ? undefined : strip(oldName, 'a/')
      const newPath = newName === DEV_NULL ? undefined : strip(newName, 'b/')
      const name = newPath ?? oldPath ?? fallbackName
      if (fromGit) {
        // Same file as the `diff --git` line, whose paths these lines state exactly.
        fromGit = false
        rename(name, newPath && oldPath)
        continue
      }
      open(name, newPath && oldPath)
      continue
    }
    if (HUNK.test(line)) {
      if (!file) open(fallbackName)
      withHunks.add(file!)
      fromGit = false
      inHunk = true
      continue
    }
    if (!inHunk || !file) continue
    if (line.startsWith('+')) file.additions++
    else if (line.startsWith('-')) file.deletions++
  }
  return files.filter(f => withHunks.has(f))
}
