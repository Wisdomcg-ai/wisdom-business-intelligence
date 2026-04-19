'use client'

/**
 * ConsolidatedPLTab — renders the per-entity + eliminations + consolidated
 * P&L table for a consolidation group (Phase 34, Iteration 34.0).
 *
 * Layout (matches Dragon + IICT reference PDFs):
 *   | Account | Entity A | Entity B | ...N | Eliminations | Consolidated |
 *
 * Desktop: sticky Account column (left) + sticky Consolidated column (right),
 * horizontal scroll for middle columns. Mobile: one entity column at a time
 * via toggle pills, always show Consolidated.
 *
 * The tab consumes the raw `ConsolidatedReport` payload (via the
 * `useConsolidatedReport` hook) — no adapter needed here; this is the
 * consolidation-native view.
 */

import { useState } from 'react'

// Loose typing — the canonical shape lives in @/lib/consolidation/types. We
// keep the interface in this file so the tab does not import server-only types.
interface EntityColumnVM {
  member_id: string
  business_id: string
  display_name: string
  display_order: number
  functional_currency: string
  lines: Array<{
    account_type: string
    account_name: string
    monthly_values: Record<string, number>
  }>
}

interface EliminationEntryVM {
  rule_id: string
  rule_description: string
  account_type: string
  account_name: string
  amount: number
  source_entity_id: string
  source_amount: number
}

interface ConsolidatedReportVM {
  group: { id: string; name: string; presentation_currency: string }
  byTenant: EntityColumnVM[]
  eliminations: EliminationEntryVM[]
  consolidated: {
    lines: Array<{
      account_type: string
      account_name: string
      monthly_values: Record<string, number>
    }>
  }
  fx_context: {
    rates_used: Record<string, number>
    missing_rates: Array<{ currency_pair: string; period: string }>
  }
  diagnostics: {
    members_loaded: number
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
  // Mobile: active entity column index (desktop ignores this — shows all)
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

  // Aggregate eliminations by alignment key (account_type + normalized name)
  // for quick per-row lookup.
  const elimsByKey = new Map<string, number>()
  for (const e of report.eliminations) {
    const k = alignmentKey(e)
    elimsByKey.set(k, (elimsByKey.get(k) ?? 0) + e.amount)
  }

  // Build display rows: use consolidated.lines as the canonical row order
  // (already sorted by account_type → account_name in the engine).
  const rows = report.consolidated.lines.map((l) => {
    const key = alignmentKey(l)
    const entityValues = report.byTenant.map((col) => {
      const line = col.lines.find((el) => alignmentKey(el) === key)
      return line?.monthly_values[reportMonth] ?? 0
    })
    const elim = elimsByKey.get(key) ?? 0
    const consolidated = l.monthly_values[reportMonth] ?? 0
    return {
      accountType: l.account_type,
      accountName: l.account_name,
      entityValues,
      elim,
      consolidated,
    }
  })

  return (
    <div className="space-y-4 bg-white rounded-lg shadow-sm p-4">
      {/* Mobile entity toggle pills — desktop hides these and shows all columns */}
      <div className="flex gap-2 flex-wrap md:hidden">
        {report.byTenant.map((col, idx) => (
          <button
            key={col.member_id}
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
                  key={col.member_id}
                  className={`text-right px-4 py-2 whitespace-nowrap ${
                    idx === activeEntityIdx ? '' : 'hidden md:table-cell'
                  }`}
                >
                  {col.display_name}
                  {col.functional_currency !==
                    report.group.presentation_currency && (
                    <span className="block text-xs text-gray-500">
                      ({col.functional_currency}→
                      {report.group.presentation_currency})
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
            {rows.map((r, i) => (
              <tr key={i} className="border-b hover:bg-gray-50">
                <td className="sticky left-0 z-10 bg-white px-4 py-2 whitespace-nowrap">
                  {r.accountName}
                </td>
                {r.entityValues.map((v, idx) => (
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
                    r.elim < 0 ? 'text-red-600' : 'text-gray-900'
                  }`}
                >
                  {fmt(r.elim, true)}
                </td>
                <td
                  className={`sticky right-0 z-10 bg-white text-right tabular-nums px-4 py-2 font-semibold ${
                    r.consolidated < 0 ? 'text-red-600' : 'text-gray-900'
                  }`}
                >
                  {fmt(r.consolidated, true)}
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

      {/* Diagnostics footer — members loaded, lines processed, processing time.
          Visible but unobtrusive; helps debug unexpectedly empty consolidations. */}
      <div className="text-xs text-gray-500">
        Members loaded: {report.diagnostics.members_loaded} · Lines processed:{' '}
        {report.diagnostics.total_lines_processed} · Processing:{' '}
        {report.diagnostics.processing_ms}ms
      </div>
    </div>
  )
}
