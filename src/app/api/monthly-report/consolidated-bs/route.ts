/**
 * POST /api/monthly-report/consolidated-bs
 *
 * Consolidated Balance Sheet endpoint (Phase 34, Iteration 34.1).
 *
 * Input:  { business_id, report_month, fiscal_year }
 * Output: ConsolidatedBalanceSheet — per-tenant columns + consolidated rows
 *         + Translation Reserve (CTA) + intercompany loan eliminations.
 *
 * Behavior: mirrors /api/monthly-report/consolidated (P&L) but:
 *   - uses translateBSAtClosingSpot with closing_spot rates (not monthly_average)
 *   - consumes only intercompany_loan elimination rules (P&L filters those OUT)
 *   - returns a BSRow shape grouped by account_type (asset|liability|equity)
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
import { buildConsolidatedBalanceSheet } from '@/lib/consolidation/balance-sheet'
import {
  loadClosingSpotRate,
  translateBSAtClosingSpot,
} from '@/lib/consolidation/fx'

export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
)

/** Last day of a 'YYYY-MM' month as 'YYYY-MM-DD'. */
function lastDayOfMonth(month: string): string {
  const [y, m] = month.split('-').map(Number)
  const last = new Date(y, m, 0)
  return `${y}-${String(m).padStart(2, '0')}-${String(last.getDate()).padStart(2, '0')}`
}

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
      createRateLimitKey('consolidated-bs', user.id),
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

    // --- FISCAL YEAR (used only to pre-validate fiscal_year is sane) ---
    stage = 'fetch_year_start'
    const { data: parentProfile } = await supabase
      .from('business_profiles')
      .select('fiscal_year_start')
      .eq('business_id', business_id)
      .maybeSingle()
    const yearStartMonth = parentProfile?.fiscal_year_start ?? DEFAULT_YEAR_START_MONTH
    // We don't need the fiscal year keys for BS math (single as-of date), but
    // we generate them defensively to surface invalid fiscal_year early.
    generateFiscalMonthKeys(fiscal_year, yearStartMonth)

    const asOfDate = lastDayOfMonth(report_month)
    const presentationCurrency = 'AUD'

    // --- ENGINE ---
    stage = 'engine'
    const report = await buildConsolidatedBalanceSheet(supabase, {
      businessId: business_id,
      asOfDate,
      translate: async (tenant, lines) => {
        const pair = `${tenant.functional_currency}/${presentationCurrency}`
        stage = 'load_rates'
        const rate = await loadClosingSpotRate(
          supabase as any,
          pair,
          asOfDate,
        )
        if (rate === null) {
          // Surface the missing rate — DO NOT silently default to 1.0 (Pitfall 3).
          // The engine forwards this into fx_context.missing_rates and the
          // consumer surfaces it via FXRateMissingBanner.
          return {
            translated: lines,
            missing: [{ currency_pair: pair, period: asOfDate }],
            ratesUsed: {},
          }
        }
        const translated = translateBSAtClosingSpot(lines, rate)
        return {
          translated,
          missing: [],
          ratesUsed: { [pair]: rate },
        }
      },
    })

    return NextResponse.json({ success: true, report })
  } catch (err) {
    console.error('[Consolidated BS] unhandled error, stage:', stage, err)
    return NextResponse.json(
      { error: 'Internal error', stage, detail: String(err) },
      { status: 500 },
    )
  }
}
