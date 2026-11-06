import type { Extension } from '@codemirror/state'
import type { Environment } from '@inkdropapp/types'
import { getSettings, parseAliases } from '../config'
import { pluginLanguages } from '../inkdrop/code-components'
import { log } from '../shared/log'
import { createCompletionExtension, type CodeMirrorModules } from './completion'

type EditorCommands = {
  'editor:add-extension': { extension: Extension }
  'editor:remove-extension': { extension: Extension }
}

/** Inkdrop's own CodeMirror module instances: extensions must use the same ones. */
function codeMirrorModules(env: Environment): CodeMirrorModules | undefined {
  try {
    const cm = env.getExports()['@codemirror'] as Partial<CodeMirrorModules> | undefined
    return cm?.autocomplete && cm.state && cm.language ? (cm as CodeMirrorModules) : undefined
  } catch {
    return undefined
  }
}

/**
 * Adds the code fence completion source to Inkdrop's editor through the
 * (undocumented) `editor:add-extension` / `editor:remove-extension` commands,
 * which keep the extension across note switches. Returns a disposer.
 */
export function installEditorCompletion(env: Environment): () => void {
  const cm = codeMirrorModules(env)
  if (!cm) {
    log.warn('CodeMirror modules not available; editor completion disabled')
    return () => {}
  }
  const extension = createCompletionExtension(cm, {
    pluginLanguages: () => pluginLanguages(env.markdownRenderer),
    userAliases: () => parseAliases(getSettings().languageAliases)
  })
  env.commands.dispatch<EditorCommands>(document.body, 'editor:add-extension', { extension })
  return () => env.commands.dispatch<EditorCommands>(document.body, 'editor:remove-extension', { extension })
}
