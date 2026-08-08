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
  classifyXeroConnection,
  needsAttention,
  preferConnection,
  ACCESS_TOKEN_TTL_MS,
  TOKEN_VERIFIED_WINDOW_MS,
  DATA_STALE_MS,
  FIRST_SYNC_GRACE_MS,
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

describe('preferConnection — which row wins for one business', () => {
  const live = { id: 'live', is_active: true }
  const dead = { id: 'dead', is_active: false }

  it('takes the first row when nothing is held yet', () => {
    expect(preferConnection(null, dead)).toBe(dead)
  })

  it('an active row displaces a dead one even when the dead one is newer', () => {
    expect(preferConnection(dead, live)).toBe(live)
  })

  it('keeps the held row otherwise — the caller ordered by updated_at DESC', () => {
    expect(preferConnection(live, dead)).toBe(live)
    expect(preferConnection(live, { id: 'other', is_active: true })).toBe(live)
  })
})
