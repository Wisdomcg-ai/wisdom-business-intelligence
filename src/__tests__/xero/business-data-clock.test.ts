/**
 * `businessDataClock` — the one definition of how current the Xero figures on a
 * page are, as the KPI dashboard's "Last synced" shows them.
 *
 * The line used to read `financial_metrics.updated_at`, a column that table has
 * never had, so it never rendered. The clock it now shows is the STALEST clock of
 * every org behind the figures: the orgs the classifier counts, and every tenant
 * whose mirror rows the page drew — disconnecting keeps the rows, so on 16 Sep
 * 2026 IICT Group's charts still summed IICT Group Pty Ltd (last written 10 Sep)
 * with no connection row for it. One org's fresh sync must never stand in for
 * figures that are older, including the headline org `classifyBusinessConnections`
 * picks by status. A lookup that fails is `unknown`, never a date and never
 * "never synced".
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

/** No mirror rows drawn — the page shows no Xero figures. */
const NOTHING_SHOWN: string[] = []

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
    expect(businessDataClock([stampedLater], jobs({ 'tenant-a': hoursAgo(30) }), ['tenant-a'])).toEqual({
      status: 'synced',
      lastSyncAt: hoursAgo(3),
      orgs: [{ tenantName: 'Urban Road Pty Ltd', lastSyncAt: hoursAgo(3) }],
    })

    const jobLater = row({ id: 'a', tenant_name: 'Urban Road Pty Ltd', last_synced_at: hoursAgo(30) })
    expect(businessDataClock([jobLater], jobs({ 'tenant-a': hoursAgo(2) }), ['tenant-a'])).toMatchObject({
      status: 'synced',
      lastSyncAt: hoursAgo(2),
    })
  })

  it('a connected org that has never synced is never_synced, not a date', () => {
    const brandNew = row({ id: 'a', tenant_name: 'Distinct Directions Pty Ltd', created_at: hoursAgo(2) })
    expect(businessDataClock([brandNew], jobs({}), NOTHING_SHOWN)).toEqual({
      status: 'never_synced',
      orgs: [{ tenantName: 'Distinct Directions Pty Ltd', lastSyncAt: null }],
    })
  })

  it('no connection and no figures is none', () => {
    expect(businessDataClock([], jobs({}), NOTHING_SHOWN)).toEqual({ status: 'none' })
  })

  it('the same tenant drawn many times is still one org', () => {
    const org = row({ id: 'a', tenant_name: 'A Pty Ltd', last_synced_at: hoursAgo(4) })
    expect(businessDataClock([org], jobs({}), ['tenant-a', 'tenant-a', ' tenant-a '])).toEqual({
      status: 'synced',
      lastSyncAt: hoursAgo(4),
      orgs: [{ tenantName: 'A Pty Ltd', lastSyncAt: hoursAgo(4) }],
    })
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

    expect(businessDataClock(rows, clock, ['tenant-limited', 'tenant-pty'])).toEqual({
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
    expect(businessDataClock(rows, jobs({}), NOTHING_SHOWN)).toMatchObject({ status: 'synced', lastSyncAt: hoursAgo(240) })
  })

  it('an org that has never synced makes the business never_synced, and is listed first', () => {
    const rows = [
      row({ id: 'roofing', tenant_name: 'Dragon Roofing Pty Ltd', last_synced_at: hoursAgo(2) }),
      row({ id: 'hail', tenant_name: 'EASY HAIL CLAIM PTY LTD', created_at: hoursAgo(1) }),
    ]
    expect(businessDataClock(rows, jobs({}), ['tenant-roofing'])).toEqual({
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
      expect(businessDataClock(order.map((i) => rows[i]), jobs({}), ['tenant-a', 'tenant-b', 'tenant-c'])).toEqual(expected)
    }
  })
})

describe('businessDataClock — figures the page drew count, whether or not their org still does', () => {
  it("figures from an org with no connection row are dated by its tenant's last sync — the IICT case", () => {
    // Two orgs reconnected and synced an hour ago. The third org's connection is
    // gone, but its rows are still in the mirror and in the charts, last synced
    // 130h ago. Counting only the connection rows would print the fresh date.
    const rows = [
      row({ id: 'aust', tenant_name: 'IICT (Aust) Pty Ltd', last_synced_at: hoursAgo(1) }),
      row({ id: 'limited', tenant_name: 'IICT Group Limited', last_synced_at: hoursAgo(1) }),
    ]
    const clock = jobs({ 'tenant-aust': hoursAgo(1), 'tenant-limited': hoursAgo(1), 'tenant-pty': hoursAgo(130) })

    expect(businessDataClock(rows, clock, ['tenant-aust', 'tenant-limited'])).toMatchObject({ lastSyncAt: hoursAgo(1) })
    expect(businessDataClock(rows, clock, ['tenant-aust', 'tenant-pty', 'tenant-limited'])).toEqual({
      status: 'synced',
      lastSyncAt: hoursAgo(130),
      orgs: [
        { tenantName: null, lastSyncAt: hoursAgo(130) },
        { tenantName: 'IICT (Aust) Pty Ltd', lastSyncAt: hoursAgo(1) },
        { tenantName: 'IICT Group Limited', lastSyncAt: hoursAgo(1) },
      ],
    })
  })

  it('such an org with no sync in the window is unknown — its figures exist, so it is not "never synced"', () => {
    const rows = [row({ id: 'aust', tenant_name: 'IICT (Aust) Pty Ltd', last_synced_at: hoursAgo(1) })]
    expect(businessDataClock(rows, jobs({ 'tenant-aust': hoursAgo(1) }), ['tenant-aust', 'tenant-pty'])).toEqual({
      status: 'unknown',
    })
  })

  it('a business with no connection left, whose figures are still drawn, gets a date — not none', () => {
    expect(businessDataClock([], jobs({ 'tenant-gone': hoursAgo(20) }), ['tenant-gone'])).toEqual({
      status: 'synced',
      lastSyncAt: hoursAgo(20),
      orgs: [{ tenantName: null, lastSyncAt: hoursAgo(20) }],
    })
  })

  it('a retired org sets nothing while its figures are not drawn', () => {
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
    expect(businessDataClock(rows, jobs({}), ['tenant-live'])).toEqual({
      status: 'synced',
      lastSyncAt: hoursAgo(2),
      orgs: [{ tenantName: 'Live Org', lastSyncAt: hoursAgo(2) }],
    })
  })

  it('a retired org whose figures are still drawn counts at its own clock, under its own name', () => {
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
    expect(businessDataClock(rows, jobs({}), ['tenant-live', 'tenant-wound-up'])).toEqual({
      status: 'synced',
      lastSyncAt: hoursAgo(24 * 50),
      orgs: [
        { tenantName: 'Wound Up Pty Ltd', lastSyncAt: hoursAgo(24 * 50) },
        { tenantName: 'Live Org', lastSyncAt: hoursAgo(2) },
      ],
    })
  })

  it('when every org is retired they count after all, as they do for the status', () => {
    const retired = { is_active: false, include_in_consolidation: false }
    const rows = [
      row({ id: 'a', tenant_name: 'A', last_synced_at: hoursAgo(24 * 20), ...retired }),
      row({ id: 'b', tenant_name: 'B', last_synced_at: hoursAgo(24 * 30), ...retired }),
    ]
    expect(businessDataClock(rows, jobs({}), NOTHING_SHOWN)).toMatchObject({ status: 'synced', lastSyncAt: hoursAgo(24 * 30) })
  })

  it('a dead row superseded by a live row for the same org is not an org', () => {
    const rows = [
      row({ id: 'old', tenant_id: 'tenant-x', tenant_name: 'X Pty Ltd', is_active: false, last_synced_at: hoursAgo(24 * 30) }),
      row({ id: 'reconnected', tenant_id: 'tenant-x', tenant_name: 'X Pty Ltd', last_synced_at: hoursAgo(1) }),
    ]
    expect(businessDataClock(rows, jobs({}), ['tenant-x'])).toEqual({
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
    expect(businessDataClock(rows, jobs({ 'tenant-a': hoursAgo(1) }, false), ['tenant-a', 'tenant-b'])).toEqual({
      status: 'unknown',
    })
  })

  it('a failed lookup for drawn figures with no connection left is unknown', () => {
    expect(businessDataClock([], jobs({ 'tenant-gone': hoursAgo(1) }, false), ['tenant-gone'])).toEqual({ status: 'unknown' })
  })

  it('a failed lookup with no connection and no figures is still none — there was nothing to look up', () => {
    expect(businessDataClock([], jobs({}, false), NOTHING_SHOWN)).toEqual({ status: 'none' })
  })

  it('an org with no tenant_id cannot be looked up in sync_jobs, so the clock is unknown', () => {
    const rows = [
      row({ id: 'a', tenant_name: 'A', last_synced_at: hoursAgo(1) }),
      row({ id: 'blank', tenant_id: '   ', tenant_name: 'Blank', last_synced_at: hoursAgo(1) }),
    ]
    expect(businessDataClock(rows, jobs({ 'tenant-a': hoursAgo(1) }), ['tenant-a'])).toEqual({ status: 'unknown' })
  })

  it('a drawn row with no tenant_id cannot be dated, so the clock is unknown', () => {
    const rows = [row({ id: 'a', tenant_name: 'A', last_synced_at: hoursAgo(1) })]
    expect(businessDataClock(rows, jobs({ 'tenant-a': hoursAgo(1) }), ['tenant-a', null])).toEqual({ status: 'unknown' })
    expect(businessDataClock(rows, jobs({ 'tenant-a': hoursAgo(1) }), ['tenant-a', '  '])).toEqual({ status: 'unknown' })
    expect(businessDataClock([], jobs({}), [null])).toEqual({ status: 'unknown' })
  })
})
