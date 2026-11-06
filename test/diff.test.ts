import * as diffs from '@pierre/diffs'
import { createHighlighterCore } from 'shiki/core'
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript'
import { bundledLanguages } from 'shiki/langs'
import { describe, expect, it } from 'vite-plus/test'
import { configSchema, type Settings } from '../src/config'
import { parseDiff } from '../src/diff/parse'
import { summarizePatch } from '../src/diff/summary'
import { ensureLoaded, getHighlighter, shikiCoreOf } from '../src/highlight/shiki'
import { buildModel } from '../src/model'

const settings = Object.fromEntries(Object.entries(configSchema).map(([k, v]) => [k, v.default])) as unknown as Settings
const build = (lang: string, meta: string, code: string, s: Partial<Settings> = {}) =>
  buildModel({ lang, meta, code }, { ...settings, ...s })

const GIT_PATCH = `diff --git a/src/a.ts b/src/a.ts
index 83db48f..bf269f4 100644
--- a/src/a.ts
+++ b/src/a.ts
@@ -1,3 +1,3 @@
 const a = 1
-const b = 2
+const b = 3
 export { a, b }`

describe('one Shiki core shared with @pierre/diffs', () => {
  it('uses the core inside the diffs shared highlighter', async () => {
    const shared = await diffs.getSharedHighlighter({ preferredHighlighter: 'shiki-js', themes: [], langs: [] })
    const core = shikiCoreOf(shared)
    expect(core).not.toBeNull()
    expect(await getHighlighter()).toBe(core)
  })

  it('loads each grammar once for both', async () => {
    await ensureLoaded(['typescript'], 'github-dark')
    const hl = await getHighlighter()
    const grammar = hl.getLanguage('typescript')

    const shared = await diffs.getSharedHighlighter({
      preferredHighlighter: 'shiki-js',
      themes: ['github-dark'],
      langs: ['typescript', 'python']
    })
    expect(shared.hasLoadedLanguages(['typescript'])).toBe(true)
    expect(hl.getLanguage('typescript')).toBe(grammar) // not loaded again
    expect(hl.getLoadedLanguages()).toContain('python') // diffs' load is ours too
  })

  it('keeps the engine forgiving (build plugin)', async () => {
    // ahk2 has a pattern the JS engine can't compile; it is hit by hotkeys.
    const code = 'LCtrl & a::MsgBox "hi"'
    const strict = await createHighlighterCore({ engine: createJavaScriptRegexEngine(), themes: [], langs: [] })
    await strict.loadLanguage(bundledLanguages.ahk2)
    await strict.loadTheme(import('shiki/themes/github-dark.mjs'))
    expect(() => strict.codeToTokens(code, { lang: 'ahk2', theme: 'github-dark' })).toThrow()
    strict.dispose()

    await ensureLoaded(['ahk2'], 'github-dark')
    const hl = await getHighlighter()
    expect(() => hl.codeToTokens(code, { lang: 'ahk2', theme: 'github-dark' })).not.toThrow()
  })
})

describe('parseDiff', () => {
  it('parses a git patch', () => {
    const r = parseDiff(diffs, GIT_PATCH)
    expect(r?.files.map(f => f.name)).toEqual(['src/a.ts'])
  })

  it('parses multi-file patches', () => {
    const patch = ['x.js', 'y.css']
      .map(f => `diff --git a/${f} b/${f}\n--- a/${f}\n+++ b/${f}\n@@ -1 +1 @@\n-a\n+b`)
      .join('\n')
    expect(parseDiff(diffs, patch)?.files.map(f => f.name)).toEqual(['x.js', 'y.css'])
  })

  it('accepts bare hunks, named after the title', () => {
    const r = parseDiff(diffs, '@@ -1,2 +1,2 @@\n-print("hi")\n+print("hello")\n x = 1', { title: 'app.py' })
    expect(r?.files[0]?.name).toBe('app.py')
  })

  it('reads a removed `-- x` line in a bare hunk as content, not a header', () => {
    const r = parseDiff(diffs, '@@ -1,2 +1,2 @@\n--- old\n+-- new\n select 1;', { title: 'q.sql' })
    expect(r?.files[0]?.name).toBe('q.sql')
    expect(r?.files[0]?.deletionLines).toHaveLength(2)
  })

  it('tolerates miscounted hunk headers', () => {
    const r = parseDiff(diffs, '--- a/s.ts\n+++ b/s.ts\n@@ -1,1 +1,1 @@\n a\n-b\n+c\n+d')
    expect(r?.files[0]?.additionLines).toHaveLength(3)
  })

  it('drops a/ b/ prefixes of non-git patches', () => {
    const f = parseDiff(diffs, '--- a/app.py\n+++ b/app.py\n@@ -1 +1 @@\n-a\n+b')?.files[0]
    expect(f?.name).toBe('app.py')
    expect(f?.prevName).toBeUndefined()
  })

  it('applies the lang= override', () => {
    expect(parseDiff(diffs, GIT_PATCH, { lang: 'javascript' })?.files[0]?.lang).toBe('javascript')
  })

  it('rejects formats the view cannot show', () => {
    expect(parseDiff(diffs, '3c3\n< old\n---\n> new')).toBeNull()
    expect(parseDiff(diffs, 'just text')).toBeNull()
  })
})

describe('diffStyle in the model', () => {
  it('defaults real diffs to the unified view', () => {
    expect(build('diff', '', GIT_PATCH).diffStyle).toBe('unified')
    expect(build('patch', '', GIT_PATCH).diffStyle).toBe('unified')
  })

  it('follows the setting and the block option', () => {
    expect(build('diff', '', GIT_PATCH, { diffStyle: 'split' }).diffStyle).toBe('split')
    expect(build('diff', '', GIT_PATCH, { diffStyle: 'classic' }).diffStyle).toBeUndefined()
    expect(build('diff', 'diffStyle=split', GIT_PATCH).diffStyle).toBe('split')
    expect(build('diff', 'diffStyle=classic', GIT_PATCH).diffStyle).toBeUndefined()
    expect(build('diff', 'diffStyle=bogus', GIT_PATCH, { diffStyle: 'split' }).diffStyle).toBe('split')
  })

  it('leaves +/- notation blocks classic', () => {
    const m = build('diff', 'lang="ts"', '+const a = 1\n-const b = 2')
    expect(m.diffStyle).toBeUndefined()
    expect(m.diffLang).toBeUndefined()
  })

  it('resolves lang= for the view', () => {
    expect(build('diff', 'lang="ts"', GIT_PATCH).diffLang).toBe('typescript')
    expect(build('diff', '', GIT_PATCH).diffLang).toBeUndefined()
  })
})

describe('summarizePatch', () => {
  it('names git files and counts their lines', () => {
    expect(summarizePatch(GIT_PATCH)).toEqual([{ name: 'src/a.ts', additions: 1, deletions: 1 }])
  })

  it('handles multi-file, renamed, added and deleted files', () => {
    const patch = [
      'diff --git a/old.js b/new.js',
      'similarity index 90%',
      'rename from old.js',
      'rename to new.js',
      '--- a/old.js',
      '+++ b/new.js',
      '@@ -1 +1 @@',
      '-a',
      '+b',
      'diff --git a/added.txt b/added.txt',
      'new file mode 100644',
      '--- /dev/null',
      '+++ b/added.txt',
      '@@ -0,0 +1,2 @@',
      '+x',
      '+y',
      '--- a/gone.py',
      '+++ /dev/null',
      '@@ -1 +0,0 @@',
      '-z'
    ].join('\n')
    expect(summarizePatch(patch)).toEqual([
      { name: 'new.js', prevName: 'old.js', additions: 1, deletions: 1 },
      { name: 'added.txt', additions: 2, deletions: 0 },
      { name: 'gone.py', additions: 0, deletions: 1 }
    ])
  })

  it('counts header-looking content lines and ignores hunk counts', () => {
    const patch = '--- a/q.sql\n+++ b/q.sql\n@@ -1,1 +1,1 @@\n--- old comment\n+-- new comment\n+select 1;'
    expect(summarizePatch(patch)).toEqual([{ name: 'q.sql', additions: 2, deletions: 1 }])
  })

  it('leaves out files without hunks', () => {
    const patch = 'diff --git a/a.png b/a.png\nBinary files differ\n' + GIT_PATCH
    expect(summarizePatch(patch).map(f => f.name)).toEqual(['src/a.ts'])
  })

  it('names bare hunks after the fallback', () => {
    expect(summarizePatch('@@ -1 +1 @@\n-a\n+b', 'main.rs')).toEqual([{ name: 'main.rs', additions: 1, deletions: 1 }])
  })

  it('is stored on diff-view models only', () => {
    expect(build('diff', '', GIT_PATCH).diffFiles).toHaveLength(1)
    expect(build('diff', '', GIT_PATCH, { diffStyle: 'classic' }).diffFiles).toBeUndefined()
    expect(build('diff', 'title="cfg.rs"', '@@ -1 +1 @@\n-a\n+b').diffFiles?.[0]?.name).toBe('cfg.rs')
  })

  it('keeps hand-written diffs that remove a `--` comment classic', () => {
    const m = build('diff', 'lang=sql', ' SELECT 1;\n--- old comment\n+-- new comment\n FROM t;')
    expect(m.diffStyle).toBeUndefined()
    expect(m.hlLang).toBe('sql')
    expect(m.lineMarkers.map(r => r.type)).toEqual(['del', 'ins'])
    expect(m.code).toBe('SELECT 1;\n-- old comment\n-- new comment\nFROM t;')
  })

  it('shows formats the view cannot parse as classic', () => {
    const normal = build('diff', '', '3c3\n< a\n---\n> b')
    expect(normal.hlLang).toBe('diff')
    expect(normal.diffStyle).toBeUndefined()
    expect(build('diff', '', '*** a.txt\n--- b.txt\n***************\n*** 1 ****\n! a').diffStyle).toBeUndefined()
  })

  it('keeps unified headers in the code (no file-name comment extraction)', () => {
    const code = '--- a/x.py\n+++ b/x.py\n@@ -1 +1 @@\n-a\n+b'
    expect(build('diff', '', code).code).toBe(code)
  })
})
