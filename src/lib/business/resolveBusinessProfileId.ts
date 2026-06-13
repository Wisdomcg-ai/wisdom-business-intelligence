import type { SupabaseClient } from '@supabase/supabase-js'
import type { BusinessProfileId } from '@/lib/types/ids'
import { toBusinessProfileId } from '@/lib/types/ids'
import { surfaceSupabaseError } from '@/lib/supabase/surfaceError'

/**
 * Resolve any of the three id-spaces to the canonical `business_profiles.id`.
 *
 * Accepts a `business_profiles.id`, a `businesses.id`, or an auth `user_id` and
 * returns the matching `business_profiles.id`, or `null` if none matches. It
 * NEVER returns a `businesses.id` — the result is always safe to pass to a
 * profile-keyed table (business_kpis, strategic_initiatives, business_financial_goals,
 * kpi_actuals, quarterly_snapshots, weekly_reviews, financial_forecasts, …).
 *
 * Why this is the only sanctioned path: the three UUID namespaces are disjoint
 * (0 collisions) and `businesses` ↔ `business_profiles` is 1:1, so the input can be
 * classified by probing `business_profiles` on each column. Use this instead of
 * inline `business_profiles.select('id')` lookups + `|| businesses.id` fallbacks,
 * which are the mechanism by which the dual-ID bug keeps recurring.
 *
 * Companion to `resolveBusinessId()` (which returns a `businesses.id`, correct for
 * businesses-keyed tables) — do not conflate the two.
 */
export async function resolveBusinessProfileId(
  supabase: SupabaseClient,
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
