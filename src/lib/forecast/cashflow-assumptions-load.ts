/**
 * A forecast's saved cashflow assumptions (financial_forecasts.assumptions.cashflow).
 *
 * Shared by GET /api/forecast/cashflow/assumptions (on the user's RLS client)
 * and scripts/preview-pack.ts (service role). Reads only. Null when the
 * forecast does not exist; `cashflow` null when it has none saved. Throws on a
 * database error.
 */

type Client = any

export async function loadCashflowAssumptions(
  supabase: Client,
  forecastId: string,
): Promise<{ business_id: string; cashflow: any | null } | null> {
  const { data: forecast, error } = await supabase
    .from('financial_forecasts')
    .select('business_id, assumptions')
    .eq('id', forecastId)
    .maybeSingle()
  if (error) throw error
  if (!forecast) return null
  return { business_id: forecast.business_id, cashflow: forecast.assumptions?.cashflow ?? null }
}
