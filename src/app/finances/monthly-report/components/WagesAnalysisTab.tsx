'use client'

import { Loader2, Users, Settings } from 'lucide-react'
import type { WagesDetailData } from '../types'

interface WagesAnalysisTabProps {
  data: WagesDetailData | null
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

function formatPayRunDate(dateStr: string): string {
  if (!dateStr) return 'Pay Run'
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}

export default function WagesAnalysisTab({ data, isLoading, error, onOpenSettings }: WagesAnalysisTabProps) {
  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow-sm p-8 text-center">
        <Loader2 className="w-8 h-8 animate-spin text-brand-orange mx-auto mb-3" />
        <p className="text-sm text-gray-600">Loading wages detail...</p>
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

  if (!data || data.accounts.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-sm p-8 text-center">
        <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <h3 className="text-lg font-medium text-gray-900">Configure Wages Accounts</h3>
        <p className="text-sm text-gray-500 mt-1 max-w-md mx-auto">
          Select which expense accounts contain wages/payroll in Settings to enable this tab.
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

  // Collect unique pay run dates across all employees
  const payRunDates = data.pay_run_dates || []

  // Calculate column totals
  const colTotals: Record<string, number> = {}
  for (const d of payRunDates) colTotals[d] = 0
  let totalActual = 0
  let totalBudget = 0

  for (const emp of data.employees) {
    for (const pr of emp.pay_runs) {
      if (pr.date && colTotals[pr.date] !== undefined) {
        colTotals[pr.date] += pr.gross_earnings
      }
    }
    totalActual += emp.actual_total
    totalBudget += emp.budget_total
  }

  const totalVariance = totalBudget - totalActual

  return (
    <div className="space-y-4">
      {/* Account Summary */}
      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-brand-navy text-white text-xs">
                <th className="px-4 py-3 text-left font-semibold">Account</th>
                <th className="px-4 py-3 text-right font-semibold">Budget</th>
                <th className="px-4 py-3 text-right font-semibold">Actual</th>
                <th className="px-4 py-3 text-right font-semibold">Var ($)</th>
              </tr>
            </thead>
            <tbody>
              {data.accounts.map((account) => (
                <tr key={account.account_name} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-2 text-sm text-gray-900">{account.account_name}</td>
                  <td className="px-4 py-2 text-sm text-right text-gray-600">{account.budget ? fmt(account.budget) : '—'}</td>
                  <td className="px-4 py-2 text-sm text-right font-medium text-gray-900">{fmt(account.actual)}</td>
                  <td className={`px-4 py-2 text-sm text-right ${varianceColor(account.variance)}`}>{fmt(account.variance)}</td>
                </tr>
              ))}
              <tr className="bg-brand-navy text-white font-semibold">
                <td className="px-4 py-3 text-sm">Total</td>
                <td className="px-4 py-3 text-sm text-right">{fmt(data.grand_total.budget)}</td>
                <td className="px-4 py-3 text-sm text-right">{fmt(data.grand_total.actual)}</td>
                <td className="px-4 py-3 text-sm text-right">{fmt(data.grand_total.variance)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Employee Pay Run Table */}
      {data.employees.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-brand-navy text-white text-xs">
                  <th className="px-4 py-3 text-left font-semibold">Employee</th>
                  {payRunDates.map(d => (
                    <th key={d} className="px-4 py-3 text-right font-semibold whitespace-nowrap">
                      {formatPayRunDate(d)}
                    </th>
                  ))}
                  <th className="px-4 py-3 text-right font-semibold">Total Paid</th>
                  <th className="px-4 py-3 text-right font-semibold">Budget</th>
                  <th className="px-4 py-3 text-right font-semibold">Var ($)</th>
                </tr>
              </thead>
              <tbody>
                {data.employees.map((emp, idx) => {
                  // Build a map of date → gross for this employee
                  const payByDate: Record<string, number> = {}
                  for (const pr of emp.pay_runs) {
                    if (pr.date) payByDate[pr.date] = (payByDate[pr.date] || 0) + pr.gross_earnings
                  }

                  return (
                    <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-2 text-sm text-gray-900">{emp.name}</td>
                      {payRunDates.map(d => (
                        <td key={d} className="px-4 py-2 text-sm text-right text-gray-700">
                          {payByDate[d] ? fmt(payByDate[d]) : '—'}
                        </td>
                      ))}
                      <td className="px-4 py-2 text-sm text-right font-medium text-gray-900">
                        {emp.actual_total ? fmt(emp.actual_total) : '—'}
                      </td>
                      <td className="px-4 py-2 text-sm text-right text-gray-600">
                        {emp.budget_total ? fmt(emp.budget_total) : '—'}
                      </td>
                      <td className={`px-4 py-2 text-sm text-right font-medium ${varianceColor(emp.variance)}`}>
                        {emp.budget_total || emp.actual_total ? fmt(emp.variance) : '—'}
                      </td>
                    </tr>
                  )
                })}

                {/* Totals row */}
                <tr className="bg-brand-navy text-white font-semibold">
                  <td className="px-4 py-3 text-sm">Total</td>
                  {payRunDates.map(d => (
                    <td key={d} className="px-4 py-3 text-sm text-right">{fmt(colTotals[d])}</td>
                  ))}
                  <td className="px-4 py-3 text-sm text-right">{fmt(totalActual)}</td>
                  <td className="px-4 py-3 text-sm text-right">{fmt(totalBudget)}</td>
                  <td className="px-4 py-3 text-sm text-right">{fmt(totalVariance)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Info note */}
      {data.payroll_available && (
        <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
          <p className="text-xs text-blue-800">
            Actuals sourced from Xero PayRun data. Budget from forecast employees.
          </p>
        </div>
      )}
      {!data.payroll_available && (
        <div className="bg-amber-50 rounded-lg p-3 border border-amber-200">
          <p className="text-xs text-amber-800">
            Xero PayRun data not available — showing forecast budget only. To see actual pay per employee, disconnect and reconnect Xero to grant the updated payroll permissions.
          </p>
        </div>
      )}
    </div>
  )
}
