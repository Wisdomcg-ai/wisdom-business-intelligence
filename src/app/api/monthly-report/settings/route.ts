import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getSupabaseSecretKey } from '@/lib/supabase/keys'
import { createRouteHandlerClient } from '@/lib/supabase/server'
import { verifyBusinessAccess } from '@/lib/utils/verify-business-access'
import { forecastBelongsToBusiness } from '@/lib/budgets/owned-forecast'
import { resolveBusinessProfileIds } from '@/lib/business/resolveBusinessProfileIds'
import { revertReportIfApproved } from '@/lib/reports/revert-report'
import * as Sentry from '@sentry/nextjs'
import { requireSectionPermission } from '@/lib/permissions/requireSectionPermission'
import { enforceSectionPermission } from '@/lib/permissions/sectionPermissionConfig'
import { z } from 'zod'
import { withSchema, withQuerySchema } from '@/lib/api/with-schema'

export const dynamic = 'force-dynamic'

// VALID-05a (observe mode): GET reads `business_id`; POST persists report settings.
const SettingsGetQuerySchema = z.object({
  business_id: z.string().optional(),
})

const SettingsPostSchema = z.object({
  business_id: z.string(),
  sections: z.record(z.string(), z.any()).optional(),
  show_prior_year: z.boolean().optional(),
  show_ytd: z.boolean().optional(),
  show_unspent_budget: z.boolean().optional(),
  show_budget_next_month: z.boolean().optional(),
  show_budget_annual_total: z.boolean().optional(),
  budget_forecast_id: z.string().nullable().optional(),
  budget_source: z.enum(['forecast', 'budget_version']).optional(),
  subscription_account_codes: z.array(z.string()).optional(),
  wages_account_names: z.array(z.string()).optional(),
  pdf_layout: z.any().optional(),
  standing_commentary: z.any().optional(),
  report_month: z.string().optional(),
})

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  getSupabaseSecretKey()
)

const DEFAULT_SECTIONS = {
  revenue_detail: true,
  cogs_detail: true,
  opex_detail: true,
  payroll_detail: false,
  subscription_detail: false,
  balance_sheet: false,
  cashflow: false,
  trend_charts: true,
  chart_revenue_vs_expenses: true,
  chart_revenue_breakdown: true,
  chart_variance_heatmap: true,
  chart_budget_burn_rate: true,
  chart_break_even: true,
  chart_cash_runway: false,
  chart_cumulative_net_cash: false,
  chart_working_capital_gap: false,
  chart_team_cost_pct: false,
  chart_cost_per_employee: false,
  chart_subscription_creep: false,
}

const DEFAULT_SETTINGS = {
  sections: DEFAULT_SECTIONS,
  show_prior_year: true,
  show_ytd: true,
  show_unspent_budget: true,
  show_budget_next_month: true,
  show_budget_annual_total: true,
  budget_forecast_id: null,
  budget_source: 'forecast',
  subscription_account_codes: [],
  wages_account_names: [],
}

/**
 * GET /api/monthly-report/settings?business_id=xxx
 * Returns the settings for this business. If none exist, return the defaults.
 */
async function getHandler(request: Request) {
  try {
    // Phase 65-02: introduce user auth so requireSectionPermission has a userId.
    // The module-level service-role `supabase` continues to be used for data fetching below.
    const authClient = await createRouteHandlerClient()
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const businessId = searchParams.get('business_id')

    if (!businessId) {
      return NextResponse.json({ error: 'business_id is required' }, { status: 400 })
    }

    // Phase 65: section-permission gate (LOG_ONLY by default, ENFORCE via env var)
    const _sectionVerdict = await requireSectionPermission(
      authClient,          // auth-bound client; NEVER pass a service-role client here
      user.id,
      businessId,
      'finances',
    )
    const _sectionBlocked = enforceSectionPermission(
      _sectionVerdict,
      'finances',
      'api/monthly-report/settings',
      user.id,
      businessId,
    )
    if (_sectionBlocked) return _sectionBlocked

    // R29 (SEC-N2): hard authorization gate. The section-permission check above
    // is LOG_ONLY by default, so it does not block cross-tenant access on its
    // own. The module-level Supabase client is service-role and bypasses RLS,
    // making this the only durable tenant-isolation enforcement on this route.
    const _hasAccess = await verifyBusinessAccess(user.id, businessId)
    if (!_hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { data: settings, error } = await supabase
      .from('monthly_report_settings')
      .select('*')
      .eq('business_id', businessId)
      .maybeSingle()

    if (error) {
      Sentry.captureException(error, { tags: { route: 'monthly-report/settings' }, extra: { context: "[Monthly Report Settings] Error fetching settings" } } as any)
      return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 })
    }

    // If no row exists, return defaults without creating a row
    if (!settings) {
      return NextResponse.json({
        settings: {
          business_id: businessId,
          ...DEFAULT_SETTINGS,
        },
        is_default: true,
      })
    }

    // Merge stored sections with defaults so keys added after initial save are always present
    const mergedSettings = {
      ...settings,
      sections: { ...DEFAULT_SECTIONS, ...(settings.sections ?? {}) },
    }

    return NextResponse.json({
      settings: mergedSettings,
      is_default: false,
    })

  } catch (error) {
    Sentry.captureException(error, { tags: { route: 'monthly-report/settings' }, extra: { context: "Error in GET /api/monthly-report/settings" } } as any)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/monthly-report/settings
 * Upsert settings for a business
 */
async function postHandler(request: Request) {
  try {
    // Phase 65-02: introduce user auth so requireSectionPermission has a userId.
    const authClient = await createRouteHandlerClient()
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const {
      business_id,
      sections,
      show_prior_year,
      show_ytd,
      show_unspent_budget,
      show_budget_next_month,
      show_budget_annual_total,
      budget_forecast_id,
      budget_source,
      subscription_account_codes,
      wages_account_names,
      pdf_layout,
      standing_commentary,
      // Optional: month being edited (YYYY-MM). When provided, an approved/sent report
      // for that month silently reverts to draft per Phase 35 D-16. Settings are business-
      // level so without a month we cannot scope the revert; callers that have a current
      // month should pass it.
      report_month,
    } = body

    if (!business_id) {
      return NextResponse.json({ error: 'business_id is required' }, { status: 400 })
    }

    // Phase 65: section-permission gate (LOG_ONLY by default, ENFORCE via env var)
    const _sectionVerdict = await requireSectionPermission(
      authClient,          // auth-bound client; NEVER pass a service-role client here
      user.id,
      business_id,
      'finances',
    )
    const _sectionBlocked = enforceSectionPermission(
      _sectionVerdict,
      'finances',
      'api/monthly-report/settings',
      user.id,
      business_id,
    )
    if (_sectionBlocked) return _sectionBlocked

    // R29 (SEC-N2): hard authorization gate. The section-permission check above
    // is LOG_ONLY by default, so it does not block cross-tenant access on its
    // own. The module-level Supabase client is service-role and bypasses RLS,
    // making this the only durable tenant-isolation enforcement on this route.
    const _hasAccess = await verifyBusinessAccess(user.id, business_id)
    if (!_hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // A pinned budget forecast is a capability: everything that later reads it
    // (generate, full-year, subscription-detail) does so on the service-role
    // client, which bypasses RLS. Writing an unvalidated id here would persist
    // a cross-tenant read — this route's own business_id gate does not cover
    // the forecast. Rejected rather than silently dropped: a coach who picked
    // the wrong thing should be told, not quietly ignored.
    if (budget_forecast_id) {
      const ids = await resolveBusinessProfileIds(supabase, business_id)
      const owned = await forecastBelongsToBusiness(supabase, budget_forecast_id, ids.all)
      if (!owned) {
        Sentry.captureMessage('[Monthly Report Settings] rejected a budget_forecast_id from another business', {
          level: 'warning' as any,
          tags: { invariant: 'forecast-id-not-owned', route: 'monthly-report/settings' },
          extra: { business_id, user_id: user.id, requestedForecastId: budget_forecast_id },
        } as any)
        return NextResponse.json(
          { error: 'That forecast does not belong to this business', code: 'FORECAST_NOT_OWNED' },
          { status: 403 },
        )
      }
    }

    // Switching a client ONTO the budget store is the moment their baseline
    // changes, so it is guarded rather than merely recorded.
    if (budget_source === 'budget_version') {
      const { data: anyVersion } = await supabase
        .from('budget_versions')
        .select('id')
        .eq('business_id', business_id)
        .not('locked_at', 'is', null)
        .limit(1)
      if (!anyVersion || anyVersion.length === 0) {
        return NextResponse.json(
          { error: 'Import a budget from Xero before switching this client to the budget store', code: 'NO_BUDGET_VERSION' },
          { status: 400 },
        )
      }

      // One cheap check on a rare write, instead of a per-report tenant check:
      // a multi-org business (Dragon 2 orgs, IICT 3) needs its per-tenant
      // budgets summed, and summing HKD into AUD is not something to arrive at
      // by accident. Kept out until that exists.
      const { count: orgCount } = await supabase
        .from('xero_connections')
        .select('id', { count: 'exact', head: true })
        .eq('business_id', business_id)
        .eq('is_active', true)
      if ((orgCount ?? 0) > 1) {
        return NextResponse.json(
          { error: 'This business has more than one Xero organisation; the budget store cannot combine their budgets yet', code: 'MULTI_ORG_BUDGET_UNSUPPORTED' },
          { status: 400 },
        )
      }
    }

    // Merge provided sections with defaults (so partial updates work)
    const mergedSections = sections
      ? { ...DEFAULT_SECTIONS, ...sections }
      : DEFAULT_SECTIONS

    const baseData: Record<string, any> = {
      business_id,
      sections: mergedSections,
      show_prior_year: show_prior_year ?? DEFAULT_SETTINGS.show_prior_year,
      show_ytd: show_ytd ?? DEFAULT_SETTINGS.show_ytd,
      show_unspent_budget: show_unspent_budget ?? DEFAULT_SETTINGS.show_unspent_budget,
      show_budget_next_month: show_budget_next_month ?? DEFAULT_SETTINGS.show_budget_next_month,
      show_budget_annual_total: show_budget_annual_total ?? DEFAULT_SETTINGS.show_budget_annual_total,
      budget_forecast_id: budget_forecast_id || null,
      subscription_account_codes: subscription_account_codes || [],
      wages_account_names: wages_account_names || [],
      updated_at: new Date().toISOString(),
    }

    // Only include pdf_layout when explicitly provided
    if (pdf_layout !== undefined) {
      baseData.pdf_layout = pdf_layout
    }
    // WD.3 — same omit-unless-provided semantics: a settings save that doesn't
    // carry standing_commentary must not clear it.
    if (standing_commentary !== undefined) {
      baseData.standing_commentary = standing_commentary
    }
    // Same omit-unless-provided semantics, and for a sharper reason: every key
    // in baseData above is rewritten with a default when absent, and both UI
    // writers post fixed key sets. Putting budget_source there would mean a
    // coach dragging a page in the PDF layout editor silently reverted the
    // client to the forecast.
    if (budget_source !== undefined) {
      baseData.budget_source = budget_source
    }

    let { data: settings, error } = await supabase
      .from('monthly_report_settings')
      .upsert(baseData, {
        onConflict: 'business_id',
        ignoreDuplicates: false,
      })
      .select()
      .single()

    // Code deploys before migrations are applied by hand here, so a column the
    // schema does not have yet must not fail the whole save. Keyed on the
    // Postgres/PostgREST codes rather than a substring of one column's name —
    // the old test only matched 'pdf_layout', and only when pdf_layout was sent.
    const droppedColumns: string[] = []
    if (error && (error.code === '42703' || error.code === 'PGRST204')) {
      for (const col of ['budget_source', 'pdf_layout']) {
        if (col in baseData && error.message?.includes(col)) {
          delete baseData[col]
          droppedColumns.push(col)
        }
      }
      if (droppedColumns.length > 0) {
        Sentry.captureMessage('[Monthly Report Settings] retrying without columns the schema does not have yet', {
          level: 'warning' as any,
          tags: { invariant: 'settings-missing-column' },
          extra: { business_id, dropped: droppedColumns, message: error.message },
        } as any)
        const retry = await supabase
          .from('monthly_report_settings')
          .upsert(baseData, {
            onConflict: 'business_id',
            ignoreDuplicates: false,
          })
          .select()
          .single()
        settings = retry.data
        error = retry.error
      }
    }

    if (error) {
      Sentry.captureException(error, { tags: { route: 'monthly-report/settings' }, extra: { context: "[Monthly Report Settings] Error upserting settings" } } as any)
      return NextResponse.json(
        { error: error.message || 'Failed to save settings' },
        { status: 500 }
      )
    }

    // Phase 35 D-16: Silently revert an approved or sent report to draft after a coach edit
    // (template / section toggle / pdf layout). Preserves snapshot_data (D-18) so the
    // already-sent email link keeps rendering the version the client received.
    // Settings are business-level, so we only revert when the caller passes the current
    // report_month; callers without that context are no-ops here.
    if (report_month) {
      try {
        const periodMonth = `${report_month}-01`
        await revertReportIfApproved(supabase, business_id, periodMonth)
      } catch (revertErr) {
        // Do not fail the save if revert tracking fails — log and continue.
        Sentry.captureException(revertErr, { tags: { route: 'monthly-report/settings' }, extra: { context: "[monthly-report/settings] revertReportIfApproved failed" } } as any)
      }
    }

    // Never report a bare success when budget_source was dropped: that would
    // tell the coach the client is on the budget store while the database still
    // says 'forecast'. Three states, not two — value / empty / could-not-save.
    return NextResponse.json({
      success: true,
      settings,
      ...(droppedColumns.includes('budget_source') ? { budget_source_not_persisted: true } : {}),
    })

  } catch (error) {
    Sentry.captureException(error, { tags: { route: 'monthly-report/settings' }, extra: { context: "Error in POST /api/monthly-report/settings" } } as any)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const GET = withQuerySchema('monthly-report/settings', SettingsGetQuerySchema, getHandler)
export const POST = withSchema('monthly-report/settings', SettingsPostSchema, postHandler)
