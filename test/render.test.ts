import { beforeAll, describe, expect, it } from 'vite-plus/test'
import { configSchema, type Settings } from '../src/config'
import { highlight } from '../src/highlight/service'
import { renderBlock, renderPlain } from '../src/highlight/render'
import { compileInlineMarkers, findInlineRanges } from '../src/highlight/transformers/inline-markers'
import { gutterChars } from '../src/highlight/transformers/structure'
import { ensureLoaded, getHighlighter } from '../src/highlight/shiki'
import { buildModel } from '../src/model'

const settings = Object.fromEntries(Object.entries(configSchema).map(([k, v]) => [k, v.default])) as unknown as Settings
const model = (lang: string, meta: string, code: string, s: Partial<Settings> = {}) =>
  buildModel({ lang, meta, code }, { ...settings, ...s })

async function render(lang: string, meta: string, code: string, s: Partial<Settings> = {}) {
  const m = model(lang, meta, code, s)
  const theme = await ensureLoaded([m.hlLang], 'github-dark')
  return renderBlock(await getHighlighter(), m, theme)
}

const count = (html: string, needle: string) => html.split(needle).length - 1

beforeAll(async () => {
  await ensureLoaded(['javascript', 'typescript', 'shellscript'], 'github-dark')
})

describe('renderBlock', () => {
  it('highlights with the JS regex engine and one element per line', async () => {
    const r = await render('js', '', 'const a = 1\n\nconst b = 2')
    expect(r.lineCount).toBe(3)
    expect(count(r.html, 'class="line acb-line')).toBe(3)
    expect(r.html).toMatch(/style="color:#[0-9A-F]{6}/i)
    expect(r.html).not.toContain('\n') // no newline text nodes between block lines
    expect(r.vars['--acb-bg']).toBeTruthy()
    expect(r.dark).toBe(true)
  })

  it('labels a line with its strongest labelled marker', async () => {
    const r = await render('js', `mark={"m":1} del={"d":1} ins={"i":1}`, 'a')
    expect(r.html).toContain('acb-line acb-del')
    expect(r.html).toContain('data-label="d"')
    expect(r.html).not.toContain('data-label="m"')
  })

  it('applies line markers and labels', async () => {
    const r = await render('js', `{1} ins={2} del={"x":3}`, 'a\nb\nc')
    expect(r.html).toContain('acb-line acb-mark')
    expect(r.html).toContain('acb-line acb-ins')
    expect(r.html).toContain('acb-line acb-del')
    expect(r.html).toContain('data-label="x"')
  })

  it('maps markers and collapsed sections to source lines past removed notation lines', async () => {
    const code = 'a()\n// [!code focus:1]\nb()\nc()\nd()'
    const marked = await render('js', '{3} showLineNumbers', code)
    expect(marked.lineCount).toBe(4)
    const lineOf = (html: string, text: string) =>
      html.split('<span class="line').find(l => l.includes(`>${text}<`)) ?? ''
    expect(lineOf(marked.html, 'b')).toContain('acb-mark')
    expect(lineOf(marked.html, 'c')).not.toContain('acb-mark')
    expect(marked.html).not.toContain('dataAcbSrc')
    expect(marked.html).not.toContain('data-acb-src')

    const collapsed = await render('js', 'collapse={3-4}', code)
    const section = collapsed.html.slice(collapsed.html.indexOf('<details'), collapsed.html.indexOf('</details>'))
    expect(section).toContain('>b<')
    expect(section).toContain('>c<')
    expect(section).not.toContain('>d<')
    expect(section).toContain('data-collapsed="2 collapsed lines"')
    expect(collapsed.visibleRows).toBe(3)
  })

  it('renders the plain fallback with the same structure', () => {
    const p = renderPlain(model('js', '{2} collapse={4-5} showLineNumbers', 'a\n// [!code ++]\nb <x>\nc\nd'))
    expect(p.lineCount).toBe(4)
    expect(p.visibleRows).toBe(3)
    expect(p.html).not.toContain('[!code')
    expect(p.html).toContain('b &#x3C;x>')
    expect(p.html).toContain('<details')
    expect(p.html).toContain('data-ln="4"')
  })

  it('sizes the gutter for negative start numbers', () => {
    expect(gutterChars(-100, 5)).toBe(4)
    expect(gutterChars(98, 3)).toBe(3)
  })

  it('renders line numbers starting at startLineNumber', async () => {
    const r = await render('js', 'showLineNumbers startLineNumber=98', 'a\nb\nc')
    expect(r.html).toContain('data-ln="98"')
    expect(r.html).toContain('data-ln="100"')
    expect(r.html).toContain('--acb-ln-chars:3')
    expect(r.html).toContain('acb-has-ln')
  })

  it('wraps inline markers across token boundaries', async () => {
    const r = await render('js', `"a = 1" del=/(b)/`, 'const a = 1; b')
    expect(count(r.html, 'acb-im acb-im-mark')).toBeGreaterThanOrEqual(2) // split over tokens
    expect(r.html).toContain('acb-im-start')
    expect(r.html).toContain('acb-im-end')
    expect(r.html).toContain('acb-im acb-im-del')
  })

  it('resolves overlapping inline markers by priority', () => {
    const m = model('js', `"abc" del="bc"`, 'abc')
    expect(findInlineRanges('abc', compileInlineMarkers(m.inlineMarkers))).toEqual([{ start: 1, end: 3, type: 'del' }])
  })

  it('creates collapsible sections', async () => {
    const r = await render('js', 'collapse={2-3}', 'a\nb\nc\nd')
    expect(r.html).toContain('<details class="acb-collapse acb-collapse-github">')
    expect(r.html).toContain('data-collapsed="2 collapsed lines"')
    const auto = await render('js', 'collapse={3-4} collapseStyle=collapsible-auto', 'a\nb\nc\nd')
    expect(auto.html).toContain('acb-collapse-collapsible-end')
  })

  it('supports shiki notation comments', async () => {
    const r = await render(
      'js',
      '',
      'a() // [!code ++]\nb() // [!code --]\nc() // [!code focus]\nd() // [!code highlight]'
    )
    expect(r.html).toContain('acb-ins')
    expect(r.html).toContain('acb-del')
    expect(r.html).toContain('acb-focused')
    expect(r.html).toContain('acb-has-focused')
    expect(r.html).toContain('acb-mark')
    expect(r.html).not.toContain('[!code')
  })

  it('keeps notation comments when disabled', async () => {
    const r = await render('js', 'notation=false', 'a() // [!code ++]')
    expect(r.html).toContain('[!code ++]')
  })

  it('emits per-line indent for wrapping', async () => {
    const r = await render('js', 'hangingIndent=2', 'if (a) {\n    b()\n}')
    expect(r.html).toContain('--acb-indent:6')
    expect(r.html).toContain('--acb-indent:2')
  })

  it('renders unknown languages and ANSI', async () => {
    const plain = await render('nonexistent', '', '<b>&</b>')
    expect(plain.html).toContain('&#x3C;b>&#x26;&#x3C;/b>')
    const ansi = await render('ansi', '', '\u001b[31mred\u001b[0m')
    expect(ansi.html).toContain('red')
    expect(ansi.html).not.toContain('\u001b')
  })

  it('caches through the service', async () => {
    const m = model('ts', '', 'let x: number = 1')
    const a = await highlight({ model: m, theme: 'github-dark' })
    const b = await highlight({ model: m, theme: 'github-dark' })
    expect(a).toBe(b)
  })

  it('falls back to a known theme', async () => {
    const m = model('ts', '', 'x')
    const r = await highlight({ model: m, theme: 'does-not-exist' })
    expect(r.html).toContain('acb-pre')
    expect(r.vars['--acb-bg']).toBeDefined()
  })
})
