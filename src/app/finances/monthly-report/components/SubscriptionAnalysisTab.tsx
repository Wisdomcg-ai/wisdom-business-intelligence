'use client'

import { Loader2, CreditCard, Settings } from 'lucide-react'
import type { SubscriptionDetailData } from '../types'

interface SubscriptionAnalysisTabProps {
  data: SubscriptionDetailData | null
  isLoading: boolean
  error: string | null
  onOpenSettings?: () => void
}

function fmt(value: number): string {
  const abs = Math.abs(value)
  const formatted = abs.toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
  return value < 0 ? `-$${formatted}` : `$${formatted}`
}

function varianceColor(variance: number): string {
  if (variance === 0) return ''
  return variance > 0 ? 'text-green-700' : 'text-red-600'
}

function formatMonthLabel(reportMonth: string): string {
  if (!reportMonth) return ''
  const d = new Date(reportMonth + '-01')
  const month = d.toLocaleDateString('en-AU', { month: 'short' })
  const year = d.getFullYear().toString().slice(-2)
  return `${month} ${year}`
}

function formatPriorMonthLabel(reportMonth: string): string {
  if (!reportMonth) return 'Last Month'
  const [y, m] = reportMonth.split('-').map(Number)
  const priorDate = new Date(y, m - 2, 1)
  const month = priorDate.toLocaleDateString('en-AU', { month: 'short' })
  const year = priorDate.getFullYear().toString().slice(-2)
  return `${month} ${year}`
}

export default function SubscriptionAnalysisTab({ data, isLoading, error, onOpenSettings }: SubscriptionAnalysisTabProps) {
  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow-sm p-8 text-center max-w-3xl">
        <Loader2 className="w-8 h-8 animate-spin text-brand-orange mx-auto mb-3" />
        <p className="text-sm text-gray-600">Loading subscription detail...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="mb-6 p-4 bg-red-50 rounded-lg border border-red-200 max-w-3xl">
        <p className="text-sm text-red-800">{error}</p>
      </div>
    )
  }

  if (!data || data.accounts.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-sm p-8 text-center max-w-3xl">
        <CreditCard className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <h3 className="text-lg font-medium text-gray-900">Configure Subscription Accounts</h3>
        <p className="text-sm text-gray-500 mt-1 max-w-md mx-auto">
          Select which expense accounts contain subscription costs in Settings to enable this tab.
        </p>
        {onOpenSettings && (
          <button
            onClick={onOpenSettings}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-brand-navy hover:bg-brand-navy-800 rounded-lg transition-colors"
          >
            <Settings className="w-4 h-4" />
            Open Settings
          </button>
        )}
      </div>
    )
  }

  const currentMonthLabel = formatMonthLabel(data.report_month)
  const priorMonthLabel = formatPriorMonthLabel(data.report_month)

  return (
    <div className="max-w-3xl mx-auto">
      <div className="bg-white rounded-lg shadow-sm overflow-hidden border border-gray-200">
        <table className="w-full">
          <thead>
            <tr className="bg-brand-navy text-white text-xs">
              <th className="px-4 py-2.5 text-left font-semibold">Vendor</th>
              <th className="px-4 py-2.5 text-right font-semibold w-28">{priorMonthLabel}</th>
              <th className="px-4 py-2.5 text-right font-semibold w-28">Budget</th>
              <th className="px-4 py-2.5 text-right font-semibold w-28">{currentMonthLabel || 'Actual'}</th>
              <th className="px-4 py-2.5 text-right font-semibold w-28">Variance</th>
            </tr>
          </thead>
          <tbody>
            {data.accounts.map((account) => (
              <AccountGroup key={account.account_code} account={account} />
            ))}

            {/* Grand Total */}
            <tr className="bg-brand-navy text-white font-semibold">
              <td className="px-4 py-2.5 text-sm">Grand Total</td>
              <td className="px-4 py-2.5 text-sm text-right">{fmt(data.grand_total.prior_month)}</td>
              <td className="px-4 py-2.5 text-sm text-right">{fmt(data.grand_total.budget)}</td>
              <td className="px-4 py-2.5 text-sm text-right">{fmt(data.grand_total.actual)}</td>
              <td className="px-4 py-2.5 text-sm text-right">{fmt(data.grand_total.variance)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

function AccountGroup({ account }: { account: SubscriptionDetailData['accounts'][number] }) {
  return (
    <>
      {/* Section header */}
      <tr className="bg-amber-50 border-t border-amber-200">
        <td colSpan={5} className="px-4 py-2 text-sm font-bold text-amber-800">
          {account.account_name}
        </td>
      </tr>

      {/* Vendor rows */}
      {account.vendors.map((vendor) => {
        const isUnbudgeted = vendor.budget === 0 && vendor.actual > 0
        return (
          <tr key={vendor.vendor_key} className={`border-b border-gray-100 hover:bg-gray-50 ${isUnbudgeted ? 'bg-amber-50/30' : ''}`}>
            <td className="px-4 py-1.5 text-sm text-gray-900 pl-6">
              {vendor.vendor_name}
              {isUnbudgeted && (
                <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-700">
                  NEW
                </span>
              )}
            </td>
            <td className="px-4 py-1.5 text-sm text-right text-gray-500">
              {vendor.prior_month_actual !== 0 ? fmt(vendor.prior_month_actual) : '—'}
            </td>
            <td className="px-4 py-1.5 text-sm text-right text-gray-500">
              {vendor.budget !== 0 ? fmt(vendor.budget) : '—'}
            </td>
            <td className="px-4 py-1.5 text-sm text-right font-medium text-gray-900">{fmt(vendor.actual)}</td>
            <td className={`px-4 py-1.5 text-sm text-right font-medium ${varianceColor(vendor.variance)}`}>
              {vendor.budget !== 0 ? fmt(vendor.variance) : '—'}
            </td>
          </tr>
        )
      })}

      {/* Subtotal */}
      <tr className="bg-amber-50/50 font-semibold border-b border-amber-200">
        <td className="px-4 py-2 text-sm text-amber-800">Subtotal — {account.account_name}</td>
        <td className="px-4 py-2 text-sm text-right text-amber-800">{fmt(account.total_prior_month)}</td>
        <td className="px-4 py-2 text-sm text-right text-amber-800">{fmt(account.total_budget)}</td>
        <td className="px-4 py-2 text-sm text-right text-amber-800">{fmt(account.total_actual)}</td>
        <td className={`px-4 py-2 text-sm text-right font-semibold ${varianceColor(account.total_variance)}`}>
          {fmt(account.total_variance)}
        </td>
      </tr>
    </>
  )
}
