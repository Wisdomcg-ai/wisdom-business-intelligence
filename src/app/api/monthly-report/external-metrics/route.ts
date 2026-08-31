import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getSupabaseSecretKey } from '@/lib/supabase/keys'
import { createRouteHandlerClient } from '@/lib/supabase/server'
import { verifyBusinessAccess } from '@/lib/utils/verify-business-access'
import { resolveBusinessProfileIds } from '@/lib/business/resolveBusinessProfileIds'
import * as Sentry from '@sentry/nextjs'
import { requireSectionPermission } from '@/lib/permissions/requireSectionPermission'
import { enforceSectionPermission } from '@/lib/permissions/sectionPermissionConfig'
import { z } from 'zod'
import { withSchema, withQuerySchema } from '@/lib/api/with-schema'
import {
  validateValues,
  isValidPeriodMonth,
  computeExternalTie,
  sumReconcileMeasure,
  type SeriesMeasure,
} from '@/lib/monthly-report/external-metrics'

export const dynamic = 'force-dynamic'

/**
 * WE.1 — external metrics: the one write path behind every hand-built insert.
 *
 * GET  ?business_id&period_month           → series + the month's values + EXT-TIES
 * POST { action: 'define_series', ... }    → create/update a series definition
 * POST { action: 'upsert_values', ... }    → write a batch of values (idempotent
 *                                            on the natural key)
 *
 * Three callers share the POST: the entry UI, CSV paste, and the client skills
 * that already pull these numbers each month (source_ref records which).
 * Rejected rows are NAMED in the response, never silently dropped — a skill
 * with a typo'd measure key must hear about it.
 *
 * withSchema is observe-mode (VALID-05a), so handlers enforce their own
 * contracts.
 */
const ExternalMetricsGetSchema = z.object({
  business_id: z.string().optional(),
  period_month: z.string().optional(),
})

const ExternalMetricsPostSchema = z.object({
  business_id: z.string(),
  action: z.enum(['define_series', 'upsert_values']),
  series_key: z.string(),
  // define_series
  display_name: z.string().optional(),
  dimension_label: z.string().optional(),
  measures: z.array(z.any()).optional(),
  reconciles_to_account_name: z.string().nullable().optional(),
  reconcile_measure_key: z.string().nullable().optional(),
  reconcile_tolerance: z.number().optional(),
  config: z.record(z.string(), z.any()).optional(),
  source: z.string().optional(),
  // upsert_values
  period_month: z.string().optional(),
  values: z.array(z.any()).optional(),
  source_ref: z.string().optional(),
})

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  getSupabaseSecretKey()
)

/** Shared auth trio (R29 pattern). Returns a NextResponse to short-circuit, or the user id. */
async function authorize(businessId: string): Promise<{ block: NextResponse } | { userId: string }> {
  const authClient = await createRouteHandlerClient()
  const { data: { user }, error: authError } = await authClient.auth.getUser()
  if (authError || !user) {
    return { block: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  const verdict = await requireSectionPermission(authClient, user.id, businessId, 'finances')
  const blocked = enforceSectionPermission(
    verdict, 'finances', 'api/monthly-report/external-metrics', user.id, businessId,
  )
  if (blocked) return { block: blocked }
  const hasAccess = await verifyBusinessAccess(user.id, businessId)
  if (!hasAccess) {
    return { block: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { userId: user.id }
}

async function getHandler(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const businessId = searchParams.get('business_id')
    const periodMonth = searchParams.get('period_month')
    if (!businessId || !isValidPeriodMonth(periodMonth)) {
      return NextResponse.json(
        { error: 'business_id and period_month (YYYY-MM) are required' },
        { status: 400 },
      )
    }

    const auth = await authorize(businessId)
    if ('block' in auth) return auth.block

    const { data: seriesRows, error: sErr } = await supabase
      .from('external_metric_series')
      .select('*')
      .eq('business_id', businessId)
      .eq('is_active', true)
      .order('display_name')
    if (sErr) throw sErr

    const seriesIds = (seriesRows ?? []).map((s) => s.id)
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
      .map((s) => s.reconciles_to_account_name)
      .filter((n): n is string => !!n)
    let plByName = new Map<string, Record<string, number>>()
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

    const series = (seriesRows ?? []).map((s) => {
      const values = (valueRows ?? []).filter((v) => v.series_id === s.id)
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

    return NextResponse.json({ success: true, period_month: periodMonth, series })
  } catch (error) {
    Sentry.captureException(error, { tags: { route: 'monthly-report/external-metrics' }, extra: { context: '[ExternalMetrics] GET error' } } as any)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

async function postHandler(request: Request) {
  try {
    const body = await request.json()
    const { business_id, action, series_key } = body ?? {}
    if (!business_id || typeof series_key !== 'string' || !series_key.trim()) {
      return NextResponse.json({ error: 'business_id and series_key are required' }, { status: 400 })
    }

    const auth = await authorize(business_id)
    if ('block' in auth) return auth.block

    if (action === 'define_series') {
      const measures = Array.isArray(body.measures) ? (body.measures as SeriesMeasure[]) : []
      if (!body.display_name || !body.dimension_label || measures.length === 0) {
        return NextResponse.json(
          { error: 'define_series requires display_name, dimension_label and at least one measure' },
          { status: 400 },
        )
      }
      const measureKeys = new Set(measures.map((m) => m?.key).filter(Boolean))
      if (measureKeys.size !== measures.length) {
        return NextResponse.json({ error: 'measure keys must be unique and non-empty' }, { status: 400 })
      }
      // A declared reconciliation must point at a real measure — a dangling
      // reconcile key would silently disable EXT-TIES forever.
      if (body.reconcile_measure_key && !measureKeys.has(body.reconcile_measure_key)) {
        return NextResponse.json(
          { error: `reconcile_measure_key '${body.reconcile_measure_key}' is not one of the series measures` },
          { status: 400 },
        )
      }

      const { data, error } = await supabase
        .from('external_metric_series')
        .upsert(
          {
            business_id,
            series_key: series_key.trim(),
            source: body.source ?? 'manual',
            display_name: body.display_name,
            dimension_label: body.dimension_label,
            measures,
            reconciles_to_account_name: body.reconciles_to_account_name ?? null,
            reconcile_measure_key: body.reconcile_measure_key ?? null,
            reconcile_tolerance: body.reconcile_tolerance ?? 1,
            config: body.config ?? {},
            is_active: true,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'business_id,series_key', ignoreDuplicates: false },
        )
        .select()
        .single()
      if (error) throw error
      return NextResponse.json({ success: true, series: data })
    }

    if (action === 'upsert_values') {
      if (!isValidPeriodMonth(body.period_month)) {
        return NextResponse.json({ error: 'period_month (YYYY-MM) is required' }, { status: 400 })
      }
      const { data: series, error: sErr } = await supabase
        .from('external_metric_series')
        .select('id, measures')
        .eq('business_id', business_id)
        .eq('series_key', series_key.trim())
        .maybeSingle()
      if (sErr) throw sErr
      if (!series) {
        return NextResponse.json(
          { error: `No series '${series_key}' for this business — define_series first` },
          { status: 404 },
        )
      }

      const { valid, rejected } = validateValues(
        { measures: (series.measures ?? []) as SeriesMeasure[] },
        Array.isArray(body.values) ? body.values : [],
      )
      if (valid.length === 0) {
        return NextResponse.json(
          { error: 'No valid values in payload', rejected },
          { status: 400 },
        )
      }

      const now = new Date().toISOString()
      const rows = valid.map((v) => ({
        series_id: series.id,
        business_id,
        period_month: body.period_month,
        dimension_value: v.dimension_value,
        measure_key: v.measure_key,
        scenario: v.scenario,
        value: v.value,
        source_ref: body.source_ref ?? 'manual',
        updated_at: now,
      }))
      const { data, error } = await supabase
        .from('external_metric_values')
        .upsert(rows, {
          onConflict: 'series_id,period_month,dimension_value,measure_key,scenario',
          ignoreDuplicates: false,
        })
        .select('id')
      if (error) throw error

      return NextResponse.json({
        success: true,
        upserted: data?.length ?? 0,
        // Named rejects, never silent — the caller (often a skill) must know.
        rejected,
      })
    }

    return NextResponse.json(
      { error: "action must be 'define_series' or 'upsert_values'" },
      { status: 400 },
    )
  } catch (error) {
    Sentry.captureException(error, { tags: { route: 'monthly-report/external-metrics' }, extra: { context: '[ExternalMetrics] POST error' } } as any)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const GET = withQuerySchema('monthly-report/external-metrics', ExternalMetricsGetSchema, getHandler)
export const POST = withSchema('monthly-report/external-metrics', ExternalMetricsPostSchema, postHandler)
