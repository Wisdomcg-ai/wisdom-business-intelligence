/**
 * Phase 67-02 — predicate that says "this business has at least one active,
 * consolidation-included Xero tenant whose functional_currency differs from
 * AUD" (the platform's presentation currency).
 *
 * Used by the forecast wizard read paths (historical-pl-summary.ts and
 * forecast-read-service.ts) to decide whether to route through the
 * consolidation engine for FX translation, or take the direct-read fast path
 * unchanged.
 *
 * Returns false for:
 *   - businesses with no Xero connections
 *   - single-tenant businesses on AUD
 *   - multi-tenant businesses where every tenant is on AUD
 *
 * Returns true only when the consolidation engine has actual work to do.
 * Pre-Phase-67-01 some HK/NZ/etc. tenants were mis-tagged as 'AUD' in
 * xero_connections.functional_currency — fixing those rows is a prerequisite
 * for this predicate to return true at all.
 */
import { resolveBusinessProfileIds } from '@/lib/business/resolveBusinessProfileIds'

const PRESENTATION_CURRENCY = 'AUD'

export async function needsFxConsolidation(
  supabase: any, // matches the prevailing pattern across this codebase
  businessId: string,
): Promise<boolean> {
  const ids = await resolveBusinessProfileIds(supabase, businessId)
  const { data: conns, error } = await supabase
    .from('xero_connections')
    .select('functional_currency')
    .in('business_id', ids.all)
    .eq('is_active', true)
    .eq('include_in_consolidation', true)

  if (error || !conns || conns.length === 0) return false

  return conns.some((c: { functional_currency: string | null }) => {
    const ccy = (c.functional_currency || PRESENTATION_CURRENCY).toUpperCase()
    return ccy !== PRESENTATION_CURRENCY
  })
}
