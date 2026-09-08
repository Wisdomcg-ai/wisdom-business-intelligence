/**
 * "Does this forecast belong to this business?"
 *
 * A forecast id that arrives from outside — a request body, or a settings row
 * written from one — is a capability. These routes run on the service-role
 * client, which bypasses RLS, so nothing else stops a caller naming another
 * tenant's forecast and reading what hangs off it: `forecast_pl_lines` (the
 * whole budget) and `forecast_employees` (employee_name, position,
 * annual_salary, super_rate, pay_per_period, monthly_cost, start_date).
 *
 * DUAL ID: `financial_forecasts.business_id` is business_profiles-space —
 * 39 of 39 rows in prod. Validating it against `businesses.id` would match
 * nothing and silently reject every legitimate forecast, so callers must pass
 * the full id-set from `resolveBusinessProfileIds` (`ids.all`), never a single
 * businesses-space id.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * True when `forecastId` belongs to one of the given business id-spaces.
 *
 * Fails CLOSED: a query error returns false. A caller that cannot prove
 * ownership must not get the forecast.
 */
export async function forecastBelongsToBusiness(
  supabase: SupabaseClient,
  forecastId: string,
  businessIds: readonly string[],
): Promise<boolean> {
  if (!forecastId || businessIds.length === 0) return false

  const { data, error } = await supabase
    .from('financial_forecasts')
    .select('id')
    .eq('id', forecastId)
    .in('business_id', businessIds as string[])
    .maybeSingle()

  if (error) return false
  return !!data
}
