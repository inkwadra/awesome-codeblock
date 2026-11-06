import { describe, expect, it } from 'vite-plus/test'
import { configSchema, oneOf, COLLAPSE_STYLES, modelSettingsChanged, type Settings } from '../src/config'
import { detectIndentStep, mergeRanges } from '../src/highlight/transformers/structure'
import { isForeignLanguage, pluginLanguages } from '../src/inkdrop/code-components'
import { deserialize, serialize } from '../src/model'

const settings = Object.fromEntries(Object.entries(configSchema).map(([k, v]) => [k, v.default])) as unknown as Settings

describe('settings', () => {
  it('narrows enumerated values', () => {
    expect(oneOf(COLLAPSE_STYLES, 'collapsible-end')).toBe('collapsible-end')
    expect(oneOf(COLLAPSE_STYLES, 'sideways')).toBeUndefined()
    expect(oneOf(COLLAPSE_STYLES, undefined)).toBeUndefined()
  })

  it('rebuilds the preview only for settings baked into the block models', () => {
    expect(modelSettingsChanged(settings, { ...settings, editorCompletion: false })).toBe(false)
    expect(modelSettingsChanged(settings, { ...settings, darkTheme: 'nord', copyButton: false })).toBe(false)
    expect(modelSettingsChanged(settings, { ...settings, showLanguage: false })).toBe(false)
    expect(modelSettingsChanged(settings, { ...settings, wrap: !settings.wrap })).toBe(true)
    expect(modelSettingsChanged(settings, { ...settings, languageAliases: 'conf=ini' })).toBe(true)
  })

  it('lists only light themes for light mode and dark themes for dark mode', () => {
    expect(configSchema.lightTheme.enum).toContain('github-light')
    expect(configSchema.lightTheme.enum).not.toContain('github-dark')
    expect(configSchema.darkTheme.enum).toContain('github-dark')
    expect(configSchema.darkTheme.enum).not.toContain('github-light')
  })

  it('orders the settings without gaps or duplicates', () => {
    const orders = Object.values(configSchema).map(s => s.order)
    expect(orders).toEqual(orders.map((_, i) => i + 1))
  })
})

describe('serialize', () => {
  it('reuses the JSON a value was parsed from', () => {
    const json = '{"b":1,  "a":2}' // not what JSON.stringify would produce
    const value = deserialize<{ a: number; b: number }>(json)!
    expect(value).toEqual({ a: 2, b: 1 })
    expect(serialize(value)).toBe(json)
    const fresh = { a: 1 }
    expect(serialize(fresh)).toBe('{"a":1}')
    expect(serialize(fresh)).toBe(serialize(fresh))
  })

  it('rejects invalid input', () => {
    expect(deserialize('{')).toBeNull()
    expect(deserialize('3')).toBeNull()
    expect(deserialize(undefined)).toBeNull()
  })
})

describe('mergeRanges', () => {
  it('clamps, sorts and merges adjacent ranges', () => {
    expect(
      mergeRanges(
        [
          { from: 8, to: 20 },
          { from: 0, to: 2 },
          { from: 3, to: 4 },
          { from: 12, to: 9 }
        ],
        10
      )
    ).toEqual([
      { from: 1, to: 4 },
      { from: 8, to: 10 }
    ])
  })
})

describe('code components of other plugins', () => {
  const renderer = {
    remarkCodeComponents: {
      default: () => null,
      inlineDefault: () => null,
      mermaid: () => null,
      math: null,
      inlineMath: () => null
    }
  }

  it('detects languages rendered by other plugins', () => {
    expect(isForeignLanguage(renderer, 'mermaid')).toBe(true)
    expect(isForeignLanguage(renderer, 'math')).toBe(false) // unregistered (null)
    expect(isForeignLanguage(renderer, 'default')).toBe(false)
    expect(isForeignLanguage(renderer, 'toString')).toBe(false) // not an own key
    expect(isForeignLanguage(renderer, '')).toBe(false)
  })

  it('lists them for completion, without inline renderers', () => {
    expect(pluginLanguages(renderer)).toEqual(['mermaid'])
    expect(pluginLanguages(undefined)).toEqual([])
  })
})

describe('detectIndentStep', () => {
  it('finds the indentation step of the code', () => {
    expect(detectIndentStep('a {\n  b {\n    c\n  }\n}', 4)).toBe(2)
    expect(detectIndentStep('def f():\n    if x:\n        y', 2)).toBe(4)
    expect(detectIndentStep('func f() {\n\tif x {\n\t\ty\n\t}\n}', 4)).toBe(4)
  })

  it('ignores doc-comment steps, alignment and the first line', () => {
    expect(detectIndentStep('  /**\n   * doc\n   */\n  f(a,\n                b)\n  {\n    x\n  }', 4)).toBe(2)
    expect(detectIndentStep('        deep\n        line', 3)).toBe(3)
  })
})
