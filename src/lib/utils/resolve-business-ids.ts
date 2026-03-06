/**
 * Resolves the business_profiles.id from a businesses.id.
 *
 * financial_forecasts.business_id is an FK to business_profiles.id,
 * NOT businesses.id. This helper returns an array of IDs to try
 * (profile ID first, then the original ID as fallback) so queries
 * work regardless of which ID the caller has.
 */
export async function resolveBusinessIds(
  supabase: { from: (table: string) => any },
  businessId: string
): Promise<string[]> {
  const { data: profile } = await supabase
    .from('business_profiles')
    .select('id')
    .eq('business_id', businessId)
    .maybeSingle()

  return profile?.id ? [profile.id, businessId] : [businessId]
}
