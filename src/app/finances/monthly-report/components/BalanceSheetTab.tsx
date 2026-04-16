'use client'

import { useEffect } from 'react'
import { Loader2, AlertCircle, RefreshCw } from 'lucide-react'
import type { BalanceSheetData, BalanceSheetRow, BalanceSheetCompare } from '../types'

// ─── Formatting helpers ──────────────────────────────────────────────────────

function formatAmount(value: number | null): string {
  if (value === null) return '—'
  const abs = Math.abs(value)
  const formatted = abs.toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
  return value < 0 ? `(${formatted})` : formatted
}

function formatPct(value: number | null): string {
  if (value === null) return 'N/A'
  const abs = Math.abs(value)
  const formatted = `${Math.round(abs)}%`
  return value < 0 ? `(${formatted})` : formatted
}

function isNegative(value: number | null): boolean {
  return value !== null && value < 0
}

// ─── Cell components ─────────────────────────────────────────────────────────

function AmountCell({ value, className = '' }: { value: number | null; className?: string }) {
  return (
    <td className={`text-right tabular-nums pr-4 ${isNegative(value) ? 'text-red-600' : 'text-gray-900'} ${className}`}>
      {formatAmount(value)}
    </td>
  )
}

function PctCell({ value, className = '' }: { value: number | null; className?: string }) {
  const isNA = value === null
  return (
    <td className={`text-right tabular-nums pr-4 ${isNegative(value) ? 'text-red-600' : isNA ? 'text-gray-400' : 'text-gray-900'} ${className}`}>
      {formatPct(value)}
    </td>
  )
}

// ─── Row renderers ────────────────────────────────────────────────────────────

function SectionHeaderRow({ row }: { row: BalanceSheetRow }) {
  return (
    <tr>
      <td colSpan={5} className="pt-4 pb-1 pl-4 text-sm italic text-gray-400 select-none">
        {row.label}
      </td>
    </tr>
  )
}

function LineItemRow({ row }: { row: BalanceSheetRow }) {
  return (
    <tr className="hover:bg-gray-50/60 transition-colors">
      <td className="py-1.5 pl-8 pr-4 text-sm text-gray-700 truncate max-w-xs" title={row.label}>
        {row.label}
      </td>
      <AmountCell value={row.current} className="py-1.5 text-sm" />
      <AmountCell value={row.prior} className="py-1.5 text-sm" />
      <AmountCell value={row.variance} className="py-1.5 text-sm" />
      <PctCell value={row.variance_pct} className="py-1.5 text-sm" />
    </tr>
  )
}

function SubtotalRow({ row }: { row: BalanceSheetRow }) {
  return (
    <>
      <tr>
        <td colSpan={5} className="pt-0">
          <div className="border-t border-gray-200 mx-4" />
        </td>
      </tr>
      <tr className="bg-gray-50/50">
        <td className="py-2 pl-4 pr-4 text-sm font-semibold text-gray-800">{row.label}</td>
        <AmountCell value={row.current} className="py-2 text-sm font-semibold" />
        <AmountCell value={row.prior} className="py-2 text-sm font-semibold" />
        <AmountCell value={row.variance} className="py-2 text-sm font-semibold" />
        <PctCell value={row.variance_pct} className="py-2 text-sm font-semibold" />
      </tr>
    </>
  )
}

function NetAssetsRow({ row }: { row: BalanceSheetRow }) {
  return (
    <>
      <tr>
        <td colSpan={5} className="py-1">
          <div className="border-t-2 border-gray-300 mx-2" />
        </td>
      </tr>
      <tr className="bg-brand-orange/5">
        <td className="py-2.5 pl-4 pr-4 text-sm font-bold text-gray-900">{row.label}</td>
        <AmountCell value={row.current} className="py-2.5 text-sm font-bold" />
        <AmountCell value={row.prior} className="py-2.5 text-sm font-bold" />
        <AmountCell value={row.variance} className="py-2.5 text-sm font-bold" />
        <PctCell value={row.variance_pct} className="py-2.5 text-sm font-bold" />
      </tr>
      <tr>
        <td colSpan={5} className="pb-1">
          <div className="border-t-2 border-gray-300 mx-2" />
        </td>
      </tr>
    </>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

interface BalanceSheetTabProps {
  businessId: string
  month: string            // YYYY-MM
  balanceSheet: BalanceSheetData | null
  isLoading: boolean
  error: string | null
  compare: BalanceSheetCompare
  onCompareChange: (c: BalanceSheetCompare) => void
  onLoad: (month: string) => void
}

export default function BalanceSheetTab({
  businessId,
  month,
  balanceSheet,
  isLoading,
  error,
  compare,
  onCompareChange,
  onLoad,
}: BalanceSheetTabProps) {
  // Load on mount and when month/compare changes
  useEffect(() => {
    if (businessId && month) {
      onLoad(month)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId, month, compare])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 gap-3 text-gray-400">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-sm">Loading balance sheet…</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <AlertCircle className="w-8 h-8 text-red-400" />
        <p className="text-sm text-gray-600">{error}</p>
        <button
          onClick={() => onLoad(month)}
          className="mt-1 flex items-center gap-1.5 px-3 py-1.5 text-sm text-brand-orange border border-brand-orange/30 rounded-lg hover:bg-brand-orange/5 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Retry
        </button>
      </div>
    )
  }

  if (!balanceSheet) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-400 text-sm">
        Select a month to load the balance sheet.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Controls bar */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Balance Sheet</h2>
          <p className="text-sm text-gray-400 mt-0.5">{balanceSheet.current_label}</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Compare toggle */}
          <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
            <button
              onClick={() => onCompareChange('yoy')}
              className={`px-3 py-1.5 transition-colors ${compare === 'yoy' ? 'bg-brand-orange text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
            >
              vs Prior Year
            </button>
            <button
              onClick={() => onCompareChange('mom')}
              className={`px-3 py-1.5 border-l border-gray-200 transition-colors ${compare === 'mom' ? 'bg-brand-orange text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
            >
              vs Prior Month
            </button>
          </div>
          <button
            onClick={() => onLoad(month)}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Balance check badge */}
      {!balanceSheet.balances && (
        <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
          <AlertCircle className="w-4 h-4 shrink-0" />
          Balance sheet does not balance — Net Assets and Total Equity differ. This may indicate unreconciled transactions in Xero.
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full">
          {/* Two-tier column headers — matches Calxa spec */}
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="text-left pl-4 py-2 text-xs font-medium text-gray-500 w-1/2" />
              <th className="text-right pr-4 py-2 text-xs font-semibold text-gray-700">
                {balanceSheet.current_label}
              </th>
              <th className="text-right pr-4 py-2 text-xs font-semibold text-gray-700">
                {balanceSheet.prior_label}
              </th>
              <th className="text-right pr-4 py-2 text-xs font-semibold text-gray-700">Variance</th>
              <th className="text-right pr-4 py-2 text-xs font-semibold text-gray-700">% Variance</th>
            </tr>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th />
              <th className="text-right pr-4 pb-2 text-xs font-normal text-gray-400">Actuals</th>
              <th className="text-right pr-4 pb-2 text-xs font-normal text-gray-400">Actuals</th>
              <th />
              <th />
            </tr>
          </thead>
          <tbody>
            {balanceSheet.rows.map((row, i) => {
              switch (row.type) {
                case 'section_header':
                  return <SectionHeaderRow key={i} row={row} />
                case 'line_item':
                  return <LineItemRow key={i} row={row} />
                case 'subtotal':
                  return <SubtotalRow key={i} row={row} />
                case 'net_assets':
                  return <NetAssetsRow key={i} row={row} />
                default:
                  return null
              }
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-400">
        Data sourced from Xero · Negatives shown as (brackets) in red · % Variance shows N/A when prior period is zero
      </p>
    </div>
  )
}
