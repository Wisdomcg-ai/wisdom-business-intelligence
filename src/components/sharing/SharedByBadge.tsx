/**
 * SharedByBadge
 *
 * Read-only badge rendered on rows the viewer does NOT own (is_owner === false).
 * Reads "Shared with you" — the owner display name is shown in the tooltip on
 * hover, since the underlying name lookup is a follow-up.
 */

'use client'

import React from 'react'
import { Users } from 'lucide-react'

export type SharedByBadgeProps = {
  ownerName?: string
  ownerEmail?: string
}

export function SharedByBadge({ ownerName, ownerEmail }: SharedByBadgeProps) {
  const label = ownerName?.trim() || ownerEmail?.trim() || 'a teammate'
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-brand-orange-800 bg-brand-orange-100 border border-brand-orange-300 rounded-full"
      data-testid="shared-by-badge"
      title={`Shared with you by ${label}`}
    >
      <Users className="w-3.5 h-3.5" />
      Shared with you
    </span>
  )
}
