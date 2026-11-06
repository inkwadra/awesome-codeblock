import type { Environment } from '@inkdropapp/types'

/**
 * The `Environment` handed to `activate()`, so other modules can reach it
 * without the (discouraged) global `inkdrop` variable. `undefined` outside
 * Inkdrop (tests) and after deactivation: callers degrade gracefully.
 */
let current: Environment | undefined

export function setEnv(env: Environment | undefined): void {
  current = env
}

export function getEnv(): Environment | undefined {
  return current
}
