/**
 * POST /api/monthly-report/consolidated
 *
 * Multi-tenant consolidation endpoint (Phase 34, tenant model).
 *
 * Input:  { business_id, report_month, fiscal_year }
 * Output: { report: ConsolidatedReport — per-tenant columns for the business,
 *           settings — the business's monthly_report_settings, as
 *           GET /api/monthly-report/settings serves them }
 *
 * Behavior: consolidation is only meaningful when the business has 2+ active
 * Xero connections marked include_in_consolidation. With 0 or 1 tenant, the
 * returned report still works but has 0 or 1 columns.
 *
 * Phase 34.3: the engine now also loads per-tenant forecasts from
 * `financial_forecasts` (scoped by tenant_id + fiscal_year) and attaches
 *   - byTenant[].budgetLines (per-tenant budget, universe-aligned)
 *   - consolidated.budgetLines (summed across tenants)
 *   - diagnostics.tenants_with_budget / tenants_without_budget
 * No route-level change is required — the output flows through the generic
 * `report` object returned below.
 *
 * Security:
 * - Auth-gated (401)
 * - Access check: owner_id or assigned_coach_id OR super_admin
 * - Rate-limited
 * - Stage-tracked error shape
 */

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getSupabaseSecretKey } from '@/lib/supabase/keys'
import { createRouteHandlerClient } from '@/lib/supabase/server'
import * as Sentry from '@sentry/nextjs'
import {
  checkRateLimit,
  createRateLimitKey,
  RATE_LIMIT_CONFIGS,
} from '@/lib/utils/rate-limiter'
import { requireSectionPermission } from '@/lib/permissions/requireSectionPermission'
import { enforceSectionPermission } from '@/lib/permissions/sectionPermissionConfig'
import { getUserSystemRoleServer, isCoachOrAdmin } from '@/lib/auth/server-roles'
import {
  generateFiscalMonthKeys,
  DEFAULT_YEAR_START_MONTH,
} from '@/lib/utils/fiscal-year-utils'
import { buildConsolidation } from '@/lib/consolidation/engine'
import {
  loadFxRates,
  translatePLAtMonthlyAverage,
} from '@/lib/consolidation/fx'
import { resolveBusinessProfileIds } from '@/lib/business/resolveBusinessProfileIds'
import { reportedFxMonths } from '@/lib/monthly-report/consolidated-fx'
import { createForecastReadService } from '@/lib/services/forecast-read-service'
import { loadReportSettings } from '@/lib/monthly-report/report-settings-load'
import { resolveApprovedBudgetForTenants } from '@/lib/budgets/consolidated-budget'
import { loadAccountGroups, withConsolidatedGroups } from '@/lib/monthly-report/consolidated-groups'
import { z } from 'zod'
import { withSchema } from '@/lib/api/with-schema'

export const dynamic = 'force-dynamic'

// VALID-05a (observe mode): POST builds the consolidated P&L. Body may be empty.
const ConsolidatedPostSchema = z.object({
  business_id: z.string().optional(),
  report_month: z.string().optional(),
  fiscal_year: z.union([z.string(), z.number()]).optional(),
})

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  getSupabaseSecretKey(),
)

async function postHandler(request: Request) {
  let stage = 'init'
  try {
    stage = 'auth'
    const authSupabase = await createRouteHandlerClient()
    const { data: { user }, error: authError } = await authSupabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const { business_id, report_month, fiscal_year } = body ?? {}
    if (!business_id || !report_month || !fiscal_year) {
      return NextResponse.json(
        { error: 'business_id, report_month, and fiscal_year are required' },
        { status: 400 },
      )
    }

    // Resolve dual IDs (businesses.id vs business_profiles.id) using the
    // module-level service-role client — business_profiles may be RLS-restricted
    // for the auth-bound client.
    stage = 'resolve_business_ids'
    const ids = await resolveBusinessProfileIds(supabase, business_id)

    stage = 'rate_limit'
    const rl = await checkRateLimit(
      createRateLimitKey('consolidated-report', user.id),
      RATE_LIMIT_CONFIGS.report,
    )
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Try again later.' },
        { status: 429 },
      )
    }

    // --- ROLE GATE ---
    // Consolidation (the multi-entity rollup) is a coach/admin-only view — it is
    // hidden from clients in the UI, and gated here so a client (even the business
    // owner) can't reach the data by calling the endpoint directly. Fails closed:
    // a null role (transient error / unknown) is denied. Runs BEFORE the per-
    // business access check below; both must pass.
    stage = 'role_gate'
    const systemRole = await getUserSystemRoleServer(authSupabase, user.id)
    if (!isCoachOrAdmin(systemRole)) {
      return NextResponse.json(
        { error: 'Consolidation is available to coaches and admins only.' },
        { status: 403 },
      )
    }

    // --- ACCESS CHECK ---
    stage = 'access_check'
    const { data: bizAccess } = await authSupabase
      .from('businesses')
      .select('id')
      .eq('id', ids.businessId)
      .or(`owner_id.eq.${user.id},assigned_coach_id.eq.${user.id}`)
      .maybeSingle()

    if (!bizAccess) {
      const { data: roleRow } = await authSupabase
        .from('system_roles')
        .select('role')
        .eq('user_id', user.id)
        .maybeSingle()
      if (roleRow?.role !== 'super_admin') {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 })
      }
    }

    // Phase 65: section-permission gate (LOG_ONLY by default, ENFORCE via env var)
    const _sectionVerdict = await requireSectionPermission(
      authSupabase,        // auth-bound client; NEVER pass a service-role client here
      user.id,
      ids.businessId,
      'finances',
    )
    const _sectionBlocked = enforceSectionPermission(
      _sectionVerdict,
      'finances',
      'api/monthly-report/consolidated',
      user.id,
      ids.businessId,
    )
    if (_sectionBlocked) return _sectionBlocked

    // --- FISCAL YEAR ---
    stage = 'fetch_year_start'
    const { data: parentProfile } = await supabase
      .from('business_profiles')
      .select('fiscal_year_start')
      .eq('business_id', ids.businessId)
      .maybeSingle()
    const yearStartMonth = parentProfile?.fiscal_year_start ?? DEFAULT_YEAR_START_MONTH
    const fyMonths = generateFiscalMonthKeys(fiscal_year, yearStartMonth) as readonly string[]

    // --- REPORT SETTINGS ---
    // The business's own settings row, read the way the settings panel reads
    // it, served beside the report for the Budget vs Actual adapter. The
    // adapter used to put a stub in its place that switched off Unspent
    // Budget, Budget Next Month, Budget Annual Total and the prior year, so
    // Dragon and IICT printed six figure columns where Calxa prints nine,
    // whatever the coach had set (IICT-12, DRG-05). A failed read fails the
    // request: a report with guessed columns is not one to send.
    stage = 'load_settings'
    const { settings } = await loadReportSettings(supabase, ids.businessId)

    // --- ENGINE ---
    // Presentation currency is always AUD for now. FX callback kicks in only
    // for tenants with non-AUD functional_currency (engine short-circuits AUD tenants).
    const presentationCurrency = 'AUD'
    // The months this report prints from. Translation walks every month a line
    // carries, but rates are loaded for the fiscal year only, so every month
    // outside it came back "missing" — IICT's banner listed eighteen months,
    // most of them with rates stored, when the August pack reads two (IICT-62).
    // A missing rate is reported only for a month the report reads; values in
    // the other months are never printed.
    const reportedMonths = new Set(reportedFxMonths(fyMonths, report_month))

    // --- BUDGET SOURCE ---
    // Read positively, as the single-entity route does: a business with no
    // settings row arrives on the defaults' 'forecast'. On the budget store the
    // engine takes the approved budget INSTEAD of the forecast — per
    // organisation or for the group, aligned to each organisation's own
    // accounts, in AUD or refused with the reason (lib/budgets/consolidated-
    // budget). This route used to ignore the setting, so Dragon and IICT
    // printed a forecast under "Budgets" whatever the coach chose (DRG-03,
    // IICT-07).
    const onBudgetStore = (settings as { budget_source?: string } | null)?.budget_source === 'budget_version'

    stage = 'engine'
    const engineReport = await buildConsolidation(supabase, {
      businessId: ids.businessId,
      reportMonth: report_month,
      fiscalYear: fiscal_year,
      fyMonths,
      translate: async (tenant, lines) => {
        const pair = `${tenant.functional_currency}/${presentationCurrency}`
        stage = 'load_rates'
        const rates = await loadFxRates(
          supabase as unknown as Parameters<typeof loadFxRates>[0],
          pair,
          'monthly_average',
          Array.from(fyMonths),
        )
        const { translated, missing } = translatePLAtMonthlyAverage(lines, rates)
        const ratesUsed: Record<string, number> = {}
        for (const [m, r] of rates.entries()) {
          ratesUsed[`${pair}::${m}`] = r
        }
        return { translated, missing: missing.filter((m) => reportedMonths.has(m)), ratesUsed }
      },
      ...(onBudgetStore
        ? {
            resolveApprovedBudget: ({ tenants, accountsByTenant, presentationCurrency: currency }) => {
              stage = 'approved_budget'
              return resolveApprovedBudgetForTenants(supabase as any, {
                businessId: ids.businessId,
                fiscalYear: fiscal_year,
                reportMonth: report_month,
                fyMonths,
                tenants,
                accountsByTenant,
                presentationCurrency: currency,
              })
            },
          }
        : {}),
    })

    // --- EXPENSE GROUPS ---
    // Each consolidated line under the group its account is mapped to, the
    // one reading the single-entity pages use (consolidated-groups). The
    // lines carried none, so every consolidated statement page printed one
    // flat run where Calxa prints IICT's and Dragon's expenses under their
    // headings, each with a subtotal (IICT-26, DRG-21). A failed read fails the
    // request, as the generate route's does. A report with no lines has
    // nothing to group and reads nothing.
    stage = 'load_mappings'
    const report = engineReport.consolidated.lines.length > 0
      ? withConsolidatedGroups(engineReport, await loadAccountGroups(supabase, ids))
      : engineReport

    // PRES-07 — this route never computed read-path quality, so the monthly
    // report's DataIntegrityBanner had nothing to render for a consolidation
    // parent and its state stayed at the optimistic 'verified' seed. The result
    // was that the only two multi-org businesses on the platform — Dragon
    // Roofing (2 orgs) and IICT Group (3, one of them HKD) — were the ONLY
    // businesses that could never show a stale/failed-sync warning, despite
    // being the ones most exposed to a partial sync.
    //
    // computeDataQuality already walks every active xero_connection for the
    // given ids and rolls up worst-of severity, so a consolidation parent needs
    // no special aggregation — just the call nobody was making.
    let data_quality: Awaited<ReturnType<ReturnType<typeof createForecastReadService>['getDataQualityForBusiness']>> | null = null
    try {
      data_quality = await createForecastReadService(
        supabase as unknown as Parameters<typeof createForecastReadService>[0],
      ).getDataQualityForBusiness(ids.all)
    } catch (qualityErr) {
      // Never fail the report over the quality probe — but never claim
      // "verified" either. A null here makes the client show the amber
      // "couldn't verify" banner rather than a silent clean bill of health.
      Sentry.captureException(qualityErr, { tags: { invariant: 'consolidated_quality_probe_failed' } })
    }

    return NextResponse.json({
      success: true,
      report,
      settings,
      data_quality: data_quality?.data_quality ?? null,
      per_tenant_quality: data_quality?.per_tenant_quality ?? [],
    })
  } catch (err) {
    Sentry.captureException(err, { tags: { route: 'monthly-report/consolidated' }, extra: { context: 'unhandled error', stage } } as any)
    return NextResponse.json(
      { error: 'Internal error', stage, detail: String(err) },
      { status: 500 },
    )
  }
}

export const POST = withSchema('monthly-report/consolidated', ConsolidatedPostSchema, postHandler)
