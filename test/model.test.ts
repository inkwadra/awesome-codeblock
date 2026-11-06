import { describe, expect, it } from 'vite-plus/test'
import { configSchema, type Settings } from '../src/config'
import { blockLanguageName, buildModel, findFileNameComment, getCopyText, splitLangAndMeta } from '../src/model'

const settings = Object.fromEntries(Object.entries(configSchema).map(([k, v]) => [k, v.default])) as unknown as Settings

const build = (lang: string, meta: string, code: string, s: Partial<Settings> = {}) =>
  buildModel({ lang, meta, code }, { ...settings, ...s })

describe('splitLangAndMeta', () => {
  it('splits glued meta', () => {
    expect(splitLangAndMeta('js{1,3}', 'wrap')).toEqual(['js', '{1,3} wrap'])
    expect(splitLangAndMeta('ts[app.ts]', '')).toEqual(['ts', '[app.ts]'])
    expect(splitLangAndMeta('js', undefined)).toEqual(['js', ''])
  })
})

describe('file name extraction', () => {
  it('finds a file-name comment and removes it', () => {
    const m = build('js', '{3}', '// src/index.js\nconst a = 1\nconst b = 2\n')
    expect(m.title).toBe('src/index.js')
    expect(m.code).toBe('const a = 1\nconst b = 2')
    // {3} referred to the source line "const b = 2", now line 2
    expect(m.lineMarkers).toEqual([{ type: 'mark', from: 2, to: 2 }])
  })
  it('accepts prefixes and other comment styles', () => {
    expect(findFileNameComment(['<!-- File name: index.html -->'])?.name).toBe('index.html')
    expect(findFileNameComment(['#!/bin/sh', '# deploy.sh'])?.name).toBe('deploy.sh')
    expect(findFileNameComment(['/* styles/app.css */'])?.name).toBe('styles/app.css')
  })
  it('ignores ordinary comments', () => {
    expect(findFileNameComment(['# Install dependencies'])).toBeNull()
    expect(findFileNameComment(['const x = 1', '// a.js'])).toBeNull()
  })
  it('respects explicit title, frame=none and the setting', () => {
    expect(build('js', 'title="x"', '// a.js\n1').code).toBe('// a.js\n1')
    expect(build('js', 'frame="none"', '// a.js\n1').title).toBeUndefined()
    expect(build('js', '', '// a.js\n1', { extractFileNameFromCode: false }).title).toBeUndefined()
  })
  it('lets a block override the setting both ways', () => {
    expect(build('js', 'extractFileName', '// a.js\n1', { extractFileNameFromCode: false }).title).toBe('a.js')
    expect(build('js', 'extractFileName=false', '// a.js\n1').title).toBeUndefined()
    expect(build('js', 'extractFileName frame="none"', '// a.js\n1').title).toBeUndefined()
  })
})

describe('tab size', () => {
  it('uses the setting unless the block sets tabSize=, within 1–16', () => {
    expect(build('go', '', 'x', { tabSize: 8 }).tabSize).toBe(8)
    expect(build('go', 'tabSize=2', 'x').tabSize).toBe(2)
    expect(build('go', 'tabSize=0', 'x').tabSize).toBe(1)
    expect(build('go', 'tabSize=99', 'x').tabSize).toBe(16)
  })
})

describe('frames', () => {
  it('uses a code frame unless frame=none', () => {
    expect(build('sh', '', 'npm i').frame).toBe('code')
    expect(build('js', 'frame="none"', 'x').frame).toBe('none')
    expect(build('js', 'frame=terminal', 'x').frame).toBe('code')
  })
})

describe('diff', () => {
  it('converts +/- lines to markers with lang=', () => {
    const m = build('diff', 'lang="js"', '  const a = 1\n-const b = 2\n+const b = 3')
    expect(m.hlLang).toBe('javascript')
    expect(m.code).toBe(' const a = 1\nconst b = 2\nconst b = 3')
    expect(m.lineMarkers).toEqual([
      { type: 'del', from: 2, to: 2 },
      { type: 'ins', from: 3, to: 3 }
    ])
  })
  it('leaves real diff files alone', () => {
    const code = '--- a/x\n+++ b/x\n@@ -1 +1 @@\n-a\n+b'
    const m = build('diff', '', code)
    expect(m.code).toBe(code)
    expect(m.hlLang).toBe('diff')
    expect(m.lineMarkers).toEqual([])
  })
  it('names the block in the header', () => {
    expect(blockLanguageName(build('diff', 'lang="ts"', '-a\n+b'))).toBe('TypeScript diff')
    expect(blockLanguageName(build('diff', '', '--- a/x\n+++ b/x\n@@ -1 +1 @@\n-a\n+b'))).toBe('Diff')
    expect(blockLanguageName(build('diff', '', '-a\n+b'))).toBe('Diff')
    expect(blockLanguageName(build('ts', '', 'x'))).toBe('TypeScript')
  })
})

describe('options', () => {
  it('supports Inkdrop line= / branch=', () => {
    const m = build('js', 'line=10-12 branch=main url=https://github.com/a/b', 'x')
    expect(m.lineNumbers).toBe(true)
    expect(m.startLineNumber).toBe(10)
    expect(m.info).toEqual({ range: { from: 10, to: 12 }, branch: 'main' })
    expect(m.url).toBe('https://github.com/a/b')
  })
  it('resolves languages and defaults', () => {
    expect(build('TS', '', 'x').hlLang).toBe('typescript')
    expect(build('golang', '', 'x').hlLang).toBe('go')
    expect(build('nope', '', 'x').hlLang).toBe('text')
    expect(build('js', '', 'x', { showLineNumbers: true }).lineNumbers).toBe(true)
    expect(build('js', 'showLineNumbers=false', 'x', { showLineNumbers: true }).lineNumbers).toBe(false)
    expect(build('js', 'wrap', 'x').wrap).toBe(true)
  })
  it('keeps tab and group', () => {
    const m = build('sh', 'tab="pnpm" group=pm', 'pnpm i')
    expect(m.tab).toBe('pnpm')
    expect(m.group).toBe('pm')
  })
})

describe('getCopyText', () => {
  it('strips notation comments', () => {
    const m = build(
      'ts',
      '',
      'a() // [!code ++]\n// [!code focus]\nb()\nc() /* [!code --] */\n# [!code highlight]\nd()'
    )
    expect(getCopyText(m)).toBe('a()\nb()\nc()\nd()')
    const off = build('ts', 'notation=false', 'a() // [!code ++]')
    expect(getCopyText(off)).toBe('a() // [!code ++]')
  })
  it('keeps notations Shiki does not know', () => {
    const m = build('ts', '', 'a() // [!code nope]\nb() // [!code info]')
    expect(getCopyText(m)).toBe('a() // [!code nope]\nb()')
  })
  it('keeps shell sessions verbatim', () => {
    const m = build('console', '', '$ npm i\n# comment\nadded 1 package')
    expect(getCopyText(m)).toBe(m.code)
  })
})
