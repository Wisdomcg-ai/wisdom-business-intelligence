/**
 * Resolves a business ID to the correct format for xero_connections.business_id.
 *
 * With the Phase 34 tenant-aware model, a single businesses.id can have multiple
 * xero_connections rows (one per Xero tenant). This helper picks the most-recent
 * active connection for legacy single-tenant callers that only need ONE connection
 * (e.g. the dashboard sync endpoint). Multi-tenant callers (consolidation engine,
 * multi-tenant sync) should query xero_connections directly by business_id.
 *
 * The xero_connections table's business_id column references business_profiles(id)
 * in legacy data, but newer rows reference businesses(id). This utility tries both.
 */
export async function resolveXeroBusinessId(
  supabase: { from: (table: string) => any },
  businessId: string
): Promise<{ connectionBusinessId: string; connection: any | null }> {
  const pickLatest = (rows: any[] | null | undefined) =>
    Array.isArray(rows) && rows.length > 0 ? rows[0] : null

  // Try 1: direct match on businessId (could be businesses.id OR business_profiles.id)
  const { data: directConns } = await supabase
    .from('xero_connections')
    .select('*')
    .eq('business_id', businessId)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(5)

  const directConn = pickLatest(directConns)
  if (directConn) {
    return { connectionBusinessId: businessId, connection: directConn }
  }

  // Try 2: businessId is businesses.id → look up business_profiles.id and try again
  const { data: profile } = await supabase
    .from('business_profiles')
    .select('id')
    .eq('business_id', businessId)
    .maybeSingle()

  if (profile?.id) {
    const { data: profileConns } = await supabase
      .from('xero_connections')
      .select('*')
      .eq('business_id', profile.id)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(5)

    const profileConn = pickLatest(profileConns)
    if (profileConn) {
      return { connectionBusinessId: profile.id, connection: profileConn }
    }
    // No connection exists yet — return business_profiles.id for new-connection FK compatibility
    return { connectionBusinessId: profile.id, connection: null }
  }

  // Try 3: businessId IS business_profiles.id → see if connection lives under the businesses.id instead
  const { data: bizProfile } = await supabase
    .from('business_profiles')
    .select('id, business_id')
    .eq('id', businessId)
    .maybeSingle()

  if (bizProfile) {
    const { data: bizConns } = await supabase
      .from('xero_connections')
      .select('*')
      .eq('business_id', bizProfile.business_id)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(5)

    const bizConn = pickLatest(bizConns)
    if (bizConn) {
      return { connectionBusinessId: bizProfile.business_id, connection: bizConn }
    }
    return { connectionBusinessId: bizProfile.id, connection: null }
  }

  return { connectionBusinessId: businessId, connection: null }
}
