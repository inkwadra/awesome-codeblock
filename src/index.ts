import type { Environment, IInkdropPlugin } from '@inkdropapp/types'
import { AcbBlock, AcbGroup } from './components/CodeBlock'
import {
  bindSettings,
  configSchema,
  getSettings,
  parseAliases,
  modelSettingsChanged,
  subscribeSettings
} from './config'
import { installEditorCompletion } from './editor/install'
import { setUserAliases } from './highlight/languages'
import { clearHighlightCache } from './highlight/service'
import { preloadFileIcons } from './icons'
import { setEnv } from './inkdrop/env'
import { isForeignLanguage } from './inkdrop/code-components'
import { extendRenderer, refreshPreview } from './inkdrop/renderer'
import { BLOCK_TAG, createRehypePlugin, GROUP_TAG } from './rehype/plugin'
import { DisposableBag, type Disposer } from './shared/disposables'
import { bindTheme } from './theme'

function applyLanguageAliases(): void {
  setUserAliases(parseAliases(getSettings().languageAliases))
}

/**
 * Most settings are baked into the block models in the rehype stage, so the
 * preview is rebuilt when one of them changes. The theme and the header
 * settings are read by the components, which update without re-rendering the
 * note. The highlight cache is keyed by the model, so it stays valid.
 */
function bindPreviewRefresh(env: Environment): Disposer {
  let previous = getSettings()
  return subscribeSettings(() => {
    const next = getSettings()
    const changed = modelSettingsChanged(previous, next)
    previous = next
    if (!changed) return
    applyLanguageAliases()
    refreshPreview(env)
  })
}

/** Adds or removes the editor completion extension following its setting. */
function bindEditorCompletion(env: Environment): Disposer {
  let remove: Disposer | null = null
  const sync = () => {
    const enabled = getSettings().editorCompletion
    if (enabled && !remove) remove = installEditorCompletion(env)
    else if (!enabled && remove) {
      remove()
      remove = null
    }
  }
  sync()
  const unsubscribe = subscribeSettings(sync)
  return () => {
    unsubscribe()
    remove?.()
    remove = null
  }
}

class AwesomeCodeblockPlugin implements IInkdropPlugin {
  config = configSchema

  private bag = new DisposableBag()
  /** Bumped on every (de)activation, to detect a deactivation during `activate`'s await. */
  private generation = 0

  async activate(env: Environment) {
    const generation = ++this.generation
    setEnv(env)
    void preloadFileIcons()

    this.bag.add(bindSettings(env))
    applyLanguageAliases()
    this.bag.add(bindPreviewRefresh(env), bindTheme(env), bindEditorCompletion(env))

    const restoreRenderer = await extendRenderer(env, {
      rehypePlugin: renderer => createRehypePlugin({ isForeignLanguage: lang => isForeignLanguage(renderer, lang) }),
      components: { [BLOCK_TAG]: AcbBlock, [GROUP_TAG]: AcbGroup }
    })
    // Deactivated while waiting for the renderer.
    if (generation !== this.generation) restoreRenderer()
    else this.bag.add(restoreRenderer)
  }

  deactivate() {
    this.generation++
    this.bag.dispose()
    clearHighlightCache()
    setEnv(undefined)
  }
}

export default new AwesomeCodeblockPlugin()
