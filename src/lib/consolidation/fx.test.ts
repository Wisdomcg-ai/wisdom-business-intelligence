/**
 * FX translation unit tests — Phase 34 plan 34-00c.
 *
 * Exercises pure-math helpers `translatePLAtMonthlyAverage` and
 * `translationDiagnostics`, plus the IICT fixture round-trip.
 *
 * The DB-read function `loadFxRates` is NOT tested here — its real
 * verification lives in the API route integration (plan 34-00e) where a
 * live/mocked Supabase client is available. Keeping this file pure keeps
 * the RED→GREEN TDD cycle fast.
 */

import { describe, it, expect } from 'vitest'
import {
  translatePLAtMonthlyAverage,
  translationDiagnostics,
} from './fx'
import type { XeroPLLineLike } from './types'
import { iictHKPL, HKD_AUD_MONTHLY } from './__fixtures__/iict-mar-2026'

function hkdLine(name: string, values: Record<string, number>): XeroPLLineLike {
  return {
    business_id: 'hk-biz',
    account_name: name,
    account_code: null,
    account_type: 'revenue',
    section: 'Revenue',
    monthly_values: values,
  }
}

describe('translatePLAtMonthlyAverage', () => {
  it('multiplies value by rate for each month', () => {
    const lines = [hkdLine('Sales HK', { '2026-03': 100, '2026-04': 200 })]
    const rates = new Map([
      ['2026-03', 0.1925],
      ['2026-04', 0.193],
    ])
    const { translated, missing } = translatePLAtMonthlyAverage(lines, rates)
    expect(missing).toEqual([])
    expect(translated[0].monthly_values['2026-03']).toBeCloseTo(19.25, 2)
    expect(translated[0].monthly_values['2026-04']).toBeCloseTo(38.6, 2)
  })

  it('does NOT silently default to 1.0 when rate is missing — value preserved + month flagged', () => {
    const lines = [hkdLine('Sales HK', { '2026-03': 100, '2026-04': 200 })]
    const rates = new Map([['2026-03', 0.1925]]) // 2026-04 missing
    const { translated, missing } = translatePLAtMonthlyAverage(lines, rates)
    expect(missing).toEqual(['2026-04'])
    // preserved, NOT 200 × 1.0 silently — the value stays in HKD and caller
    // surfaces the missing month via fx_context.missing_rates[]
    expect(translated[0].monthly_values['2026-04']).toBe(200)
    // And the matched month is still translated correctly
    expect(translated[0].monthly_values['2026-03']).toBeCloseTo(19.25, 2)
  })

  it('deduplicates missing months across multiple lines', () => {
    const lines = [
      hkdLine('Sales HK', { '2026-04': 100 }),
      hkdLine('COGS HK', { '2026-04': 50 }),
    ]
    const rates = new Map<string, number>()
    const { missing } = translatePLAtMonthlyAverage(lines, rates)
    expect(missing).toEqual(['2026-04'])
  })

  it('returns sorted missing months when multiple months lack rates', () => {
    const lines = [
      hkdLine('Sales HK', { '2026-05': 10, '2026-03': 20, '2026-04': 30 }),
    ]
    const rates = new Map<string, number>()
    const { missing } = translatePLAtMonthlyAverage(lines, rates)
    expect(missing).toEqual(['2026-03', '2026-04', '2026-05'])
  })

  it('does NOT fabricate keys not present in source (Pitfall 2)', () => {
    const lines = [hkdLine('Sales HK', { '2026-03': 100 })]
    // Rate exists for a month the line does NOT have — translated result
    // must not invent a new 2026-04 key.
    const rates = new Map([
      ['2026-03', 0.1925],
      ['2026-04', 0.193],
    ])
    const { translated } = translatePLAtMonthlyAverage(lines, rates)
    expect(Object.keys(translated[0].monthly_values)).toEqual(['2026-03'])
  })

  it('handles empty monthly_values input without fabricating keys', () => {
    const lines = [hkdLine('Sales HK', {})]
    const rates = new Map([['2026-03', 0.1925]])
    const { translated, missing } = translatePLAtMonthlyAverage(lines, rates)
    expect(translated[0].monthly_values).toEqual({})
    expect(missing).toEqual([])
  })

  it('translates zero values to zero without marking them missing', () => {
    const lines = [hkdLine('Sales HK', { '2026-03': 0 })]
    const rates = new Map([['2026-03', 0.1925]])
    const { translated, missing } = translatePLAtMonthlyAverage(lines, rates)
    expect(translated[0].monthly_values['2026-03']).toBe(0)
    expect(missing).toEqual([])
  })

  it('preserves non-monthly fields unchanged', () => {
    const lines = [hkdLine('Sales HK', { '2026-03': 100 })]
    lines[0].account_code = 'HK-200'
    const rates = new Map([['2026-03', 0.1925]])
    const { translated } = translatePLAtMonthlyAverage(lines, rates)
    expect(translated[0].account_name).toBe('Sales HK')
    expect(translated[0].account_code).toBe('HK-200')
    expect(translated[0].account_type).toBe('revenue')
    expect(translated[0].section).toBe('Revenue')
    expect(translated[0].business_id).toBe('hk-biz')
  })

  it('does not mutate input lines (pure function)', () => {
    const original = hkdLine('Sales HK', { '2026-03': 100 })
    const snapshot = JSON.stringify(original)
    const rates = new Map([['2026-03', 0.1925]])
    translatePLAtMonthlyAverage([original], rates)
    expect(JSON.stringify(original)).toBe(snapshot)
  })
})

describe('IICT fixture round-trip — HKD × 0.1925 → AUD', () => {
  it('translates iictHKPL at 2026-03 rate from HKD_AUD_MONTHLY', () => {
    const rates = new Map(Object.entries(HKD_AUD_MONTHLY))
    const { translated, missing } = translatePLAtMonthlyAverage(iictHKPL, rates)
    expect(missing.length).toBe(0)
    // Spot check: every HK line's 2026-03 value × 0.1925 should match translated.
    for (let i = 0; i < iictHKPL.length; i++) {
      const hkVal = iictHKPL[i].monthly_values['2026-03'] ?? 0
      const audVal = translated[i].monthly_values['2026-03'] ?? 0
      expect(audVal).toBeCloseTo(hkVal * HKD_AUD_MONTHLY['2026-03'], 2)
    }
  })
})

describe('translationDiagnostics', () => {
  it('packages rates_used and missing_rates by currency pair', () => {
    const d = translationDiagnostics([
      {
        currencyPair: 'HKD/AUD',
        rates: new Map([['2026-03', 0.1925]]),
        missing: ['2026-04'],
      },
    ])
    expect(d.rates_used['HKD/AUD::2026-03']).toBe(0.1925)
    expect(d.missing_rates).toEqual([
      { currency_pair: 'HKD/AUD', period: '2026-04' },
    ])
  })

  it('merges rates_used across multiple currency pairs', () => {
    const d = translationDiagnostics([
      {
        currencyPair: 'HKD/AUD',
        rates: new Map([['2026-03', 0.1925]]),
        missing: [],
      },
      {
        currencyPair: 'NZD/AUD',
        rates: new Map([['2026-03', 0.92]]),
        missing: ['2026-04'],
      },
    ])
    expect(d.rates_used['HKD/AUD::2026-03']).toBe(0.1925)
    expect(d.rates_used['NZD/AUD::2026-03']).toBe(0.92)
    expect(d.missing_rates).toEqual([
      { currency_pair: 'NZD/AUD', period: '2026-04' },
    ])
  })

  it('returns empty sections when no translations supplied', () => {
    const d = translationDiagnostics([])
    expect(d.rates_used).toEqual({})
    expect(d.missing_rates).toEqual([])
  })
})
