/**
 * Resolves a business ID to the correct format for xero_connections.business_id.
 *
 * With the Phase 34 tenant-aware model, a single businesses.id can have multiple
 * xero_connections rows (one per Xero tenant). `resolveXeroConnections` returns
 * ALL of them; `resolveXeroBusinessId` picks one for legacy single-tenant callers
 * that only need a primary connection (e.g. the dashboard sync endpoint).
 *
 * The xero_connections table's business_id column references business_profiles(id)
 * in legacy data, but newer rows reference businesses(id). This utility tries both.
 */

/**
 * Upper bound on connections per business. Dragon Roofing has 2, IICT Group has 3;
 * 20 is generous headroom while still bounding the query.
 */
const MAX_CONNECTIONS = 20

/**
 * Ordering is `created_at DESC, id ASC`. The `id` tie-break matters: connections
 * created by a single "connect all orgs" flow share an IDENTICAL created_at to the
 * microsecond (Dragon Roofing's two rows, IICT Group's three), so ordering by
 * created_at alone left the "primary" connection to Postgres' arbitrary row order
 * — it could differ run to run, silently changing which Xero org a single-tenant
 * caller analysed. See the multi-tenant subscription-crawl fix.
 */
const orderStably = (q: any) =>
  q.order('created_at', { ascending: false }).order('id', { ascending: true }).limit(MAX_CONNECTIONS)

const asList = (rows: any[] | null | undefined) => (Array.isArray(rows) ? rows : [])

/**
 * Returns EVERY active Xero connection for a business, newest first.
 *
 * Multi-org businesses (Dragon Roofing = Dragon Roofing Pty Ltd + Easy Hail Claim;
 * IICT Group = three entities) must analyse every tenant or they silently report on
 * a fraction of the business. Probes the same three id-space branches as
 * `resolveXeroBusinessId` so both helpers agree on which rows belong to a business.
 */
export async function resolveXeroConnections(
  supabase: { from: (table: string) => any },
  businessId: string
): Promise<{ connectionBusinessId: string; connections: any[] }> {
  // Try 1: direct match on businessId (could be businesses.id OR business_profiles.id)
  const { data: directConns } = await orderStably(
    supabase.from('xero_connections').select('*').eq('business_id', businessId).eq('is_active', true)
  )

  if (asList(directConns).length > 0) {
    return { connectionBusinessId: businessId, connections: asList(directConns) }
  }

  // Try 2: businessId is businesses.id → look up business_profiles.id and try again
  const { data: profile } = await supabase
    .from('business_profiles')
    .select('id')
    .eq('business_id', businessId)
    .maybeSingle()

  if (profile?.id) {
    const { data: profileConns } = await orderStably(
      supabase.from('xero_connections').select('*').eq('business_id', profile.id).eq('is_active', true)
    )

    if (asList(profileConns).length > 0) {
      return { connectionBusinessId: profile.id, connections: asList(profileConns) }
    }
    // No connection exists yet — return business_profiles.id for new-connection FK compatibility
    return { connectionBusinessId: profile.id, connections: [] }
  }

  // Try 3: businessId IS business_profiles.id → see if connection lives under the businesses.id instead
  const { data: bizProfile } = await supabase
    .from('business_profiles')
    .select('id, business_id')
    .eq('id', businessId)
    .maybeSingle()

  if (bizProfile) {
    const { data: bizConns } = await orderStably(
      supabase
        .from('xero_connections')
        .select('*')
        .eq('business_id', bizProfile.business_id)
        .eq('is_active', true)
    )

    if (asList(bizConns).length > 0) {
      return { connectionBusinessId: bizProfile.business_id, connections: asList(bizConns) }
    }
    return { connectionBusinessId: bizProfile.id, connections: [] }
  }

  return { connectionBusinessId: businessId, connections: [] }
}

/**
 * Single-connection view of {@link resolveXeroConnections}, kept for callers that
 * genuinely only need one tenant. For anything that reports a business's numbers,
 * prefer `resolveXeroConnections` — picking one tenant under-reports a multi-org
 * business without any error.
 */
export async function resolveXeroBusinessId(
  supabase: { from: (table: string) => any },
  businessId: string
): Promise<{ connectionBusinessId: string; connection: any | null }> {
  const { connectionBusinessId, connections } = await resolveXeroConnections(supabase, businessId)
  return { connectionBusinessId, connection: connections[0] ?? null }
}
