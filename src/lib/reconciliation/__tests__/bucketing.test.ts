import { describe, it, expect } from 'vitest'
import {
  bucketByMonth,
  outstandingStatementLines,
  xeroDateToMonthKey,
} from '../bucketing'

describe('xeroDateToMonthKey', () => {
  it('parses plain ISO dates', () => {
    expect(xeroDateToMonthKey('2026-08-14')).toBe('2026-08')
  })

  it('parses ISO timestamps', () => {
    expect(xeroDateToMonthKey('2026-07-01T00:00:00')).toBe('2026-07')
  })

  it('parses .NET JSON dates (Accounting API fallback path)', () => {
    // 2026-08-14T00:00:00Z
    expect(xeroDateToMonthKey('/Date(1786752000000+0000)/')).toBe('2026-08')
  })

  it('rejects garbage rather than guessing', () => {
    expect(xeroDateToMonthKey('not a date')).toBeNull()
    expect(xeroDateToMonthKey('')).toBeNull()
    expect(xeroDateToMonthKey(undefined)).toBeNull()
    expect(xeroDateToMonthKey('2026-99-01')).toBeNull()
  })
})

describe('bucketByMonth', () => {
  it('groups items by transaction month with count and gross value', () => {
    const buckets = bucketByMonth([
      { date: '2026-07-03', amount: -1200 },
      { date: '2026-07-15', amount: 340.5 },
      { date: '2026-08-01', amount: -99.99 },
    ])
    expect(buckets).toEqual([
      { month: '2026-07', count: 2, value: 1540.5 },
      { month: '2026-08', count: 1, value: 99.99 },
    ])
  })

  it('uses absolute amounts so debits and credits both add to workload', () => {
    const [bucket] = bucketByMonth([
      { date: '2026-08-01', amount: -50 },
      { date: '2026-08-02', amount: 50 },
    ])
    expect(bucket.value).toBe(100)
    expect(bucket.count).toBe(2)
  })

  it('sorts buckets chronologically', () => {
    const buckets = bucketByMonth([
      { date: '2026-08-01', amount: 1 },
      { date: '2025-12-31', amount: 1 },
      { date: '2026-01-15', amount: 1 },
    ])
    expect(buckets.map(b => b.month)).toEqual(['2025-12', '2026-01', '2026-08'])
  })

  it('drops items with unparseable dates instead of misfiling them', () => {
    const buckets = bucketByMonth([
      { date: 'bogus', amount: 500 },
      { date: '2026-08-01', amount: 10 },
    ])
    expect(buckets).toEqual([{ month: '2026-08', count: 1, value: 10 }])
  })

  it('rounds accumulated float cents', () => {
    const [bucket] = bucketByMonth([
      { date: '2026-08-01', amount: 0.1 },
      { date: '2026-08-02', amount: 0.2 },
    ])
    expect(bucket.value).toBe(0.3)
  })

  it('returns empty for no items', () => {
    expect(bucketByMonth([])).toEqual([])
  })
})

describe('outstandingStatementLines', () => {
  it('keeps only unreconciled, non-deleted, non-duplicate lines', () => {
    const items = outstandingStatementLines([
      { postedDate: '2026-08-01', amount: 100, isReconciled: false },
      { postedDate: '2026-08-02', amount: 200, isReconciled: true },
      { postedDate: '2026-08-03', amount: 300, isReconciled: false, isDeleted: true },
      { postedDate: '2026-08-04', amount: 400, isReconciled: false, isDuplicate: true },
    ])
    expect(items).toEqual([{ date: '2026-08-01', amount: 100 }])
  })

  it('treats a line with no isReconciled flag as NOT outstanding (fail closed on shape drift)', () => {
    expect(outstandingStatementLines([{ postedDate: '2026-08-01', amount: 100 }])).toEqual([])
  })
})
