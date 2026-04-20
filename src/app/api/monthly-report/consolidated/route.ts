/**
 * POST /api/monthly-report/consolidated
 *
 * Multi-tenant consolidation endpoint (Phase 34, tenant model).
 *
 * Input:  { business_id, report_month, fiscal_year }
 * Output: ConsolidatedReport — per-tenant columns for the business.
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

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createRouteHandlerClient } from '@/lib/supabase/server'
import {
  checkRateLimit,
  createRateLimitKey,
  RATE_LIMIT_CONFIGS,
} from '@/lib/utils/rate-limiter'
import {
  generateFiscalMonthKeys,
  DEFAULT_YEAR_START_MONTH,
} from '@/lib/utils/fiscal-year-utils'
import { buildConsolidation } from '@/lib/consolidation/engine'
import {
  loadFxRates,
  translatePLAtMonthlyAverage,
} from '@/lib/consolidation/fx'

export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
)

export async function POST(request: NextRequest) {
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

    stage = 'rate_limit'
    const rl = checkRateLimit(
      createRateLimitKey('consolidated-report', user.id),
      RATE_LIMIT_CONFIGS.report,
    )
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Try again later.' },
        { status: 429 },
      )
    }

    // --- ACCESS CHECK ---
    stage = 'access_check'
    const { data: bizAccess } = await authSupabase
      .from('businesses')
      .select('id')
      .eq('id', business_id)
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

    // --- FISCAL YEAR ---
    stage = 'fetch_year_start'
    const { data: parentProfile } = await supabase
      .from('business_profiles')
      .select('fiscal_year_start')
      .eq('business_id', business_id)
      .maybeSingle()
    const yearStartMonth = parentProfile?.fiscal_year_start ?? DEFAULT_YEAR_START_MONTH
    const fyMonths = generateFiscalMonthKeys(fiscal_year, yearStartMonth) as readonly string[]

    // --- ENGINE ---
    // Presentation currency is always AUD for now. FX callback kicks in only
    // for tenants with non-AUD functional_currency (engine short-circuits AUD tenants).
    const presentationCurrency = 'AUD'

    stage = 'engine'
    const report = await buildConsolidation(supabase, {
      businessId: business_id,
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
        return { translated, missing, ratesUsed }
      },
    })

    return NextResponse.json({ success: true, report })
  } catch (err) {
    console.error('[Consolidated Report] unhandled error, stage:', stage, err)
    return NextResponse.json(
      { error: 'Internal error', stage, detail: String(err) },
      { status: 500 },
    )
  }
}
