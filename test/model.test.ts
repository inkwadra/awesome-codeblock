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
  it('leaves comments that only resemble a file name in the code', () => {
    const untouched: Array<[lang: string, code: string]> = [
      ['py', '# Version: 1.2.3\nprint(1)'],
      ['sh', '# v2.0\necho hi'],
      ['js', '// Output: 3.14\nconsole.log(Math.PI)'],
      ['js', '// https://example.com/docs/api.html\nfetch(url)'],
      ['js', '// TODO: refactor.this\nfoo()'],
      ['css', '/* 1.5 */\na{}'],
      ['text', '# 192.168.1.1\n127.0.0.1 localhost'],
      ['sql', '-- 2024.01.15\nselect 1']
    ]
    for (const [lang, code] of untouched) {
      const m = build(lang, '', code)
      expect(m.title, code).toBeUndefined()
      expect(m.code, code).toBe(code)
    }
  })
  it('reads `#` as a heading in Markdown', () => {
    for (const lang of ['md', 'markdown', 'mdx']) {
      expect(build(lang, '', '# Node.js\n\nSome text').title, lang).toBeUndefined()
      expect(build(lang, '', '## notes.md\n\nSome text').code, lang).toBe('## notes.md\n\nSome text')
    }
    expect(build('md', '', '<!-- docs/intro.md -->\n# Intro').title).toBe('docs/intro.md')
    expect(build('py', '', '# main.py\nprint(1)').title).toBe('main.py')
  })
  it('accepts known extensions, dotfiles, bare names and paths', () => {
    const titled: Array<[code: string, title: string]> = [
      ['# values.yaml\nkey: 1', 'values.yaml'],
      ['// src/components/Button.tsx\nexport {}', 'src/components/Button.tsx'],
      ['# .env.local\nA=1', '.env.local'],
      ['# Dockerfile\nFROM node', 'Dockerfile'],
      ['// include/core.h\nint x;', 'include/core.h'],
      ['# requirements.txt\nflask', 'requirements.txt'],
      // An unknown extension is taken for one when the name is a path.
      ['# conf/app.xyz\nA=1', 'conf/app.xyz']
    ]
    for (const [code, title] of titled) expect(build('text', '', code).title, code).toBe(title)
    expect(build('text', '', '# app.xyz\nA=1').title).toBeUndefined()
  })
  it('keeps a comment that is the whole block', () => {
    expect(build('bash', '', '# setup.sh')).toMatchObject({ code: '# setup.sh' })
    expect(build('bash', '', '# setup.sh').title).toBeUndefined()
    expect(build('bash', '', '# setup.sh\n\n').title).toBeUndefined()
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
  it('copies the rendered code when it is given', () => {
    const m = build('ts', '', 'a() // [!code ++]')
    expect(getCopyText(m, 'a()')).toBe('a()')
    // Without notation comments the code is copied as written.
    expect(getCopyText(build('ts', '', 'a()'), 'ignored')).toBe('a()')
    expect(getCopyText(build('ts', 'notation=false', 'a() // [!code ++]'), 'ignored')).toBe('a() // [!code ++]')
  })
  it('keeps trailing notations in code without a grammar, where Shiki keeps them', () => {
    const m = build('text', '', 'keep // [!code ++]\n// [!code highlight]\nlast')
    expect(getCopyText(m)).toBe('keep // [!code ++]\nlast')
  })
  it('keeps shell sessions verbatim', () => {
    const m = build('console', '', '$ npm i\n# comment\nadded 1 package')
    expect(getCopyText(m)).toBe(m.code)
  })
})
