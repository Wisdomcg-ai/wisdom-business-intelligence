'use client'

/**
 * ConsolidatedPLTab — renders per-tenant Actual + Budget + Variance columns
 * plus a consolidated Actual + Budget + Variance ($) + Variance (%) column.
 *
 * Layout matches Matt's Dragon Consolidation PDF page 2 ("Actual vs Budget —
 * DRAGON CONSOLIDATION"):
 *   | Account |
 *   |  Tenant A: Actual | Budget | Var $ |
 *   |  Tenant B: Actual | Budget | Var $ |
 *   |  Eliminations |
 *   |  Consolidated: Actual | Budget | Var $ | Var % |
 *
 * Desktop: sticky Account column (left) + sticky Consolidated columns (right),
 * horizontal scroll for middle columns. Mobile: only Consolidated group
 * visible by default; toggle pills reveal one tenant's triplet at a time.
 *
 * Phase 34.3 note: budget values come from `byTenant[].budgetLines` and
 * `consolidated.budgetLines`. When a tenant has no budget the Budget + Variance
 * cells render as em-dash and the header shows a subtle "(no budget)" hint.
 */

import { Fragment, useState } from 'react'
import { AlertTriangle } from 'lucide-react'

interface ForecastLineVM {
  account_type: string
  account_name: string
  monthly_values: Record<string, number>
}

interface EntityColumnVM {
  connection_id: string
  tenant_id: string
  display_name: string
  display_order: number
  functional_currency: string
  lines: Array<{
    account_type: string
    account_name: string
    monthly_values: Record<string, number>
  }>
  budgetLines?: ForecastLineVM[]
}

interface EliminationEntryVM {
  rule_id: string
  rule_description: string
  account_type: string
  account_name: string
  amount: number
  source_tenant_id: string
  source_amount: number
}

interface ConsolidatedReportVM {
  business: { id: string; name: string; presentation_currency: string }
  byTenant: EntityColumnVM[]
  eliminations: EliminationEntryVM[]
  consolidated: {
    lines: Array<{
      account_type: string
      account_name: string
      monthly_values: Record<string, number>
    }>
    budgetLines: ForecastLineVM[]
  }
  fx_context: {
    rates_used: Record<string, number>
    missing_rates: Array<{ currency_pair: string; period: string }>
  }
  diagnostics: {
    tenants_loaded: number
    total_lines_processed: number
    eliminations_applied_count: number
    eliminations_total_amount: number
    processing_ms: number
    tenants_with_budget: number
    tenants_without_budget: string[]
  }
}

function fmt(value: number | null, opts: { dash?: boolean } = {}): string {
  if (value === null || (opts.dash && value === 0)) return '—'
  const abs = Math.abs(value)
  const formatted = abs.toLocaleString('en-AU', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })
  return value < 0 ? `-$${formatted}` : `$${formatted}`
}

function fmtPercent(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—'
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`
}

function alignmentKey(line: { account_type: string; account_name: string }) {
  return `${line.account_type.toLowerCase().trim()}::${line.account_name.toLowerCase().trim()}`
}

interface Props {
  report: ConsolidatedReportVM | null
  reportMonth: string // 'YYYY-MM'
  isLoading: boolean
  error: string | null
}

export default function ConsolidatedPLTab({
  report,
  reportMonth,
  isLoading,
  error,
}: Props) {
  // Mobile: which tenant's triplet is visible. Consolidated group always visible.
  const [activeEntityIdx, setActiveEntityIdx] = useState(0)

  if (isLoading) {
    return (
      <div className="p-8 text-center text-gray-500">
        Loading consolidated report…
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
  if (!report) {
    return (
      <div className="p-8 text-center text-gray-500">
        Select a month to generate the consolidated report.
      </div>
    )
  }

  // Defensive defaults — older API payloads may not ship budgetLines yet.
  const budgetLines = report.consolidated.budgetLines ?? []
  const tenantsWithoutBudget = report.diagnostics.tenants_without_budget ?? []

  // Index budgets by alignment key for O(1) lookup
  const budgetByKey = new Map<string, ForecastLineVM>()
  for (const b of budgetLines) budgetByKey.set(alignmentKey(b), b)

  // Per-tenant budget lookup: tenant_id → (key → row)
  const tenantBudgetIndex = new Map<string, Map<string, ForecastLineVM>>()
  for (const col of report.byTenant) {
    const m = new Map<string, ForecastLineVM>()
    for (const b of col.budgetLines ?? []) m.set(alignmentKey(b), b)
    tenantBudgetIndex.set(col.tenant_id, m)
  }

  // Aggregate eliminations by alignment key for per-row lookup
  const elimsByKey = new Map<string, number>()
  for (const e of report.eliminations) {
    const k = alignmentKey(e)
    elimsByKey.set(k, (elimsByKey.get(k) ?? 0) + e.amount)
  }

  // Build display rows from consolidated.lines (canonical order).
  const rows = report.consolidated.lines.map((l) => {
    const key = alignmentKey(l)
    const tenantCells = report.byTenant.map((col) => {
      const actualLine = col.lines.find((el) => alignmentKey(el) === key)
      const actual = actualLine?.monthly_values[reportMonth] ?? 0
      const hasBudget = col.budgetLines != null
      const budgetLine = hasBudget
        ? tenantBudgetIndex.get(col.tenant_id)?.get(key)
        : undefined
      const budget = budgetLine?.monthly_values[reportMonth] ?? 0
      const variance = actual - budget
      return {
        actual,
        budget,
        variance,
        hasBudget,
      }
    })
    const elim = elimsByKey.get(key) ?? 0
    const consolidatedActual = l.monthly_values[reportMonth] ?? 0
    const consolidatedBudget =
      budgetByKey.get(key)?.monthly_values[reportMonth] ?? 0
    const consolidatedVariance = consolidatedActual - consolidatedBudget
    const consolidatedVariancePct =
      consolidatedBudget !== 0
        ? (consolidatedVariance / Math.abs(consolidatedBudget)) * 100
        : null
    return {
      accountType: l.account_type,
      accountName: l.account_name,
      tenantCells,
      elim,
      consolidatedActual,
      consolidatedBudget,
      consolidatedVariance,
      consolidatedVariancePct,
    }
  })

  const hasAnyBudget = report.byTenant.some((c) => c.budgetLines != null)

  return (
    <div className="space-y-4 bg-white rounded-lg shadow-sm p-4">
      {/* No-budget warning banner — surfaces tenants missing a forecast for this FY */}
      {tenantsWithoutBudget.length > 0 && (
        <div className="p-3 rounded-lg border border-amber-200 bg-amber-50 text-xs text-amber-800 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            {tenantsWithoutBudget.length} tenant
            {tenantsWithoutBudget.length === 1 ? ' has' : 's have'} no budget
            for this fiscal year — their Budget + Variance cells show zero
            until a forecast is created and assigned.
          </span>
        </div>
      )}

      {/* Mobile entity toggle pills — reveal one tenant's triplet at a time */}
      <div className="flex gap-2 flex-wrap md:hidden">
        {report.byTenant.map((col, idx) => (
          <button
            key={col.connection_id}
            onClick={() => setActiveEntityIdx(idx)}
            className={`px-3 py-1 text-sm rounded-full ${
              activeEntityIdx === idx
                ? 'bg-brand-orange text-white'
                : 'bg-gray-100 text-gray-700'
            }`}
          >
            {col.display_name}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto border rounded-lg">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 border-b">
            {/* Row 1: tenant-name group header + consolidated group header */}
            <tr>
              <th
                rowSpan={2}
                className="sticky left-0 z-10 bg-gray-50 text-left px-4 py-2 whitespace-nowrap align-bottom"
              >
                Account
              </th>
              {report.byTenant.map((col, idx) => (
                <th
                  key={col.connection_id}
                  colSpan={3}
                  className={`text-center px-4 py-2 border-l whitespace-nowrap ${
                    idx === activeEntityIdx ? '' : 'hidden md:table-cell'
                  }`}
                >
                  {col.display_name}
                  {col.functional_currency !==
                    report.business.presentation_currency && (
                    <span className="block text-[10px] font-normal text-gray-500">
                      ({col.functional_currency}→
                      {report.business.presentation_currency})
                    </span>
                  )}
                  {col.budgetLines == null && (
                    <span className="block text-[10px] font-normal text-amber-700">
                      (no budget)
                    </span>
                  )}
                </th>
              ))}
              <th
                rowSpan={2}
                className="text-right px-4 py-2 whitespace-nowrap hidden md:table-cell border-l align-bottom"
              >
                Eliminations
              </th>
              <th
                colSpan={4}
                className="sticky right-0 z-10 bg-gray-50 text-center px-4 py-2 border-l whitespace-nowrap"
              >
                Consolidated
              </th>
            </tr>
            {/* Row 2: Actual / Budget / Var $ subheaders */}
            <tr className="bg-gray-100">
              {report.byTenant.map((col, idx) => (
                <Fragment key={col.connection_id}>
                  <th
                    className={`text-right px-3 py-1 text-[11px] font-medium border-l ${
                      idx === activeEntityIdx ? '' : 'hidden md:table-cell'
                    }`}
                  >
                    Actual
                  </th>
                  <th
                    className={`text-right px-3 py-1 text-[11px] font-medium ${
                      idx === activeEntityIdx ? '' : 'hidden md:table-cell'
                    }`}
                  >
                    Budget
                  </th>
                  <th
                    className={`text-right px-3 py-1 text-[11px] font-medium ${
                      idx === activeEntityIdx ? '' : 'hidden md:table-cell'
                    }`}
                  >
                    Var $
                  </th>
                </Fragment>
              ))}
              <th className="sticky right-0 z-10 bg-gray-100 text-right px-3 py-1 text-[11px] font-medium border-l">
                Actual
              </th>
              <th className="sticky right-0 z-10 bg-gray-100 text-right px-3 py-1 text-[11px] font-medium">
                Budget
              </th>
              <th className="sticky right-0 z-10 bg-gray-100 text-right px-3 py-1 text-[11px] font-medium">
                Var $
              </th>
              <th className="sticky right-0 z-10 bg-gray-100 text-right px-3 py-1 text-[11px] font-medium">
                Var %
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b hover:bg-gray-50">
                <td className="sticky left-0 z-10 bg-white px-4 py-2 whitespace-nowrap">
                  {r.accountName}
                </td>
                {r.tenantCells.map((cell, idx) => (
                  <Fragment key={idx}>
                    <td
                      className={`text-right tabular-nums px-3 py-2 border-l ${
                        idx === activeEntityIdx ? '' : 'hidden md:table-cell'
                      } ${cell.actual < 0 ? 'text-red-600' : 'text-gray-900'}`}
                    >
                      {fmt(cell.actual, { dash: true })}
                    </td>
                    <td
                      className={`text-right tabular-nums px-3 py-2 ${
                        idx === activeEntityIdx ? '' : 'hidden md:table-cell'
                      } ${
                        !cell.hasBudget
                          ? 'text-gray-300'
                          : cell.budget < 0
                            ? 'text-red-600'
                            : 'text-gray-700'
                      }`}
                    >
                      {cell.hasBudget ? fmt(cell.budget, { dash: true }) : '—'}
                    </td>
                    <td
                      className={`text-right tabular-nums px-3 py-2 ${
                        idx === activeEntityIdx ? '' : 'hidden md:table-cell'
                      } ${
                        !cell.hasBudget
                          ? 'text-gray-300'
                          : cell.variance < 0
                            ? 'text-red-600'
                            : cell.variance > 0
                              ? 'text-green-700'
                              : 'text-gray-500'
                      }`}
                    >
                      {cell.hasBudget
                        ? fmt(cell.variance, { dash: true })
                        : '—'}
                    </td>
                  </Fragment>
                ))}
                <td
                  className={`text-right tabular-nums px-3 py-2 hidden md:table-cell border-l ${
                    r.elim < 0 ? 'text-red-600' : 'text-gray-900'
                  }`}
                >
                  {fmt(r.elim, { dash: true })}
                </td>
                <td
                  className={`sticky right-0 z-10 bg-white text-right tabular-nums px-3 py-2 font-semibold border-l ${
                    r.consolidatedActual < 0 ? 'text-red-600' : 'text-gray-900'
                  }`}
                >
                  {fmt(r.consolidatedActual, { dash: true })}
                </td>
                <td
                  className={`sticky right-0 z-10 bg-white text-right tabular-nums px-3 py-2 ${
                    !hasAnyBudget
                      ? 'text-gray-300'
                      : r.consolidatedBudget < 0
                        ? 'text-red-600'
                        : 'text-gray-700'
                  }`}
                >
                  {hasAnyBudget
                    ? fmt(r.consolidatedBudget, { dash: true })
                    : '—'}
                </td>
                <td
                  className={`sticky right-0 z-10 bg-white text-right tabular-nums px-3 py-2 ${
                    !hasAnyBudget
                      ? 'text-gray-300'
                      : r.consolidatedVariance < 0
                        ? 'text-red-600'
                        : r.consolidatedVariance > 0
                          ? 'text-green-700'
                          : 'text-gray-500'
                  }`}
                >
                  {hasAnyBudget
                    ? fmt(r.consolidatedVariance, { dash: true })
                    : '—'}
                </td>
                <td
                  className={`sticky right-0 z-10 bg-white text-right tabular-nums px-3 py-2 ${
                    r.consolidatedVariancePct === null
                      ? 'text-gray-300'
                      : r.consolidatedVariancePct < 0
                        ? 'text-red-600'
                        : r.consolidatedVariancePct > 0
                          ? 'text-green-700'
                          : 'text-gray-500'
                  }`}
                >
                  {fmtPercent(r.consolidatedVariancePct)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Eliminations diagnostic panel — surfaces which rules fired and
          their source amounts. Critical for the coach audit flow. */}
      {report.eliminations.length > 0 && (
        <details className="border rounded-lg p-4 bg-gray-50">
          <summary className="cursor-pointer text-sm font-medium text-gray-700">
            View eliminations applied (
            {report.diagnostics.eliminations_applied_count} entries, total{' '}
            {fmt(report.diagnostics.eliminations_total_amount)})
          </summary>
          <ul className="mt-3 space-y-1 text-xs text-gray-600">
            {report.eliminations.map((e, i) => (
              <li key={i}>
                <span className="font-medium">{e.rule_description}</span> —{' '}
                {e.account_name}: source {fmt(e.source_amount)}, elimination{' '}
                {fmt(e.amount)}
              </li>
            ))}
          </ul>
        </details>
      )}

      {/* Diagnostics footer — tenants loaded, budget coverage, lines processed. */}
      <div className="text-xs text-gray-500">
        Tenants loaded: {report.diagnostics.tenants_loaded} · With budget:{' '}
        {report.diagnostics.tenants_with_budget}/
        {report.diagnostics.tenants_loaded} · Lines processed:{' '}
        {report.diagnostics.total_lines_processed} · Processing:{' '}
        {report.diagnostics.processing_ms}ms
      </div>
    </div>
  )
}
