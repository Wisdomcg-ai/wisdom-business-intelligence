/**
 * The ONE definition of "is this Xero connection alive", pinned at its edges.
 *
 * Three surfaces classify from this module — the coach-dashboard health pill
 * (/api/Xero/connection-health), the coach's chase list
 * (/api/coach/xero-connections), and the studio owner's integrations page. Their
 * route suites exercise it through HTTP; this file pins the thresholds
 * themselves, where an off-by-one is invisible from any route.
 *
 * The previous version of this file tested the bug. Two of its cases asserted
 * that a token valid past a 30-minute grace made a connection `verified` even
 * when the last refresh was old — a disjunct that could never fire, because
 * expires_at is stamped at refresh_time + 30min and the grace was also 30min, so
 * it reduced to `refresh_time > now`. Both cases are gone; the case they should
 * have been is `a refresh failing every tick for 13h reads auth_stale`.
 */

import { describe, it, expect } from 'vitest'
import {
  classifyBusinessConnections,
  classifyXeroConnection,
  dataClockFor,
  needsAttention,
  ACCESS_TOKEN_TTL_MS,
  TOKEN_VERIFIED_WINDOW_MS,
  DATA_STALE_MS,
  FIRST_SYNC_GRACE_MS,
  type XeroConnectionStatus,
  type XeroConnectionStatusRow,
} from '@/lib/xero/connection-status'

const NOW = Date.parse('2026-07-28T12:00:00.000Z')
const at = (offsetMs: number) => new Date(NOW + offsetMs).toISOString()

/** A token granted `ageMs` ago — expires_at is always grant + the 30-min TTL. */
const tokenGrantedAgo = (ageMs: number) => at(-ageMs + ACCESS_TOKEN_TTL_MS)

const row = (over: Partial<XeroConnectionStatusRow> = {}): XeroConnectionStatusRow => ({
  id: 'c1',
  business_id: 'b1',
  tenant_id: 't1',
  is_active: true,
  last_synced_at: at(-60_000),
  updated_at: at(-60_000),
  expires_at: tokenGrantedAgo(60_000),
  created_at: at(-30 * 86_400_000),
  ...over,
})

/** A healthy data clock: synced a minute ago, lookup succeeded. */
const freshClock = { lastSyncMs: NOW - 60_000, lookupOk: true }

describe('classifyXeroConnection — absence and terminal states', () => {
  it('no row is "none", not "dead" — never connected differs from disconnected', () => {
    expect(classifyXeroConnection(null, freshClock, NOW).status).toBe('none')
    expect(classifyXeroConnection(undefined, freshClock, NOW).status).toBe('none')
  })

  it('is_active=false is dead regardless of how fresh the token looks', () => {
    const c = classifyXeroConnection(row({ is_active: false }), freshClock, NOW)
    expect(c.status).toBe('dead')
  })

  it('a NULL is_active is treated as dead, not as connected', () => {
    expect(classifyXeroConnection(row({ is_active: null }), freshClock, NOW).status).toBe('dead')
  })
})

describe('classifyXeroConnection — "we could not check" is never green', () => {
  it('a failed sync_jobs lookup is unknown, NOT connected', () => {
    // The whole point of the tier. Before, a failed lookup produced an empty map
    // that read as "nobody has synced", which the caller rendered as fine.
    const c = classifyXeroConnection(row(), { lastSyncMs: null, lookupOk: false }, NOW)
    expect(c.status).toBe('unknown')
  })

  it('an unparseable expires_at is unknown — the auth clock cannot be derived', () => {
    expect(classifyXeroConnection(row({ expires_at: 'not-a-date' }), freshClock, NOW).status)
      .toBe('unknown')
    expect(classifyXeroConnection(row({ expires_at: null }), freshClock, NOW).status)
      .toBe('unknown')
  })

  it('a blank tenant_id is unknown — the data lookup could not have been keyed', () => {
    expect(classifyXeroConnection(row({ tenant_id: '   ' }), freshClock, NOW).status).toBe('unknown')
    expect(classifyXeroConnection(row({ tenant_id: null }), freshClock, NOW).status).toBe('unknown')
  })

  it('unknown outranks a stale data clock — worst truth wins', () => {
    const c = classifyXeroConnection(
      row({ tenant_id: '' }),
      { lastSyncMs: NOW - 30 * 86_400_000, lookupOk: true },
      NOW,
    )
    expect(c.status).toBe('unknown')
  })
})

describe('classifyXeroConnection — the auth axis', () => {
  it('THE REGRESSION TEST: a refresh failing every tick for 13h is auth_stale', () => {
    // This is the Caringbah class, and the case the old predicate could not
    // express. The refresh cron writes the row twice per tick (lock acquire, lock
    // release in a finally) BEFORE it knows whether Xero said yes, and an
    // unconditional DB trigger bumps updated_at on every write. So updated_at is
    // one minute old while no token has been granted in 13 hours. The old
    // classifier read updated_at and said "verified".
    const c = classifyXeroConnection(
      row({
        updated_at: at(-60_000), // trigger bumped it moments ago
        expires_at: tokenGrantedAgo(13 * 60 * 60_000), // ...but Xero last said yes 13h back
      }),
      freshClock,
      NOW,
    )
    expect(c.status).toBe('auth_stale')
  })

  it('one minute inside the 12h window is still fine', () => {
    const c = classifyXeroConnection(
      row({ expires_at: tokenGrantedAgo(TOKEN_VERIFIED_WINDOW_MS - 60_000) }),
      freshClock,
      NOW,
    )
    expect(c.status).toBe('connected')
  })

  it('exactly at the 12h boundary is auth_stale — the window is exclusive', () => {
    const c = classifyXeroConnection(
      row({ expires_at: tokenGrantedAgo(TOKEN_VERIFIED_WINDOW_MS) }),
      freshClock,
      NOW,
    )
    expect(c.status).toBe('auth_stale')
  })

  it('a broken auth axis outranks a healthy data axis', () => {
    const c = classifyXeroConnection(
      row({ expires_at: tokenGrantedAgo(20 * 60 * 60_000) }),
      freshClock,
      NOW,
    )
    expect(c.status).toBe('auth_stale')
  })

  it('lastTokenRefreshAt is expires_at minus the token TTL, not updated_at', () => {
    const c = classifyXeroConnection(
      row({ updated_at: at(-1_000), expires_at: tokenGrantedAgo(3 * 60 * 60_000) }),
      freshClock,
      NOW,
    )
    expect(c.lastTokenRefreshAt).toBe(at(-3 * 60 * 60_000))
  })
})

describe('classifyXeroConnection — the data axis', () => {
  it('token fine but numbers 3 days old is data_stale, not connected', () => {
    const c = classifyXeroConnection(
      row(),
      { lastSyncMs: NOW - 3 * 86_400_000, lookupOk: true },
      NOW,
    )
    expect(c.status).toBe('data_stale')
  })

  it('inside 48h is connected; exactly at 48h is data_stale', () => {
    expect(
      classifyXeroConnection(row(), { lastSyncMs: NOW - (DATA_STALE_MS - 60_000), lookupOk: true }, NOW).status,
    ).toBe('connected')
    expect(
      classifyXeroConnection(row(), { lastSyncMs: NOW - DATA_STALE_MS, lookupOk: true }, NOW).status,
    ).toBe('data_stale')
  })

  it('a caller may pass a laxer threshold — the owner page uses 72h', () => {
    const clock = { lastSyncMs: NOW - 60 * 60 * 60_000, lookupOk: true } // 60h
    expect(classifyXeroConnection(row(), clock, NOW).status).toBe('data_stale')
    expect(classifyXeroConnection(row(), clock, NOW, 72 * 60 * 60_000).status).toBe('connected')
  })

  it('never synced but only just connected is pending_first_sync, not an alarm', () => {
    const c = classifyXeroConnection(
      row({ created_at: at(-2 * 60 * 60_000) }),
      { lastSyncMs: null, lookupOk: true },
      NOW,
    )
    expect(c.status).toBe('pending_first_sync')
  })

  it('never synced and connected 3 days ago IS an alarm', () => {
    // The old check exempted never-synced connections outright and forever, so a
    // connection that never once worked was permanently invisible. Every studio
    // onboarding at launch starts in this state.
    const c = classifyXeroConnection(
      row({ created_at: at(-(FIRST_SYNC_GRACE_MS + 60_000)) }),
      { lastSyncMs: null, lookupOk: true },
      NOW,
    )
    expect(c.status).toBe('data_stale')
  })

  it('never synced with no created_at falls to data_stale, not to a free pass', () => {
    const c = classifyXeroConnection(
      row({ created_at: null }),
      { lastSyncMs: null, lookupOk: true },
      NOW,
    )
    expect(c.status).toBe('data_stale')
  })
})

describe('needsAttention', () => {
  it('covers every state a human must act on, and no others', () => {
    expect(needsAttention('dead')).toBe(true)
    expect(needsAttention('auth_stale')).toBe(true)
    expect(needsAttention('data_stale')).toBe(true)
    expect(needsAttention('unknown')).toBe(true)
    expect(needsAttention('connected')).toBe(false)
    expect(needsAttention('pending_first_sync')).toBe(false)
    expect(needsAttention('none')).toBe(false)
  })
})

describe('dataClockFor — one row, its own tenant', () => {
  const syncClock = (byTenant: Record<string, number>, ok = true) => ({ ok, byTenant: new Map(Object.entries(byTenant)) })

  it('takes the fresher of the stamped column and the sync_jobs clock for the row’s tenant', () => {
    expect(dataClockFor(row({ last_synced_at: at(-5 * 3_600_000) }), syncClock({ t1: NOW - 3_600_000 })))
      .toEqual({ lastSyncMs: NOW - 3_600_000, lookupOk: true })
    expect(dataClockFor(row({ last_synced_at: at(-3_600_000) }), syncClock({ t1: NOW - 5 * 3_600_000 })))
      .toEqual({ lastSyncMs: NOW - 3_600_000, lookupOk: true })
  })

  it('never borrows another tenant’s clock', () => {
    expect(dataClockFor(row({ last_synced_at: null }), syncClock({ t2: NOW - 60_000 })).lastSyncMs).toBeNull()
  })

  it('an unparseable column does not erase a real sync_jobs clock', () => {
    expect(dataClockFor(row({ last_synced_at: 'garbage' }), syncClock({ t1: NOW - 60_000 })).lastSyncMs)
      .toBe(NOW - 60_000)
  })

  it('carries a failed lookup through as lookupOk=false', () => {
    expect(dataClockFor(row(), syncClock({}, false)).lookupOk).toBe(false)
  })
})

describe('classifyBusinessConnections — a business is as healthy as its worst org', () => {
  const HOUR = 3_600_000
  const DAY = 24 * HOUR

  const syncClock = (byTenant: Record<string, number> = {}, ok = true) => ({
    ok,
    byTenant: new Map(Object.entries(byTenant)),
  })

  /** One org's live row, healthy unless overridden. Clocks come from last_synced_at. */
  const org = (tenant: string, over: Partial<XeroConnectionStatusRow> = {}): XeroConnectionStatusRow =>
    row({ id: `conn-${tenant}`, tenant_id: tenant, tenant_name: `${tenant} Pty Ltd`, ...over })

  /** Every ordering of `items` — the reducer must not care which one it gets. */
  const permutations = <T,>(items: T[]): T[][] =>
    items.length <= 1
      ? [items]
      : items.flatMap((item, i) => permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [item, ...rest]))

  const expectOrderIndependent = (rows: XeroConnectionStatusRow[], clock = syncClock()) => {
    const baseline = classifyBusinessConnections(rows, clock, NOW)
    for (const ordering of permutations(rows)) {
      expect(classifyBusinessConnections(ordering, clock, NOW)).toEqual(baseline)
    }
    return baseline
  }

  it('no rows is "none", with nothing to name', () => {
    const c = classifyBusinessConnections([], syncClock(), NOW)
    expect(c).toMatchObject({ status: 'none', connectionId: null, lastSyncAt: null, tenantName: null, orgs: [], statusScope: null })
  })

  it('THE REGRESSION TEST: IICT Group — one of three orgs 403ing reads data_stale however the rows were last written', () => {
    // 15 Sep 2026. IICT Group Pty Ltd has failed every sync since 10 Sep 16:11
    // UTC while its token keeps refreshing; its two siblings sync on schedule.
    // Every refresh and sync bumps updated_at, and the routes classified
    // whichever row was written last — so the pill read data_stale only while
    // the failing org happened to be the latest write, and connected after any
    // sibling's sync. Here each org takes a turn as the latest write, in every
    // row order.
    const lastGood = NOW - 4.4 * DAY
    const rows = [
      org('iict-aust', { id: 'f9c98d7f', tenant_name: 'IICT (Aust) Pty Ltd', last_synced_at: at(-3 * HOUR) }),
      org('iict-pty', { id: '4bd37c02', tenant_name: 'IICT Group Pty Ltd', last_synced_at: new Date(lastGood).toISOString() }),
      org('iict-hk', { id: '09cad39a', tenant_name: 'IICT Group Limited', last_synced_at: at(-3 * HOUR) }),
    ]
    const clock = syncClock({ 'iict-aust': NOW - 3 * HOUR, 'iict-pty': lastGood, 'iict-hk': NOW - 3 * HOUR })
    const writeStamps = [at(-30_000), at(-60_000), at(-90_000)]

    const c = classifyBusinessConnections(rows, clock, NOW)
    for (let latest = 0; latest < rows.length; latest++) {
      const restamped = rows.map((r, i) => ({ ...r, updated_at: writeStamps[(i + latest) % rows.length] }))
      expect(expectOrderIndependent(restamped, clock)).toEqual(c)
    }
    expect(c.status).toBe('data_stale')
    expect(c.tenantName).toBe('IICT Group Pty Ltd')
    expect(c.statusScope).toBe('IICT Group Pty Ltd')
    expect(c.connectionId).toBe('4bd37c02')
    // The headline clock explains the status — the dead org's, not a sibling's.
    expect(c.lastSyncAt).toBe(new Date(lastGood).toISOString())
    expect(c.orgs.map((o) => o.status)).toEqual(['data_stale', 'connected', 'connected'])
  })

  describe('worst truth wins across the full precedence', () => {
    // One org per status, each on its own tenant.
    const makers: Record<Exclude<XeroConnectionStatus, 'none'>, () => XeroConnectionStatusRow> = {
      dead: () => org('t-dead', { is_active: false }),
      unknown: () => org('t-unknown', { expires_at: null }),
      auth_stale: () => org('t-auth', { expires_at: tokenGrantedAgo(13 * HOUR) }),
      data_stale: () => org('t-data', { last_synced_at: at(-3 * DAY) }),
      pending_first_sync: () => org('t-pending', { last_synced_at: null, created_at: at(-2 * HOUR) }),
      connected: () => org('t-ok'),
    }
    const precedence = ['dead', 'unknown', 'auth_stale', 'data_stale', 'pending_first_sync', 'connected'] as const

    it('each fixture really is the status it is named for', () => {
      for (const status of precedence) {
        expect(classifyBusinessConnections([makers[status]()], syncClock(), NOW).status).toBe(status)
      }
    })

    for (let i = 0; i < precedence.length; i++) {
      for (let j = i + 1; j < precedence.length; j++) {
        const worse = precedence[i]
        const better = precedence[j]
        it(`${worse} beats ${better}, in either order`, () => {
          const c = expectOrderIndependent([makers[better](), makers[worse]()])
          expect(c.status).toBe(worse)
          expect(c.statusScope).toBe(makers[worse]().tenant_name)
        })
      }
    }

    it('all six at once is dead, and every org is still listed worst first', () => {
      const c = expectOrderIndependent(precedence.map((s) => makers[s]()))
      expect(c.status).toBe('dead')
      expect(c.orgs.map((o) => o.status)).toEqual([...precedence])
    })
  })

  it('each org is judged on its OWN tenant’s sync clock, never a sibling’s', () => {
    // Neither row has the stamped column; freshness comes only from sync_jobs.
    const rows = [
      org('t-fresh', { last_synced_at: null }),
      org('t-cold', { last_synced_at: null }),
    ]
    const c = expectOrderIndependent(rows, syncClock({ 't-fresh': NOW - HOUR, 't-cold': NOW - 3 * DAY }))
    expect(c.status).toBe('data_stale')
    expect(c.tenantName).toBe('t-cold Pty Ltd')
  })

  it('either clock source is enough for an org — its stamped column or its tenant’s sync_jobs row', () => {
    const rows = [org('t-a', { last_synced_at: at(-HOUR) }), org('t-b', { last_synced_at: null })]
    expect(classifyBusinessConnections(rows, syncClock({ 't-b': NOW - 2 * HOUR }), NOW).status).toBe('connected')
  })

  describe('dead rows', () => {
    it('a dead row superseded by a live row for the SAME org does not poison the business', () => {
      // A reconnect that landed under the other business-id form: the old rows
      // are dead, stamped more recently than the live ones on their way out.
      const live = ['t1', 't2', 't3'].map((t) => org(t, { business_id: 'biz', updated_at: at(-2 * HOUR) }))
      const old = ['t1', 't2', 't3'].map((t) =>
        org(t, { id: `old-${t}`, business_id: 'profile', is_active: false, last_synced_at: null, updated_at: at(-60_000), expires_at: at(-120 * DAY) }),
      )
      const c = expectOrderIndependent([...old, ...live])
      expect(c.status).toBe('connected')
      expect(c.orgs).toHaveLength(3)
      expect(c.orgs.map((o) => o.connectionId).sort()).toEqual(['conn-t1', 'conn-t2', 'conn-t3'])
    })

    it('a dead org with NO live row makes the business dead, and names that org', () => {
      // Dragon Roofing shape: one org fine, the other refused by Xero. The
      // business's numbers now cover one of two entities.
      const rows = [
        org('dragon', { tenant_name: 'Dragon Roofing Pty Ltd' }),
        org('easyhail', { tenant_name: 'EASY HAIL CLAIM PTY LTD', is_active: false }),
      ]
      const c = expectOrderIndependent(rows)
      expect(c.status).toBe('dead')
      expect(c.statusScope).toBe('EASY HAIL CLAIM PTY LTD')
      expect(c.connectionId).toBe('conn-easyhail')
    })

    it('a business whose only rows are dead is dead, business-wide', () => {
      const c = expectOrderIndependent([
        org('t1', { is_active: false }),
        org('t1', { id: 'dup-t1', is_active: false }),
        org('t2', { is_active: null }),
      ])
      expect(c.status).toBe('dead')
      expect(c.orgs).toHaveLength(2)
      expect(c.statusScope).toBeNull()
    })

    it('a dead row with a blank tenant_id cannot be matched to a live org, so it stands alone', () => {
      const c = expectOrderIndependent([org('t1'), org('t1', { id: 'blank', tenant_id: '  ', is_active: false })])
      expect(c.status).toBe('dead')
      expect(c.connectionId).toBe('blank')
    })
  })

  it('two live rows for one org (one per id form) are one org, and the worse row speaks for it', () => {
    const c = expectOrderIndependent([
      org('t1', { id: 'canonical' }),
      org('t1', { id: 'legacy', business_id: 'profile', expires_at: tokenGrantedAgo(20 * HOUR) }),
    ])
    expect(c.status).toBe('auth_stale')
    expect(c.orgs).toHaveLength(1)
    expect(c.connectionId).toBe('legacy')
    expect(c.statusScope).toBeNull()
  })

  it('a failed sync lookup is unknown for every live org — but an orphaned dead org still outranks it', () => {
    const failed = syncClock({}, false)
    expect(classifyBusinessConnections([org('t1'), org('t2')], failed, NOW)).toMatchObject({ status: 'unknown', statusScope: null })
    expect(classifyBusinessConnections([org('t1'), org('t2', { is_active: false })], failed, NOW).status).toBe('dead')
  })

  it('passes the caller’s data threshold to every org — the owner page’s 72h', () => {
    const rows = [org('t1'), org('t2', { last_synced_at: at(-60 * HOUR) })]
    expect(classifyBusinessConnections(rows, syncClock(), NOW).status).toBe('data_stale')
    expect(classifyBusinessConnections(rows, syncClock(), NOW, 72 * HOUR).status).toBe('connected')
  })

  describe('statusScope — naming only what the name makes clearer', () => {
    it('a single-org business is never scoped, even when broken', () => {
      expect(classifyBusinessConnections([org('t1', { is_active: false })], syncClock(), NOW).statusScope).toBeNull()
    })

    it('every org sharing the status is business-wide: no org named', () => {
      const c = classifyBusinessConnections(
        [org('t1', { last_synced_at: at(-3 * DAY) }), org('t2', { last_synced_at: at(-4 * DAY) })],
        syncClock(),
        NOW,
      )
      expect(c).toMatchObject({ status: 'data_stale', worstOrgCount: 2, statusScope: null })
      // The headline clock is the stalest org's: "not synced since" is honest for all.
      expect(c.lastSyncAt).toBe(at(-4 * DAY))
    })

    it('several but not all: counts instead of naming one', () => {
      const c = expectOrderIndependent([
        org('t1', { last_synced_at: at(-3 * DAY) }),
        org('t2', { last_synced_at: at(-4 * DAY) }),
        org('t3'),
      ])
      expect(c).toMatchObject({ status: 'data_stale', worstOrgCount: 2, statusScope: '2 of 3 orgs' })
    })

    it('an unnamed worst org is counted rather than left blank', () => {
      const c = classifyBusinessConnections([org('t1'), org('t2', { tenant_name: null, is_active: false })], syncClock(), NOW)
      expect(c.statusScope).toBe('1 of 2 orgs')
    })

    it('a healthy multi-org business reports its stalest org’s clock as the headline', () => {
      const c = expectOrderIndependent([org('t1', { last_synced_at: at(-HOUR) }), org('t2', { last_synced_at: at(-5 * HOUR) })])
      expect(c).toMatchObject({ status: 'connected', statusScope: null, lastSyncAt: at(-5 * HOUR) })
    })

    it('identical orgs still pick the same headline every time', () => {
      const c = expectOrderIndependent([org('t-b', { tenant_name: 'Same' }), org('t-a', { tenant_name: 'Same' }), org('t-c', { tenant_name: 'Same' })])
      expect(c.tenantId).toBe('t-a')
    })
  })
})
