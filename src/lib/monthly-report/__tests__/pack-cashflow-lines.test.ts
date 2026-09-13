/**
 * Urban Road's August pack showed July's Canvas Sales at $371,142 on the
 * cashflow page and $337,402 on the income page — the same month, in the same
 * pack, because the cashflow projected a month that had already happened.
 */
import { describe, it, expect } from 'vitest'
import {
  applyPackOpening, buildPackCashflowLines, packCashflowBasis, packOpeningFromAssumptions,
} from '../pack-cashflow-lines'
import type { OpeningBank } from '../opening-bank'
import type { FullYearReport } from '@/app/finances/monthly-report/types'
import { generateCashflowForecast } from '@/lib/cashflow/engine'
import { FORECAST, baseAssumptions, plLine } from '@/lib/cashflow/__fixtures__/small-business'

const MONTHS = ['2026-07', '2026-08', '2026-09', '2026-10']

function line(name: string, category: string, per: Record<string, { a?: number; b?: number; ap?: number | null }>) {
  return {
    account_name: name,
    category,
    months: MONTHS.map(m => ({
      month: m,
      actual: per[m]?.a ?? 0,
      budget: per[m]?.b ?? 0,
      approved_budget: per[m]?.ap === undefined ? 0 : per[m]!.ap,
      prior_year: 0,
      source: 'actual' as const,
    })),
    projected_total: 0, annual_budget: 0, approved_annual_budget: 0,
    variance_amount: 0, variance_percent: 0,
  }
}

const report = (lines: ReturnType<typeof line>[]): FullYearReport =>
  ({ sections: [{ category: 'Revenue', lines }] } as unknown as FullYearReport)

const CANVAS = line('Canvas Sales', 'Revenue', {
  '2026-07': { a: 337402, b: 371142, ap: 279320 },
  '2026-08': { a: 295827, b: 371142, ap: 279320 },
  '2026-09': { a: 0, b: 384251, ap: 279320 },
  '2026-10': { a: 0, b: 307252, ap: 279320 },
})

describe('buildPackCashflowLines', () => {
  it('puts the banked months in actual_months, where the engine prefers them', () => {
    const { lines } = buildPackCashflowLines(report([CANVAS]), '2026-08')
    expect(lines[0].actual_months).toEqual({ '2026-07': 337402, '2026-08': 295827 })
  })

  it('drives the remaining months off the APPROVED budget', () => {
    const { lines, approvedThroughout } = buildPackCashflowLines(report([CANVAS]), '2026-08')
    expect(lines[0].forecast_months).toEqual({ '2026-09': 279320, '2026-10': 279320 })
    expect(approvedThroughout).toBe(true)
  })

  it('writes a zero actual rather than omitting it', () => {
    // A missing key makes the engine fall through to forecast_months, putting a
    // projection back into a month that has already happened.
    const quiet = line('Materialised', 'Revenue', { '2026-07': { a: 0, b: 450 } })
    const { lines } = buildPackCashflowLines(report([quiet]), '2026-07')
    expect(lines[0].actual_months['2026-07']).toBe(0)
    expect('2026-07' in lines[0].actual_months).toBe(true)
  })

  it('falls back to the forecast and SAYS so when there is no approved budget', () => {
    const noBudget = line('Services', 'Revenue', {
      '2026-08': { a: 4200, ap: null },
      '2026-09': { b: 5000, ap: null },
    })
    const built = buildPackCashflowLines(report([noBudget]), '2026-08')
    expect(built.lines[0].forecast_months['2026-09']).toBe(5000)
    expect(built.approvedThroughout).toBe(false)
  })

  it('one account without an approved budget is enough to change the label', () => {
    const built = buildPackCashflowLines(
      report([CANVAS, line('Services', 'Revenue', { '2026-09': { b: 5000, ap: null } })]),
      '2026-08',
    )
    expect(built.approvedThroughout).toBe(false)
  })

  it('reports the split it made', () => {
    const built = buildPackCashflowLines(report([CANVAS]), '2026-08')
    expect(built.actualMonths).toEqual(['2026-07', '2026-08'])
    expect(built.budgetMonths).toEqual(['2026-09', '2026-10'])
  })

  it('treats the report month itself as an actual, never as a forecast', () => {
    const built = buildPackCashflowLines(report([CANVAS]), '2026-08')
    expect(built.actualMonths).toContain('2026-08')
    expect(built.budgetMonths).not.toContain('2026-08')
  })

  it('returns nothing, safely, when there is no full-year report', () => {
    expect(buildPackCashflowLines(null, '2026-08').lines).toEqual([])
    expect(buildPackCashflowLines(undefined, '2026-08').lines).toEqual([])
    expect(buildPackCashflowLines(report([CANVAS]), '').lines).toEqual([])
  })

  it('is not vacuously "approved" when nothing is forecast at all', () => {
    // Every month banked: the page has nothing to say about whose numbers the
    // forecast used, and must not claim the approved budget.
    const built = buildPackCashflowLines(report([CANVAS]), '2026-12')
    expect(built.budgetMonths).toEqual([])
    expect(built.approvedThroughout).toBe(false)
  })
})

describe('packCashflowBasis', () => {
  const fmt = (m: string) => ({ '2026-07': 'Jul 2026', '2026-08': 'Aug 2026', '2026-09': 'Sep 2026', '2026-10': 'Oct 2026' }[m] ?? m)

  it('names both halves of the row', () => {
    const built = buildPackCashflowLines(report([CANVAS]), '2026-08')
    expect(packCashflowBasis(built, fmt))
      .toBe('Actuals Jul 2026 to Aug 2026 · approved budget Sep 2026 to Oct 2026')
  })

  it('says forecast when that is what it used', () => {
    const built = buildPackCashflowLines(
      report([line('Services', 'Revenue', { '2026-08': { a: 1 }, '2026-09': { b: 2, ap: null } })]),
      '2026-08',
    )
    expect(packCashflowBasis(built, fmt)).toContain('forecast Sep 2026')
  })

  it('does not say "to" when a half is a single month', () => {
    // A two-month line, so each half really is one month.
    const short = {
      account_name: 'X', category: 'Revenue',
      months: [
        { month: '2026-07', actual: 1, budget: 0, approved_budget: 0, prior_year: 0, source: 'actual' as const },
        { month: '2026-08', actual: 0, budget: 0, approved_budget: 2, prior_year: 0, source: 'forecast' as const },
      ],
      projected_total: 0, annual_budget: 0, approved_annual_budget: 0,
      variance_amount: 0, variance_percent: 0,
    }
    const built = buildPackCashflowLines(report([short as never]), '2026-07')
    expect(packCashflowBasis(built, fmt)).toBe('Actuals for Jul 2026 · approved budget for Aug 2026')
  })

  it('says nothing when there is nothing to say', () => {
    expect(packCashflowBasis(buildPackCashflowLines(null, '2026-08'), fmt)).toBeNull()
  })

  it('still says the opening is unavailable on the fallback path with no months', () => {
    // No Full Year report → the page runs on the forecast's own lines and the
    // composed split is empty. That is exactly where a $0 opening would pass
    // for a real one if the sentence vanished with the months.
    expect(packCashflowBasis(buildPackCashflowLines(null, '2026-08'), fmt, 'unavailable'))
      .toBe('Opening bank balance unavailable — balances start from $0')
  })

  it('still names a read opening on the fallback path', () => {
    expect(packCashflowBasis(buildPackCashflowLines(null, '2026-08'), fmt, { amount: 167629.81, asAt: '2026-06-30' }))
      .toBe('Opening bank $167,630 at 30 Jun 2026')
  })

  it('names the opening bank balance and the date it was read at', () => {
    const built = buildPackCashflowLines(report([CANVAS]), '2026-08')
    expect(packCashflowBasis(built, fmt, { amount: 167629.81, asAt: '2026-06-30' }))
      .toBe('Opening bank $167,630 at 30 Jun 2026 · Actuals Jul 2026 to Aug 2026 · approved budget Sep 2026 to Oct 2026')
  })

  it('keeps the sign of an overdrawn opening', () => {
    const built = buildPackCashflowLines(report([CANVAS]), '2026-08')
    expect(packCashflowBasis(built, fmt, { amount: -4200.4, asAt: '2026-06-30' }))
      .toMatch(/^Opening bank -\$4,200 at 30 Jun 2026 · /)
  })

  it('says the opening is unavailable instead of printing a $0-based projection silently', () => {
    const built = buildPackCashflowLines(report([CANVAS]), '2026-08')
    const basis = packCashflowBasis(built, fmt, 'unavailable')!
    expect(basis).toMatch(/^Opening bank balance unavailable/)
    expect(basis).toContain('Actuals Jul 2026 to Aug 2026')
  })
})

describe('applyPackOpening — the pack path', () => {
  // What the forecast module's Xero sync saves for Urban Road, which the pack
  // merges before it runs the engine.
  const SYNCED = baseAssumptions({
    opening_bank_balance: 265684.92,
    balance_date: '2026-07-31',
    opening_trade_debtors: 267324,
    opening_trade_creditors: 478794,
    opening_gst_liability: 28435,
    opening_payg_wh_liability: 16674,
    opening_payg_instalment_liability: 900,
    opening_super_liability: 1260,
    dso_days: 45,
    dpo_days: 60,
  })
  const READ: OpeningBank = { status: 'read', amount: 167629.81, asAt: '2026-06-30' }

  it('replaces the bank with the balance-sheet figure at the day before the year', () => {
    const a = applyPackOpening(SYNCED, READ)
    expect(a.opening_bank_balance).toBe(167629.81)
    expect(a.balance_date).toBe('2026-06-30')
  })

  it('zeroes debtors, creditors, ATO and super, which the actuals already contain', () => {
    const a = applyPackOpening(SYNCED, READ)
    expect(a.opening_trade_debtors).toBe(0)
    expect(a.opening_trade_creditors).toBe(0)
    expect(a.opening_gst_liability).toBe(0)
    expect(a.opening_payg_wh_liability).toBe(0)
    expect(a.opening_payg_instalment_liability).toBe(0)
    expect(a.opening_super_liability).toBe(0)
  })

  it('keeps every other saved setting', () => {
    const a = applyPackOpening(SYNCED, READ)
    expect(a.dso_days).toBe(45)
    expect(a.dpo_days).toBe(60)
    expect(a.gst_reporting_frequency).toBe(SYNCED.gst_reporting_frequency)
  })

  it('an unreadable opening is 0 with NO balance date — a saved sync date cannot vouch for it', () => {
    const a = applyPackOpening(SYNCED, { status: 'unavailable', asAt: '2026-06-30', reason: 'x' })
    expect(a.opening_bank_balance).toBe(0)
    expect(a.balance_date).toBe('')
    expect(packOpeningFromAssumptions(a)).toBe('unavailable')
  })

  it("opens the engine's first month only — a balance for another year is unavailable", () => {
    // Urban Road's FY2027 forecast starts 2026-07: 30 June opens it.
    expect(applyPackOpening(SYNCED, READ, '2026-07').opening_bank_balance).toBe(167629.81)
    // A planning-season forecast starting 2027-07 must not open on 30 Jun 2026.
    const wrongYear = applyPackOpening(SYNCED, READ, '2027-07')
    expect(wrongYear.opening_bank_balance).toBe(0)
    expect(packOpeningFromAssumptions(wrongYear)).toBe('unavailable')
    // The year boundary: 31 Dec opens January.
    expect(applyPackOpening(SYNCED, { status: 'read', amount: 5, asAt: '2025-12-31' }, '2026-01').balance_date)
      .toBe('2025-12-31')
  })

  it('reads back as the opening the basis line names', () => {
    expect(packOpeningFromAssumptions(applyPackOpening(SYNCED, READ)))
      .toEqual({ amount: 167629.81, asAt: '2026-06-30' })
    // A genuinely empty bank that WAS read is $0, not unavailable.
    expect(packOpeningFromAssumptions(applyPackOpening(SYNCED, { status: 'read', amount: 0, asAt: '2026-06-30' })))
      .toEqual({ amount: 0, asAt: '2026-06-30' })
    expect(packOpeningFromAssumptions(null)).toBeUndefined()
  })

  it('the engine opens on the real bank and collects no opening debtors or pays no opening creditors', () => {
    const data = generateCashflowForecast(
      [plLine('Sales', 'Revenue', 10_000)], null, applyPackOpening(SYNCED, READ), FORECAST,
    )
    const first = data.months[0]
    expect(first.bank_at_beginning).toBe(167629.81)
    const labels = [...first.income_lines, ...first.cogs_lines].map(l => l.label)
    expect(labels).not.toContain('Opening Debtors Collected')
    expect(labels).not.toContain('Opening Creditors Paid')

    // The same saved assumptions WITHOUT the pack override double count: a
    // $211k net swing in the first month from balances the actuals already hold.
    const unpatched = generateCashflowForecast([plLine('Sales', 'Revenue', 10_000)], null, SYNCED, FORECAST)
    const unpatchedLabels = [...unpatched.months[0].income_lines, ...unpatched.months[0].cogs_lines].map(l => l.label)
    expect(unpatchedLabels).toContain('Opening Debtors Collected')
    expect(unpatchedLabels).toContain('Opening Creditors Paid')
  })
})
