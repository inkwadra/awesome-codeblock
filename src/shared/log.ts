/** Console logging with the plugin's prefix, so messages are easy to filter. */
const PREFIX = '[awesome-codeblock]'

export const log = {
  warn: (message: string, ...details: unknown[]): void => console.warn(`${PREFIX} ${message}`, ...details),
  error: (message: string, ...details: unknown[]): void => console.error(`${PREFIX} ${message}`, ...details)
}
