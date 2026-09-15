/**
 * `businessDataClock` — the one definition of how current a business's Xero
 * numbers are, as the KPI dashboard's "Last synced" shows them.
 *
 * The line used to read `financial_metrics.updated_at`, a column that table has
 * never had, so it never rendered. The clock it now shows is the STALEST counted
 * org's: the charts add up every org, so one org's fresh sync must never stand in
 * for a sibling that is weeks behind — including the headline org
 * `classifyBusinessConnections` picks by status. A lookup that fails is
 * `unknown`, never a date and never "never synced".
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  businessDataClock,
  classifyBusinessConnections,
  ACCESS_TOKEN_TTL_MS,
  type XeroConnectionStatusRow,
  type XeroSyncClock,
} from '@/lib/xero/connection-status'

const NOW = Date.parse('2026-09-16T02:00:00.000Z')
const HOUR = 60 * 60 * 1000
const hoursAgo = (hours: number) => new Date(NOW - hours * HOUR).toISOString()
const ms = (iso: string) => Date.parse(iso)

const row = (over: Partial<XeroConnectionStatusRow> & Pick<XeroConnectionStatusRow, 'id'>): XeroConnectionStatusRow => ({
  business_id: 'biz-1',
  tenant_id: `tenant-${over.id}`,
  tenant_name: null,
  include_in_consolidation: true,
  is_active: true,
  last_synced_at: null,
  updated_at: hoursAgo(0),
  // A token Xero granted ten minutes ago.
  expires_at: new Date(NOW - 10 * 60 * 1000 + ACCESS_TOKEN_TTL_MS).toISOString(),
  created_at: hoursAgo(24 * 90),
  ...over,
})

const jobs = (byTenant: Record<string, string>, ok = true): XeroSyncClock => ({
  ok,
  byTenant: new Map(Object.entries(byTenant).map(([tenant, iso]) => [tenant, ms(iso)])),
})

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('businessDataClock — one org', () => {
  it("is the fresher of the org's own column and its tenant's last job", () => {
    const stampedLater = row({ id: 'a', tenant_name: 'Urban Road Pty Ltd', last_synced_at: hoursAgo(3) })
    expect(businessDataClock([stampedLater], jobs({ 'tenant-a': hoursAgo(30) }))).toEqual({
      status: 'synced',
      lastSyncAt: hoursAgo(3),
      orgs: [{ tenantName: 'Urban Road Pty Ltd', lastSyncAt: hoursAgo(3) }],
    })

    const jobLater = row({ id: 'a', tenant_name: 'Urban Road Pty Ltd', last_synced_at: hoursAgo(30) })
    expect(businessDataClock([jobLater], jobs({ 'tenant-a': hoursAgo(2) }))).toMatchObject({
      status: 'synced',
      lastSyncAt: hoursAgo(2),
    })
  })

  it('never synced (no column, no job) is never_synced, not a date', () => {
    const brandNew = row({ id: 'a', tenant_name: 'Distinct Directions Pty Ltd', created_at: hoursAgo(2) })
    expect(businessDataClock([brandNew], jobs({}))).toEqual({
      status: 'never_synced',
      orgs: [{ tenantName: 'Distinct Directions Pty Ltd', lastSyncAt: null }],
    })
  })

  it('no rows is none', () => {
    expect(businessDataClock([], jobs({}))).toEqual({ status: 'none' })
  })
})

describe('businessDataClock — a multi-org business is as current as its stalest org', () => {
  it("is the stalest org's clock, not the headline org's", () => {
    // IICT Group Limited's token stopped refreshing 20h ago but it synced an hour
    // ago, so it is the headline (auth_stale outranks connected). IICT Group Pty
    // Ltd is connected and last synced 40h ago. The charts are 40h old.
    const rows = [
      row({
        id: 'limited',
        tenant_name: 'IICT Group Limited',
        last_synced_at: hoursAgo(1),
        expires_at: new Date(NOW - 20 * HOUR + ACCESS_TOKEN_TTL_MS).toISOString(),
      }),
      row({ id: 'pty', tenant_name: 'IICT Group Pty Ltd', last_synced_at: hoursAgo(40) }),
    ]
    const clock = jobs({})

    const business = classifyBusinessConnections(rows, clock)
    expect(business.status).toBe('auth_stale')
    expect(business.lastSyncAt).toBe(hoursAgo(1))

    expect(businessDataClock(rows, clock)).toEqual({
      status: 'synced',
      lastSyncAt: hoursAgo(40),
      orgs: [
        { tenantName: 'IICT Group Pty Ltd', lastSyncAt: hoursAgo(40) },
        { tenantName: 'IICT Group Limited', lastSyncAt: hoursAgo(1) },
      ],
    })
  })

  it('a dead org counts at its last sync, even when a staler org is the one with the better status', () => {
    const rows = [
      row({ id: 'dead', tenant_name: 'Dead Org', is_active: false, last_synced_at: hoursAgo(72) }),
      row({ id: 'stale', tenant_name: 'Stale Org', last_synced_at: hoursAgo(240) }),
      row({ id: 'fresh', tenant_name: 'Fresh Org', last_synced_at: hoursAgo(2) }),
    ]
    expect(classifyBusinessConnections(rows, jobs({})).lastSyncAt).toBe(hoursAgo(72))
    expect(businessDataClock(rows, jobs({}))).toMatchObject({ status: 'synced', lastSyncAt: hoursAgo(240) })
  })

  it('an org that has never synced makes the business never_synced, and is listed first', () => {
    const rows = [
      row({ id: 'roofing', tenant_name: 'Dragon Roofing Pty Ltd', last_synced_at: hoursAgo(2) }),
      row({ id: 'hail', tenant_name: 'EASY HAIL CLAIM PTY LTD', created_at: hoursAgo(1) }),
    ]
    expect(businessDataClock(rows, jobs({}))).toEqual({
      status: 'never_synced',
      orgs: [
        { tenantName: 'EASY HAIL CLAIM PTY LTD', lastSyncAt: null },
        { tenantName: 'Dragon Roofing Pty Ltd', lastSyncAt: hoursAgo(2) },
      ],
    })
  })

  it('orgs on the same clock are ordered by name, so the list never depends on row order', () => {
    const rows = [
      row({ id: 'b', tenant_name: 'Beta Pty Ltd', last_synced_at: hoursAgo(5) }),
      row({ id: 'a', tenant_name: 'Alpha Pty Ltd', last_synced_at: hoursAgo(5) }),
      row({ id: 'c', tenant_name: 'Gamma Pty Ltd', last_synced_at: hoursAgo(9) }),
    ]
    const expected = {
      status: 'synced',
      lastSyncAt: hoursAgo(9),
      orgs: [
        { tenantName: 'Gamma Pty Ltd', lastSyncAt: hoursAgo(9) },
        { tenantName: 'Alpha Pty Ltd', lastSyncAt: hoursAgo(5) },
        { tenantName: 'Beta Pty Ltd', lastSyncAt: hoursAgo(5) },
      ],
    }
    for (const order of [
      [0, 1, 2],
      [2, 1, 0],
      [1, 2, 0],
    ]) {
      expect(businessDataClock(order.map((i) => rows[i]), jobs({}))).toEqual(expected)
    }
  })
})

describe('businessDataClock — the orgs that count are the classifier’s', () => {
  it('an org retired on purpose (off AND excluded from consolidation) sets nothing', () => {
    const rows = [
      row({ id: 'live', tenant_name: 'Live Org', last_synced_at: hoursAgo(2) }),
      row({
        id: 'wound-up',
        tenant_name: 'Wound Up Pty Ltd',
        is_active: false,
        include_in_consolidation: false,
        last_synced_at: hoursAgo(24 * 50),
      }),
    ]
    expect(businessDataClock(rows, jobs({}))).toEqual({
      status: 'synced',
      lastSyncAt: hoursAgo(2),
      orgs: [{ tenantName: 'Live Org', lastSyncAt: hoursAgo(2) }],
    })
  })

  it('when every org is retired they count after all, as they do for the status', () => {
    const retired = { is_active: false, include_in_consolidation: false }
    const rows = [
      row({ id: 'a', tenant_name: 'A', last_synced_at: hoursAgo(24 * 20), ...retired }),
      row({ id: 'b', tenant_name: 'B', last_synced_at: hoursAgo(24 * 30), ...retired }),
    ]
    expect(businessDataClock(rows, jobs({}))).toMatchObject({ status: 'synced', lastSyncAt: hoursAgo(24 * 30) })
  })

  it('a dead row superseded by a live row for the same org is not an org', () => {
    const rows = [
      row({ id: 'old', tenant_id: 'tenant-x', tenant_name: 'X Pty Ltd', is_active: false, last_synced_at: hoursAgo(24 * 30) }),
      row({ id: 'reconnected', tenant_id: 'tenant-x', tenant_name: 'X Pty Ltd', last_synced_at: hoursAgo(1) }),
    ]
    expect(businessDataClock(rows, jobs({}))).toEqual({
      status: 'synced',
      lastSyncAt: hoursAgo(1),
      orgs: [{ tenantName: 'X Pty Ltd', lastSyncAt: hoursAgo(1) }],
    })
  })
})

describe('businessDataClock — could not check is never a date', () => {
  it('a failed sync_jobs lookup is unknown, however fresh the stamped columns look', () => {
    const rows = [
      row({ id: 'a', tenant_name: 'A', last_synced_at: hoursAgo(1) }),
      row({ id: 'b', tenant_name: 'B', last_synced_at: hoursAgo(1) }),
    ]
    expect(businessDataClock(rows, jobs({ 'tenant-a': hoursAgo(1) }, false))).toEqual({ status: 'unknown' })
  })

  it('a failed lookup for a business with no rows is still none — there was nothing to look up', () => {
    expect(businessDataClock([], jobs({}, false))).toEqual({ status: 'none' })
  })

  it('an org with no tenant_id cannot be looked up in sync_jobs, so the clock is unknown', () => {
    const rows = [
      row({ id: 'a', tenant_name: 'A', last_synced_at: hoursAgo(1) }),
      row({ id: 'blank', tenant_id: '   ', tenant_name: 'Blank', last_synced_at: hoursAgo(1) }),
    ]
    expect(businessDataClock(rows, jobs({ 'tenant-a': hoursAgo(1) }))).toEqual({ status: 'unknown' })
  })
})
