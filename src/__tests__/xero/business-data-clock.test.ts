/**
 * `businessDataClock` — the one definition of how current the Xero figures on a
 * page are, as the KPI dashboard's "Last synced" shows them.
 *
 * The line used to read `financial_metrics.updated_at`, a column that table has
 * never had, so it never rendered. The clock it now shows is the STALEST clock of
 * every org behind the figures:
 *   - the orgs the classifier counts, on the one definition's clock;
 *   - every tenant whose mirror rows the page drew. Disconnecting keeps the rows,
 *     so on 16 Sep 2026 IICT Group's charts still summed IICT Group Pty Ltd (last
 *     written 10 Sep) with no connection row for it.
 * An org whose figures are drawn is never dated later than those figures were
 * written: sync_jobs is keyed by tenant, not business, and last_synced_at has had
 * writers that stamp without writing a row. A lookup that fails is `unknown`,
 * never a date and never "never synced".
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  businessDataClock,
  classifyBusinessConnections,
  ACCESS_TOKEN_TTL_MS,
  type XeroConnectionStatusRow,
  type XeroSyncClock,
  type XeroTenantShown,
} from '@/lib/xero/connection-status'

const NOW = Date.parse('2026-09-16T02:00:00.000Z')
const HOUR = 60 * 60 * 1000
const hoursAgo = (hours: number) => new Date(NOW - hours * HOUR).toISOString()
const ms = (iso: string) => Date.parse(iso)

/** The page drew rows of this tenant, the newest written at `writtenAt`. */
const drew = (tenantId: string | null, writtenAt: string | null): XeroTenantShown => ({ tenantId, lastWrittenAt: writtenAt })
const NOTHING_DRAWN: XeroTenantShown[] = []

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
    expect(businessDataClock([stampedLater], jobs({ 'tenant-a': hoursAgo(30) }), [drew('tenant-a', hoursAgo(3))])).toEqual({
      status: 'synced',
      lastSyncAt: hoursAgo(3),
      orgs: [{ tenantName: 'Urban Road Pty Ltd', lastSyncAt: hoursAgo(3) }],
    })

    const jobLater = row({ id: 'a', tenant_name: 'Urban Road Pty Ltd', last_synced_at: hoursAgo(30) })
    expect(businessDataClock([jobLater], jobs({ 'tenant-a': hoursAgo(2) }), NOTHING_DRAWN)).toMatchObject({
      status: 'synced',
      lastSyncAt: hoursAgo(2),
    })
  })

  it('a connected org with no figures on the page that has never synced is never_synced, not a date', () => {
    const brandNew = row({ id: 'a', tenant_name: 'Distinct Directions Pty Ltd', created_at: hoursAgo(2) })
    expect(businessDataClock([brandNew], jobs({}), NOTHING_DRAWN)).toEqual({
      status: 'never_synced',
      orgs: [{ tenantName: 'Distinct Directions Pty Ltd', lastSyncAt: null }],
    })
  })

  it('no connection and no figures is none', () => {
    expect(businessDataClock([], jobs({}), NOTHING_DRAWN)).toEqual({ status: 'none' })
  })

  it('the same tenant drawn many times is one org, dated by its newest write', () => {
    const org = row({ id: 'a', tenant_name: 'A Pty Ltd', last_synced_at: hoursAgo(4) })
    const shown = [drew('tenant-a', hoursAgo(9)), drew(' tenant-a ', hoursAgo(5)), drew('tenant-a', null)]
    expect(businessDataClock([org], jobs({}), shown)).toEqual({
      status: 'synced',
      lastSyncAt: hoursAgo(5),
      orgs: [{ tenantName: 'A Pty Ltd', lastSyncAt: hoursAgo(5) }],
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

    expect(businessDataClock(rows, clock, [drew('tenant-limited', hoursAgo(1)), drew('tenant-pty', hoursAgo(40))])).toEqual({
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
    expect(businessDataClock(rows, jobs({}), NOTHING_DRAWN)).toMatchObject({ status: 'synced', lastSyncAt: hoursAgo(240) })
  })

  it('an org with no figures on the page that has never synced makes the business never_synced, listed first', () => {
    const rows = [
      row({ id: 'roofing', tenant_name: 'Dragon Roofing Pty Ltd', last_synced_at: hoursAgo(2) }),
      row({ id: 'hail', tenant_name: 'EASY HAIL CLAIM PTY LTD', created_at: hoursAgo(1) }),
    ]
    expect(businessDataClock(rows, jobs({}), [drew('tenant-roofing', hoursAgo(2))])).toEqual({
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
      expect(businessDataClock(order.map((i) => rows[i]), jobs({}), NOTHING_DRAWN)).toEqual(expected)
    }
  })
})

describe('businessDataClock — drawn figures are never dated later than they were written', () => {
  it('a counted org stamped fresh without writing a row reads its figures’ last write', () => {
    // last_synced_at says 6 minutes ago (a writer that stamps whatever Xero
    // said), but the rows on the page were last written 30h ago.
    const rows = [row({ id: 'a', tenant_name: 'A Pty Ltd', last_synced_at: hoursAgo(0.1) })]
    expect(businessDataClock(rows, jobs({ 'tenant-a': hoursAgo(30) }), [drew('tenant-a', hoursAgo(30))])).toEqual({
      status: 'synced',
      lastSyncAt: hoursAgo(30),
      orgs: [{ tenantName: 'A Pty Ltd', lastSyncAt: hoursAgo(30) }],
    })
  })

  it('evidence older than the write wins — a sync that wrote rows and then failed is not the last good sync', () => {
    const rows = [row({ id: 'a', tenant_name: 'A Pty Ltd', last_synced_at: hoursAgo(26) })]
    expect(businessDataClock(rows, jobs({ 'tenant-a': hoursAgo(26) }), [drew('tenant-a', hoursAgo(2))])).toMatchObject({
      lastSyncAt: hoursAgo(26),
    })
  })

  it('a counted org with no clock whose figures are on the page is dated by them, not "not yet"', () => {
    // Reconnected after a long gap: a new row, never stamped, no job in the
    // lookup's window — and last year's figures still on the page.
    const rows = [row({ id: 'a', tenant_name: 'A Pty Ltd', created_at: hoursAgo(1) })]
    expect(businessDataClock(rows, jobs({}), [drew('tenant-a', hoursAgo(24 * 90))])).toEqual({
      status: 'synced',
      lastSyncAt: hoursAgo(24 * 90),
      orgs: [{ tenantName: 'A Pty Ltd', lastSyncAt: hoursAgo(24 * 90) }],
    })
  })
})

describe('businessDataClock — figures from an org that no longer counts', () => {
  it('are dated by when they were written — the IICT case', () => {
    // Two orgs reconnected and synced an hour ago. The third org's connection is
    // gone, but its rows are still in the mirror and in the charts, written 130h
    // ago. Counting only the connection rows would print the fresh date.
    const rows = [
      row({ id: 'aust', tenant_name: 'IICT (Aust) Pty Ltd', last_synced_at: hoursAgo(1) }),
      row({ id: 'limited', tenant_name: 'IICT Group Limited', last_synced_at: hoursAgo(1) }),
    ]
    const clock = jobs({ 'tenant-aust': hoursAgo(1), 'tenant-limited': hoursAgo(1), 'tenant-pty': hoursAgo(130) })
    const shownConnected = [drew('tenant-aust', hoursAgo(1)), drew('tenant-limited', hoursAgo(1))]

    expect(businessDataClock(rows, clock, shownConnected)).toMatchObject({ lastSyncAt: hoursAgo(1) })
    expect(businessDataClock(rows, clock, [...shownConnected, drew('tenant-pty', hoursAgo(130))])).toEqual({
      status: 'synced',
      lastSyncAt: hoursAgo(130),
      orgs: [
        { tenantName: null, lastSyncAt: hoursAgo(130) },
        { tenantName: 'IICT (Aust) Pty Ltd', lastSyncAt: hoursAgo(1) },
        { tenantName: 'IICT Group Limited', lastSyncAt: hoursAgo(1) },
      ],
    })
  })

  it("keep their date once the tenant's last sync leaves the lookup's window — no cliff at 60 days", () => {
    const rows = [row({ id: 'aust', tenant_name: 'IICT (Aust) Pty Ltd', last_synced_at: hoursAgo(1) })]
    expect(
      businessDataClock(rows, jobs({ 'tenant-aust': hoursAgo(1) }), [drew('tenant-aust', hoursAgo(1)), drew('tenant-pty', hoursAgo(24 * 70))]),
    ).toMatchObject({ status: 'synced', lastSyncAt: hoursAgo(24 * 70) })
  })

  it('are not made fresh by a sync of the same Xero org under another business', () => {
    // sync_jobs is keyed by tenant: another business syncing this org an hour ago
    // says nothing about these rows, written 130h ago.
    expect(businessDataClock([], jobs({ 'tenant-pty': hoursAgo(1) }), [drew('tenant-pty', hoursAgo(130))])).toEqual({
      status: 'synced',
      lastSyncAt: hoursAgo(130),
      orgs: [{ tenantName: null, lastSyncAt: hoursAgo(130) }],
    })
  })

  it('a business with no connection left, whose figures are still drawn, gets a date — not none', () => {
    expect(businessDataClock([], jobs({}), [drew('tenant-gone', hoursAgo(20))])).toEqual({
      status: 'synced',
      lastSyncAt: hoursAgo(20),
      orgs: [{ tenantName: null, lastSyncAt: hoursAgo(20) }],
    })
  })

  it('a retired org sets nothing while its figures are not drawn', () => {
    const rows = [
      row({ id: 'live', tenant_name: 'Live Org', last_synced_at: hoursAgo(2) }),
      row({ id: 'wound-up', tenant_name: 'Wound Up Pty Ltd', is_active: false, include_in_consolidation: false, last_synced_at: hoursAgo(24 * 50) }),
    ]
    expect(businessDataClock(rows, jobs({}), [drew('tenant-live', hoursAgo(2))])).toEqual({
      status: 'synced',
      lastSyncAt: hoursAgo(2),
      orgs: [{ tenantName: 'Live Org', lastSyncAt: hoursAgo(2) }],
    })
  })

  it('a retired org whose figures are still drawn counts, under its own name, capped by its figures’ write', () => {
    const rows = [
      row({ id: 'live', tenant_name: 'Live Org', last_synced_at: hoursAgo(2) }),
      // Stamped yesterday by a writer that stamps every row of the business — its
      // figures were last written 50 days ago.
      row({ id: 'wound-up', tenant_name: 'Wound Up Pty Ltd', is_active: false, include_in_consolidation: false, last_synced_at: hoursAgo(24) }),
    ]
    expect(
      businessDataClock(rows, jobs({}), [drew('tenant-live', hoursAgo(2)), drew('tenant-wound-up', hoursAgo(24 * 50))]),
    ).toEqual({
      status: 'synced',
      lastSyncAt: hoursAgo(24 * 50),
      orgs: [
        { tenantName: 'Wound Up Pty Ltd', lastSyncAt: hoursAgo(24 * 50) },
        { tenantName: 'Live Org', lastSyncAt: hoursAgo(2) },
      ],
    })
  })

  it('an org renamed across its leftover rows reads its newest row’s name, whatever the row order', () => {
    const retired = { is_active: false, include_in_consolidation: false, tenant_id: 'tenant-x' }
    const live = row({ id: 'live', tenant_name: 'Live Org', last_synced_at: hoursAgo(1) })
    const older = row({ id: 'old', tenant_name: 'Old Name Pty Ltd', created_at: hoursAgo(24 * 300), ...retired })
    const newer = row({ id: 'new', tenant_name: 'New Name Pty Ltd', created_at: hoursAgo(24 * 100), ...retired })
    const shown = [drew('tenant-live', hoursAgo(1)), drew('tenant-x', hoursAgo(24 * 40))]
    for (const rows of [
      [live, older, newer],
      [newer, live, older],
    ]) {
      expect(businessDataClock(rows, jobs({}), shown)).toMatchObject({
        orgs: [{ tenantName: 'New Name Pty Ltd', lastSyncAt: hoursAgo(24 * 40) }, { tenantName: 'Live Org' }],
      })
    }
  })

  it('when every org is retired they count after all, as they do for the status', () => {
    const retired = { is_active: false, include_in_consolidation: false }
    const rows = [
      row({ id: 'a', tenant_name: 'A', last_synced_at: hoursAgo(24 * 20), ...retired }),
      row({ id: 'b', tenant_name: 'B', last_synced_at: hoursAgo(24 * 30), ...retired }),
    ]
    expect(businessDataClock(rows, jobs({}), NOTHING_DRAWN)).toMatchObject({ status: 'synced', lastSyncAt: hoursAgo(24 * 30) })
  })

  it('a dead row superseded by a live row for the same org is not an org', () => {
    const rows = [
      row({ id: 'old', tenant_id: 'tenant-x', tenant_name: 'X Pty Ltd', is_active: false, last_synced_at: hoursAgo(24 * 30) }),
      row({ id: 'reconnected', tenant_id: 'tenant-x', tenant_name: 'X Pty Ltd', last_synced_at: hoursAgo(1) }),
    ]
    expect(businessDataClock(rows, jobs({}), [drew('tenant-x', hoursAgo(1))])).toEqual({
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
    expect(businessDataClock(rows, jobs({ 'tenant-a': hoursAgo(1) }, false), [drew('tenant-a', hoursAgo(1))])).toEqual({
      status: 'unknown',
    })
  })

  it('a failed lookup for drawn figures with no connection left is unknown', () => {
    expect(businessDataClock([], jobs({}, false), [drew('tenant-gone', hoursAgo(1))])).toEqual({ status: 'unknown' })
  })

  it('a failed lookup with no connection and no figures is still none — there was nothing to look up', () => {
    expect(businessDataClock([], jobs({}, false), NOTHING_DRAWN)).toEqual({ status: 'none' })
  })

  it('an org with no tenant_id cannot be looked up in sync_jobs, so the clock is unknown', () => {
    const rows = [
      row({ id: 'a', tenant_name: 'A', last_synced_at: hoursAgo(1) }),
      row({ id: 'blank', tenant_id: '   ', tenant_name: 'Blank', last_synced_at: hoursAgo(1) }),
    ]
    expect(businessDataClock(rows, jobs({ 'tenant-a': hoursAgo(1) }), NOTHING_DRAWN)).toEqual({ status: 'unknown' })
  })

  it('a drawn row with no tenant_id cannot be dated, so the clock is unknown', () => {
    const rows = [row({ id: 'a', tenant_name: 'A', last_synced_at: hoursAgo(1) })]
    expect(businessDataClock(rows, jobs({}), [drew('tenant-a', hoursAgo(1)), drew(null, hoursAgo(1))])).toEqual({ status: 'unknown' })
    expect(businessDataClock(rows, jobs({}), [drew('tenant-a', hoursAgo(1)), drew('  ', hoursAgo(1))])).toEqual({ status: 'unknown' })
    expect(businessDataClock([], jobs({}), [drew(null, hoursAgo(1))])).toEqual({ status: 'unknown' })
  })

  it('drawn figures with no write time cannot be dated, so the clock is unknown — counted or not', () => {
    const rows = [row({ id: 'a', tenant_name: 'A', last_synced_at: hoursAgo(1) })]
    expect(businessDataClock(rows, jobs({}), [drew('tenant-a', null)])).toEqual({ status: 'unknown' })
    expect(businessDataClock(rows, jobs({}), [drew('tenant-a', hoursAgo(1)), drew('tenant-gone', 'not a date')])).toEqual({
      status: 'unknown',
    })
  })
})
