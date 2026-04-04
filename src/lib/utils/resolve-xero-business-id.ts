/**
 * Resolves a business ID to the correct format for xero_connections.business_id.
 *
 * The xero_connections table's business_id column references business_profiles(id),
 * but the app often passes businesses.id. This utility tries both ID formats
 * and returns whichever one has an active Xero connection.
 *
 * If no connection exists yet (new connection), it returns the business_profiles.id
 * since that's what the FK constraint expects.
 */
export async function resolveXeroBusinessId(
  supabase: { from: (table: string) => any },
  businessId: string
): Promise<{ connectionBusinessId: string; connection: any | null }> {
  // Try 1: direct match (businessId might already be business_profiles.id)
  const { data: directConn } = await supabase
    .from('xero_connections')
    .select('*')
    .eq('business_id', businessId)
    .eq('is_active', true)
    .maybeSingle();

  if (directConn) {
    return { connectionBusinessId: businessId, connection: directConn };
  }

  // Try 2: businessId is businesses.id → resolve to business_profiles.id
  const { data: profile } = await supabase
    .from('business_profiles')
    .select('id')
    .eq('business_id', businessId)
    .maybeSingle();

  if (profile?.id) {
    const { data: profileConn } = await supabase
      .from('xero_connections')
      .select('*')
      .eq('business_id', profile.id)
      .eq('is_active', true)
      .maybeSingle();

    if (profileConn) {
      return { connectionBusinessId: profile.id, connection: profileConn };
    }

    // No connection exists yet — return business_profiles.id for new connections
    return { connectionBusinessId: profile.id, connection: null };
  }

  // Try 3: businessId is business_profiles.id → resolve to businesses.id
  const { data: bizProfile } = await supabase
    .from('business_profiles')
    .select('business_id')
    .eq('id', businessId)
    .maybeSingle();

  if (bizProfile?.business_id) {
    const { data: bizConn } = await supabase
      .from('xero_connections')
      .select('*')
      .eq('business_id', bizProfile.business_id)
      .eq('is_active', true)
      .maybeSingle();

    if (bizConn) {
      return { connectionBusinessId: bizProfile.business_id, connection: bizConn };
    }
  }

  // Fallback: return the original ID, no connection found
  return { connectionBusinessId: businessId, connection: null };
}
