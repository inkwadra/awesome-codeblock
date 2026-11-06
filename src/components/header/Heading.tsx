import React from 'react'
import type { DiffFileSummary } from '../../diff/summary'
import { FileTypeIcon } from '../../icons'
import { blockLanguageName, type BlockModel } from '../../model'
import { useSettings } from '../hooks'
import { SourceRef } from './SourceRef'
import { ExternalLink, formatRange, TitleText } from './TitleText'

const DiffStat: React.FC<{ files: readonly DiffFileSummary[] }> = ({ files }) => {
  const additions = files.reduce((sum, f) => sum + f.additions, 0)
  const deletions = files.reduce((sum, f) => sum + f.deletions, 0)
  return (
    <span className="acb-diff-stat" title={`${deletions} deleted, ${additions} added`}>
      {deletions > 0 && <span className="acb-diff-del">−{deletions}</span>}
      {additions > 0 && <span className="acb-diff-add">+{additions}</span>}
    </span>
  )
}

/**
 * Heading of a diff view: the patch's file (or file count) and its +/- stats.
 * diffs' own per-file header is then shown only for multi-file patches.
 */
const DiffHeading: React.FC<{ model: BlockModel; files: readonly DiffFileSummary[]; dark: boolean }> = ({
  model,
  files,
  dark
}) => {
  const single = files.length === 1 ? files[0] : undefined
  let name: React.ReactNode
  if (model.title) name = <TitleText model={model} />
  else if (single) {
    name = (
      <span className="acb-title">
        {single.prevName && <span className="acb-title-prev">{single.prevName} → </span>}
        <span className="acb-title-text">{single.name}</span>
      </span>
    )
  } else name = <span className="acb-lang-name">{files.length} files</span>
  if (!model.title && model.url) {
    name = (
      <ExternalLink url={model.url} className="acb-title acb-title-link">
        {name}
      </ExternalLink>
    )
  }

  return (
    <div className="acb-heading" title={blockLanguageName(model)}>
      <FileTypeIcon lang={single ? undefined : 'diff'} title={model.title ?? single?.name} dark={dark} />
      {name}
      <DiffStat files={files} />
      <SourceRef model={model} />
    </div>
  )
}

/** Left side of a frame's header: icon, title or language, source range and git ref. */
export const Heading: React.FC<{ model: BlockModel; dark: boolean }> = ({ model, dark }) => {
  const settings = useSettings()
  if (model.diffFiles?.length) return <DiffHeading model={model} files={model.diffFiles} dark={dark} />

  const name = blockLanguageName(model)
  const range = model.info?.range
  // Without a file name the gutter already shows where the excerpt starts.
  const showRange = !!range && (!!model.title || !model.lineNumbers)
  return (
    <div className="acb-heading" title={model.title ? name : undefined}>
      <FileTypeIcon lang={model.lang} hlLang={model.hlLang} title={model.title} dark={dark} />
      {model.title ? (
        <TitleText model={model} range={showRange ? range : undefined} />
      ) : (
        <>
          {model.url ? (
            // `url=` without a title: the language name is the link.
            <ExternalLink url={model.url} className="acb-title acb-title-link">
              <span className="acb-lang-name">{name}</span>
            </ExternalLink>
          ) : (
            settings.showLanguage && <span className="acb-lang-name">{name}</span>
          )}
          {showRange && (
            <span className="acb-range-text">
              {range.to !== undefined ? 'Lines' : 'Line'} {formatRange(range)}
            </span>
          )}
        </>
      )}
      <SourceRef model={model} />
    </div>
  )
}
