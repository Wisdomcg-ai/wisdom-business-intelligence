/**
 * Dashboard badge captures — validation (named rejects) and the
 * latest-per-tenant rollup the board shows beside the API count.
 */
import { describe, it, expect } from 'vitest'
import { validateCapture, summariseDashboardCaptures, type CaptureRow } from './dashboard-capture'

describe('validateCapture', () => {
  it('accepts a well-formed capture and defaults method to manual', () => {
    const v = validateCapture({ tenant_id: ' t1 ', total_count: 3, accounts: [{ name: 'Westpac', count: 3 }] })
    expect(v.ok).toBe(true)
    expect(v.value).toEqual({ tenant_id: 't1', total_count: 3, accounts: [{ name: 'Westpac', count: 3 }], method: 'manual', notes: null })
  })
  it('accepts chrome_routine and a total with no per-account detail', () => {
    const v = validateCapture({ tenant_id: 't1', total_count: 0, method: 'chrome_routine' })
    expect(v.ok).toBe(true)
    expect(v.value?.method).toBe('chrome_routine')
  })
  it('names every rejection', () => {
    expect(validateCapture(null).error).toBe('capture must be an object')
    expect(validateCapture({ total_count: 1 }).error).toBe('tenant_id is required')
    expect(validateCapture({ tenant_id: 't1', total_count: -1 }).error).toContain('non-negative integer')
    expect(validateCapture({ tenant_id: 't1', total_count: 1.5 }).error).toContain('non-negative integer')
    expect(validateCapture({ tenant_id: 't1', total_count: 2, accounts: [{ name: '', count: 2 }] }).error).toContain('each account')
  })
  it('rejects per-account detail that does not foot to the total (a mis-read, not data)', () => {
    const v = validateCapture({ tenant_id: 't1', total_count: 5, accounts: [{ name: 'A', count: 2 }, { name: 'B', count: 2 }] })
    expect(v.ok).toBe(false)
    expect(v.error).toContain('accounts sum to 4')
  })
})

describe('summariseDashboardCaptures', () => {
  const row = (tenant_id: string, captured_at: string, total_count: number): CaptureRow => ({
    tenant_id, business_id: 'b1', captured_at, total_count, accounts: [], method: 'chrome_routine',
  })

  it('takes the LATEST capture per tenant and sums across tenants', () => {
    const s = summariseDashboardCaptures([
      row('t1', '2026-09-01T02:00:00Z', 30), // older
      row('t1', '2026-09-02T02:00:00Z', 25),
      row('t2', '2026-09-02T03:00:00Z', 2),
    ], ['t1', 't2'])
    expect(s?.total_count).toBe(27)
    expect(s?.captured_tenants).toBe(2)
    expect(s?.tenant_count).toBe(2)
    // "as of" is the OLDEST of the latest-per-tenant — the honest timestamp.
    expect(s?.captured_at).toBe('2026-09-02T02:00:00Z')
  })

  it('a never-captured tenant is reported as missing, never assumed zero', () => {
    const s = summariseDashboardCaptures([row('t1', '2026-09-02T02:00:00Z', 4)], ['t1', 't2', 't3'])
    expect(s?.captured_tenants).toBe(1)
    expect(s?.tenant_count).toBe(3)
    expect(s?.total_count).toBe(4)
  })

  it('null when nothing has been captured', () => {
    expect(summariseDashboardCaptures([], ['t1'])).toBeNull()
  })

  it('a capture for a tenant no longer active is ignored', () => {
    const s = summariseDashboardCaptures([row('gone', '2026-09-02T02:00:00Z', 99), row('t1', '2026-09-02T02:00:00Z', 1)], ['t1'])
    expect(s?.total_count).toBe(1)
  })
})

describe('summariseDashboardCaptures — account breakdown and notes', () => {
  const row = (tenant: string, at: string, count: number, accounts: any, notes?: string): CaptureRow => ({
    tenant_id: tenant, business_id: 'b1', captured_at: at, total_count: count,
    accounts, method: 'chrome_routine', notes: notes ?? null,
  })

  it('merges the LATEST capture per tenant into a count-descending account list', () => {
    const s = summariseDashboardCaptures([
      row('t1', '2026-09-05T04:00:00Z', 40, [{ name: 'Amex', count: 31 }, { name: 'Trans', count: 9 }]),
      row('t1', '2026-09-01T04:00:00Z', 99, [{ name: 'STALE', count: 99 }]),
      row('t2', '2026-09-05T04:10:00Z', 6, [{ name: 'Cheque', count: 6 }]),
    ], ['t1', 't2'])!
    expect(s.accounts).toEqual([
      { name: 'Amex', count: 31 },
      { name: 'Trans', count: 9 },
      { name: 'Cheque', count: 6 },
    ])
  })

  it('collects non-empty latest notes, deduped', () => {
    const s = summariseDashboardCaptures([
      row('t1', '2026-09-05T04:00:00Z', 1, [], 'AUG-RELEVANT: 1 of 1.'),
      row('t2', '2026-09-05T04:10:00Z', 0, [], '  '),
    ], ['t1', 't2'])!
    expect(s.notes).toEqual(['AUG-RELEVANT: 1 of 1.'])
  })

  it('null accounts arrays are tolerated', () => {
    const s = summariseDashboardCaptures([row('t1', '2026-09-05T04:00:00Z', 3, null)], ['t1'])!
    expect(s.accounts).toEqual([])
    expect(s.notes).toEqual([])
  })
})
