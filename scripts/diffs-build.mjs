#!/usr/bin/env node
import { dirname, join } from 'node:path'

const ENGINE_SHIM = '\0acb-forgiving-js-engine'
const DIFFS_FILE = /[\\/]@pierre[\\/]diffs[\\/]/

function forgivingJsEngine() {
  return {
    name: 'acb-forgiving-js-engine',
    enforce: 'pre',
    resolveId(source, importer) {
      if (source === 'shiki/engine/javascript' && importer && DIFFS_FILE.test(importer)) return ENGINE_SHIM
      return null
    },
    load(id) {
      if (id !== ENGINE_SHIM) return null
      return [
        "import { createJavaScriptRegexEngine as create } from '@shikijs/engine-javascript'",
        "export * from '@shikijs/engine-javascript'",
        'export function createJavaScriptRegexEngine(options) {',
        '  return create({ forgiving: true, ...options })',
        '}'
      ].join('\n')
    }
  }
}

export const DIFFS_HIGHLIGHTER = 'acb-diffs-highlighter'

function diffsHighlighterEntry() {
  return {
    name: 'acb-diffs-highlighter',
    enforce: 'pre',
    async resolveId(source, importer) {
      if (source !== DIFFS_HIGHLIGHTER) return null
      const entry = await this.resolve('@pierre/diffs', importer, { skipSelf: true })
      if (!entry) throw new Error('[acb-diffs-highlighter] cannot resolve @pierre/diffs')
      return join(dirname(entry.id), 'highlighter', 'shared_highlighter.js')
    }
  }
}

export function diffsBuild() {
  return [forgivingJsEngine(), diffsHighlighterEntry()]
}
