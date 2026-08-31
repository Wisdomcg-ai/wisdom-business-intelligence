/**
 * W0.2 — pay-run pagination.
 *
 * Xero's AU Payroll spec on GET /PayRuns: "e.g. page=1 – Up to 100 PayRuns will
 * be returned in a single API call."
 *
 * wages-detail used to call that endpoint with no page, no order and no date
 * filter, then filter the response by payment date in JS. So it only ever saw
 * whichever 100 runs Xero returned first. A weekly-payroll client passes 100
 * runs in roughly two years, after which the report month can be absent
 * entirely — and the page renders a confident empty state, not an error.
 *
 * These cover the paging decisions, which are the part that can be wrong
 * silently. The network call itself is thin by design.
 */
import { describe, it, expect } from 'vitest'
import {
  PAY_RUNS_PAGE_SIZE,
  PAY_RUNS_MAX_PAGES,
  PAY_RUNS_ORDER,
  payRunLookbackCutoff,
  shouldFetchNextPayRunPage,
  oldestPeriodEnd,
} from '@/app/api/monthly-report/wages-detail/_helpers'

/** Mirrors parseXeroDate in the route: Xero's /Date(ms+zone)/ with an ISO fallback. */
function parseXeroDate(dateStr: string): Date | null {
  if (!dateStr) return null
  const match = dateStr.match(/\/Date\((\d+)([+-]\d+)?\)\//)
  if (match) return new Date(parseInt(match[1]))
  const d = new Date(dateStr)
  return isNaN(d.getTime()) ? null : d
}

const iso = (s: string) => ({ PayRunPeriodEndDate: s })

describe('payRunLookbackCutoff', () => {
  it('looks back two whole months before the report month by default', () => {
    // Paging is ordered by PERIOD END but the report selects on PAYMENT date,
    // and a period ending 30 Jun can be paid in Jul — hence the margin.
    expect(payRunLookbackCutoff('2026-07').toISOString()).toBe('2026-05-01T00:00:00.000Z')
  })

  it('handles year underflow', () => {
    expect(payRunLookbackCutoff('2026-01').toISOString()).toBe('2025-11-01T00:00:00.000Z')
    expect(payRunLookbackCutoff('2026-02').toISOString()).toBe('2025-12-01T00:00:00.000Z')
  })

  it('honours a custom lookback', () => {
    expect(payRunLookbackCutoff('2026-07', 6).toISOString()).toBe('2026-01-01T00:00:00.000Z')
  })

  it('falls back to the epoch on an unparseable month so paging is not truncated', () => {
    // Better to page to the hard stop than to silently bound a window we cannot
    // justify — a wrong-but-plausible cutoff is how the original bug looked.
    expect(payRunLookbackCutoff('').getTime()).toBe(0)
    expect(payRunLookbackCutoff('not-a-month').getTime()).toBe(0)
  })
})

describe('oldestPeriodEnd', () => {
  it('returns the earliest parseable period end on the page', () => {
    const runs = [iso('2026-07-26'), iso('2026-07-05'), iso('2026-07-19')]
    expect(oldestPeriodEnd(runs, parseXeroDate)?.toISOString().slice(0, 10)).toBe('2026-07-05')
  })

  it('parses Xero /Date(...)/ format', () => {
    const runs = [{ PayRunPeriodEndDate: '/Date(1751500800000+0000)/' }]
    expect(oldestPeriodEnd(runs, parseXeroDate)).toBeInstanceOf(Date)
  })

  it('ignores unparseable and missing dates', () => {
    const runs = [{ PayRunPeriodEndDate: 'rubbish' }, {}, iso('2026-07-05')]
    expect(oldestPeriodEnd(runs, parseXeroDate)?.toISOString().slice(0, 10)).toBe('2026-07-05')
  })

  it('returns null when nothing parses', () => {
    expect(oldestPeriodEnd([{ PayRunPeriodEndDate: 'rubbish' }, {}], parseXeroDate)).toBeNull()
  })
})

describe('shouldFetchNextPayRunPage', () => {
  const cutoff = payRunLookbackCutoff('2026-07') // 2026-05-01

  it('stops on a short page — that was the last one', () => {
    expect(
      shouldFetchNextPayRunPage({
        pageCount: 42,
        pageNumber: 1,
        oldestPeriodEnd: new Date('2026-06-01'),
        cutoff,
      }),
    ).toBe(false)
  })

  it('continues on a full page that has not yet reached the cutoff', () => {
    // The regression case: a full first page whose oldest run is still recent
    // means older pages exist and the report month may be behind them.
    expect(
      shouldFetchNextPayRunPage({
        pageCount: PAY_RUNS_PAGE_SIZE,
        pageNumber: 1,
        oldestPeriodEnd: new Date('2026-06-15'),
        cutoff,
      }),
    ).toBe(true)
  })

  it('stops once the page has paged past the cutoff', () => {
    expect(
      shouldFetchNextPayRunPage({
        pageCount: PAY_RUNS_PAGE_SIZE,
        pageNumber: 1,
        oldestPeriodEnd: new Date('2026-04-30'),
        cutoff,
      }),
    ).toBe(false)
  })

  it('treats a page landing exactly on the cutoff as still in range', () => {
    expect(
      shouldFetchNextPayRunPage({
        pageCount: PAY_RUNS_PAGE_SIZE,
        pageNumber: 1,
        oldestPeriodEnd: new Date('2026-05-01T00:00:00.000Z'),
        cutoff,
      }),
    ).toBe(true)
  })

  it('keeps paging when a full page had no parseable dates', () => {
    // Stopping here would bound the window on no evidence.
    expect(
      shouldFetchNextPayRunPage({
        pageCount: PAY_RUNS_PAGE_SIZE,
        pageNumber: 1,
        oldestPeriodEnd: null,
        cutoff,
      }),
    ).toBe(true)
  })

  it('stops at the hard page limit even when still in range', () => {
    expect(
      shouldFetchNextPayRunPage({
        pageCount: PAY_RUNS_PAGE_SIZE,
        pageNumber: PAY_RUNS_MAX_PAGES,
        oldestPeriodEnd: new Date('2026-06-15'),
        cutoff,
      }),
    ).toBe(false)
  })

  it('bounds a weekly client to a single page in the common case', () => {
    // ~52 runs a year: one 100-run page reaches back about two years, well past
    // a two-month cutoff, so steady state stays at one call.
    let pages = 0
    let pageNumber = 0
    let oldest = new Date('2026-07-26')
    do {
      pages += 1
      pageNumber += 1
      // Each page of 100 weekly runs walks back ~100 weeks.
      oldest = new Date(oldest.getTime() - 100 * 7 * 86400_000)
    } while (
      shouldFetchNextPayRunPage({
        pageCount: PAY_RUNS_PAGE_SIZE,
        pageNumber,
        oldestPeriodEnd: oldest,
        cutoff,
      })
    )
    expect(pages).toBe(1)
  })
})

describe('paging constants', () => {
  it('matches the page size Xero documents', () => {
    expect(PAY_RUNS_PAGE_SIZE).toBe(100)
  })

  it('orders newest period first so paging is deterministic', () => {
    // Without an order clause Xero's page 1 is not guaranteed to be the newest
    // runs, which is what let the report month fall off the end.
    expect(PAY_RUNS_ORDER).toBe('PayRunPeriodEndDate DESC')
  })
})
