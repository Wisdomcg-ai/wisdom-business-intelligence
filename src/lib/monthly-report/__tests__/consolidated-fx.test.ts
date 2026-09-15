/**
 * The months a consolidated pack needs a rate for, and the sentence that
 * names them (IICT-04, IICT-05, IICT-62).
 */
import { describe, it, expect } from 'vitest'
import { describeMissingRates, missingRatesForReport, reportedFxMonths } from '../consolidated-fx'

const FY27 = ['2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12', '2027-01', '2027-02', '2027-03', '2027-04', '2027-05', '2027-06']

describe('reportedFxMonths', () => {
  it('is the fiscal year up to and including the report month', () => {
    expect(reportedFxMonths(FY27, '2026-08')).toEqual(['2026-07', '2026-08'])
    expect(reportedFxMonths(FY27, '2027-06')).toEqual(FY27)
  })
})

describe('missingRatesForReport', () => {
  it('drops months after the report month, dedupes, and orders by month', () => {
    expect(missingRatesForReport([
      { currency_pair: 'HKD/AUD', period: '2026-09' },
      { currency_pair: 'HKD/AUD', period: '2026-08' },
      { currency_pair: 'HKD/AUD', period: '2026-07' },
      { currency_pair: 'HKD/AUD', period: '2026-08' },
    ], '2026-08')).toEqual([
      { currency_pair: 'HKD/AUD', period: '2026-07' },
      { currency_pair: 'HKD/AUD', period: '2026-08' },
    ])
  })

  it('reads a date-shaped period as its month', () => {
    expect(missingRatesForReport([{ currency_pair: 'HKD/AUD', period: '2026-08-01' }], '2026-08')).toEqual([{ currency_pair: 'HKD/AUD', period: '2026-08' }])
  })

  it('nothing missing, or no list, is empty', () => {
    expect(missingRatesForReport([], '2026-08')).toEqual([])
    expect(missingRatesForReport(undefined, '2026-08')).toEqual([])
  })
})

describe('describeMissingRates', () => {
  it('names every month of every pair', () => {
    expect(describeMissingRates([{ currency_pair: 'HKD/AUD', period: '2026-08' }])).toBe('no HKD/AUD exchange rate is stored for Aug 2026')
    expect(describeMissingRates([
      { currency_pair: 'HKD/AUD', period: '2026-06' },
      { currency_pair: 'HKD/AUD', period: '2026-07' },
      { currency_pair: 'HKD/AUD', period: '2026-08' },
    ])).toBe('no HKD/AUD exchange rate is stored for Jun 2026, Jul 2026 and Aug 2026')
    expect(describeMissingRates([
      { currency_pair: 'HKD/AUD', period: '2026-08' },
      { currency_pair: 'USD/AUD', period: '2026-08' },
    ])).toBe('no HKD/AUD exchange rate is stored for Aug 2026; no USD/AUD exchange rate is stored for Aug 2026')
  })
})
