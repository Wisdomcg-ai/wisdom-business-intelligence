/**
 * @deprecated Use `resolveBusinessProfileIds` from
 * `@/lib/business/resolveBusinessProfileIds`, which returns the same data with
 * branded `{ businessId, profileId }` types that protect against the
 * `businesses.id` ⇄ `business_profiles.id` ⇄ `user.id` confusion.
 *
 * R1 PR-4 — deprecation shim. The real implementation (the two
 * `business_profiles` lookups, the module memo, and the input-echo fallback)
 * now lives in `resolveBusinessProfileIds`. This file is a thin bridge that
 * delegates there and un-brands the result back to the legacy
 * `{ bizId, profileId, all }` shape, so the remaining un-migrated callers keep
 * working unchanged during the R1 consolidation. Remove this file once the last
 * caller has migrated to the branded resolver.
 */
import { resolveBusinessProfileIds } from '@/lib/business/resolveBusinessProfileIds'

interface ResolvedIds {
  /** The businesses.id (used by business_users, business_kpis, etc.) */
  bizId: string
  /** The business_profiles.id (used by xero_connections, financial_forecasts, xero_pl_lines) */
  profileId: string
  /** Array of both IDs for .in() queries: [profileId, bizId] */
  all: string[]
}

/**
 * @deprecated Use `resolveBusinessProfileIds` from
 * `@/lib/business/resolveBusinessProfileIds`. This delegates there and
 * un-brands the result.
 */
export async function resolveBusinessIds(
  supabase: { from: (table: string) => any },
  businessId: string,
): Promise<ResolvedIds> {
  const { businessId: bizId, profileId, all } = await resolveBusinessProfileIds(
    supabase,
    businessId,
  )
  // Un-brand: BusinessId / BusinessProfileId are string subtypes, so these
  // assignments are safe and the runtime values are unchanged.
  return { bizId, profileId, all }
}
