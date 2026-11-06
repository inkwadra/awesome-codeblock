import React from 'react'
import { UiIcon } from '../../icons'
import type { BlockModel } from '../../model'

/**
 * Where the code comes from: `branch=` / `commit=` as one git ref next to the
 * title. (`line=` joins the file name, see `TitleText`.)
 */
export const SourceRef: React.FC<{ model: BlockModel }> = ({ model }) => {
  const { branch, commit } = model.info ?? {}
  if (!branch && !commit) return null
  const label = [branch && `Branch ${branch}`, commit && `commit ${commit}`].filter(Boolean).join(', ')
  return (
    <span className="acb-ref" title={label}>
      <UiIcon name={branch ? 'branch' : 'commit'} size={11} />
      {branch && <span className="acb-ref-branch">{branch}</span>}
      {commit && <span className="acb-ref-commit">{commit}</span>}
    </span>
  )
}
