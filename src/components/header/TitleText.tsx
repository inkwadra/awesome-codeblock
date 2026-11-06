import React from 'react'
import { UiIcon } from '../../icons'
import { openExternal } from '../../inkdrop/platform'
import { linkComponent } from '../../inkdrop/renderer'
import type { BlockInfo, BlockModel } from '../../model'

type Range = NonNullable<BlockInfo['range']>

/** "10–14" or "10". */
export function formatRange(range: Range): string {
  return range.to !== undefined ? `${range.from}–${range.to}` : String(range.from)
}

/** A link opened in the browser, with a link icon after its content. */
export const ExternalLink: React.FC<React.PropsWithChildren<{ url: string; className: string }>> = ({
  url,
  className,
  children
}) => {
  const content = (
    <>
      {children}
      <UiIcon name="link" size={12} />
    </>
  )
  // Prefer Inkdrop's anchor component: it opens external URLs in the browser.
  const Anchor = linkComponent()
  if (Anchor) {
    return (
      <Anchor href={url} className={className}>
        {content}
      </Anchor>
    )
  }
  return (
    <a
      href={url}
      className={className}
      onClick={e => {
        e.preventDefault()
        openExternal(url)
      }}
    >
      {content}
    </a>
  )
}

/** The block's title, with its source range; a link when the block has `url=`. */
export const TitleText: React.FC<{ model: BlockModel; range?: Range }> = ({ model, range }) => {
  const text = (
    <>
      <span className="acb-title-text">{model.title}</span>
      {range && <span className="acb-range">:{formatRange(range)}</span>}
    </>
  )
  if (!model.url) return <span className="acb-title">{text}</span>
  return (
    <ExternalLink url={model.url} className="acb-title acb-title-link">
      {text}
    </ExternalLink>
  )
}
