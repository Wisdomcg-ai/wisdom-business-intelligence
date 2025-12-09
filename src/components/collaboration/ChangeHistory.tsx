'use client'

import { useState, useEffect } from 'react'
import { format, formatDistanceToNow } from 'date-fns'
import { getRecordHistory, AuditLogEntry } from '@/lib/audit'
import { cn } from '@/lib/utils'

interface ChangeHistoryProps {
  tableName: string
  recordId: string
  className?: string
}

/**
 * Shows the change history for a specific record
 */
export function ChangeHistory({
  tableName,
  recordId,
  className,
}: ChangeHistoryProps) {
  const [history, setHistory] = useState<AuditLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchHistory() {
      setLoading(true)
      setError(null)

      const result = await getRecordHistory(tableName, recordId)

      if (result.error) {
        setError(result.error)
      } else {
        setHistory(result.data || [])
      }

      setLoading(false)
    }

    fetchHistory()
  }, [tableName, recordId])

  if (loading) {
    return (
      <div className={cn('p-4 text-center text-gray-500', className)}>
        Loading history...
      </div>
    )
  }

  if (error) {
    return (
      <div className={cn('p-4 text-center text-red-500', className)}>
        {error}
      </div>
    )
  }

  if (history.length === 0) {
    return (
      <div className={cn('p-4 text-center text-gray-500', className)}>
        No history available
      </div>
    )
  }

  return (
    <div className={cn('space-y-4', className)}>
      <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">
        Change History
      </h3>
      <div className="flow-root">
        <ul className="-mb-8">
          {history.map((entry, idx) => (
            <li key={entry.id || idx}>
              <div className="relative pb-8">
                {idx !== history.length - 1 && (
                  <span
                    className="absolute top-4 left-4 -ml-px h-full w-0.5 bg-gray-200 dark:bg-gray-700"
                    aria-hidden="true"
                  />
                )}
                <div className="relative flex space-x-3">
                  <div>
                    <span
                      className={cn(
                        'h-8 w-8 rounded-full flex items-center justify-center ring-8 ring-white dark:ring-gray-900',
                        entry.action === 'create' && 'bg-green-500',
                        entry.action === 'update' && 'bg-blue-500',
                        entry.action === 'delete' && 'bg-red-500'
                      )}
                    >
                      {entry.action === 'create' && (
                        <PlusIcon className="h-4 w-4 text-white" />
                      )}
                      {entry.action === 'update' && (
                        <PencilIcon className="h-4 w-4 text-white" />
                      )}
                      {entry.action === 'delete' && (
                        <TrashIcon className="h-4 w-4 text-white" />
                      )}
                    </span>
                  </div>
                  <div className="flex min-w-0 flex-1 justify-between space-x-4 pt-1.5">
                    <div>
                      <p className="text-sm text-gray-900 dark:text-gray-100">
                        {entry.description}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        by {entry.user_name}
                      </p>
                    </div>
                    <div className="whitespace-nowrap text-right text-xs text-gray-500 dark:text-gray-400">
                      <time
                        dateTime={entry.created_at as unknown as string}
                        title={format(
                          new Date(entry.created_at as unknown as string),
                          'PPpp'
                        )}
                      >
                        {formatDistanceToNow(
                          new Date(entry.created_at as unknown as string),
                          { addSuffix: true }
                        )}
                      </time>
                    </div>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

// Icons
function PlusIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 4v16m8-8H4"
      />
    </svg>
  )
}

function PencilIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
      />
    </svg>
  )
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
      />
    </svg>
  )
}

interface ChangeHistoryModalProps {
  isOpen: boolean
  onClose: () => void
  tableName: string
  recordId: string
  title?: string
}

/**
 * Modal wrapper for change history
 */
export function ChangeHistoryModal({
  isOpen,
  onClose,
  tableName,
  recordId,
  title = 'Change History',
}: ChangeHistoryModalProps) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        {/* Backdrop */}
        <div
          className="fixed inset-0 bg-black/50 transition-opacity"
          onClick={onClose}
        />

        {/* Modal */}
        <div className="relative w-full max-w-lg transform rounded-lg bg-white dark:bg-gray-800 p-6 shadow-xl transition-all">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {title}
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"
            >
              <span className="sr-only">Close</span>
              <svg
                className="h-6 w-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            <ChangeHistory tableName={tableName} recordId={recordId} />
          </div>
        </div>
      </div>
    </div>
  )
}
