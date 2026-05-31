/**
 * R1 — canonical branded bidirectional business↔profile id mapping.
 *
 * This module now OWNS the resolver implementation. It was introduced in PR-0
 * as a thin re-brand that delegated to the legacy role-blind `resolveBusinessIds`
 * (`src/lib/utils/resolve-business-ids.ts`); in PR-4 the implementation moved
 * here and the legacy file became a `@deprecated` shim that delegates BACK to
 * this function and un-brands the result. There is exactly ONE implementation —
 * this one — so the two id-spaces can never silently drift.
 *
 * Behaviour is preserved verbatim from the legacy resolver:
 *   - two `business_profiles` lookups (by `business_id`, then by `id`),
 *   - the module-level memo (never invalidated — request-scoping is R1 PR-6),
 *   - the input-echo fallback for unresolvable ids (kept until R14's data
 *     cleanse; see below),
 *   - the load-bearing `all` ordering for `.in('business_id', …)` money queries.
 *
 * IMPORTANT: the input-echo fallback is preserved on purpose. For a tenant whose
 * stored `business_id` is a polluted wrong-id-class value, this keeps money
 * reads degrading to "no rows" instead of throwing. Do not stricten it here —
 * write-side strictness is enforced separately by `assertBusinessProfileId`
 * (`sync-orchestrator.ts`).
 *
 * The branded `{ businessId, profileId }` shape gives callers TypeScript
 * protection against the `businesses.id` ⇄ `business_profiles.id` ⇄ `user.id`
 * confusion (the #1 incident class). New code should import THIS function;
 * `resolveBusinessIds` remains only as a deprecated bridge for un-migrated
 * call sites.
 */
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
 * Module-level memo — keyed by EITHER id-space. Carried over UNCHANGED from the
 * legacy resolver: it is a process-level singleton and is never invalidated by
 * design. R1 PR-6 will flip it to request-scoped / off; until then the
 * behaviour (and its warm-vs-cold-process quirk) must be identical to legacy.
 */
const cache = new Map<string, ResolvedBusinessProfileIds>()

/**
 * Accepts EITHER a `businesses.id` or a `business_profiles.id` and returns both,
 * branded, plus the `all` array used by `.in('business_id', …)` money queries.
 */
export async function resolveBusinessProfileIds(
  supabase: { from: (table: string) => any },
  businessId: string,
): Promise<ResolvedBusinessProfileIds> {
  // Check cache first.
  const cached = cache.get(businessId)
  if (cached) return cached

  // Try 1: input is businesses.id → look up business_profiles.id.
  const { data: profile } = await supabase
    .from('business_profiles')
    .select('id, business_id')
    .eq('business_id', businessId)
    .maybeSingle()

  if (profile?.id) {
    const result: ResolvedBusinessProfileIds = {
      businessId: toBusinessId(businessId),
      profileId: toBusinessProfileId(profile.id),
      all: [profile.id, businessId],
    }
    cache.set(businessId, result)
    cache.set(profile.id, result)
    return result
  }

  // Try 2: input is business_profiles.id → look up businesses.id.
  const { data: profileRow } = await supabase
    .from('business_profiles')
    .select('id, business_id')
    .eq('id', businessId)
    .maybeSingle()

  if (profileRow?.business_id) {
    const result: ResolvedBusinessProfileIds = {
      businessId: toBusinessId(profileRow.business_id),
      profileId: toBusinessProfileId(businessId),
      all: [businessId, profileRow.business_id],
    }
    cache.set(businessId, result)
    cache.set(profileRow.business_id, result)
    return result
  }

  // Fallback: couldn't resolve → echo the input as both ids. NOT cached
  // (preserved as-is from legacy), so a later sync that creates the
  // business_profiles row can still resolve correctly.
  return {
    businessId: toBusinessId(businessId),
    profileId: toBusinessProfileId(businessId),
    all: [businessId],
  }
}
