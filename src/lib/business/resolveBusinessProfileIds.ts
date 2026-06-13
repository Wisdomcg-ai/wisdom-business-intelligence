/**
 * R1 — canonical branded bidirectional business↔profile id mapping.
 *
 * This module is the SOLE business↔profile id resolver. It was introduced in
 * PR-0 as a thin re-brand that delegated to the legacy role-blind
 * `resolveBusinessIds`; in PR-4 the implementation moved here and the legacy
 * file became a `@deprecated` shim, and in the R1 cleanup that shim was deleted
 * outright once every caller had migrated. There is exactly ONE implementation —
 * this one — so the two id-spaces can never silently drift.
 *
 * Behaviour is preserved verbatim from the original resolver, with ONE
 * deliberate change in R1 PR-6 (see below):
 *   - two `business_profiles` lookups (by `business_id`, then by `id`),
 *   - the input-echo fallback for unresolvable ids (kept until R14's data
 *     cleanse; see below),
 *   - the load-bearing `all` ordering for `.in('business_id', …)` money queries.
 *
 * R1 PR-6 — module-level memo removed. The legacy resolver carried a
 * process-level `Map` that was never invalidated: a warm serverless instance
 * could serve a stale id pair indefinitely (e.g. after a business_profiles row
 * is created or repaired), and it grew unbounded across the process lifetime.
 * Each resolution is a single indexed PK/FK lookup against `business_profiles`,
 * and call sites invoke the resolver once per request, so the cache bought
 * almost nothing while creating warm-vs-cold nondeterminism. It is now gone —
 * every call resolves fresh.
 *
 * IMPORTANT: the input-echo fallback is preserved on purpose. For a tenant whose
 * stored `business_id` is a polluted wrong-id-class value, this keeps money
 * reads degrading to "no rows" instead of throwing. Do not stricten it here —
 * write-side strictness is enforced separately by `assertBusinessProfileId`
 * (`sync-orchestrator.ts`).
 *
 * The branded `{ businessId, profileId }` shape gives callers TypeScript
 * protection against the `businesses.id` ⇄ `business_profiles.id` ⇄ `user.id`
 * confusion (the #1 incident class).
 *
 * This module exports the project's TWO sanctioned profile-id surfaces — keep
 * them HERE together; do NOT split them back into separate files (a duplicate
 * `resolveBusinessProfileId.ts` was created in Phase 74 and folded back in here,
 * because two resolver files are exactly the fragmentation that lets the two
 * id-spaces drift):
 *   - `resolveBusinessProfileIds` (plural) — READ surface. Returns BOTH ids plus
 *     the load-bearing `all` array, WITH the input-echo fallback so money reads
 *     degrade to "no rows" instead of throwing. Used by the ~40 Xero / forecast /
 *     monthly-report read sites. Do not stricten it.
 *   - `resolveBusinessProfileId` (singular) — WRITE / strict surface. Returns just
 *     the canonical `business_profiles.id` or `null` (NO echo), and additionally
 *     probes `user_id`. Use it where a null result must ABORT the operation rather
 *     than persist a wrong-id-class value (the Phase 74 dual-ID write fixes).
 */
import {
  type BusinessId,
  type BusinessProfileId,
  toBusinessId,
  toBusinessProfileId,
} from '@/lib/types/ids'
import { surfaceSupabaseError } from '@/lib/supabase/surfaceError'

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
 * branded, plus the `all` array used by `.in('business_id', …)` money queries.
 *
 * No memoization (R1 PR-6): every call performs the lookups fresh. The lookups
 * are single indexed PK/FK queries and call sites resolve once per request.
 */
export async function resolveBusinessProfileIds(
  supabase: { from: (table: string) => any },
  businessId: string,
): Promise<ResolvedBusinessProfileIds> {
  // Try 1: input is businesses.id → look up business_profiles.id.
  const { data: profile } = await supabase
    .from('business_profiles')
    .select('id, business_id')
    .eq('business_id', businessId)
    .maybeSingle()

  if (profile?.id) {
    return {
      businessId: toBusinessId(businessId),
      profileId: toBusinessProfileId(profile.id),
      all: [profile.id, businessId],
    }
  }

  // Try 2: input is business_profiles.id → look up businesses.id.
  const { data: profileRow } = await supabase
    .from('business_profiles')
    .select('id, business_id')
    .eq('id', businessId)
    .maybeSingle()

  if (profileRow?.business_id) {
    return {
      businessId: toBusinessId(profileRow.business_id),
      profileId: toBusinessProfileId(businessId),
      all: [businessId, profileRow.business_id],
    }
  }

  // Fallback: couldn't resolve → echo the input as both ids, so a later sync
  // that creates the business_profiles row can still resolve correctly.
  return {
    businessId: toBusinessId(businessId),
    profileId: toBusinessProfileId(businessId),
    all: [businessId],
  }
}

/**
 * Strict single-id resolver — the WRITE surface (see module header).
 *
 * Resolves any of the three id-spaces (`business_profiles.id` / `businesses.id` /
 * auth `user_id`) to the canonical `business_profiles.id`, or `null` when none
 * matches. Unlike the plural reader it NEVER echoes the input back: an
 * unresolvable id yields `null` so callers null-guard and ABORT instead of
 * persisting a wrong-id-class value (the dual-ID write-bug class). It also probes
 * `user_id`, which the read path does not need.
 *
 * Probe order: `id` → `business_id` → `user_id`. PostgREST errors are surfaced
 * (Sentry + console) rather than swallowed — every confirmed Phase 74 write bug
 * was hidden by a discarded error.
 */
export async function resolveBusinessProfileId(
  supabase: { from: (table: string) => any },
  input: string | null | undefined,
): Promise<BusinessProfileId | null> {
  if (!input) return null

  // 1. Already a business_profiles.id?
  const byId = await supabase
    .from('business_profiles')
    .select('id')
    .eq('id', input)
    .maybeSingle()
  if (byId.error) surfaceSupabaseError('resolveBusinessProfileId.byId', byId.error)
  if (byId.data?.id) return toBusinessProfileId(byId.data.id)

  // 2. A businesses.id? (business_profiles.business_id is the FK to businesses.id)
  const byBusiness = await supabase
    .from('business_profiles')
    .select('id')
    .eq('business_id', input)
    .maybeSingle()
  if (byBusiness.error) surfaceSupabaseError('resolveBusinessProfileId.byBusiness', byBusiness.error)
  if (byBusiness.data?.id) return toBusinessProfileId(byBusiness.data.id)

  // 3. An auth user_id (the business owner)?
  const byUser = await supabase
    .from('business_profiles')
    .select('id')
    .eq('user_id', input)
    .maybeSingle()
  if (byUser.error) surfaceSupabaseError('resolveBusinessProfileId.byUser', byUser.error)
  if (byUser.data?.id) return toBusinessProfileId(byUser.data.id)

  return null
}
