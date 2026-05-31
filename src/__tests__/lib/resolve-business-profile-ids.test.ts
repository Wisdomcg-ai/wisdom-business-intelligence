/**
 * R1 — characterization lock for the canonical `resolveBusinessProfileIds`
 * (`src/lib/business/resolveBusinessProfileIds.ts`).
 *
 * This is the SOLE business↔profile id resolver (the legacy role-blind
 * `resolveBusinessIds` shim was deleted in the R1 cleanup once every caller had
 * migrated). The suite pins the three resolution paths, the load-bearing `all`
 * ordering, and the post-PR-6 no-memoization contract:
 *   1. forward  — input is `businesses.id`        → look up the matching profile
 *   2. reverse  — input is `business_profiles.id` → look up the parent business
 *   3. fallback — input resolves to neither        → businessId == profileId == input
 *   4. no memoization — every call re-queries (the module-level cache was
 *      removed in R1 PR-6; a warm serverless instance must never serve a stale
 *      id pair)
 *
 * Note on `all` ordering (load-bearing for `.in('business_id', …)` queries):
 *   - forward/reverse path: all = [profileId, bizId]
 *   - fallback path:        all = [input]   (single element)
 *
 * The fake Supabase client models only the `business_profiles` lookups by
 * `business_id` and by `id`, which is all the resolver touches. It exposes a
 * `calls` counter so the no-memo cases can assert DB round-trips.
 */
import { describe, it, expect } from 'vitest'
import { resolveBusinessProfileIds } from '@/lib/business/resolveBusinessProfileIds'

type ProfileRow = { id: string; business_id: string }

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
          const match = rows.find((r) =>
            col === 'id' ? r.id === val : r.business_id === val,
          )
          return { data: match ?? null, error: null }
        },
      }
      return chain
    },
  }
  return client
}

describe('resolveBusinessProfileIds — canonical resolver (R1)', () => {
  it('forward: businesses.id input → branded { businessId, profileId, all:[profileId,bizId] }', async () => {
    const bizId = 'biz-bp-fwd'
    const profileId = 'prof-bp-fwd'
    const res = await resolveBusinessProfileIds(
      makeClient([{ id: profileId, business_id: bizId }]) as any,
      bizId,
    )
    expect(res.businessId).toBe(bizId)
    expect(res.profileId).toBe(profileId)
    expect(res.all).toEqual([profileId, bizId])
  })

  it('reverse: business_profiles.id input → branded parent business; all:[profileId,bizId]', async () => {
    const bizId = 'biz-bp-rev'
    const profileId = 'prof-bp-rev'
    const res = await resolveBusinessProfileIds(
      makeClient([{ id: profileId, business_id: bizId }]) as any,
      profileId,
    )
    expect(res.businessId).toBe(bizId)
    expect(res.profileId).toBe(profileId)
    expect(res.all).toEqual([profileId, bizId])
  })

  it('fallback: unresolvable id echoes itself for both; all:[input] (preserved)', async () => {
    const orphan = 'orphan-bp-1'
    const res = await resolveBusinessProfileIds(makeClient([]) as any, orphan)
    expect(res.businessId).toBe(orphan)
    expect(res.profileId).toBe(orphan)
    expect(res.all).toEqual([orphan])
  })

  it('no memoization: a repeat call for the same input re-queries the DB (PR-6)', async () => {
    const bizId = 'biz-bp-memo'
    const profileId = 'prof-bp-memo'
    const client = makeClient([{ id: profileId, business_id: bizId }])

    await resolveBusinessProfileIds(client as any, bizId)
    const callsAfterFirst = client.calls.count
    await resolveBusinessProfileIds(client as any, bizId)

    // Module cache removed in PR-6 → the second call hits the DB again.
    expect(client.calls.count).toBeGreaterThan(callsAfterFirst)
  })

  it('no cross-key memo: resolving by the other id re-queries (PR-6)', async () => {
    const bizId = 'biz-bp-memo2'
    const profileId = 'prof-bp-memo2'
    const client = makeClient([{ id: profileId, business_id: bizId }])

    await resolveBusinessProfileIds(client as any, bizId) // forward resolve, no caching
    const callsAfterFirst = client.calls.count

    // Ask by the OTHER key — re-queries; nothing is memoized.
    const res = await resolveBusinessProfileIds(client as any, profileId)
    expect(client.calls.count).toBeGreaterThan(callsAfterFirst)
    expect(res.businessId).toBe(bizId)
    expect(res.profileId).toBe(profileId)
  })

  it('fallback path re-queries on the next call (PR-6: no path is cached)', async () => {
    const orphan = 'orphan-bp-memo'
    const client = makeClient([])

    await resolveBusinessProfileIds(client as any, orphan)
    const callsAfterFirst = client.calls.count
    await resolveBusinessProfileIds(client as any, orphan)

    expect(client.calls.count).toBeGreaterThan(callsAfterFirst)
  })
})
