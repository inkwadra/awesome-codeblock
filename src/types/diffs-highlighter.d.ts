/**
 * diffs' shared-highlighter module, imported on its own so code blocks don't
 * load the diff view (see `scripts/diffs-build.mjs`).
 */
declare module 'acb-diffs-highlighter' {
  export { disposeHighlighter, getSharedHighlighter } from '@pierre/diffs'
}
