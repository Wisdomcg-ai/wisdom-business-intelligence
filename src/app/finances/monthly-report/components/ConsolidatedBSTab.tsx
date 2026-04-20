'use client'

/**
 * ConsolidatedBSTab — Phase 34, Iteration 34.1.
 *
 * Renders the per-tenant + eliminations + consolidated Balance Sheet table
 * for a consolidation parent business.
 *
 * Layout:
 *   | Account | Tenant A | Tenant B | ...N | Eliminations | Consolidated |
 *
 * Grouped into three sections: Assets, Liabilities, Equity. Each section
 * shows a subtotal row. The Translation Reserve (CTA) line is rendered as
 * an explicit equity row whenever the engine posts a non-zero residual
 * (AUD-only consolidations skip this entirely).
 *
 * Mirrors ConsolidatedPLTab's structural choices (sticky Account column,
 * sticky Consolidated column, mobile entity toggle pills).
 */

import { useState } from 'react'

// Loose view-model typing — the canonical shape lives in
// @/lib/consolidation/balance-sheet and is intentionally not imported here
// to avoid dragging server-only types into the client bundle.
interface BSEntityColumnVM {
  connection_id: string
  tenant_id: string
  business_id: string
  display_name: string
  display_order: number
  functional_currency: string
  rows: Array<{
    account_type: string
    account_name: string
    section: string
    balance: number
  }>
}

interface BSEliminationEntryVM {
  rule_id: string
  rule_description: string
  account_type: string
  account_name: string
  amount: number
  source_tenant_id: string
  source_amount: number
}

interface ConsolidatedBalanceSheetVM {
  business: { id: string; name: string; presentation_currency: string }
  asOfDate: string
  byTenant: BSEntityColumnVM[]
  eliminations: BSEliminationEntryVM[]
  consolidated: {
    rows: Array<{
      account_type: string
      account_name: string
      section: string
      balance: number
    }>
    translationReserve: number
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
  }
}

function fmt(value: number | null, dash = false): string {
  if (value === null || (dash && value === 0)) return '—'
  const abs = Math.abs(value)
  const formatted = abs.toLocaleString('en-AU', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })
  return value < 0 ? `-$${formatted}` : `$${formatted}`
}

function alignmentKey(row: { account_type: string; account_name: string }) {
  return `${row.account_type.toLowerCase().trim()}::${row.account_name.toLowerCase().trim()}`
}

const SECTION_ORDER: Array<{ key: string; label: string }> = [
  { key: 'asset', label: 'Assets' },
  { key: 'liability', label: 'Liabilities' },
  { key: 'equity', label: 'Equity' },
]

interface Props {
  report: ConsolidatedBalanceSheetVM | null
  isLoading: boolean
  error: string | null
}

export default function ConsolidatedBSTab({ report, isLoading, error }: Props) {
  const [activeEntityIdx, setActiveEntityIdx] = useState(0)

  if (isLoading) {
    return (
      <div className="p-8 text-center text-gray-500">
        Loading consolidated balance sheet…
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
        Select a month to generate the consolidated balance sheet.
      </div>
    )
  }

  // Precompute eliminations by alignment key for per-row lookup.
  const elimsByKey = new Map<string, number>()
  for (const e of report.eliminations) {
    const k = alignmentKey(e)
    elimsByKey.set(k, (elimsByKey.get(k) ?? 0) + e.amount)
  }

  return (
    <div className="space-y-4 bg-white rounded-lg shadow-sm p-4">
      {/* Mobile entity toggle pills */}
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
            <tr>
              <th className="sticky left-0 z-10 bg-gray-50 text-left px-4 py-2 whitespace-nowrap">
                Account
              </th>
              {report.byTenant.map((col, idx) => (
                <th
                  key={col.connection_id}
                  className={`text-right px-4 py-2 whitespace-nowrap ${
                    idx === activeEntityIdx ? '' : 'hidden md:table-cell'
                  }`}
                >
                  {col.display_name}
                  {col.functional_currency !== report.business.presentation_currency && (
                    <span className="block text-xs text-gray-500">
                      ({col.functional_currency}→{report.business.presentation_currency})
                    </span>
                  )}
                </th>
              ))}
              <th className="text-right px-4 py-2 whitespace-nowrap hidden md:table-cell">
                Eliminations
              </th>
              <th className="sticky right-0 z-10 bg-gray-50 text-right px-4 py-2 whitespace-nowrap font-semibold">
                Consolidated
              </th>
            </tr>
          </thead>
          <tbody>
            {SECTION_ORDER.map((sec) => {
              const rowsInSection = report.consolidated.rows.filter(
                (r) => r.account_type === sec.key,
              )
              if (rowsInSection.length === 0) return null

              // Section subtotal across every column
              const entitySubtotals = report.byTenant.map((col) =>
                col.rows
                  .filter((r) => r.account_type === sec.key)
                  .reduce((s, r) => s + r.balance, 0),
              )
              const elimSubtotal = report.eliminations
                .filter((e) => e.account_type === sec.key)
                .reduce((s, e) => s + e.amount, 0)
              const consolidatedSubtotal = rowsInSection.reduce(
                (s, r) => s + r.balance,
                0,
              )

              return (
                <>
                  {/* Section header row */}
                  <tr key={`${sec.key}-header`} className="bg-gray-100/60">
                    <td
                      colSpan={report.byTenant.length + 3}
                      className="px-4 py-2 text-sm font-semibold text-gray-700"
                    >
                      {sec.label}
                    </td>
                  </tr>
                  {/* Line items */}
                  {rowsInSection.map((r, i) => {
                    const key = alignmentKey(r)
                    const entityValues = report.byTenant.map((col) => {
                      const row = col.rows.find(
                        (er) => alignmentKey(er) === key,
                      )
                      return row?.balance ?? 0
                    })
                    const elim = elimsByKey.get(key) ?? 0
                    return (
                      <tr
                        key={`${sec.key}-${i}`}
                        className="border-b hover:bg-gray-50"
                      >
                        <td className="sticky left-0 z-10 bg-white px-4 py-2 whitespace-nowrap pl-6">
                          {r.account_name}
                        </td>
                        {entityValues.map((v, idx) => (
                          <td
                            key={idx}
                            className={`text-right tabular-nums px-4 py-2 ${
                              idx === activeEntityIdx ? '' : 'hidden md:table-cell'
                            } ${v < 0 ? 'text-red-600' : 'text-gray-900'}`}
                          >
                            {fmt(v, true)}
                          </td>
                        ))}
                        <td
                          className={`text-right tabular-nums px-4 py-2 hidden md:table-cell ${
                            elim < 0 ? 'text-red-600' : 'text-gray-900'
                          }`}
                        >
                          {fmt(elim, true)}
                        </td>
                        <td
                          className={`sticky right-0 z-10 bg-white text-right tabular-nums px-4 py-2 font-semibold ${
                            r.balance < 0 ? 'text-red-600' : 'text-gray-900'
                          }`}
                        >
                          {fmt(r.balance, true)}
                        </td>
                      </tr>
                    )
                  })}
                  {/* Section subtotal */}
                  <tr
                    key={`${sec.key}-subtotal`}
                    className="bg-gray-50 border-b font-semibold"
                  >
                    <td className="sticky left-0 z-10 bg-gray-50 px-4 py-2 whitespace-nowrap">
                      Total {sec.label}
                    </td>
                    {entitySubtotals.map((v, idx) => (
                      <td
                        key={idx}
                        className={`text-right tabular-nums px-4 py-2 ${
                          idx === activeEntityIdx ? '' : 'hidden md:table-cell'
                        }`}
                      >
                        {fmt(v)}
                      </td>
                    ))}
                    <td className="text-right tabular-nums px-4 py-2 hidden md:table-cell">
                      {fmt(elimSubtotal, true)}
                    </td>
                    <td className="sticky right-0 z-10 bg-gray-50 text-right tabular-nums px-4 py-2">
                      {fmt(consolidatedSubtotal)}
                    </td>
                  </tr>
                </>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Translation Reserve explicit callout — matches how ConsolidatedPLTab
          surfaces FX context. The CTA line is also in consolidated.rows (under
          Equity), but calling it out here makes the IAS 21 adjustment obvious. */}
      {Math.abs(report.consolidated.translationReserve) > 0.01 && (
        <div className="px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
          <strong>Translation Reserve (CTA):</strong>{' '}
          {fmt(report.consolidated.translationReserve)} — residual absorbed in
          Equity to restore Assets = Liabilities + Equity after FX translation.
        </div>
      )}

      {/* Eliminations diagnostic — lists the intercompany loan rules that fired */}
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

      <div className="text-xs text-gray-500">
        Tenants loaded: {report.diagnostics.tenants_loaded} · Lines processed:{' '}
        {report.diagnostics.total_lines_processed} · Processing:{' '}
        {report.diagnostics.processing_ms}ms · As of: {report.asOfDate}
      </div>
    </div>
  )
}
