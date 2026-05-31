/**
 * R1 PR-0 — branded bidirectional business↔profile id mapping.
 *
 * This is the FIRST, deliberately zero-risk slice of the R1 resolver
 * consolidation. It does NOT rewire any call site and it does NOT reimplement
 * any logic: it simply DELEGATES to the existing role-blind mapper
 * `resolveBusinessIds` (`src/lib/utils/resolve-business-ids.ts`) and re-brands
 * its result into the canonical `@/lib/types/ids` types.
 *
 * Why delegate instead of copy the logic
 * --------------------------------------
 * Behaviour is then identical to the legacy resolver BY CONSTRUCTION — same two
 * `business_profiles` lookups, same module-level memo, same input-echo fallback
 * for unresolvable ids, same load-bearing `all` ordering. There is no second
 * implementation that can silently drift from the original. The equivalence
 * test (`resolve-business-profile-ids.test.ts`) pins that the only difference is
 * the branding of the returned fields.
 *
 * What this unlocks
 * -----------------
 * Call sites can migrate, one at a time in later PRs, from the unbranded
 * `{ bizId, profileId }` shape to the branded `{ businessId, profileId }` shape
 * — getting TypeScript protection against the `businesses.id` ⇄
 * `business_profiles.id` ⇄ `user.id` confusion (the #1 incident class) WITHOUT
 * changing runtime behaviour. The legacy resolver stays in place until every
 * caller has moved; only then (a later PR) do we touch the never-invalidated
 * cache and the echo fallback — both of which are still relied upon in prod and
 * must outlive R14's data cleanse.
 *
 * IMPORTANT: the input-echo fallback is preserved on purpose. For a tenant whose
 * stored `business_id` is a polluted wrong-id-class value, this keeps money
 * reads degrading to "no rows" instead of throwing. Do not stricten it here.
 */
import { resolveBusinessIds } from '@/lib/utils/resolve-business-ids'
import {
  type BusinessId,
  type BusinessProfileId,
  toBusinessId,
  toBusinessProfileId,
} from '@/lib/types/ids'

export interface ResolvedBusinessProfileIds {
  /** The `businesses.id` (used by business_users, business_kpis, etc.). */
  businessId: BusinessId
  /** The `business_profiles.id` (used by xero_connections, financial_forecasts, xero_pl_lines). */
  profileId: BusinessProfileId
  /**
   * Both ids for `.in()` queries, in the legacy load-bearing order:
   *   - forward/reverse path: `[profileId, businessId]`
   *   - fallback path:        `[input]` (single element)
   */
  all: string[]
}

/**
 * Accepts EITHER a `businesses.id` or a `business_profiles.id` and returns both,
 * branded. Pure re-branding of `resolveBusinessIds` — see the module doc for why
 * this delegates rather than reimplements.
 */
export async function resolveBusinessProfileIds(
  supabase: { from: (table: string) => unknown },
  businessId: string,
): Promise<ResolvedBusinessProfileIds> {
  const { bizId, profileId, all } = await resolveBusinessIds(
    supabase as { from: (table: string) => any },
    businessId,
  )
  return {
    businessId: toBusinessId(bizId),
    profileId: toBusinessProfileId(profileId),
    all,
  }
}
