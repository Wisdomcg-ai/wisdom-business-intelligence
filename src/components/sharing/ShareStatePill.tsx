/**
 * ShareStatePill — owner-facing badge that indicates a row's share state.
 *
 * Pairs with SharedByBadge (which renders on recipient views). When the
 * viewer is the owner, this pill shows whether the row is shared so the
 * owner has visual feedback after using the share dialog.
 *
 * Renders nothing for private rows — pure noise removal.
 */

'use client'

import React from 'react'
import { Globe, Users } from 'lucide-react'

export type ShareStatePillProps = {
  sharedWithAll: boolean
  sharedWith: string[] | null | undefined
}

export function ShareStatePill({ sharedWithAll, sharedWith }: ShareStatePillProps) {
  const specificCount = Array.isArray(sharedWith) ? sharedWith.length : 0

  if (sharedWithAll) {
    return (
      <span
        className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold text-emerald-800 bg-emerald-100 border border-emerald-200 rounded-full"
        data-testid="share-state-pill-team"
        title="Shared with everyone on the team"
      >
        <Globe className="w-3 h-3" />
        Shared with team
      </span>
    )
  }

  if (specificCount > 0) {
    return (
      <span
        className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold text-emerald-800 bg-emerald-100 border border-emerald-200 rounded-full"
        data-testid="share-state-pill-specific"
        title={`Shared with ${specificCount} ${specificCount === 1 ? 'person' : 'people'}`}
      >
        <Users className="w-3 h-3" />
        Shared with {specificCount}
      </span>
    )
  }

  return null
}
