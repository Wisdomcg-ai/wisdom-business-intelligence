/**
 * The read half of external metrics: active series, the month's values, and
 * the EXT-TIES reconciliation per series that declares a target.
 *
 * Shared by GET /api/monthly-report/external-metrics and
 * scripts/preview-pack.ts. Reads only; the caller supplies the client and is
 * responsible for authorisation. Throws on a database error.
 */
import { resolveBusinessProfileIds } from '@/lib/business/resolveBusinessProfileIds'
import { computeExternalTie, sumReconcileMeasure } from './external-metrics'

type Client = any

export async function loadExternalMetricSeries(supabase: Client, businessId: string, periodMonth: string): Promise<any[]> {
  const { data: seriesRows, error: sErr } = await supabase
    .from('external_metric_series')
    .select('*')
    .eq('business_id', businessId)
    .eq('is_active', true)
    .order('display_name')
  if (sErr) throw sErr

  const seriesIds = (seriesRows ?? []).map((s: { id: string }) => s.id)
  const { data: valueRows, error: vErr } = seriesIds.length
    ? await supabase
        .from('external_metric_values')
        .select('series_id, dimension_value, measure_key, scenario, value, source_ref, updated_at')
        .in('series_id', seriesIds)
        .eq('period_month', periodMonth)
    : { data: [], error: null }
  if (vErr) throw vErr

  // EXT-TIES per series that declares a reconciliation target. The account
  // side reads the same wide-compat view every report page uses.
  const ids = await resolveBusinessProfileIds(supabase, businessId)
  const accountNames = (seriesRows ?? [])
    .map((s: { reconciles_to_account_name?: string | null }) => s.reconciles_to_account_name)
    .filter((n: string | null | undefined): n is string => !!n)
  const plByName = new Map<string, Record<string, number>>()
  if (accountNames.length > 0) {
    const { data: plRows } = await supabase
      .from('xero_pl_lines_wide_compat')
      .select('account_name, monthly_values')
      .in('business_id', ids.all)
      .in('account_name', accountNames)
    // Multi-org: one row per tenant per name — merge months the same way the
    // generate route dedupes, so EXT-TIES compares against the report's figure.
    for (const r of plRows ?? []) {
      const existing = plByName.get(r.account_name)
      plByName.set(r.account_name, existing ? { ...existing, ...r.monthly_values } : (r.monthly_values ?? {}))
    }
  }

  return (seriesRows ?? []).map((s: any) => {
    const values = (valueRows ?? []).filter((v: any) => v.series_id === s.id)
    let tie = null
    if (s.reconciles_to_account_name && s.reconcile_measure_key) {
      tie = computeExternalTie({
        seriesTotal: sumReconcileMeasure(values, s.reconcile_measure_key),
        accountActual: Number(plByName.get(s.reconciles_to_account_name)?.[periodMonth] ?? 0),
        accountName: s.reconciles_to_account_name,
        tolerance: Number(s.reconcile_tolerance ?? 1),
      })
    }
    return { ...s, values, tie }
  })
}
