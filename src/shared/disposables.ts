import { log } from './log'

export type Disposer = () => void

/**
 * Collects disposers and runs them in reverse order of registration, so
 * resources are torn down after the ones that depend on them. A failing
 * disposer is logged and does not stop the others.
 */
export class DisposableBag {
  private disposers: Disposer[] = []

  add(...disposers: Disposer[]): void {
    this.disposers.push(...disposers)
  }

  dispose(): void {
    for (const dispose of this.disposers.splice(0).reverse()) {
      try {
        dispose()
      } catch (err) {
        log.warn('dispose failed:', err)
      }
    }
  }
}
