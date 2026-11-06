import type { Element, Root } from 'hast'
import { describe, expect, it } from 'vite-plus/test'
import type { BlockModel, GroupData } from '../src/model'
import { setSettings } from '../src/config'
import { createRehypePlugin } from '../src/rehype/plugin'

/** Builds the hast Inkdrop's mdast `code` handler produces (Inkdrop 6.3). */
function codeblock(lang: string | null, meta: string | null, value: string, line = 1): Element {
  const codeProps: Record<string, any> = {}
  if (lang) codeProps.className = [`language-${lang}`]
  if (meta) codeProps.meta = meta
  const preProps: Record<string, any> = { lang: lang ?? undefined }
  if (meta) preProps.meta = meta
  return {
    type: 'element',
    tagName: 'div',
    properties: {
      className: ['codeblock', ...(lang ? [`lang-${lang}`] : [])],
      'line-start': line,
      'line-end': line + 2
    },
    children: [
      {
        type: 'element',
        tagName: 'pre',
        properties: preProps,
        children: [
          { type: 'element', tagName: 'code', properties: codeProps, children: [{ type: 'text', value: value + '\n' }] }
        ]
      }
    ]
  }
}

const nl = { type: 'text' as const, value: '\n' }

async function run(tree: Root, foreign: string[] = []) {
  const plugin = createRehypePlugin({ isForeignLanguage: l => foreign.includes(l) })
  await plugin()(tree)
  return tree
}

const modelOf = (node: any): BlockModel => JSON.parse(node.properties.dataAcb)

describe('rehype plugin', () => {
  it('replaces code blocks and keeps scroll-sync attributes', async () => {
    const tree = await run({ type: 'root', children: [codeblock('js', 'title="a.js" {1}', 'const a = 1', 5)] })
    const node = tree.children[0] as Element
    expect(node.tagName).toBe('acb-block')
    expect(node.properties['line-start']).toBe(5)
    expect(node.properties['line-end']).toBe(7)
    const model = modelOf(node)
    expect(model.title).toBe('a.js')
    expect(model.code).toBe('const a = 1')
    expect(model.hlLang).toBe('javascript')
  })

  it('leaves languages owned by other plugins untouched', async () => {
    const mermaid = codeblock('mermaid', null, 'graph TD; A-->B')
    const math = codeblock('math', null, 'x^2')
    const tree = await run({ type: 'root', children: [mermaid, nl, math] }, ['mermaid', 'math'])
    expect(tree.children[0]).toBe(mermaid)
    expect(tree.children[2]).toBe(math)
  })

  it('leaves ignored languages untouched, aliases included', async () => {
    setSettings({ ignoredLanguages: 'javascript, ts, bogus' })
    try {
      const js = codeblock('js', null, 'a')
      const tsx = codeblock('typescript', null, 'b')
      const py = codeblock('py', null, 'c')
      const unknown = codeblock('nosuchlang', null, 'd')
      const tree = await run({ type: 'root', children: [js, nl, tsx, nl, py, nl, unknown] })
      expect(tree.children[0]).toBe(js)
      expect(tree.children[2]).toBe(tsx)
      expect((tree.children[4] as Element).tagName).toBe('acb-block')
      expect((tree.children[6] as Element).tagName).toBe('acb-block')
    } finally {
      setSettings({ ignoredLanguages: '' })
    }
  })

  it('handles indented (lang-less) code and nested blocks', async () => {
    const quote: Element = {
      type: 'element',
      tagName: 'blockquote',
      properties: {},
      children: [codeblock(null, null, 'plain')]
    }
    const tree = await run({ type: 'root', children: [quote] })
    const inner = (tree.children[0] as Element).children[0] as Element
    expect(inner.tagName).toBe('acb-block')
    expect(modelOf(inner).hlLang).toBe('text')
  })

  it('groups consecutive tabbed blocks', async () => {
    const tree = await run({
      type: 'root',
      children: [
        codeblock('sh', 'tab=npm group=pm', 'npm i', 1),
        nl,
        codeblock('sh', 'tab=pnpm group=pm', 'pnpm i', 5),
        nl,
        codeblock('sh', 'tab=other group=x', 'x', 9),
        nl,
        codeblock('js', '', 'y', 13)
      ]
    })
    const tags = tree.children.filter((c): c is Element => c.type === 'element').map(c => c.tagName)
    // The lone `tab=other` block is a one-tab group, the plain block stays a block.
    expect(tags).toEqual(['acb-group', 'acb-group', 'acb-block'])
    const group = tree.children[0] as Element
    const data: GroupData = JSON.parse(group.properties.dataAcb as string)
    expect(data.key).toBe('pm')
    expect(data.models.map(m => m.tab)).toEqual(['npm', 'pnpm'])
    expect(group.properties['line-start']).toBe(1)
    expect(group.properties['line-end']).toBe(7)
  })

  it('does not group across other content', async () => {
    const p: Element = { type: 'element', tagName: 'p', properties: {}, children: [{ type: 'text', value: 'hi' }] }
    const tree = await run({
      type: 'root',
      children: [codeblock('sh', 'tab=a', 'a'), p, codeblock('sh', 'tab=b', 'b')]
    })
    const tags = tree.children.filter((c): c is Element => c.type === 'element').map(c => c.tagName)
    expect(tags).toEqual(['acb-group', 'p', 'acb-group'])
    const first: GroupData = JSON.parse((tree.children[0] as Element).properties.dataAcb as string)
    expect(first.models.map(m => m.tab)).toEqual(['a'])
  })

  it('ignores non-codeblock pre (raw HTML)', async () => {
    const pre: Element = { type: 'element', tagName: 'pre', properties: {}, children: [{ type: 'text', value: 'raw' }] }
    const tree = await run({ type: 'root', children: [pre] })
    expect(tree.children[0]).toBe(pre)
  })
})
