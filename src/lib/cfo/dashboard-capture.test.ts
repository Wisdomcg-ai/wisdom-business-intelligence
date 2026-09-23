/**
 * Dashboard badge captures — validation (named rejects) and the
 * latest-per-tenant rollup the board shows beside the API count.
 */
import { describe, it, expect } from 'vitest'
import { validateCapture, summariseDashboardCaptures, deriveReadiness, type CaptureRow } from './dashboard-capture'

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
      { name: 'Amex', count: 31, months: null },
      { name: 'Trans', count: 9, months: null },
      { name: 'Cheque', count: 6, months: null },
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

describe('validateCapture — month histograms (schema v2)', () => {
  const cap = (accounts: any) => ({ tenant_id: 't1', total_count: accounts.reduce((s: number, a: any) => s + a.count, 0), accounts })

  it('accepts a footing month split and preserves it', () => {
    const v = validateCapture(cap([{ name: 'Amex', count: 5, months: { '2026-08': 3, '2026-09': 2 } }]))
    expect(v.ok).toBe(true)
    expect(v.value!.accounts[0].months).toEqual({ '2026-08': 3, '2026-09': 2 })
  })

  it('refuses a split that does not foot to the account count', () => {
    const v = validateCapture(cap([{ name: 'Amex', count: 5, months: { '2026-08': 3 } }]))
    expect(v.ok).toBe(false)
    expect(v.error).toContain('sum to 3 but count is 5')
  })

  it('refuses malformed month keys and non-integer values', () => {
    expect(validateCapture(cap([{ name: 'A', count: 1, months: { 'Aug-2026': 1 } }])).ok).toBe(false)
    expect(validateCapture(cap([{ name: 'A', count: 1, months: { '2026-13': 1 } }])).ok).toBe(false)
    expect(validateCapture(cap([{ name: 'A', count: 1, months: { '2026-08': 1.5 } }])).ok).toBe(false)
  })

  it('accounts without months stay valid (v1 captures keep working)', () => {
    const v = validateCapture(cap([{ name: 'A', count: 2 }]))
    expect(v.ok).toBe(true)
    expect(v.value!.accounts[0].months).toBeUndefined()
  })
})

describe('deriveReadiness — the one question', () => {
  const NOW = '2026-09-05T12:00:00Z'
  const capture = (at: string, accounts: any[]): any => ({
    total_count: accounts.reduce((s, a) => s + a.count, 0),
    captured_at: at, captured_tenants: 1, tenant_count: 1, per_tenant: [], notes: [],
    accounts,
  })

  it('READY: fresh capture, everything dated after the report month', () => {
    const r = deriveReadiness(capture('2026-09-05T04:00:00Z', [
      { name: 'Main', count: 3, months: { '2026-09': 3 } },
    ]), [], '2026-08', NOW)
    expect(r.state).toBe('ready')
    expect(r.blocking).toBe(0)
  })

  it('BLOCKED: items in or before the report month, named per account', () => {
    const r = deriveReadiness(capture('2026-09-05T04:00:00Z', [
      { name: 'Amex', count: 31, months: { '2026-07': 14, '2026-08': 8, '2026-09': 9 } },
      { name: 'Trans', count: 8, months: { '2026-09': 8 } },
    ]), [], '2026-08', NOW)
    expect(r.state).toBe('blocked')
    expect(r.blocking).toBe(22)
    expect(r.by_account).toEqual([{ name: 'Amex', blocking: 22, unsplit: false }])
  })

  it('splits blocking into prior months vs the report month (the two-column view)', () => {
    const r = deriveReadiness(capture('2026-09-05T04:00:00Z', [
      { name: 'Amex', count: 31, months: { '2026-07': 14, '2026-08': 8, '2026-09': 9 } },
      { name: 'Cash', count: 3, months: { '2026-06': 1, '2026-08': 2 } },
    ]), [], '2026-08', NOW)
    expect(r.blocking_prior).toBe(15) // 14 Jul + 1 Jun
    expect(r.blocking_current).toBe(10) // 8 + 2 Aug
    expect(r.blocking).toBe(25)
    expect(r.blocking_prior + r.blocking_current).toBe(r.blocking)
  })

  it('prior/current are zero when everything is later than the report month', () => {
    const r = deriveReadiness(capture('2026-09-05T04:00:00Z', [
      { name: 'Main', count: 3, months: { '2026-09': 3 } },
    ]), [], '2026-08', NOW)
    expect(r.blocking_prior).toBe(0)
    expect(r.blocking_current).toBe(0)
  })

  it('an account without a month split can never yield READY (fail-closed)', () => {
    const r = deriveReadiness(capture('2026-09-05T04:00:00Z', [
      { name: 'Mystery', count: 4, months: null },
    ]), [], '2026-08', NOW)
    expect(r.state).toBe('blocked')
    expect(r.possibly_blocking).toBe(4)
    expect(r.by_account[0].unsplit).toBe(true)
  })

  it('STALE beats blocked/ready: an old capture cannot give a confident verdict', () => {
    const r = deriveReadiness(capture('2026-08-20T04:00:00Z', [
      { name: 'Main', count: 0, months: {} },
    ]), [], '2026-08', NOW)
    expect(r.state).toBe('stale')
    expect(r.capture_age_days).toBeGreaterThan(7)
  })

  it('NEVER: no capture at all', () => {
    expect(deriveReadiness(null, [], '2026-08', NOW).state).toBe('never')
  })

  it('a total-only capture (badge number, no account breakdown) can never be READY', () => {
    const r = deriveReadiness({
      total_count: 47, captured_at: '2026-09-05T04:00:00Z',
      captured_tenants: 1, tenant_count: 1, per_tenant: [], notes: [], accounts: [],
    } as any, [], '2026-08', NOW)
    expect(r.state).toBe('blocked')
    expect(r.possibly_blocking).toBe(47)
    expect(r.by_account).toEqual([{ name: '(no account breakdown)', blocking: 47, unsplit: true }])
  })

  it('a tenant whose capture lacks accounts cannot hide behind an itemised clean tenant', () => {
    // Merged summary: itemised tenant is clean (Sep only), the other tenant
    // contributed 30 items with no account rows at all.
    const r = deriveReadiness({
      total_count: 33, captured_at: '2026-09-05T04:00:00Z',
      captured_tenants: 2, tenant_count: 2, per_tenant: [], notes: [],
      accounts: [{ name: 'Main', count: 3, months: { '2026-09': 3 } }],
    } as any, [], '2026-08', NOW)
    expect(r.state).toBe('blocked')
    expect(r.possibly_blocking).toBe(30)
  })

  it('PARTIAL: a clean capture covering only some orgs is never READY', () => {
    const r = deriveReadiness({
      ...capture('2026-09-05T04:00:00Z', [{ name: 'Main', count: 3, months: { '2026-09': 3 } }]),
      captured_tenants: 1, tenant_count: 3,
    }, [], '2026-08', NOW)
    expect(r.state).toBe('partial')
    expect(r.uncaptured_tenants).toBe(2)
  })

  it('visible blocking items beat partial coverage (still BLOCKED, counts a floor)', () => {
    const r = deriveReadiness({
      ...capture('2026-09-05T04:00:00Z', [{ name: 'Main', count: 5, months: { '2026-08': 5 } }]),
      captured_tenants: 1, tenant_count: 2,
    }, [], '2026-08', NOW)
    expect(r.state).toBe('blocked')
    expect(r.uncaptured_tenants).toBe(1)
  })

  it('ignored accounts are excluded from the verdict but reported for visibility', () => {
    const r = deriveReadiness(capture('2026-09-05T04:00:00Z', [
      { name: 'Paypal Account - DO NOT USE (legacy feed)', count: 19920, months: null },
      { name: 'Main', count: 2, months: { '2026-09': 2 } },
    ]), ['paypal account - do not use (legacy feed)'], '2026-08', NOW)
    expect(r.state).toBe('ready')
    expect(r.ignored).toEqual([{ name: 'Paypal Account - DO NOT USE (legacy feed)', count: 19920 }])
  })
})
