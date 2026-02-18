'use client'

import { AlertTriangle } from 'lucide-react'

interface UnmappedAccountsAlertProps {
  count: number
  onAutoMap: () => void
  isLoading?: boolean
}

export default function UnmappedAccountsAlert({ count, onAutoMap, isLoading }: UnmappedAccountsAlertProps) {
  if (count === 0) return null

  return (
    <div className="mb-4 p-4 bg-amber-50 rounded-lg border border-amber-200">
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="text-sm font-medium text-amber-800">
            {count} unmapped Xero account{count !== 1 ? 's' : ''} found
          </p>
          <p className="text-xs text-amber-700 mt-1">
            These accounts appear in your Xero data but haven't been mapped to a report category yet.
          </p>
          <button
            onClick={onAutoMap}
            disabled={isLoading}
            className="mt-2 inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-md bg-amber-100 text-amber-800 hover:bg-amber-200 transition-colors disabled:opacity-50"
          >
            {isLoading ? 'Mapping...' : 'Auto-Map All Accounts'}
          </button>
        </div>
      </div>
    </div>
  )
}
