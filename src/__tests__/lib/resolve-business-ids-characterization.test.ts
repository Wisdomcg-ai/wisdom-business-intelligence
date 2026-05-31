/**
 * R1 prerequisite — characterization lock for the bidirectional business-ID
 * resolver (`src/lib/utils/resolve-business-ids.ts`).
 *
 * The roadmap's testing posture is explicit: BEFORE the R1 canonicalization
 * migration (collapsing the triple business-ID collision onto
 * `business_profiles.id` for money/Xero tables), pin the CURRENT correct
 * resolver id-mapping outputs so the migration has a safety net. This suite is
 * that net for the resolver.
 *
 * It pins the three resolution paths and the (post-PR-6) no-memoization
 * contract:
 *   1. forward  — input is `businesses.id`        → look up the matching profile
 *   2. reverse  — input is `business_profiles.id` → look up the parent business
 *   3. fallback — input resolves to neither        → bizId == profileId == input
 *   4. no memoization — every call re-queries (the module-level cache was
 *      removed in R1 PR-6; see resolveBusinessProfileIds.ts)
 *
 * Note on `all` ordering (load-bearing for `.in()` queries):
 *   - forward path:  all = [profileId, bizId]
 *   - reverse path:  all = [inputProfileId, bizId]
 *   - fallback path: all = [input]   (single element)
 *
 * ⚠ R1 PR-6 removed the resolver's never-invalidated module-level cache. A warm
 * serverless instance could otherwise serve a stale id pair indefinitely. The
 * tests below now lock the OPPOSITE of the old behaviour: no call is memoized,
 * so a repeat resolution always re-queries the DB.
 */

import { describe, it, expect, vi } from 'vitest'
import { resolveBusinessIds } from '@/lib/utils/resolve-business-ids'

// ─── Fake Supabase: only models business_profiles lookups by `business_id`
//     and by `id`, which is all the resolver touches. ──────────────────────────

type ProfileRow = { id: string; business_id: string }

/**
 * `rows` is the canonical business_profiles fixture. The returned client also
 * exposes `calls` so tests can assert how many DB round-trips happened (memo
 * verification).
 */
function makeClient(rows: ProfileRow[]) {
  const calls = { count: 0 }
  const client = {
    calls,
    from: (table: string) => {
      if (table !== 'business_profiles') {
        throw new Error(`unexpected table queried: ${table}`)
      }
      let col: 'id' | 'business_id' | null = null
      let val: string | null = null
      const chain: any = {
        select: () => chain,
        eq: (column: 'id' | 'business_id', value: string) => {
          col = column
          val = value
          return chain
        },
        maybeSingle: async () => {
          calls.count++
          const match = rows.find((r) => (col === 'id' ? r.id === val : r.business_id === val))
          return { data: match ?? null, error: null }
        },
      }
      return chain
    },
  }
  return client
}

describe('resolveBusinessIds — characterization (R1 prerequisite)', () => {
  it('forward: businesses.id input resolves to the matching profile; all = [profileId, bizId]', async () => {
    const bizId = 'biz-fwd-1'
    const profileId = 'prof-fwd-1'
    const client = makeClient([{ id: profileId, business_id: bizId }])

    const res = await resolveBusinessIds(client as any, bizId)

    expect(res.bizId).toBe(bizId)
    expect(res.profileId).toBe(profileId)
    expect(res.all).toEqual([profileId, bizId])
  })

  it('reverse: business_profiles.id input resolves to the parent business; all = [profileId, bizId]', async () => {
    const bizId = 'biz-rev-1'
    const profileId = 'prof-rev-1'
    // The first lookup (.eq business_id = profileId) misses; the second
    // (.eq id = profileId) hits — that is the reverse path.
    const client = makeClient([{ id: profileId, business_id: bizId }])

    const res = await resolveBusinessIds(client as any, profileId)

    expect(res.bizId).toBe(bizId)
    expect(res.profileId).toBe(profileId)
    expect(res.all).toEqual([profileId, bizId])
  })

  it('fallback: an unresolvable id maps to itself for both, all = [input] (single element)', async () => {
    const orphan = 'orphan-unresolvable-1'
    const client = makeClient([]) // nothing matches either lookup

    const res = await resolveBusinessIds(client as any, orphan)

    expect(res.bizId).toBe(orphan)
    expect(res.profileId).toBe(orphan)
    expect(res.all).toEqual([orphan])
  })

  it('no memoization: a repeat call for the same input re-queries the DB (PR-6)', async () => {
    const bizId = 'biz-memo-1'
    const profileId = 'prof-memo-1'
    const client = makeClient([{ id: profileId, business_id: bizId }])

    await resolveBusinessIds(client as any, bizId)
    const callsAfterFirst = client.calls.count
    await resolveBusinessIds(client as any, bizId)

    // Module cache removed in PR-6 → the second call hits the DB again.
    expect(client.calls.count).toBeGreaterThan(callsAfterFirst)
  })

  it('no cross-key memo: resolving by the other id re-queries (PR-6)', async () => {
    const bizId = 'biz-memo-2'
    const profileId = 'prof-memo-2'
    const client = makeClient([{ id: profileId, business_id: bizId }])

    await resolveBusinessIds(client as any, bizId) // forward resolve, no caching
    const callsAfterFirst = client.calls.count

    // Ask by the OTHER key — re-queries; nothing is memoized.
    const res = await resolveBusinessIds(client as any, profileId)
    expect(client.calls.count).toBeGreaterThan(callsAfterFirst)
    expect(res.bizId).toBe(bizId)
    expect(res.profileId).toBe(profileId)
  })

  it('fallback path re-queries on the next call (PR-6: no path is cached)', async () => {
    // The fallback branch never resolved a row, and with the module cache gone
    // a later call (e.g. after the row is created) is always re-run.
    const orphan = 'orphan-unresolvable-2'
    const client = makeClient([])

    await resolveBusinessIds(client as any, orphan)
    const callsAfterFirst = client.calls.count
    await resolveBusinessIds(client as any, orphan)

    expect(client.calls.count).toBeGreaterThan(callsAfterFirst)
  })
})
