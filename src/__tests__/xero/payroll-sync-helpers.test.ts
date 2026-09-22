/**
 * WB.2 — payroll sync pure helpers.
 *
 * The IO loop in payroll-sync.ts is deliberately thin; these are the decisions
 * that can be wrong silently.
 */
import { describe, it, expect } from 'vitest'
import {
  parseXeroDate,
  resolveGroupKey,
  pickRunsNeedingDetail,
  isPayrollNotAccessible,
} from '@/lib/xero/payroll-sync'
import { XeroHttpError, RateLimitDailyExceededError } from '@/lib/xero/xero-api-client'

describe('parseXeroDate', () => {
  it('parses Xero /Date(ms)/ and ISO, rejects garbage', () => {
    expect(parseXeroDate('/Date(1751500800000+0000)/')).toBeInstanceOf(Date)
    expect(parseXeroDate('2026-07-03')?.toISOString().slice(0, 10)).toBe('2026-07-03')
    expect(parseXeroDate('rubbish')).toBeNull()
    expect(parseXeroDate(null)).toBeNull()
  })
})

describe('resolveGroupKey', () => {
  it('uses EmployeeGroupName when present (the DD clinic shape)', () => {
    expect(resolveGroupKey({ employee_group_name: 'Bathurst' })).toEqual({
      group_key: 'bathurst',
      group_label: 'Bathurst',
    })
  })

  it('flat (null group) when absent — every current WisdomBI client', () => {
    expect(resolveGroupKey({ employee_group_name: null })).toEqual({
      group_key: null,
      group_label: null,
    })
    expect(resolveGroupKey(undefined)).toEqual({ group_key: null, group_label: null })
    expect(resolveGroupKey({ employee_group_name: '  ' })).toEqual({
      group_key: null,
      group_label: null,
    })
  })
})

describe('pickRunsNeedingDetail — backfill convergence', () => {
  const run = (id: string, date: string, detailed: boolean) => ({
    pay_run_id: id,
    payment_date: date,
    detail_synced_at: detailed ? '2026-08-01T00:00:00Z' : null,
  })

  it('never re-fetches a stamped run', () => {
    const picked = pickRunsNeedingDetail(
      [run('a', '2026-07-03', true), run('b', '2026-07-10', false)],
      10,
    )
    expect(picked.map((r) => r.pay_run_id)).toEqual(['b'])
  })

  it('fills oldest-first so history completes deterministically', () => {
    const picked = pickRunsNeedingDetail(
      [run('new', '2026-07-24', false), run('old', '2026-07-03', false), run('mid', '2026-07-10', false)],
      10,
    )
    expect(picked.map((r) => r.pay_run_id)).toEqual(['old', 'mid', 'new'])
  })

  it('respects the cap — one giant backfill cannot starve the run', () => {
    const runs = Array.from({ length: 200 }, (_, i) =>
      run(`r${i}`, `2026-0${(i % 6) + 1}-15`, false),
    )
    expect(pickRunsNeedingDetail(runs, 40)).toHaveLength(40)
    expect(pickRunsNeedingDetail(runs, 0)).toHaveLength(0)
    // A negative remainder (cap already consumed) must not throw or go weird.
    expect(pickRunsNeedingDetail(runs, -5)).toHaveLength(0)
  })
})

describe('isPayrollNotAccessible — "no payroll" is a state of the org, not a defect', () => {
  it('401 (Payroll API access not authorised) and 403 (Payroll has not been purchased)', () => {
    expect(
      isPayrollNotAccessible(new XeroHttpError(401, 't', 'Payroll API access not authorised')),
    ).toBe(true)
    expect(
      isPayrollNotAccessible(new XeroHttpError(403, 't', 'Payroll has not been purchased')),
    ).toBe(true)
  })

  it('any other status is still a real error', () => {
    expect(isPayrollNotAccessible(new XeroHttpError(404, 't', 'not found'))).toBe(false)
    expect(isPayrollNotAccessible(new XeroHttpError(400, 't', 'bad request'))).toBe(false)
  })

  it('typed only — a daily rate-limit pause or a generic Error mentioning 401 is not "no payroll"', () => {
    expect(isPayrollNotAccessible(new RateLimitDailyExceededError('t'))).toBe(false)
    expect(isPayrollNotAccessible(new Error('xero 401 for tenant t: nope'))).toBe(false)
    expect(isPayrollNotAccessible(null)).toBe(false)
  })
})
