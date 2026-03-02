'use client'

import { CheckCircle, AlertTriangle, ExternalLink } from 'lucide-react'
import type { ReconciliationStatus } from '../types'

interface ReconciliationGateProps {
  reconciliation: ReconciliationStatus | null
  isLoading: boolean
  selectedMonth: string
  onProceedDraft: () => void
}

export default function ReconciliationGate({
  reconciliation,
  isLoading,
  selectedMonth,
  onProceedDraft,
}: ReconciliationGateProps) {
  if (isLoading) {
    return (
      <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200 animate-pulse">
        <div className="h-4 bg-gray-200 rounded w-48" />
      </div>
    )
  }

  if (!reconciliation) return null

  const monthLabel = new Date(selectedMonth + '-01').toLocaleDateString('en-AU', {
    month: 'long',
    year: 'numeric',
  })

  // Green: All reconciled
  if (reconciliation.is_clean) {
    return (
      <div className="mb-6 p-4 bg-green-50 rounded-lg border border-green-200 flex items-center gap-3">
        <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
        <span className="text-sm text-green-800 font-medium">
          All transactions reconciled for {monthLabel}
        </span>
      </div>
    )
  }

  // Amber/Red: Unreconciled transactions exist
  const count = reconciliation.unreconciled_count
  const total = reconciliation.unreconciled_total
  const isRed = count >= 10
  const bgColor = isRed ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'
  const textColor = isRed ? 'text-red-800' : 'text-amber-800'
  const iconColor = isRed ? 'text-red-500' : 'text-amber-500'

  const formattedTotal = new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: 0,
  }).format(total)

  return (
    <div className={`mb-6 p-4 rounded-lg border ${bgColor}`}>
      <div className="flex items-start gap-3">
        <AlertTriangle className={`w-5 h-5 ${iconColor} flex-shrink-0 mt-0.5`} />
        <div className="flex-1">
          <p className={`text-sm font-medium ${textColor}`}>
            {reconciliation.has_more ? '100+' : count} unreconciled transaction{count !== 1 ? 's' : ''} ({formattedTotal})
          </p>
          <p className={`text-xs mt-1 ${textColor} opacity-80`}>
            Report will be marked as DRAFT until all transactions are reconciled in Xero.
          </p>
          <div className="flex items-center gap-3 mt-3">
            <a
              href="https://go.xero.com/Bank/BankAccounts.aspx"
              target="_blank"
              rel="noopener noreferrer"
              className={`inline-flex items-center gap-1 text-xs font-medium ${textColor} underline hover:opacity-80`}
            >
              Reconcile in Xero <ExternalLink className="w-3 h-3" />
            </a>
            <button
              onClick={onProceedDraft}
              className="inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-md bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Generate Draft Report
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
