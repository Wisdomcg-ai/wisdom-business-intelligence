/**
 * Make one forecast version the ACTIVE one for its business + fiscal year.
 *
 * The active version is what reports, the dashboard and the monthly report
 * read. Two surfaces offer this (the Forecast Builder selector's "Set as
 * Active" and the Versions tab's "Set as active"); both go through here so
 * they cannot drift.
 *
 * financial_forecasts.business_id is business_profiles-space, so the
 * deactivate-others filter must use the PROFILE id — filtering by
 * businesses.id is a silent no-op that then collides with
 * unique_active_forecast_per_fy on activate (dual-ID trap).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveBusinessProfileId } from '@/lib/business/resolveBusinessProfileIds'

export interface SetActiveVersionInput {
  /** businesses.id or business_profiles.id — resolved to the profile id here. */
  businessId: string
  fiscalYear: number
  forecastId: string
}

export async function setActiveForecastVersion(
  supabase: SupabaseClient<any, any, any>,
  { businessId, fiscalYear, forecastId }: SetActiveVersionInput,
): Promise<{ error: Error | null }> {
  const profileBusinessId = await resolveBusinessProfileId(supabase, businessId)
  if (!profileBusinessId) {
    return { error: new Error('Could not resolve business profile for forecast') }
  }

  const { error: deactivateError } = await supabase
    .from('financial_forecasts')
    .update({ is_active: false })
    .eq('business_id', profileBusinessId)
    .eq('fiscal_year', fiscalYear)
  if (deactivateError) return { error: new Error(deactivateError.message) }

  const { error: activateError } = await supabase
    .from('financial_forecasts')
    .update({ is_active: true })
    .eq('id', forecastId)
  if (activateError) return { error: new Error(activateError.message) }

  return { error: null }
}
