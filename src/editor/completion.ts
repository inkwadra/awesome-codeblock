import type * as Autocomplete from '@codemirror/autocomplete'
import type { Completion, CompletionContext, CompletionResult, CompletionSource } from '@codemirror/autocomplete'
import type * as Language from '@codemirror/language'
import type * as State from '@codemirror/state'
import type { EditorState, Extension, Line } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'
import { languageDisplayName, resolveLanguage } from '../highlight/languages'
import { BOOLEAN_KEYS, KEYS, LANGUAGES, NOTATIONS, VALUES, type ValueSpec } from './catalog'
import { analyzeFenceLine, matchNotation, type FenceContext } from './fence-context'

/**
 * Editor completions for code fences:
 *
 * - the language after ``` (Shiki's languages, plus languages owned by other
 *   plugins such as mermaid / math),
 * - meta options after the language (`title=""`, `{}`, `ins={}`, `frame=`, …)
 *   and their values,
 * - Shiki notation comments inside the code (`[!code ++]`, …).
 *
 * The CodeMirror modules are Inkdrop's own instances (from
 * `inkdrop.getExports()['@codemirror']`): extensions only work with the same
 * module instances the editor was built with.
 *
 * Inkdrop already completes fence languages from its CodeMirror language list
 * when the fence starts at column 0. To avoid duplicate entries, the labels it
 * offers are detected at runtime and only the missing ones are added; where
 * Inkdrop's source doesn't fire (fences in lists, quotes, `~~~`), the full
 * list is offered.
 */

export interface CodeMirrorModules {
  state: typeof State
  language: typeof Language
  autocomplete: typeof Autocomplete
}

export interface CompletionDeps {
  /** Languages rendered by other plugins (`remarkCodeComponents` keys). */
  pluginLanguages(): string[]
  /** `alias → language` pairs from the Language aliases setting. */
  userAliases?(): Readonly<Record<string, string>>
}

export function createCompletionExtension(cm: CodeMirrorModules, deps: CompletionDeps): Extension {
  const { snippetCompletion, startCompletion, CompletionContext: Ctx } = cm.autocomplete
  const { syntaxTree } = cm.language

  // --- Inkdrop's own fence-language labels (for de-duplication) -----------
  /** How long the detected labels are reused before asking Inkdrop's source again. */
  const LABELS_TTL_MS = 60_000
  let inkdropLabels: { set: Set<string>; at: number } | null = null
  const detectInkdropLabels = async (state: EditorState, pos: number): Promise<Set<string>> => {
    if (inkdropLabels && Date.now() - inkdropLabels.at < LABELS_TTL_MS) return inkdropLabels.set
    const set = new Set<string>()
    const sources = state.languageDataAt<CompletionSource | readonly (string | Completion)[]>('autocomplete', pos)
    for (const src of sources) {
      if (typeof src !== 'function' || src === source) continue
      try {
        const res = await src(new Ctx(state, pos, true))
        for (const o of res?.options ?? []) if (o.label.startsWith('```')) set.add(o.label.slice(3).toLowerCase())
      } catch {
        // a foreign source failing is not our problem
      }
    }
    inkdropLabels = { set, at: Date.now() }
    return set
  }

  // --- Syntax checks ------------------------------------------------------
  /** Is `line` the opening line of a fenced code block? */
  const isOpeningFence = (state: EditorState, line: Line, fenceStart: number): boolean => {
    const tree = syntaxTree(state)
    let node: ReturnType<typeof tree.resolve> | null = tree.resolve(line.from + fenceStart + 1, 1)
    for (; node; node = node.parent) {
      if (node.name === 'FencedCode') return state.doc.lineAt(node.from).number === line.number
    }
    // No tree info (yet): trust the regex.
    return true
  }

  const isInCodeBody = (state: EditorState, pos: number): boolean => {
    const tree = syntaxTree(state)
    for (let node: ReturnType<typeof tree.resolve> | null = tree.resolve(pos, -1); node; node = node.parent) {
      if (node.name === 'CodeText') return true
      if (node.name === 'FencedCode') return state.doc.lineAt(node.from).number !== state.doc.lineAt(pos).number
      if (node.name === 'CodeInfo' || node.name === 'CodeMark') return false
    }
    return false
  }

  // --- Option builders ----------------------------------------------------
  const reopenAfter = (completion: Completion): Completion => {
    const apply = completion.apply
    if (typeof apply !== 'function') return completion
    return {
      ...completion,
      apply(view: EditorView, c: Completion, from: number, to: number) {
        apply(view, c, from, to)
        setTimeout(() => startCompletion(view), 0)
      }
    }
  }

  const languageOptions = async (state: EditorState, pos: number, fc: Extract<FenceContext, { kind: 'lang' }>) => {
    const exclude = fc.atLineStart ? await detectInkdropLabels(state, pos) : new Set<string>()
    const seen = new Set<string>()
    const options: Completion[] = []
    const add = (id: string, detail: string, boost: number) => {
      const key = id.toLowerCase()
      if (seen.has(key) || exclude.has(key)) return
      seen.add(key)
      options.push({ label: fc.fence + id, apply: fc.fence + id, detail, type: 'class', boost })
    }
    for (const lang of deps.pluginLanguages()) add(lang, 'plugin', 2)
    for (const [alias, target] of Object.entries(deps.userAliases?.() ?? {})) {
      add(alias, `${languageDisplayName(resolveLanguage(alias), target)} (your alias)`, 1)
    }
    for (const l of LANGUAGES) add(l.id, l.alias ? `${l.name} (alias)` : l.name, l.alias ? -1 : 0)
    return options
  }

  const keyOptions = (fc: Extract<FenceContext, { kind: 'key' }>): Completion[] =>
    KEYS.filter(k => {
      if (k.langs && !k.langs.includes(fc.lang)) return false
      if (k.notLangs?.includes(fc.lang)) return false
      const key = k.key ?? k.label
      return k.repeatable || !key || ![key, ...(k.aliases ?? [])].some(name => fc.present.has(name))
    }).map(k => {
      const base: Completion = { label: k.label, detail: k.detail, info: k.info, type: 'property', boost: k.boost ?? 0 }
      const completion = snippetCompletion(k.template ?? k.label, base)
      return k.reopen ? reopenAfter(completion) : completion
    })

  const valueOptions = (state: EditorState, fc: Extract<FenceContext, { kind: 'value' }>): Completion[] => {
    let values: readonly ValueSpec[] = []
    if (Object.hasOwn(VALUES, fc.key)) values = VALUES[fc.key]!
    else if (BOOLEAN_KEYS.has(fc.key)) values = [{ label: 'true' }, { label: 'false' }]
    else if (fc.key === 'lang') values = LANGUAGES.filter(l => !l.alias).map(l => ({ label: l.id, detail: l.name }))
    else if (fc.key === 'group') {
      const found = new Set<string>()
      for (const m of state.doc.toString().matchAll(/\sgroup=["']?([\w.-]+)/g)) found.add(m[1]!)
      values = [...found].map(label => ({ label, detail: 'used in this note' }))
    }
    return values.map(v => ({
      label: v.label,
      detail: v.detail,
      info: v.info,
      type: 'enum',
      apply(view: EditorView, _c: Completion, from: number, to: number) {
        let insert = v.label
        let cursor = from + insert.length
        const next = view.state.sliceDoc(to, to + 1)
        if (fc.quote) {
          if (next === fc.quote) cursor += 1
          else {
            insert += fc.quote
            cursor += 1
          }
        }
        view.dispatch({ changes: { from, to, insert }, selection: { anchor: cursor }, userEvent: 'input.complete' })
      }
    }))
  }

  // --- The source ---------------------------------------------------------
  const source: CompletionSource = async (ctx: CompletionContext): Promise<CompletionResult | null> => {
    const { state, pos } = ctx
    const line = state.doc.lineAt(pos)
    const col = pos - line.from
    const fc = analyzeFenceLine(line.text, col)

    if (fc) {
      if (!isOpeningFence(state, line, fc.fenceStart)) return null
      if (fc.kind === 'lang') {
        const options = await languageOptions(state, pos, fc)
        if (ctx.aborted || options.length === 0) return null
        return { from: line.from + fc.fenceStart, to: line.from + fc.to, options, validFor: /^(`{3,}|~{3,})[\w+#.-]*$/ }
      }
      if (fc.kind === 'key') {
        return { from: line.from + fc.from, options: keyOptions(fc), validFor: /^[\w-]*$/ }
      }
      const options = valueOptions(state, fc)
      if (options.length === 0) return null
      return { from: line.from + fc.from, options, validFor: /^[\w.+#-]*$/ }
    }

    if (isInCodeBody(state, pos)) {
      const n = matchNotation(line.text.slice(0, col))
      if (n) {
        // Don't add a closing bracket if one is already there.
        const closed = line.text.slice(col).startsWith(']')
        return {
          from: line.from + n.from,
          options: NOTATIONS.map(o =>
            snippetCompletion(closed ? o.template.replace(/\]$/, '') : o.template, {
              label: o.label,
              info: o.info,
              detail: '[!code]',
              type: 'keyword'
            })
          ),
          validFor: /^[\w:+-]*$/
        }
      }
    }
    return null
  }

  return cm.state.EditorState.languageData.of(() => [{ autocomplete: source }])
}
