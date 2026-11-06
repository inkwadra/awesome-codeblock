import * as autocomplete from '@codemirror/autocomplete'
import { CompletionContext, type CompletionResult, type CompletionSource } from '@codemirror/autocomplete'
import { markdown } from '@codemirror/lang-markdown'
import * as language from '@codemirror/language'
import { ensureSyntaxTree } from '@codemirror/language'
import * as state from '@codemirror/state'
import { EditorState } from '@codemirror/state'
import { describe, expect, it } from 'vite-plus/test'
import { createCompletionExtension } from '../src/editor/completion'
import { analyzeFenceLine, matchNotation } from '../src/editor/fence-context'

describe('analyzeFenceLine', () => {
  const at = (line: string) => analyzeFenceLine(line.replace('|', ''), line.indexOf('|'))

  it('detects the language slot', () => {
    expect(at('```ty|')).toMatchObject({ kind: 'lang', fenceStart: 0, fence: '```', from: 3, to: 5, atLineStart: true })
    expect(at('```|')).toMatchObject({ kind: 'lang', from: 3, to: 3 })
    expect(at('```ty|pescript title="x"')).toMatchObject({ kind: 'lang', from: 3, to: 13 })
    expect(at('  - ~~~p|')).toMatchObject({ kind: 'lang', fenceStart: 4, fence: '~~~', atLineStart: false })
    expect(at('> ```j|')).toMatchObject({ kind: 'lang', fenceStart: 2, atLineStart: false })
  })

  it('detects meta keys and present keys', () => {
    const c = at('```js title="a" wr|')
    expect(c).toMatchObject({ kind: 'key', lang: 'js', from: 16 })
    expect(c?.kind === 'key' && [...c.present]).toEqual(['title'])
    expect(at('```js |')).toMatchObject({ kind: 'key', from: 6 })
    expect(at('```js{1} |')).toMatchObject({ kind: 'key', lang: 'js' })
  })

  it('detects values', () => {
    expect(at('```js frame="no|')).toMatchObject({ kind: 'value', key: 'frame', quote: '"', from: 13 })
    expect(at('```js collapseStyle=gi|')).toMatchObject({ kind: 'value', key: 'collapseStyle', quote: null, from: 20 })
    expect(at('```diff lang=|')).toMatchObject({ kind: 'value', key: 'lang', lang: 'diff' })
  })

  it('stays quiet where nothing applies', () => {
    expect(at('``|')).toBeNull()
    expect(at('text ```js |')).toBeNull()
    expect(at('```js {1, 2|')).toBeNull() // inside braces
    expect(at('```js "some te|')).toBeNull() // inside an inline marker
    expect(at('```js title="done" |')).toMatchObject({ kind: 'key' })
    expect(at('```js title="done"|')).toBeNull()
    expect(at('```js /re|')).toBeNull()
  })

  it('matches notation comments', () => {
    expect(matchNotation('foo() // [!code ')).toEqual({ from: 16, prefix: '' })
    expect(matchNotation('foo() // [!code wo')).toEqual({ from: 16, prefix: 'wo' })
    expect(matchNotation('foo() // [!cod')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// The CodeMirror source, run against a real markdown syntax tree
// ---------------------------------------------------------------------------

/** A stand-in for Inkdrop's own fence-language source. */
const inkdropLike: CompletionSource = ctx => {
  const m = ctx.matchBefore(/^```.*/)
  return m
    ? { from: m.from, options: [{ label: '```typescript' }, { label: '```TypeScript' }, { label: '```ts' }] }
    : null
}

function setup(doc: string, extra: state.Extension[] = []) {
  const cursor = doc.indexOf('|')
  const text = doc.replace('|', '')
  const ext = createCompletionExtension(
    { state, language, autocomplete },
    { pluginLanguages: () => ['mermaid'], userAliases: () => ({ myconf: 'ini' }) }
  )
  const st = EditorState.create({ doc: text, selection: { anchor: cursor }, extensions: [markdown(), ext, ...extra] })
  ensureSyntaxTree(st, st.doc.length, 5000)
  return { st, cursor }
}

async function complete(doc: string, extra: state.Extension[] = []): Promise<CompletionResult | null> {
  const { st, cursor } = setup(doc, extra)
  const sources = st.languageDataAt<CompletionSource>('autocomplete', cursor).filter(s => s !== inkdropLike)
  // Ours is the last source registered by the extension.
  const ours = sources[sources.length - 1]!
  return ours(new CompletionContext(st, cursor, true))
}

const labels = (r: CompletionResult | null) => r?.options.map(o => o.label) ?? []

describe('completion source', () => {
  it('offers Shiki languages and plugin languages', async () => {
    const r = await complete('```ty|\n```')
    expect(r?.from).toBe(0)
    expect(labels(r)).toContain('```typescript')
    expect(labels(r)).toContain('```ansi')
    expect(labels(r)).toContain('```mermaid')
  })

  it('offers the extra aliases and user aliases', async () => {
    expect(labels(await complete('```go|\n```'))).toContain('```golang')
    const r = await complete('```my|\n```')
    const mine = r?.options.find(o => o.label === '```myconf')
    expect(mine?.detail).toContain('your alias')
  })

  it('skips languages Inkdrop already offers at column 0', async () => {
    const extra = [EditorState.languageData.of(() => [{ autocomplete: inkdropLike }])]
    const r = await complete('```ty|\n```', extra)
    expect(labels(r)).not.toContain('```typescript')
    expect(labels(r)).not.toContain('```ts')
    expect(labels(r)).toContain('```tsx')
    // Inside a list item Inkdrop's source doesn't fire, so everything is offered.
    const nested = await complete('- item\n\n  ```ty|\n  ```', extra)
    expect(labels(nested)).toContain('```typescript')
  })

  it('offers meta keys without the ones already present', async () => {
    const r = await complete('```js title="a" |\nx\n```')
    expect(labels(r)).toContain('showLineNumbers')
    expect(labels(r)).toContain('ins')
    expect(labels(r)).not.toContain('title')
    expect(labels(r)).not.toContain('lang') // only for diffs
    expect(labels(await complete('```diff |\n```'))).toContain('lang')
  })

  it('treats synonyms as present and skips useDiffSyntax for diffs', async () => {
    const r = await complete('```js ln filename="a.js" |\nx\n```')
    expect(labels(r)).not.toContain('showLineNumbers')
    expect(labels(r)).not.toContain('title')
    expect(labels(r)).toContain('useDiffSyntax')
    expect(labels(await complete('```diff |\n```'))).not.toContain('useDiffSyntax')
  })

  it('offers values', async () => {
    expect(labels(await complete('```sh frame="|"\n```'))).toEqual(['code', 'none'])
    expect(labels(await complete('```js wrap=|\n```'))).toEqual(['true', 'false'])
    expect(labels(await complete('```sh group=pm tab=a\nx\n```\n```sh group=|\n```'))).toEqual(['pm'])
    expect(labels(await complete('```diff lang="|"\n```'))).toContain('typescript')
  })

  it('ignores closing fences and plain text', async () => {
    expect(await complete('```js\nx\n```|')).toBeNull()
    expect(await complete('hello |')).toBeNull()
  })

  it('offers notation comments inside code only', async () => {
    const r = await complete('```js\nfoo() // [!code |\n```')
    expect(labels(r)).toEqual(['++', '--', 'highlight', 'focus', 'error', 'warning', 'info', 'word'])
    expect(await complete('text // [!code |')).toBeNull()
  })
})
