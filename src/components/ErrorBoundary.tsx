import React from 'react'
import { log } from '../shared/log'

interface Props {
  /** Shown instead of the children after they threw. */
  fallback: React.ReactNode
  /** A new value clears the error and renders the children again (e.g. the note was edited). */
  resetKey: unknown
}

interface State {
  error: boolean
  resetKey: unknown
}

/** Keeps a broken block from taking down the whole preview. */
export class ErrorBoundary extends React.Component<React.PropsWithChildren<Props>, State> {
  state: State = { error: false, resetKey: this.props.resetKey }

  static getDerivedStateFromError(): Partial<State> {
    return { error: true }
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    return Object.is(props.resetKey, state.resetKey) ? null : { error: false, resetKey: props.resetKey }
  }

  componentDidCatch(error: unknown) {
    log.error('render error:', error)
  }

  render() {
    return this.state.error ? this.props.fallback : this.props.children
  }
}

/** Unstyled code, the last resort when a frame fails to render. */
export const PlainCode: React.FC<{ code: string }> = ({ code }) => (
  <pre className="acb-fallback">
    <code>{code}</code>
  </pre>
)

/**
 * A frame guarded by an error boundary that falls back to the plain code
 * (`fallback` replaces it). The error is cleared when `resetKey` changes.
 */
export const Guarded: React.FC<
  React.PropsWithChildren<{ code: string; resetKey: unknown; fallback?: React.ReactNode }>
> = ({ code, resetKey, fallback, children }) => (
  <ErrorBoundary resetKey={resetKey} fallback={fallback ?? <PlainCode code={code} />}>
    {children}
  </ErrorBoundary>
)
