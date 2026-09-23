/**
 * An ad-hoc OpEx line is charged its expectedAnnualAmount once per YEAR, and a
 * forecast that starts mid-year does not change that.
 *
 * Dragon Roofing FY2027 (diagnostic, 23 Sep 2026): the window runs
 * 2026-08→2027-06 because July had closed, and the ad-hoc branch divided the
 * annual amount by the ELEVEN months of the window. The stored row kept July's
 * value from the earlier full-year materialization, so a recompute that was
 * meant to retire one removed line would also have lifted 23 ad-hoc lines to
 * 13/12 of their annual figure — +$108,710 of OpEx, against a wizard summary
 * that still charged each line its annual amount once.
 *
 * The fence: the year's twelve months price the line; the window's months are
 * merely the ones written.
 */
import { describe, it, expect } from 'vitest'
import { convertAssumptionsToPLLines, type ConvertContext } from '../assumptions-to-pl-lines'
import type { ForecastAssumptions } from '../../components/wizard-v4/types/assumptions'
import type { PLLine } from '../../types'

const FY = 2027 // Jul 2026 – Jun 2027
const ANNUAL = 29_145.60
const PER_MONTH = 2_428.80 // ANNUAL / 12 — what the summary implies

function fyMonths(startYear = 2026): string[] {
  const keys: string[] = []
  let y = startYear, m = 7
  for (let i = 0; i < 12; i++) {
    keys.push(`${y}-${String(m).padStart(2, '0')}`)
    m++
    if (m > 12) { m = 1; y++ }
  }
  return keys
}

function assumptionsWithAdhoc(
  overrides: Partial<{ expectedAnnualAmount: number; expectedMonths: string[] }> = {},
): ForecastAssumptions {
  return {
    version: 1,
    createdAt: '2026-09-23T00:00:00Z',
    updatedAt: '2026-09-23T00:00:00Z',
    fiscalYearStart: '07',
    revenue: { lines: [], seasonalityPattern: Array(12).fill(100 / 12), seasonalitySource: 'manual' },
    cogs: { lines: [] },
    team: {
      existingTeam: [], plannedHires: [], superannuationPct: 12,
      workCoverPct: 0, payrollTaxPct: 0, payrollTaxThreshold: 1_200_000,
    },
    opex: {
      lines: [{
        accountId: 'opex-8',
        accountName: 'Legal expenses',
        priorYearTotal: ANNUAL,
        costBehavior: 'adhoc',
        expectedAnnualAmount: overrides.expectedAnnualAmount ?? ANNUAL,
        ...(overrides.expectedMonths ? { expectedMonths: overrides.expectedMonths } : {}),
      }],
    },
    capex: { items: [] },
  } as unknown as ForecastAssumptions
}

/** The row as an earlier, full-year materialization left it. */
function existingFullYearLine(perMonth = PER_MONTH): PLLine {
  const forecast_months: Record<string, number> = {}
  for (const mk of fyMonths()) forecast_months[mk] = perMonth
  return {
    id: 'line-legal',
    account_name: 'Legal expenses',
    account_code: 'opex-8',
    category: 'Operating Expenses',
    sort_order: 8,
    actual_months: {},
    forecast_months,
    is_manual: false,
    is_from_xero: false,
  } as unknown as PLLine
}

function ctx(
  assumptions: ForecastAssumptions,
  startMonth: string,
  endMonth: string,
  existingLines: PLLine[] = [],
  duration = 1,
): ConvertContext {
  return {
    assumptions,
    forecastStartMonth: startMonth,
    forecastEndMonth: endMonth,
    fiscalYear: FY,
    forecastDuration: duration,
    existingLines,
  }
}

const legalOf = (lines: ReturnType<typeof convertAssumptionsToPLLines>) =>
  lines.find(l => l.account_name === 'Legal expenses')!

const total = (m: Record<string, number>, keys: string[]) =>
  Math.round(keys.reduce((s, k) => s + (m[k] ?? 0), 0) * 100) / 100

describe('ad-hoc OpEx prices the year, not the window', () => {
  it('a window that starts mid-year still charges the annual amount across twelve months', () => {
    const out = convertAssumptionsToPLLines(
      ctx(assumptionsWithAdhoc(), '2026-08', '2027-06', [existingFullYearLine()]),
    )
    const legal = legalOf(out)

    // Every month the window covers carries a TWELFTH of the year.
    expect(legal.forecast_months['2026-08']).toBe(PER_MONTH)
    expect(legal.forecast_months['2027-06']).toBe(PER_MONTH)

    // The closed month is left exactly as it was found.
    expect(legal.forecast_months['2026-07']).toBe(PER_MONTH)

    // And so the fiscal year still totals the annual amount the wizard
    // summary charges — the parity that the 11-month division broke.
    expect(total(legal.forecast_months, fyMonths())).toBe(ANNUAL)
  })

  it('selected months are counted across the whole year, including closed ones', () => {
    // $12,000 expected in July and October. July has closed; the October
    // instalment is still $6,000, not the whole $12,000.
    const out = convertAssumptionsToPLLines(
      ctx(
        assumptionsWithAdhoc({ expectedAnnualAmount: 12_000, expectedMonths: ['2026-07', '2026-10'] }),
        '2026-08',
        '2027-06',
        [existingFullYearLine(1_000)],
      ),
    )
    const legal = legalOf(out)

    expect(legal.forecast_months['2026-10']).toBe(6_000)
    expect(legal.forecast_months['2026-09']).toBe(0)
    expect(legal.forecast_months['2026-07']).toBe(1_000) // untouched, outside the window
  })

  it('a full-year window is unchanged — every month gets a twelfth', () => {
    const out = convertAssumptionsToPLLines(
      ctx(assumptionsWithAdhoc(), '2026-07', '2027-06', [existingFullYearLine()]),
    )
    const legal = legalOf(out)

    for (const mk of fyMonths()) expect(legal.forecast_months[mk]).toBe(PER_MONTH)
    expect(total(legal.forecast_months, fyMonths())).toBe(ANNUAL)
  })

  it('year 2 of a mid-year forecast is charged the annual amount as well', () => {
    const out = convertAssumptionsToPLLines(
      ctx(assumptionsWithAdhoc(), '2026-08', '2028-06', [existingFullYearLine()], 2),
    )
    const legal = legalOf(out)

    // Year 2 is a whole year inside the window, so it must total the annual
    // amount on its own.
    expect(total(legal.forecast_months, fyMonths(2027))).toBe(ANNUAL)
    expect(legal.forecast_months['2027-07']).toBe(PER_MONTH)
  })
})
