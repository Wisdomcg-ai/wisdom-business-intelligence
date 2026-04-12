/**
 * Bidirectional business ID resolver.
 *
 * The platform has two ID types:
 *   - businesses.id ("bizId") — used by BusinessContext, business_users, business_kpis
 *   - business_profiles.id ("profileId") — used by xero_connections, financial_forecasts, xero_pl_lines
 *
 * This utility accepts EITHER type and returns both, so queries always use the correct one.
 * Results are cached per-request to avoid repeated DB lookups.
 */

interface ResolvedIds {
  /** The businesses.id (used by business_users, business_kpis, etc.) */
  bizId: string
  /** The business_profiles.id (used by xero_connections, financial_forecasts, xero_pl_lines) */
  profileId: string
  /** Array of both IDs for .in() queries: [profileId, bizId] */
  all: string[]
}

const cache = new Map<string, ResolvedIds>()

export async function resolveBusinessIds(
  supabase: { from: (table: string) => any },
  businessId: string
): Promise<ResolvedIds> {
  // Check cache first
  const cached = cache.get(businessId)
  if (cached) return cached

  // Try 1: businessId is businesses.id → look up business_profiles.id
  const { data: profile } = await supabase
    .from('business_profiles')
    .select('id, business_id')
    .eq('business_id', businessId)
    .maybeSingle()

  if (profile?.id) {
    const result: ResolvedIds = {
      bizId: businessId,
      profileId: profile.id,
      all: [profile.id, businessId],
    }
    cache.set(businessId, result)
    cache.set(profile.id, result)
    return result
  }

  // Try 2: businessId is business_profiles.id → look up businesses.id
  const { data: profileRow } = await supabase
    .from('business_profiles')
    .select('id, business_id')
    .eq('id', businessId)
    .maybeSingle()

  if (profileRow?.business_id) {
    const result: ResolvedIds = {
      bizId: profileRow.business_id,
      profileId: businessId,
      all: [businessId, profileRow.business_id],
    }
    cache.set(businessId, result)
    cache.set(profileRow.business_id, result)
    return result
  }

  // Fallback: couldn't resolve, use the same ID for both
  const result: ResolvedIds = {
    bizId: businessId,
    profileId: businessId,
    all: [businessId],
  }
  return result
}
