/**
 * WE.1 — external metrics pure logic.
 *
 * validateValues: named rejects, never silent drops; trims dimension values;
 * defaults scenario to actual. computeExternalTie: same three-state contract
 * as PAY-TIES (comparable:false when either side is zero — render nothing,
 * never a fake tick). sumReconcileMeasure: actuals only, numeric coercion
 * (Supabase returns numerics as strings on some paths).
 */
import { describe, it, expect } from 'vitest'
import {
  validateValues,
  isValidPeriodMonth,
  computeExternalTie,
  sumReconcileMeasure,
} from './external-metrics'

const SERIES = {
  measures: [
    { key: 'revenue', label: 'Revenue' },
    { key: 'hours', label: 'Hours' },
  ],
}

describe('isValidPeriodMonth', () => {
  it('accepts YYYY-MM', () => {
    expect(isValidPeriodMonth('2026-07')).toBe(true)
    expect(isValidPeriodMonth('2026-12')).toBe(true)
    expect(isValidPeriodMonth('2026-01')).toBe(true)
  })
  it('rejects everything else', () => {
    expect(isValidPeriodMonth('2026-13')).toBe(false)
    expect(isValidPeriodMonth('2026-00')).toBe(false)
    expect(isValidPeriodMonth('2026-7')).toBe(false)
    expect(isValidPeriodMonth('2026-07-01')).toBe(false)
    expect(isValidPeriodMonth(null)).toBe(false)
    expect(isValidPeriodMonth(202607)).toBe(false)
  })
})

describe('validateValues', () => {
  it('accepts well-formed rows and trims dimension values', () => {
    const { valid, rejected } = validateValues(SERIES, [
      { dimension_value: '  NDIS Core  ', measure_key: 'revenue', scenario: 'actual', value: 42150.5 },
      { dimension_value: 'NDIS Core', measure_key: 'revenue', scenario: 'budget', value: 40000 },
    ])
    expect(rejected).toHaveLength(0)
    expect(valid).toHaveLength(2)
    expect(valid[0].dimension_value).toBe('NDIS Core')
  })

  it('defaults scenario to actual when omitted', () => {
    const { valid } = validateValues(SERIES, [
      { dimension_value: 'Plan Mgmt', measure_key: 'hours', value: 120 },
    ])
    expect(valid[0].scenario).toBe('actual')
  })

  it('rejects unknown measure keys BY NAME — a typo must be heard, not vanish', () => {
    const { valid, rejected } = validateValues(SERIES, [
      { dimension_value: 'Plan Mgmt', measure_key: 'revenu', scenario: 'actual', value: 100 },
    ])
    expect(valid).toHaveLength(0)
    expect(rejected).toHaveLength(1)
    expect(rejected[0].reason).toContain("'revenu'")
    expect(rejected[0].reason).toContain('revenue, hours')
  })

  it('rejects non-finite values, bad scenarios, missing dimensions, non-objects', () => {
    const { valid, rejected } = validateValues(SERIES, [
      { dimension_value: 'A', measure_key: 'revenue', scenario: 'actual', value: NaN },
      { dimension_value: 'A', measure_key: 'revenue', scenario: 'forecast', value: 1 },
      { dimension_value: '   ', measure_key: 'revenue', scenario: 'actual', value: 1 },
      null,
      'not-a-row',
    ])
    expect(valid).toHaveLength(0)
    expect(rejected).toHaveLength(5)
    expect(rejected.map((r) => r.reason)).toEqual([
      'value must be a finite number',
      "scenario must be 'actual' or 'budget', got 'forecast'",
      'dimension_value missing',
      'not an object',
      'not an object',
    ])
  })

  it('partial batch: good rows pass while bad rows are named', () => {
    const { valid, rejected } = validateValues(SERIES, [
      { dimension_value: 'A', measure_key: 'revenue', scenario: 'actual', value: 10 },
      { dimension_value: 'B', measure_key: 'nope', scenario: 'actual', value: 20 },
    ])
    expect(valid).toHaveLength(1)
    expect(rejected).toHaveLength(1)
  })

  it('accepts zero and negative values (credits/adjustments are real data)', () => {
    const { valid, rejected } = validateValues(SERIES, [
      { dimension_value: 'A', measure_key: 'revenue', scenario: 'actual', value: 0 },
      { dimension_value: 'B', measure_key: 'revenue', scenario: 'actual', value: -350.25 },
    ])
    expect(rejected).toHaveLength(0)
    expect(valid.map((v) => v.value)).toEqual([0, -350.25])
  })
})

describe('sumReconcileMeasure', () => {
  const rows = [
    { measure_key: 'revenue', scenario: 'actual', value: 100.1 },
    { measure_key: 'revenue', scenario: 'actual', value: '200.4' }, // numeric-as-string
    { measure_key: 'revenue', scenario: 'budget', value: 999 }, // budget excluded
    { measure_key: 'hours', scenario: 'actual', value: 50 }, // other measure excluded
  ]
  it('sums only the reconcile measure ACTUALS, coercing numerics', () => {
    expect(sumReconcileMeasure(rows, 'revenue')).toBeCloseTo(300.5)
  })
  it('returns 0 for a measure with no rows', () => {
    expect(sumReconcileMeasure(rows, 'gp')).toBe(0)
  })
})

describe('computeExternalTie — three-state contract', () => {
  it('tie within tolerance', () => {
    const tie = computeExternalTie({ seriesTotal: 42150.5, accountActual: 42151.0, accountName: 'NDIS Revenue' })
    expect(tie.comparable).toBe(true)
    expect(tie.within_tolerance).toBe(true)
    expect(tie.delta).toBeCloseTo(0.5)
  })

  it('break outside tolerance', () => {
    const tie = computeExternalTie({ seriesTotal: 42150.5, accountActual: 43000, accountName: 'NDIS Revenue' })
    expect(tie.comparable).toBe(true)
    expect(tie.within_tolerance).toBe(false)
    expect(tie.delta).toBeCloseTo(849.5)
  })

  it('respects a custom tolerance', () => {
    const tie = computeExternalTie({ seriesTotal: 100, accountActual: 104, accountName: 'X', tolerance: 5 })
    expect(tie.within_tolerance).toBe(true)
  })

  it('NOT comparable when the series side is empty — no fake green tick', () => {
    const tie = computeExternalTie({ seriesTotal: 0, accountActual: 42151, accountName: 'NDIS Revenue' })
    expect(tie.comparable).toBe(false)
  })

  it('NOT comparable when the account side is empty (unsynced month)', () => {
    const tie = computeExternalTie({ seriesTotal: 42150.5, accountActual: 0, accountName: 'NDIS Revenue' })
    expect(tie.comparable).toBe(false)
  })

  it('rounds both sides and the delta to cents', () => {
    const tie = computeExternalTie({ seriesTotal: 100.005, accountActual: 100.004, accountName: 'X' })
    expect(tie.series_total).toBe(100.01)
    expect(tie.account_actual).toBe(100)
  })
})
