'use client'

import { Fragment, useState } from 'react'
import { ChevronRight, Loader2, Users, Settings } from 'lucide-react'
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
  // WB.4 — $1 tolerance: cent-level rounding between payslip gross and whole-
  // dollar budgets must not light a row red (DD's Daniel flagged exactly this:
  // "without tolerance, Head Office lights up red for a few cents").
  if (Math.abs(variance) <= 1) return ''
  return variance > 0 ? 'text-green-700' : 'text-red-600'
}

function formatPayRunDate(dateStr: string): string {
  if (!dateStr) return 'Pay Run'
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}

export default function WagesAnalysisTab({ data, isLoading, error, onOpenSettings }: WagesAnalysisTabProps) {
  // Phase 71-06 (S3): track which employee row (if any) is currently expanded
  // to show per-payrun detail underneath. Null = all collapsed.
  const [expandedEmployeeName, setExpandedEmployeeName] = useState<string | null>(null)

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

  // WB.4 — hide employees with nothing this month AND no budget (the sheets
  // hide them rather than delete them: the roster stays stable month to
  // month). An unpaid employee WITH a budget stays visible — a missing person
  // is a real variance, not noise.
  const visibleEmployees = data.employees.filter(
    (e) => e.actual_total !== 0 || e.budget_total !== 0,
  )
  const hiddenCount = data.employees.length - visibleEmployees.length

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
      {visibleEmployees.length > 0 && (
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
                {visibleEmployees.map((emp, idx) => {
                  // Build a map of date → gross for this employee
                  const payByDate: Record<string, number> = {}
                  for (const pr of emp.pay_runs) {
                    if (pr.date) payByDate[pr.date] = (payByDate[pr.date] || 0) + pr.gross_earnings
                  }

                  const isExpanded = expandedEmployeeName === emp.name
                  // colSpan width for the detail row: Employee + pay-run cols + Total + Budget + Var
                  const detailColSpan = 1 + payRunDates.length + 3

                  return (
                    <Fragment key={`${emp.name}-${idx}`}>
                      <tr className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="px-4 py-2 text-sm text-gray-900">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedEmployeeName(prev => (prev === emp.name ? null : emp.name))
                              }
                              aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${emp.name}`}
                              aria-expanded={isExpanded}
                              className="p-1 -m-1 rounded hover:bg-gray-200 transition-colors"
                            >
                              <ChevronRight
                                className={`w-4 h-4 text-gray-500 transition-transform ${
                                  isExpanded ? 'rotate-90' : ''
                                }`}
                              />
                            </button>
                            <span>{emp.name}</span>
                          </div>
                        </td>
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
                      {isExpanded && (
                        <tr className="bg-gray-50 border-b border-gray-100">
                          <td colSpan={detailColSpan} className="px-0 py-0">
                            <div className="px-4 py-3 sm:px-6">
                              <div className="text-xs font-semibold text-gray-700 mb-2">
                                Pay runs for {emp.name}
                              </div>
                              {emp.pay_runs.length === 0 ? (
                                <p className="text-xs text-gray-500 italic">No pay runs recorded this period.</p>
                              ) : (
                                <ul className="space-y-1">
                                  {emp.pay_runs.map((pr, i) => (
                                    <li
                                      key={`${pr.date}-${i}`}
                                      className="flex justify-between text-sm text-gray-700"
                                    >
                                      <span className="font-mono text-xs sm:text-sm">{pr.date || '—'}</span>
                                      <span className="font-medium">{fmt(pr.gross_earnings)}</span>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
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

      {/* WB.5 — PAY-TIES (warning-only). Value / tie / could-not-check:
          nothing renders when the comparison would be circular or empty. */}
      {data.ties?.comparable && data.ties.within_tolerance && (
        <div className="bg-green-50 rounded-lg p-3 border border-green-200">
          <p className="text-xs text-green-800">
            Payroll ties to the P&amp;L: {fmt(data.ties.payroll_side)} of payslip
            {data.ties.includes_super_account ? ' gross + super' : ' gross'} matches the
            configured wage accounts ({fmt(data.ties.accounts_actual)}) within $1.
          </p>
        </div>
      )}
      {data.ties?.comparable && !data.ties.within_tolerance && (
        <div className="bg-amber-50 rounded-lg p-3 border border-amber-200">
          <p className="text-xs text-amber-800">
            Payroll does not tie to the P&amp;L: payslip
            {data.ties.includes_super_account ? ' gross + super' : ' gross'} is {fmt(data.ties.payroll_side)}
            {' '}vs {fmt(data.ties.accounts_actual)} across the configured wage accounts —
            difference {fmt(data.ties.delta)}. Common causes: period-end accrual journals,
            wages posted to an account not in the Wages settings list, or a pay run paid in
            an adjacent month.
          </p>
        </div>
      )}

      {/* WB.4 — five-Friday phasing note */}
      {data.phasing?.extra_run && (
        <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
          <p className="text-xs text-blue-800">
            {data.phasing.pay_runs_in_month} pay runs fell in this month (typically{' '}
            {data.phasing.typical_runs} for a {data.phasing.calendar_type.toLowerCase()} cycle).
            The extra run inflates wages against a {data.phasing.typical_runs}-run budget —
            a phasing effect, not an overspend.
          </p>
        </div>
      )}

      {hiddenCount > 0 && (
        <p className="text-xs text-gray-400 px-1">
          {hiddenCount} employee{hiddenCount === 1 ? '' : 's'} with no pay and no budget this
          month hidden.
        </p>
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
