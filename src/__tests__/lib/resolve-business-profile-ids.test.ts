/**
 * R1 PR-0 — equivalence lock for the branded `resolveBusinessProfileIds`.
 *
 * `resolveBusinessProfileIds` (`src/lib/business/resolveBusinessProfileIds.ts`)
 * is a pure re-brand of the legacy `resolveBusinessIds`
 * (`src/lib/utils/resolve-business-ids.ts`). This suite proves the ONLY
 * difference is the branding: for every resolution path the branded result's
 * fields equal the legacy result's fields (`businessId == bizId`,
 * `profileId == profileId`, `all == all`), and the load-bearing `all` ordering
 * + the input-echo fallback are carried through unchanged.
 *
 * The fake Supabase client mirrors the one in
 * `resolve-business-ids-characterization.test.ts` — it only models the
 * `business_profiles` lookups by `business_id` and by `id`, which is all the
 * underlying resolver touches. Distinct ids per test keep the resolver's
 * module-level cache from bleeding between cases.
 */
import { describe, it, expect } from 'vitest'
import { resolveBusinessIds } from '@/lib/utils/resolve-business-ids'
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

describe('resolveBusinessProfileIds — branded equivalence (R1 PR-0)', () => {
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

  it('field-for-field equivalence with the legacy resolveBusinessIds (forward)', async () => {
    const bizId = 'biz-bp-eq'
    const profileId = 'prof-bp-eq'
    const rows = [{ id: profileId, business_id: bizId }]

    const legacy = await resolveBusinessIds(makeClient(rows) as any, bizId)
    const branded = await resolveBusinessProfileIds(makeClient(rows) as any, bizId)

    // Same values, only the field names/brands differ.
    expect(branded.businessId as string).toBe(legacy.bizId)
    expect(branded.profileId as string).toBe(legacy.profileId)
    expect(branded.all).toEqual(legacy.all)
  })

  it('field-for-field equivalence with the legacy resolveBusinessIds (fallback)', async () => {
    const orphan = 'orphan-bp-eq'

    const legacy = await resolveBusinessIds(makeClient([]) as any, orphan)
    const branded = await resolveBusinessProfileIds(makeClient([]) as any, orphan)

    expect(branded.businessId as string).toBe(legacy.bizId)
    expect(branded.profileId as string).toBe(legacy.profileId)
    expect(branded.all).toEqual(legacy.all)
  })
})
