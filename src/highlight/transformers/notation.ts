import {
  transformerNotationDiff,
  transformerNotationErrorLevel,
  transformerNotationFocus,
  transformerNotationHighlight,
  transformerNotationWordHighlight,
  transformerRenderIndentGuides
} from '@shikijs/transformers'
import type { ShikiTransformer } from 'shiki/core'

const matchAlgorithm = 'v3'

/**
 * Shiki notation comments (`// [!code ++]`, `[!code focus]`, …) mapped to the
 * plugin's classes. The transformers keep no state between renders (it lives
 * on the hast nodes), so one list serves every block.
 */
export const NOTATION_TRANSFORMERS: readonly ShikiTransformer[] = [
  transformerNotationDiff({
    matchAlgorithm,
    classLineAdd: 'acb-ins',
    classLineRemove: 'acb-del',
    classActivePre: 'acb-has-diff'
  }),
  transformerNotationHighlight({ matchAlgorithm, classActiveLine: 'acb-mark', classActivePre: 'acb-has-highlight' }),
  transformerNotationFocus({ matchAlgorithm, classActiveLine: 'acb-focused', classActivePre: 'acb-has-focused' }),
  transformerNotationErrorLevel({
    matchAlgorithm,
    classMap: {
      error: ['acb-mark', 'acb-error'],
      warning: ['acb-mark', 'acb-warning'],
      info: ['acb-mark', 'acb-info']
    },
    classActivePre: 'acb-has-highlight'
  }),
  transformerNotationWordHighlight({ matchAlgorithm, classActiveWord: 'acb-word', classActivePre: 'acb-has-word' })
]

const indentGuides = new Map<number, ShikiTransformer>()

/** Indent guide transformer for an indentation step in columns (one instance per step). */
export function indentGuidesTransformer(step: number): ShikiTransformer {
  let transformer = indentGuides.get(step)
  if (!transformer) {
    transformer = transformerRenderIndentGuides({ indent: step })
    indentGuides.set(step, transformer)
  }
  return transformer
}
