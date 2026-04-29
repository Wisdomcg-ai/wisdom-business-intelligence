/**
 * Phase 44 Plan 44-03 — Per-account self-consistency reconciler.
 *
 * D-08 contract: assert sum(monthly amounts per account) ≈ single-period
 * FY total per account, within a tolerance ($0.01 default). Fail LOUD on
 * mismatch by reporting EVERY discrepancy individually so the orchestrator
 * (44-04) can surface them on sync_jobs.error.
 *
 * Explicitly replaces the silent auto-correct at sync-all/route.ts line 386
 * (which mutated the last-month amount to absorb any FY-total diff) — that
 * pattern has been masking sparse-tenant bugs and back-dated journals
 * across the prior 24h reactive fix layer.
 *
 * Pure function: NEVER mutates inputs, no I/O, no clock.
 */

import {
  parseAmount,
  type ParsedPLRow,
} from './pl-by-month-parser'

// ─── Types ──────────────────────────────────────────────────────────────────

export type Discrepancy = {
  account_code: string | null
  account_name: string
  monthly_sum: number
  fy_total: number
  diff: number // monthly_sum - fy_total (signed)
}

export type ReconciliationResult = {
  status: 'ok' | 'mismatch'
  discrepancies: Discrepancy[]
  tolerance: number
}

// ─── Reconcile ──────────────────────────────────────────────────────────────

/**
 * Per-account self-consistency check.
 *
 * Groups parsed monthly rows by account_code (or `NAME:<account_name>`
 * when the code is null), sums each group's monthly amounts, and
 * compares to `fyTotals[key]`. Any per-account difference whose
 * absolute value exceeds `tolerance` is reported as a Discrepancy.
 *
 * Tolerance is per-account, NOT aggregated.
 *
 * Does NOT mutate the input rows or the input fyTotals map.
 * Does NOT auto-correct, absorb, or redistribute differences.
 *
 * @param monthlyRows  Output of parsePLByMonth() — long-format rows.
 * @param fyTotals     Map of account-key → authoritative FY total.
 * @param tolerance    Absolute-diff threshold per account. Default $0.01.
 */
export function reconcilePL(
  monthlyRows: ReadonlyArray<ParsedPLRow>,
  fyTotals: Readonly<Record<string, number>>,
  tolerance: number = 0.01,
): ReconciliationResult {
  // 1) Group rows by account-key. Track first-seen account_name for the
  //    discrepancy report. Use plain object as accumulator (avoid Map to
  //    keep semantics obvious in test failure output).
  type Group = {
    account_code: string | null
    account_name: string
    monthly_sum: number
  }
  const groups: Record<string, Group> = {}
  for (const row of monthlyRows) {
    const key = row.account_code ?? `NAME:${row.account_name}`
    let g = groups[key]
    if (!g) {
      g = {
        account_code: row.account_code,
        account_name: row.account_name,
        monthly_sum: 0,
      }
      groups[key] = g
    }
    g.monthly_sum += row.amount
  }

  // 2) Compare each group's monthly_sum to fyTotals[key].
  //    Accounts present in monthly rows but missing from fyTotals are
  //    treated as fy_total = 0 (the reconciler can't validate what it
  //    can't see — surface the gap as a discrepancy if the monthly_sum
  //    is non-trivial).
  const discrepancies: Discrepancy[] = []
  for (const key of Object.keys(groups)) {
    const g = groups[key]!
    // Round monthly_sum to 2 dp BEFORE comparison so floating-point
    // drift across many additions doesn't masquerade as a real
    // discrepancy. (Xero's amounts are themselves cents-precision.)
    const monthlySum = Math.round(g.monthly_sum * 100) / 100
    const fyTotal = fyTotals[key] ?? 0
    const diff = monthlySum - fyTotal
    if (Math.abs(diff) > tolerance) {
      discrepancies.push({
        account_code: g.account_code,
        account_name: g.account_name,
        monthly_sum: monthlySum,
        fy_total: fyTotal,
        diff,
      })
    }
  }

  return {
    status: discrepancies.length === 0 ? 'ok' : 'mismatch',
    discrepancies,
    tolerance,
  }
}

// ─── parseFYTotalResponse ───────────────────────────────────────────────────

type XeroAttribute = { Id?: string; Value?: string }
type XeroCell = { Value?: string; Attributes?: XeroAttribute[] }
type XeroRow = {
  RowType?: string
  Title?: string
  Cells?: XeroCell[]
  Rows?: XeroRow[]
}
type XeroReport = { Rows?: XeroRow[] }

const SUMMARY_ROW_NAMES = new Set([
  'gross profit',
  'net profit',
  'total income',
  'total revenue',
  'total cost of sales',
  'total direct costs',
  'total operating expenses',
  'total expenses',
  'total other income',
  'total other expenses',
  'operating profit',
])

/**
 * Parse Xero's single-period ProfitAndLoss response (no `periods`,
 * no `timeframe` — one totals column per account) into the
 * Record<accountKey, total> map reconcilePL consumes.
 *
 * Account-key strategy mirrors parsePLByMonth + reconcilePL:
 *   - Prefer Xero AccountID from Cells[0].Attributes when present
 *   - Fall back to `NAME:<account_name>` so the reconciler key-map
 *     aligns with the parser's group-key semantics
 *
 * Skips Xero's calculated/summary rows (Gross Profit, Total Income, etc.)
 * for the same reason parsePLByMonth does — they're not real accounts.
 */
export function parseFYTotalResponse(
  report: unknown,
): Record<string, number> {
  const r = report as { Reports?: XeroReport[] } | null
  const top = r?.Reports?.[0]
  if (!top || !Array.isArray(top.Rows)) return {}

  const out: Record<string, number> = {}

  for (const section of top.Rows) {
    if (section.RowType !== 'Section' || !Array.isArray(section.Rows)) continue
    for (const row of section.Rows) {
      if (row.RowType !== 'Row') continue
      const cells = row.Cells
      if (!Array.isArray(cells) || cells.length < 2) continue

      const accountName = (cells[0]?.Value ?? '').trim()
      if (!accountName) continue
      if (SUMMARY_ROW_NAMES.has(accountName.toLowerCase())) continue

      let accountCode: string | null = null
      const attrs = cells[0]?.Attributes
      if (Array.isArray(attrs)) {
        const idAttr = attrs.find((a) => a?.Id === 'account')
        if (idAttr?.Value) accountCode = idAttr.Value
      }
      const key = accountCode ?? `NAME:${accountName}`

      // Single-period response: the account's FY total lives in Cells[1].
      const total = parseAmount(cells[1]?.Value)
      out[key] = total
    }
  }

  return out
}
