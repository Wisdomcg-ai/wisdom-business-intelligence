/**
 * The read half of external metrics: active series, the month's values, the
 * trend window a placement asks for, and the EXT-TIES reconciliation per series
 * that declares a target.
 *
 * Shared by GET /api/monthly-report/external-metrics and
 * scripts/preview-pack.ts. Reads only; the caller supplies the client and is
 * responsible for authorisation. Throws on a database error.
 */
import { resolveBusinessProfileIds } from '@/lib/business/resolveBusinessProfileIds'
import { computeExternalTie, sumReconcileMeasure } from './external-metrics'
import { trendMonths } from './external-metric-config'

type Client = any

/** PostgREST answers at most 1,000 rows, and an unordered capped read is systematically the OLDEST. */
const PAGE = 1000

/**
 * @param months how many months a trend placement prints, ending at
 *   periodMonth (external-metric-config). One — the default — reads only the
 *   month, exactly as this loader always has.
 */
export async function loadExternalMetricSeries(
  supabase: Client,
  businessId: string,
  periodMonth: string,
  opts: { months?: number } = {},
): Promise<any[]> {
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

  // The trend window, month by month. Read in pages ordered by id: a capped
  // read of an unordered query would drop the newest months, which are the
  // ones the page prints on the left.
  const months = opts.months ?? 1
  const window = trendMonths(periodMonth, Math.max(1, months))
  const historyRows: any[] = []
  if (months > 1 && seriesIds.length > 0) {
    for (let from = 0; ; from += PAGE) {
      const { data: page, error: hErr } = await supabase
        .from('external_metric_values')
        .select('series_id, period_month, dimension_value, measure_key, scenario, value')
        .in('series_id', seriesIds)
        .gte('period_month', window[window.length - 1])
        .lte('period_month', window[0])
        .order('id')
        .range(from, from + PAGE - 1)
      if (hErr) throw hErr
      historyRows.push(...(page ?? []))
      if ((page ?? []).length < PAGE) break
    }
  }

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
    const history = months > 1
      ? (historyRows.filter((v: any) => v.series_id === s.id) as any[])
      : undefined
    return { ...s, values, ...(history ? { history } : {}), tie }
  })
}
