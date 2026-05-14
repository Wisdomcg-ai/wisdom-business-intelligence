/**
 * ShareDialog — per-item sharing for daily_tasks and ideas (Phase 61).
 *
 * SCOPE BOUNDARY (do not blur):
 *   - This dialog mutates `shared_with_all` / `shared_with` columns ONLY.
 *   - It does NOT interact with `action_items` (team-wide action list) or
 *     `issues_list` (IDS-style team issues board) — both remain business-wide
 *     by design and are intentionally out of scope.
 *   - It does NOT interact with the existing "shared board" mode on
 *     /ideas (which queries by business_id). That mode coexists with this
 *     per-item sharing mechanism; a coach can still view every team-wide
 *     idea by switching to that mode.
 *
 * Three modes (mutually exclusive):
 *   - private : shared_with_all=false, shared_with=[]
 *   - team    : shared_with_all=true,  shared_with=[]
 *   - specific: shared_with_all=false, shared_with=userIds (must be non-empty)
 *
 * Optimistic UI: callers update local state ahead of the network round-trip;
 *   on error the dialog stays open and a toast.error displays the server's
 *   message. The caller is responsible for the local rollback (parent owns
 *   the list state).
 */

'use client'

import React, { useEffect, useState } from 'react'
import { X, Lock, Users, UserCog, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { TeammatePicker } from './TeammatePicker'

export type ShareMode = 'private' | 'team' | 'specific'

export type ShareDialogProps = {
  open: boolean
  itemId: string
  itemType: 'todo' | 'idea'
  businessId: string | null
  currentMode: ShareMode
  currentSharedWith: string[]
  currentUserId: string
  onSaved: (updated: unknown) => void
  onClose: () => void
}

export function ShareDialog({
  open,
  itemId,
  itemType,
  businessId,
  currentMode,
  currentSharedWith,
  currentUserId,
  onSaved,
  onClose,
}: ShareDialogProps) {
  const [mode, setMode] = useState<ShareMode>(currentMode)
  const [selectedIds, setSelectedIds] = useState<string[]>(currentSharedWith)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (open) {
      setMode(currentMode)
      setSelectedIds(currentSharedWith)
      setSubmitting(false)
    }
  }, [open, currentMode, currentSharedWith])

  if (!open) return null

  const isSpecificInvalid = mode === 'specific' && selectedIds.length === 0
  const saveDisabled = submitting || isSpecificInvalid

  async function handleSave() {
    if (saveDisabled) return

    const url =
      itemType === 'todo'
        ? `/api/todos/${itemId}/share`
        : `/api/ideas/${itemId}/share`

    const body =
      mode === 'private'
        ? { mode: 'private' as const }
        : mode === 'team'
        ? { mode: 'team' as const }
        : { mode: 'specific' as const, userIds: selectedIds }

    setSubmitting(true)
    try {
      const res = await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        const msg =
          (err && (err.error || err.message)) ||
          `Share failed (HTTP ${res.status})`
        toast.error(typeof msg === 'string' ? msg : 'Share failed')
        setSubmitting(false)
        return
      }

      const data = await res.json()
      const updated = itemType === 'todo' ? data.task : data.idea
      toast.success('Sharing updated')
      onSaved(updated)
      onClose()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Share failed'
      toast.error(msg)
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="share-dialog-title"
    >
      <div className="bg-white rounded-xl max-w-md w-full shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h2
            id="share-dialog-title"
            className="text-lg font-semibold text-gray-900"
          >
            Share {itemType === 'todo' ? 'task' : 'idea'}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-3">
          <fieldset className="space-y-2">
            <legend className="sr-only">Sharing mode</legend>

            <label
              className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                mode === 'private'
                  ? 'border-brand-orange bg-brand-orange-50'
                  : 'border-gray-200 hover:bg-gray-50'
              }`}
            >
              <input
                type="radio"
                name="share-mode"
                value="private"
                checked={mode === 'private'}
                onChange={() => setMode('private')}
                className="mt-1 h-4 w-4 text-brand-orange border-gray-300 focus:ring-brand-orange"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Lock className="w-4 h-4 text-gray-500" />
                  <span className="text-sm font-medium text-gray-900">
                    Private (only me)
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  Only you can see this item.
                </p>
              </div>
            </label>

            <label
              className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                mode === 'team'
                  ? 'border-brand-orange bg-brand-orange-50'
                  : 'border-gray-200 hover:bg-gray-50'
              }`}
            >
              <input
                type="radio"
                name="share-mode"
                value="team"
                checked={mode === 'team'}
                onChange={() => setMode('team')}
                className="mt-1 h-4 w-4 text-brand-orange border-gray-300 focus:ring-brand-orange"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-gray-500" />
                  <span className="text-sm font-medium text-gray-900">
                    Everyone on team
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  Visible to every active member of this business.
                </p>
              </div>
            </label>

            <label
              className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                mode === 'specific'
                  ? 'border-brand-orange bg-brand-orange-50'
                  : 'border-gray-200 hover:bg-gray-50'
              }`}
            >
              <input
                type="radio"
                name="share-mode"
                value="specific"
                checked={mode === 'specific'}
                onChange={() => setMode('specific')}
                className="mt-1 h-4 w-4 text-brand-orange border-gray-300 focus:ring-brand-orange"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <UserCog className="w-4 h-4 text-gray-500" />
                  <span className="text-sm font-medium text-gray-900">
                    Specific people…
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  Pick teammates from your business.
                </p>
              </div>
            </label>
          </fieldset>

          {mode === 'specific' && (
            <div className="pt-1">
              <TeammatePicker
                businessId={businessId}
                selectedUserIds={selectedIds}
                onChange={setSelectedIds}
                currentUserId={currentUserId}
              />
              {isSpecificInvalid && (
                <p className="mt-2 text-xs text-amber-700" role="status">
                  Pick at least one teammate to share with.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-5 py-4 border-t border-gray-200">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="flex-1 px-4 py-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-lg transition-colors font-medium disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saveDisabled}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-brand-orange hover:bg-brand-orange-600 text-white rounded-lg transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            Save sharing
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * Helper for callers: derive the current share mode from a row's
 * shared_with_all / shared_with fields.
 */
export function deriveShareMode(row: {
  shared_with_all?: boolean
  shared_with?: string[] | null
}): ShareMode {
  if (row.shared_with_all) return 'team'
  if (Array.isArray(row.shared_with) && row.shared_with.length > 0) {
    return 'specific'
  }
  return 'private'
}
