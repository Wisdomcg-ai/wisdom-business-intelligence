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
 * It pins the three resolution paths and the within-process memoization:
 *   1. forward  — input is `businesses.id`        → look up the matching profile
 *   2. reverse  — input is `business_profiles.id` → look up the parent business
 *   3. fallback — input resolves to neither        → bizId == profileId == input
 *   4. memoization — a second call for either key does not re-query
 *
 * Note on `all` ordering (load-bearing for `.in()` queries):
 *   - forward path:  all = [profileId, bizId]
 *   - reverse path:  all = [inputProfileId, bizId]
 *   - fallback path: all = [input]   (single element)
 *
 * ⚠ This suite intentionally does NOT bless the resolver's module-level cache
 * as safe across requests — it only characterizes that, within one process, a
 * resolved id is memoized. The cross-request persistence of that cache is a
 * separate concern tracked outside R1.
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

// Distinct ids per test so the resolver's module-level cache never bleeds
// between cases.
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

  it('memoization: a repeat call for the same input does not re-query the DB', async () => {
    const bizId = 'biz-memo-1'
    const profileId = 'prof-memo-1'
    const client = makeClient([{ id: profileId, business_id: bizId }])

    await resolveBusinessIds(client as any, bizId)
    const callsAfterFirst = client.calls.count
    await resolveBusinessIds(client as any, bizId)

    expect(client.calls.count).toBe(callsAfterFirst)
  })

  it('memoization is bidirectional: resolving by bizId also caches the profileId key', async () => {
    const bizId = 'biz-memo-2'
    const profileId = 'prof-memo-2'
    const client = makeClient([{ id: profileId, business_id: bizId }])

    await resolveBusinessIds(client as any, bizId) // forward resolve caches both keys
    const callsAfterFirst = client.calls.count

    // Now ask by the OTHER key — should be served from cache, no new query.
    const res = await resolveBusinessIds(client as any, profileId)
    expect(client.calls.count).toBe(callsAfterFirst)
    expect(res.bizId).toBe(bizId)
    expect(res.profileId).toBe(profileId)
  })

  it('fallback path is NOT cached: an unresolvable id re-queries on the next call', async () => {
    // Documents current behavior: the fallback branch returns without writing
    // to the cache, so a later call (e.g. after the row is created) is re-run.
    const orphan = 'orphan-unresolvable-2'
    const client = makeClient([])

    await resolveBusinessIds(client as any, orphan)
    const callsAfterFirst = client.calls.count
    await resolveBusinessIds(client as any, orphan)

    expect(client.calls.count).toBeGreaterThan(callsAfterFirst)
  })
})
