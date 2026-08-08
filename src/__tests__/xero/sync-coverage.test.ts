/**
 * The set-difference check: did every studio that SHOULD have synced actually
 * sync?
 *
 * These cases are deliberately weighted toward the failure paths, because the
 * happy path is not what this module is for. Every per-connection check in the
 * codebase already handles a connection that reports in; the whole point here is
 * the connection that produces NOTHING — no result, no sync_jobs row, no
 * heartbeat — which every other check silently passes over.
 */

import { describe, it, expect } from 'vitest'
import {
  getXeroSyncCoverage,
  describeSyncCoverage,
  SYNC_COVERAGE_WINDOW_MS,
} from '@/lib/xero/sync-coverage'

const NOW = Date.parse('2026-07-29T07:00:00.000Z')
const at = (offsetMs: number) => new Date(NOW + offsetMs).toISOString()
const HOUR = 60 * 60 * 1000

/** Minimal supabase stand-in: one canned reply per table. */
function fakeClient(replies: {
  xero_connections?: { data: unknown; error: { message: string } | null }
  sync_jobs?: { data: unknown; error: { message: string } | null }
}) {
  return {
    from(table: string) {
      const reply = (replies as Record<string, unknown>)[table] ?? { data: [], error: null }
      const thenable = { then: (r: (v: unknown) => unknown) => Promise.resolve(reply).then(r) }
      const chain: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'in', 'gte']) chain[m] = () => ({ ...chain, ...thenable })
      return { ...chain, ...thenable }
    },
  } as never
}

const conn = (over: Partial<{ id: string; business_id: string; tenant_id: string | null; tenant_name: string | null }> = {}) => ({
  id: 'c1',
  business_id: 'b1',
  tenant_id: 't1',
  tenant_name: 'Studio One Pty Ltd',
  ...over,
})

describe('getXeroSyncCoverage', () => {
  it('a connection with a recent successful job is covered', async () => {
    const c = await getXeroSyncCoverage(
      fakeClient({
        xero_connections: { data: [conn()], error: null },
        sync_jobs: { data: [{ tenant_id: 't1' }], error: null },
      }),
      NOW,
    )
    expect(c.ok).toBe(true)
    expect(c.expected).toBe(1)
    expect(c.covered).toBe(1)
    expect(c.missing).toEqual([])
  })

  it('THE POINT: a connection with NO job at all is missing', async () => {
    // A cron that times out mid-fleet leaves its unreached studios exactly like
    // this — nothing anywhere. No other check in the system notices.
    const c = await getXeroSyncCoverage(
      fakeClient({
        xero_connections: { data: [conn(), conn({ id: 'c2', business_id: 'b2', tenant_id: 't2', tenant_name: 'Studio Two' })], error: null },
        sync_jobs: { data: [{ tenant_id: 't1' }], error: null },
      }),
      NOW,
    )
    expect(c.expected).toBe(2)
    expect(c.covered).toBe(1)
    expect(c.missing).toEqual([
      { connectionId: 'c2', businessId: 'b2', tenantId: 't2', tenantName: 'Studio Two' },
    ])
  })

  it('a whole fleet with no jobs reports every one of them, not a bare zero', async () => {
    const conns = Array.from({ length: 35 }, (_, i) =>
      conn({ id: `c${i}`, business_id: `b${i}`, tenant_id: `t${i}`, tenant_name: `Studio ${i}` }),
    )
    const c = await getXeroSyncCoverage(
      fakeClient({
        xero_connections: { data: conns, error: null },
        sync_jobs: { data: [], error: null },
      }),
      NOW,
    )
    expect(c.expected).toBe(35)
    expect(c.covered).toBe(0)
    expect(c.missing).toHaveLength(35)
  })

  it('a failed connection query is ok:false — NEVER "nothing is missing"', async () => {
    // The equivalence between "no problems found" and "could not look" is the
    // mistake this entire area kept making.
    const c = await getXeroSyncCoverage(
      fakeClient({ xero_connections: { data: null, error: { message: 'boom' } } }),
      NOW,
    )
    expect(c.ok).toBe(false)
    expect(c.error).toMatch(/connection query failed/)
    expect(c.missing).toEqual([])
  })

  it('a failed sync_jobs query is ok:false, not a fleet-wide false alarm', async () => {
    // The opposite failure mode matters too: treating an unreadable sync_jobs as
    // "nobody synced" would page someone about 35 studios that are all fine.
    const c = await getXeroSyncCoverage(
      fakeClient({
        xero_connections: { data: [conn()], error: null },
        sync_jobs: { data: null, error: { message: 'boom' } },
      }),
      NOW,
    )
    expect(c.ok).toBe(false)
    expect(c.error).toMatch(/sync_jobs query failed/)
    expect(c.missing).toEqual([])
  })

  it('a blank tenant_id is counted as uncheckable, not silently dropped', async () => {
    // Dropping it from the denominator would flatter the coverage number:
    // "1 of 1 synced" while a second connection is unverifiable.
    const c = await getXeroSyncCoverage(
      fakeClient({
        xero_connections: { data: [conn(), conn({ id: 'c2', tenant_id: '   ' }), conn({ id: 'c3', tenant_id: null })], error: null },
        sync_jobs: { data: [{ tenant_id: 't1' }], error: null },
      }),
      NOW,
    )
    expect(c.expected).toBe(1)
    expect(c.covered).toBe(1)
    expect(c.uncheckable).toBe(2)
  })

  it("ignores the outer per-business sync_jobs row, whose tenant_id is ''", async () => {
    // About half of sync_jobs carries tenant_id = ''. Treating it as a match
    // would mark a studio covered on the strength of a row belonging to nobody.
    const c = await getXeroSyncCoverage(
      fakeClient({
        xero_connections: { data: [conn()], error: null },
        sync_jobs: { data: [{ tenant_id: '' }, { tenant_id: null }], error: null },
      }),
      NOW,
    )
    expect(c.covered).toBe(0)
    expect(c.missing).toHaveLength(1)
  })

  it('no active connections is genuinely clean, not an alarm', async () => {
    const c = await getXeroSyncCoverage(fakeClient({ xero_connections: { data: [], error: null } }), NOW)
    expect(c.ok).toBe(true)
    expect(c.expected).toBe(0)
    expect(c.missing).toEqual([])
    expect(describeSyncCoverage(c)).toBeNull()
  })

  it('the window is 26h, not 24h — the check runs 15h after the sync', () => {
    expect(SYNC_COVERAGE_WINDOW_MS).toBe(26 * HOUR)
    void at
  })
})

describe('describeSyncCoverage', () => {
  const base = { ok: true as const, error: null, expected: 0, covered: 0, missing: [], uncheckable: 0 }

  it('says nothing when there is nothing to say', () => {
    expect(describeSyncCoverage({ ...base, expected: 5, covered: 5 })).toBeNull()
  })

  it('names the studios rather than only counting them', () => {
    const line = describeSyncCoverage({
      ...base,
      expected: 3,
      covered: 1,
      missing: [
        { connectionId: 'c1', businessId: 'b1', tenantId: 't1', tenantName: 'Caringbah Pty Ltd' },
        { connectionId: 'c2', businessId: 'b2', tenantId: 't2', tenantName: null },
      ],
    })
    expect(line).toMatch(/2 of 3/)
    expect(line).toMatch(/Caringbah Pty Ltd/)
    expect(line).toMatch(/t2/) // falls back to the tenant id when unnamed
  })

  it('caps the list at 10 and says how many more', () => {
    const missing = Array.from({ length: 14 }, (_, i) => ({
      connectionId: `c${i}`, businessId: `b${i}`, tenantId: `t${i}`, tenantName: `Studio ${i}`,
    }))
    expect(describeSyncCoverage({ ...base, expected: 14, covered: 0, missing })).toMatch(/\+4 more/)
  })

  it('an unknown result says UNKNOWN, and does not imply everything is fine', () => {
    const line = describeSyncCoverage({ ...base, ok: false, error: 'boom' })
    expect(line).toMatch(/UNKNOWN/)
  })
})
