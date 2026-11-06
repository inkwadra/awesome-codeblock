import { getEnv } from './env'

/** Writes to the system clipboard through Inkdrop, falling back to the web API. */
export async function writeClipboard(text: string): Promise<void> {
  const clipboard = getEnv()?.clipboard
  if (clipboard?.writeText) {
    clipboard.writeText(text)
    return
  }
  await navigator.clipboard.writeText(text)
}

/** Opens a URL in the user's browser. */
export function openExternal(url: string): void {
  void getEnv()?.appDelegate?.openExternal(url)
}

/** Whether Inkdrop's UI is in dark mode (falls back to the OS preference). */
export function isDarkUi(): boolean {
  if (typeof document === 'undefined') return false
  const body = document.body
  if (body?.classList.contains('dark-mode')) return true
  if (body?.classList.contains('light-mode')) return false
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-color-scheme: dark)').matches
}
