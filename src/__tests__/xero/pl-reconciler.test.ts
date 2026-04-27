/**
 * Phase 44 Plan 44-03 (RED → GREEN) — fills bodies for the it.todo
 * scaffold from 44-01.  Covers D-08.
 *
 * Test names anchored to 44-VALIDATION.md and MUST stay verbatim so
 * `vitest -t '<name>'` filters resolve.
 */
import { describe, it, expect } from 'vitest'
import jdsFY26 from './fixtures/jds-fy26.json'
import jdsReconciler from './fixtures/jds-fy26-reconciler.json'
import envisageReconciler from './fixtures/envisage-fy26-reconciler.json'
import {
  reconcilePL,
  parseFYTotalResponse,
} from '@/lib/xero/pl-reconciler'
import { parsePLByMonth, type ParsedPLRow } from '@/lib/xero/pl-by-month-parser'

describe('PL Reconciler', () => {
  // ────────────────────────────────────────────────────────────────────────
  // D-08: Fail-loud on >$0.01 monthly-vs-FY-total mismatch
  // ────────────────────────────────────────────────────────────────────────
  it('fails loud on $0.01 mismatch', () => {
    // Synthetic: one account "200" with three monthly amounts summing
    // to $99.98. FY total claims $100.00 → diff $0.02 → mismatch.
    const monthlyRows: ParsedPLRow[] = [
      {
        account_code: '200',
        account_name: 'Sales',
        account_type: 'revenue',
        period_month: '2025-07-01',
        amount: 33.33,
      },
      {
        account_code: '200',
        account_name: 'Sales',
        account_type: 'revenue',
        period_month: '2025-08-01',
        amount: 33.33,
      },
      {
        account_code: '200',
        account_name: 'Sales',
        account_type: 'revenue',
        period_month: '2025-09-01',
        amount: 33.32,
      },
    ]
    const fyTotals: Record<string, number> = { '200': 100.0 }

    const result = reconcilePL(monthlyRows, fyTotals, 0.01)
    expect(result.status).toBe('mismatch')
    expect(result.tolerance).toBe(0.01)
    expect(result.discrepancies).toHaveLength(1)
    const d = result.discrepancies[0]!
    expect(d.account_code).toBe('200')
    expect(d.account_name).toBe('Sales')
    expect(d.monthly_sum).toBeCloseTo(99.98, 2)
    expect(d.fy_total).toBe(100.0)
    expect(Math.abs(d.diff)).toBeCloseTo(0.02, 2)
  })

  // ────────────────────────────────────────────────────────────────────────
  // D-08: Tolerance — sub-cent diffs are OK
  // ────────────────────────────────────────────────────────────────────────
  it('tolerance', () => {
    // Largest diff is $0.005 → within $0.01 tolerance → status='ok'.
    const monthlyRows: ParsedPLRow[] = [
      {
        account_code: '300',
        account_name: 'Cost of Goods',
        account_type: 'cogs',
        period_month: '2025-07-01',
        amount: 50.001,
      },
      {
        account_code: '300',
        account_name: 'Cost of Goods',
        account_type: 'cogs',
        period_month: '2025-08-01',
        amount: 49.994,
      },
    ]
    const fyTotals: Record<string, number> = { '300': 100.0 } // diff = 0.005

    const result = reconcilePL(monthlyRows, fyTotals, 0.01)
    expect(result.status).toBe('ok')
    expect(result.discrepancies).toEqual([])
    expect(result.tolerance).toBe(0.01)
  })

  // ────────────────────────────────────────────────────────────────────────
  // D-08: Reconciles JDS happy path (synthetic FY totals derived from rows)
  // ────────────────────────────────────────────────────────────────────────
  // The captured JDS fixtures cover DIFFERENT time windows (the by-month
  // fixture is May 2025–Apr 2026 calendar; the reconciler fixture is
  // FY26 = Jul 2025–Jun 2026), so a direct cross-fixture comparison will
  // legitimately diverge. To prove the reconciler's happy path on real
  // data, we reconcile JDS's parsed rows against THEIR OWN per-account
  // sums — a pure self-consistency check that should always be 'ok'.
  it('reconciles JDS happy path', () => {
    const rows = parsePLByMonth(jdsFY26)
    const fyTotalsByCode: Record<string, number> = {}
    for (const r of rows) {
      const key = r.account_code ?? `NAME:${r.account_name}`
      fyTotalsByCode[key] = (fyTotalsByCode[key] ?? 0) + r.amount
    }
    const result = reconcilePL(rows, fyTotalsByCode, 0.01)
    expect(result.status).toBe('ok')
    expect(result.discrepancies).toHaveLength(0)
  })

  // ────────────────────────────────────────────────────────────────────────
  // D-08: NEVER mutates input rows — replaces sync-all/route.ts:386
  //       silent auto-correct (account.monthly_values[lastMonth] += diff).
  // ────────────────────────────────────────────────────────────────────────
  it('no auto-correct', () => {
    const monthlyRows: ParsedPLRow[] = [
      {
        account_code: '400',
        account_name: 'Rent',
        account_type: 'opex',
        period_month: '2025-07-01',
        amount: 1000.0,
      },
      {
        account_code: '400',
        account_name: 'Rent',
        account_type: 'opex',
        period_month: '2025-08-01',
        amount: 1000.0,
      },
    ]
    // Snapshot the input deeply BEFORE the call.
    const snapshotBefore = JSON.parse(JSON.stringify(monthlyRows))
    const fyTotals: Record<string, number> = { '400': 5000.0 } // huge diff ($3000)

    const result = reconcilePL(monthlyRows, fyTotals, 0.01)
    expect(result.status).toBe('mismatch')
    // The input array MUST be unchanged — no last-month adjustment.
    expect(monthlyRows).toEqual(snapshotBefore)
    // No row's amount should have shifted to absorb the diff.
    expect(monthlyRows[0]!.amount).toBe(1000.0)
    expect(monthlyRows[1]!.amount).toBe(1000.0)
  })

  // ────────────────────────────────────────────────────────────────────────
  // D-08: Per-account discrepancies — two accounts each off by $0.02
  //       MUST produce TWO entries, not one rolled-up aggregate.
  // ────────────────────────────────────────────────────────────────────────
  it('reports per-account discrepancies, not aggregate', () => {
    const monthlyRows: ParsedPLRow[] = [
      {
        account_code: '500',
        account_name: 'Sales',
        account_type: 'revenue',
        period_month: '2025-07-01',
        amount: 99.98,
      },
      {
        account_code: '600',
        account_name: 'Wages',
        account_type: 'opex',
        period_month: '2025-07-01',
        amount: 199.98,
      },
    ]
    const fyTotals: Record<string, number> = {
      '500': 100.0, // diff $0.02
      '600': 200.0, // diff $0.02
    }
    const result = reconcilePL(monthlyRows, fyTotals, 0.01)
    expect(result.status).toBe('mismatch')
    expect(result.discrepancies).toHaveLength(2)
    const codes = new Set(result.discrepancies.map((d) => d.account_code))
    expect(codes).toEqual(new Set(['500', '600']))
  })
})

// parseFYTotalResponse: helper that turns Xero's single-period FY-total
// response into the Record<accountCode, total> map reconcilePL consumes.
describe('parseFYTotalResponse', () => {
  it('extracts per-account totals from a single-period Xero response', () => {
    const totals = parseFYTotalResponse(jdsReconciler)
    // JDS reconciler fixture covers FY26 (1 Jul 2025 – 30 Jun 2026).
    // Per Plan 44-01-SUMMARY: 81 accounts in this FY-total response.
    expect(Object.keys(totals).length).toBe(81)
    // Every value should be a finite number (parsed from "$X.XX" or "(X.XX)").
    for (const v of Object.values(totals)) {
      expect(Number.isFinite(v)).toBe(true)
    }
    // Spot-check shape — Envisage reconciler too, just to prove the
    // helper handles both tenant fixtures.
    const env = parseFYTotalResponse(envisageReconciler)
    expect(Object.keys(env).length).toBeGreaterThan(0)
  })
})
