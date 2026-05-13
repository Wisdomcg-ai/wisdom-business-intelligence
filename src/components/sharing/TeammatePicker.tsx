/**
 * Phase 61-05 — TeammatePicker
 *
 * Multi-select picker over active business_users (excluding the current user).
 * Search input filters by name + email substring (case-insensitive). Used
 * inside ShareDialog when mode='specific'.
 */

'use client'

import React, { useMemo, useState } from 'react'
import { Search, Loader2 } from 'lucide-react'
import { useBusinessTeammates, type Teammate } from '@/lib/hooks/useBusinessTeammates'

export type TeammatePickerProps = {
  businessId: string | null
  selectedUserIds: string[]
  onChange: (userIds: string[]) => void
  currentUserId: string
}

export type { Teammate }

export function TeammatePicker({
  businessId,
  selectedUserIds,
  onChange,
  currentUserId,
}: TeammatePickerProps) {
  const { teammates, isLoading, error } = useBusinessTeammates(businessId)
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return teammates
      .filter((t) => t.user_id !== currentUserId)
      .filter((t) => {
        if (!q) return true
        const name = (t.display_name || '').toLowerCase()
        const email = (t.email || '').toLowerCase()
        return name.includes(q) || email.includes(q)
      })
  }, [teammates, query, currentUserId])

  function toggle(userId: string) {
    if (selectedUserIds.includes(userId)) {
      onChange(selectedUserIds.filter((id) => id !== userId))
    } else {
      onChange([...selectedUserIds, userId])
    }
  }

  return (
    <div className="space-y-2" data-testid="teammate-picker">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          placeholder="Search teammates…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-transparent"
          aria-label="Search teammates"
        />
      </div>

      {error && (
        <p className="text-xs text-red-600" role="alert">
          {error}
        </p>
      )}

      <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100 bg-white">
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 p-3 text-sm text-gray-500">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading teammates…
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-3 text-sm text-gray-500 text-center">
            {teammates.length === 0
              ? 'No active teammates in this business yet.'
              : 'No teammates match your search.'}
          </div>
        ) : (
          filtered.map((t) => {
            const checked = selectedUserIds.includes(t.user_id)
            const label = t.display_name?.trim() || t.email
            return (
              <label
                key={t.user_id}
                className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer text-sm"
                data-testid={`teammate-option-${t.user_id}`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(t.user_id)}
                  className="h-4 w-4 text-brand-orange border-gray-300 rounded focus:ring-brand-orange"
                  aria-label={`Select ${label}`}
                />
                <span className="flex-1 min-w-0">
                  <span className="block font-medium text-gray-900 truncate">{label}</span>
                  {t.display_name && t.email && (
                    <span className="block text-xs text-gray-500 truncate">{t.email}</span>
                  )}
                </span>
              </label>
            )
          })
        )}
      </div>
    </div>
  )
}
