import React, { useEffect, useSyncExternalStore } from 'react'
import { lazy } from '../shared/lazy'
import { log } from '../shared/log'
import { createStore } from '../shared/store'
import { resolveFileIcon, type FileIcons } from './resolve'
import { UI_ICON_SVG, type SvgData } from './ui-icons.generated'

/**
 * Icons from the Pierre sets. UI icons (@pierre/icons) ship in the main
 * bundle; the language / file-type set (@pierre/vscode-icons) is a separate
 * chunk preloaded on activation.
 */

export { resolveFileIcon }

const fileIconsStore = createStore<FileIcons | null>(null)
const fileIcons = lazy(() => import('./file-icons.generated'))

export function preloadFileIcons(): Promise<void> {
  return fileIcons.load().then(fileIconsStore.set, (err: unknown) => log.warn('failed to load file icons:', err))
}

function useFileIcons(): FileIcons | null {
  const icons = useSyncExternalStore(fileIconsStore.subscribe, fileIconsStore.get, fileIconsStore.get)
  useEffect(() => {
    if (!icons) void preloadFileIcons()
  }, [icons])
  return icons
}

interface SvgProps {
  data: SvgData
  size: number
  className?: string
  style?: React.CSSProperties
}

const Svg: React.FC<SvgProps> = ({ data, size, className, style }) => (
  <svg
    className={className}
    style={style}
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox={data[0]}
    aria-hidden="true"
    focusable="false"
    dangerouslySetInnerHTML={{ __html: data[1] }}
  />
)

export type UiIconName = keyof typeof UI_ICON_SVG

export const UiIcon: React.FC<{ name: UiIconName; size?: number }> = ({ name, size = 16 }) => (
  <Svg data={UI_ICON_SVG[name]} size={size} className={`acb-icon acb-icon-${name}`} />
)

interface FileTypeIconProps {
  /** Fence language. */
  lang?: string
  /** Shiki language the fence language resolves to. */
  hlLang?: string
  title?: string
  dark: boolean
  size?: number
}

/**
 * Language / file-type icon. Colored icons use the Pierre palette (400 on dark
 * themes, 600 on light ones); monochrome ones follow the frame's text color.
 * Renders an empty box until the set is loaded.
 */
export const FileTypeIcon: React.FC<FileTypeIconProps> = ({ lang, hlLang, title, dark, size = 16 }) => {
  const icons = useFileIcons()
  if (!icons) return <span className="acb-file-icon acb-file-icon-pending" style={{ width: size, height: size }} />
  const name = resolveFileIcon(icons, { lang, hlLang, title })
  const data = icons.FILE_ICON_SVG[name] ?? icons.FILE_ICON_SVG[icons.DEFAULT_ICON]
  if (!data) return null
  const [viewBox, body, colors, opacity] = data
  const shade = dark ? 0 : 1
  const style = {
    ...(colors && { color: colors[shade] }),
    ...(colors && colors[2] && { '--acb-icon-bg': colors[2 + shade] }),
    ...(opacity && { opacity })
  } as React.CSSProperties
  return (
    <Svg
      data={[viewBox, body]}
      size={size}
      style={style}
      className={`acb-file-icon acb-file-icon-${name}${colors ? '' : ' is-mono'}`}
    />
  )
}
