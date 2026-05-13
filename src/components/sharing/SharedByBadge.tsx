/**
 * Phase 61-05 — SharedByBadge
 *
 * Read-only badge rendered on rows the viewer does NOT own (is_owner === false).
 * Shows "Shared by {ownerName}" with a small Users icon. Pure presentational.
 */

'use client'

import React from 'react'
import { Users } from 'lucide-react'

export type SharedByBadgeProps = {
  ownerName?: string
  ownerEmail?: string
}

export function SharedByBadge({ ownerName, ownerEmail }: SharedByBadgeProps) {
  const label = ownerName?.trim() || ownerEmail?.trim() || 'Team member'
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium text-brand-orange-700 bg-brand-orange-50 border border-brand-orange-200 rounded-full"
      data-testid="shared-by-badge"
      title={`Shared by ${label}`}
    >
      <Users className="w-3 h-3" />
      Shared by {label}
    </span>
  )
}
