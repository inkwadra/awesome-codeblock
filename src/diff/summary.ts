/** One file of a patch, as shown in the frame header. */
export interface DiffFileSummary {
  /** Path after the change (before it, for a deleted file). */
  name: string
  /** Path before a rename. */
  prevName?: string
  additions: number
  deletions: number
}

const GIT = /^diff --git (?:a\/)?(\S+) (?:b\/)?(\S+)/
const OLD = /^--- (\S+)/
const NEW = /^\+\+\+ (\S+)/
const HUNK = /^@@ /
const DEV_NULL = '/dev/null'

const strip = (path: string, prefix: string) => (path.startsWith(prefix) ? path.slice(prefix.length) : path)

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
    if (prevName && prevName !== name) file.prevName = prevName
    files.push(file)
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    const git = GIT.exec(line)
    if (git) {
      open(git[2]!, git[1]!)
      fromGit = true
      inHunk = false
      continue
    }
    const old = OLD.exec(line)
    const next = NEW.exec(lines[i + 1] ?? '')
    if (old && next) {
      i++
      inHunk = false
      const oldPath = old[1] === DEV_NULL ? undefined : strip(old[1]!, 'a/')
      const newPath = next[1] === DEV_NULL ? undefined : strip(next[1]!, 'b/')
      if (fromGit) {
        fromGit = false // same file as the `diff --git` line
        continue
      }
      open(newPath ?? oldPath ?? fallbackName, newPath && oldPath)
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
