'use client'

import { useState } from 'react'
import { Loader2, DollarSign, Table2, BarChart3 } from 'lucide-react'
import type { CashflowForecastData } from '@/app/finances/forecast/types'
import CashflowForecastTable from '@/app/finances/forecast/components/CashflowForecastTable'
import CashflowForecastChart from '@/app/finances/forecast/components/CashflowForecastChart'
import { buildPackCashflowRows, type PackCashflowRow } from '@/lib/monthly-report/pack-cashflow-rows'

interface CashflowTabProps {
  data: CashflowForecastData | null
  isLoading: boolean
  error?: string | null
  /**
   * What the balances start from and which months are actuals — the line the
   * pack prints under its cashflow title. Includes "Opening bank balance
   * unavailable" when the balance sheet could not be read.
   */
  basis?: string | null
  /** The coach's expense-group order, as the pack prints the groups (cash model v2's table). */
  groupOrder?: readonly string[] | null
}

/** Whole dollars, a payment in brackets — the pack's cashflow figures. */
function fmtCash(value: number): string {
  if (!Number.isFinite(value)) return '—'
  const rounded = Math.round(value)
  if (rounded === 0) return '0'
  const formatted = Math.abs(rounded).toLocaleString('en-AU')
  return rounded < 0 ? `(${formatted})` : formatted
}

/**
 * Cash model v2 on screen: the pack's own rows (buildPackCashflowRows), so the
 * tab and the PDF cannot disagree. The forecast wizard's table, used before,
 * reads neither equity_lines nor unreconciled_lines — in a month with
 * Urban Road's $853.80 late credit, or an equity movement, its rows did not
 * add to Net Movement and nothing on the tab said why, while the PDF did.
 */
function PackCashflowTable({ data, groupOrder }: { data: CashflowForecastData; groupOrder?: readonly string[] | null }) {
  const rows = buildPackCashflowRows(data, groupOrder ?? null)
  const rowClass = (row: PackCashflowRow) =>
    row.kind === 'bank' ? 'bg-cyan-50 font-semibold'
      : row.kind === 'heading' ? 'font-semibold text-gray-900'
        : row.kind === 'group' ? 'bg-gray-50 font-medium'
          : row.kind === 'subtotal' || row.kind === 'net' ? 'font-semibold border-t border-gray-200'
            : row.kind === 'unreconciled' ? 'italic text-amber-800'
              : ''
  return (
    <div className="bg-white rounded-lg shadow-sm overflow-x-auto">
      <table className="min-w-full text-xs">
        <thead>
          <tr className="bg-gray-100">
            <th className="text-left px-2 py-1.5 sticky left-0 bg-gray-100" />
            {data.months.map((m) => (
              <th key={m.month} className="text-right px-2 py-1.5 whitespace-nowrap">
                {m.monthLabel}
                <div className="font-normal text-gray-500">{m.source === 'actual' ? 'Actual' : 'Budget'}</div>
              </th>
            ))}
            <th className="text-right px-2 py-1.5">Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={`${row.kind}-${row.label}-${i}`} className={rowClass(row)}>
              <td className="px-2 py-1 whitespace-nowrap sticky left-0 bg-inherit" style={{ paddingLeft: `${0.5 + row.indent}rem` }}>{row.label}</td>
              {row.kind === 'heading'
                ? data.months.map((m) => <td key={m.month} />)
                : row.values.map((v, j) => <td key={data.months[j]?.month ?? j} className="text-right px-2 py-1 tabular-nums">{fmtCash(v)}</td>)}
              <td className="text-right px-2 py-1 tabular-nums">{row.total === null ? '' : fmtCash(row.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function CashflowTab({ data, isLoading, error, basis, groupOrder }: CashflowTabProps) {
  const [viewMode, setViewMode] = useState<'table' | 'chart'>('table')

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow-sm p-8 text-center">
        <Loader2 className="w-8 h-8 animate-spin text-brand-orange mx-auto mb-3" />
        <p className="text-sm text-gray-600">Loading cashflow forecast...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="mb-6 p-4 bg-red-50 rounded-lg border border-red-200">
        <p className="text-sm text-red-800">{error}</p>
      </div>
    )
  }

  if (!data || data.months.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-sm p-8 text-center">
        <DollarSign className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <h3 className="text-lg font-medium text-gray-900">Cashflow Forecast</h3>
        <p className="text-sm text-gray-500 mt-1 max-w-md mx-auto">
          Set up a financial forecast with P&L lines to see your cashflow projection here.
        </p>
      </div>
    )
  }

  return (
    <div>
      {/* View mode toggle */}
      <div className="flex items-center justify-between gap-4 mb-4">
        <p className="text-xs text-gray-500">{basis ?? ''}</p>
        <div className="inline-flex rounded-lg border border-gray-200 bg-white">
          <button
            onClick={() => setViewMode('table')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-l-lg transition-colors ${
              viewMode === 'table' ? 'bg-brand-orange text-white' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Table2 className="w-4 h-4" />
            Table
          </button>
          <button
            onClick={() => setViewMode('chart')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-r-lg transition-colors ${
              viewMode === 'chart' ? 'bg-brand-orange text-white' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            Chart
          </button>
        </div>
      </div>

      {viewMode === 'table' ? (
        data.cash_model ? <PackCashflowTable data={data} groupOrder={groupOrder} /> : <CashflowForecastTable data={data} />
      ) : (
        <CashflowForecastChart data={data} />
      )}
    </div>
  )
}
