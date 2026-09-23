/**
 * FX-01 (26 Aug 2026) — a missing FX rate must never be presented as a number.
 *
 * fx.ts is CORRECT: it refuses to fabricate a 1.0 rate, preserves the native
 * value, and reports the gap. The bug was that the /cfo consumer DROPPED that
 * report — so the dashboard showed IICT Group's HKD revenue summed into AUD at
 * 1:1, ~5.3x overstated, with no warning of any kind, for three months.
 *
 * These tests pin the contract that the gap is reported, and quantify the real
 * production shape so the magnitude can never be dismissed as theoretical.
 */
import { describe, it, expect } from 'vitest'
import { translatePLAtMonthlyAverage, translationDiagnostics } from '@/lib/consolidation/fx'

const line = (monthly: Record<string, number>) =>
  ({
    account_type: 'revenue',
    account_name: 'Membership income',
    monthly_values: monthly,
  }) as never

describe('fx.ts never silently fabricates a rate', () => {
  it('reports the month as missing rather than defaulting to 1.0', () => {
    const { translated, missing } = translatePLAtMonthlyAverage(
      [line({ '2026-07': 4_132_048.36 })],
      new Map(), // no rates at all — the live IICT situation for Jun/Jul/Aug
    )
    expect(missing).toEqual(['2026-07'])
    // Value preserved untranslated — NOT multiplied by a fabricated 1.0, NOT zeroed.
    expect(translated[0].monthly_values['2026-07']).toBe(4_132_048.36)
  })

  it('translates correctly when the rate IS present', () => {
    const { translated, missing } = translatePLAtMonthlyAverage(
      [line({ '2026-05': 1_000_000 })],
      new Map([['2026-05', 0.17759]]),
    )
    expect(missing).toEqual([])
    expect(translated[0].monthly_values['2026-05']).toBeCloseTo(177_590, 0)
  })

  it('a partially-covered range reports only the uncovered months', () => {
    const { missing } = translatePLAtMonthlyAverage(
      [line({ '2026-05': 100, '2026-06': 100, '2026-07': 100 })],
      new Map([['2026-05', 0.17759]]),
    )
    expect(missing).toEqual(['2026-06', '2026-07'])
  })
})

describe('translationDiagnostics surfaces the gap for the UI', () => {
  it('emits one missing_rates entry per uncovered month, tagged with the pair', () => {
    const diag = translationDiagnostics([
      { currencyPair: 'HKD/AUD', rates: new Map(), missing: ['2026-06', '2026-07', '2026-08'] },
    ])
    expect(diag.missing_rates).toEqual([
      { currency_pair: 'HKD/AUD', period: '2026-06' },
      { currency_pair: 'HKD/AUD', period: '2026-07' },
      { currency_pair: 'HKD/AUD', period: '2026-08' },
    ])
  })

  it('reports nothing when every month is covered', () => {
    const diag = translationDiagnostics([
      { currencyPair: 'HKD/AUD', rates: new Map([['2026-05', 0.17759]]), missing: [] },
    ])
    expect(diag.missing_rates).toEqual([])
    expect(diag.rates_used['HKD/AUD::2026-05']).toBe(0.17759)
  })
})

describe('the magnitude this protects against (real IICT July 2026 figures)', () => {
  it('untranslated HKD overstates the AUD total by more than 5x', () => {
    const HKD_REVENUE = 4_132_048.36 // IICT Group Limited, Jul-2026, from prod
    const AUD_REVENUE = 63_423.94 // the two AUD orgs combined
    const RATE = 0.17759 // last known HKD/AUD monthly_average (May 2026)

    const wrongTotal = HKD_REVENUE + AUD_REVENUE // summed at 1:1
    const correctTotal = HKD_REVENUE * RATE + AUD_REVENUE

    expect(wrongTotal / correctTotal).toBeGreaterThan(5)
    expect(wrongTotal - correctTotal).toBeGreaterThan(3_000_000) // >$3.3M phantom revenue
  })
})
