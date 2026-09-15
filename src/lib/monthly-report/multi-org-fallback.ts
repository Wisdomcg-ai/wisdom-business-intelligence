/**
 * The "no active forecast" actuals read, refused for a business with more than
 * one Xero organisation.
 *
 * With an active forecast, actuals come through ForecastReadService, which
 * sums the organisations and translates a foreign one. Without one, the Full
 * Year (full-year-load) and the Generate route fall back to reading
 * xero_pl_lines_wide_compat for every organisation at once, keyed on the
 * account NAME, merging months by object spread — so the later organisation's
 * figure overwrites the earlier one's, and a Hong Kong dollar figure is taken
 * as Australian. IICT, which has no active FY2027 forecast, plotted August
 * income of 32,516.53 (IGL's HKD 1,628,444.86 overwritten by IGP's) where
 * Calxa has 324,881, and its Current Year Budget page projected a net loss of
 * 789,661 against Calxa's profit of 475,523 (IICT-18, IICT-44).
 *
 * One organisation is unaffected: the fallback is exactly the read it was.
 */

type Client = { from: (table: string) => any }

export interface ActiveTenant {
  tenant_id: string
  functional_currency: string | null
}

/**
 * The business's active organisations, one per tenant (IICT's sit under two
 * business ids). Throws on a database error: a failed read must not pass for
 * "one organisation" and let the overwriting read run.
 */
export async function loadActiveTenants(supabase: Client, businessIds: readonly string[]): Promise<ActiveTenant[]> {
  const { data, error } = await supabase
    .from('xero_connections')
    .select('tenant_id, functional_currency')
    .in('business_id', [...businessIds])
    .eq('is_active', true)
  if (error) throw error
  const rows = (data ?? []) as Array<{ tenant_id: string | null; functional_currency: string | null }>
  return [...new Map(rows.filter((r) => !!r.tenant_id).map((r) => [r.tenant_id as string, { tenant_id: r.tenant_id as string, functional_currency: r.functional_currency ?? null }])).values()]
}

/** Why the fallback must not run for these organisations, or null. */
export function multiOrgFallbackRefusal(tenants: readonly ActiveTenant[], fiscalYear: number | string): string | null {
  if (tenants.length <= 1) return null
  const foreign = tenants.some((t) => (t.functional_currency || 'AUD').toUpperCase() !== 'AUD')
  return `This business has ${tenants.length} Xero organisations and no active FY${fiscalYear} forecast. `
    + 'Without one, their figures cannot be combined here: accounts the organisations share would overwrite each other'
    + (foreign ? ', and a foreign currency would be added to AUD one-for-one' : '')
    + '. Use the Consolidated tab, or activate the forecast.'
}
