/**
 * POST /api/monthly-report/consolidated
 *
 * Multi-entity consolidation endpoint (Phase 34, Iteration 34.0). Given a
 * consolidation group's parent `business_id`, loads all member P&Ls, applies
 * FX translation for non-AUD members, runs intercompany eliminations, and
 * returns the full `ConsolidatedReport` for the requested month.
 *
 * Contract (see 34-00e-PLAN.md):
 * - Dual Supabase client: service-role for data; authSupabase for session
 * - Auth-gated (401 if no user)
 * - Rate-limited using the shared 'report' bucket via a dedicated
 *   `consolidated-report` key (so coach single-entity reports and
 *   consolidated reports each get their own throttle window)
 * - Stage-tracked error shape: `{ error, stage, detail }` helps debug which
 *   phase of the pipeline failed (auth / rate_limit / resolve_group /
 *   fetch_year_start / engine)
 * - FX wiring: `loadFxRates` + `translatePLAtMonthlyAverage` invoked via the
 *   engine's optional `translate` callback. AUD members short-circuit inside
 *   the engine before the callback ever fires.
 *
 * Security (STRIDE threats T-34-05/06/07):
 * - T-34-05 (info disclosure) — coach must own parent business OR be super_admin
 * - T-34-06 (DoS) — rate limit on per-user basis
 * - T-34-07 (tampering) — presence check on body inputs; all queries are
 *   parameterised via Supabase `.eq()` (no string concat)
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
    // --- AUTH -------------------------------------------------------------
    stage = 'auth'
    const authSupabase = await createRouteHandlerClient()
    const {
      data: { user },
      error: authError,
    } = await authSupabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // --- BODY VALIDATION --------------------------------------------------
    const body = await request.json().catch(() => ({}))
    const { business_id, report_month, fiscal_year } = body ?? {}
    if (!business_id || !report_month || !fiscal_year) {
      return NextResponse.json(
        {
          error:
            'business_id, report_month, and fiscal_year are required',
        },
        { status: 400 },
      )
    }

    // --- RATE LIMIT -------------------------------------------------------
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

    // --- RESOLVE GROUP ----------------------------------------------------
    stage = 'resolve_group'
    const { data: group, error: groupErr } = await supabase
      .from('consolidation_groups')
      .select('id, business_id, presentation_currency, name')
      .eq('business_id', business_id)
      .maybeSingle()

    if (groupErr) {
      console.error('[Consolidated Report] group lookup error:', groupErr)
      return NextResponse.json(
        {
          error: 'Failed to resolve group',
          stage,
          detail: groupErr.message,
        },
        { status: 500 },
      )
    }
    if (!group) {
      return NextResponse.json(
        { error: 'Consolidation group not found for business_id' },
        { status: 404 },
      )
    }

    // --- ACCESS CHECK (owner/coach → otherwise super_admin) ---------------
    const { data: bizAccess } = await authSupabase
      .from('businesses')
      .select('id')
      .eq('id', group.business_id)
      .or(`owner_id.eq.${user.id},assigned_coach_id.eq.${user.id}`)
      .maybeSingle()

    if (!bizAccess) {
      // Fall back to super_admin check (system_roles.role = 'super_admin')
      const { data: roleRow } = await authSupabase
        .from('system_roles')
        .select('role')
        .eq('user_id', user.id)
        .maybeSingle()
      if (roleRow?.role !== 'super_admin') {
        return NextResponse.json(
          { error: 'Access denied' },
          { status: 403 },
        )
      }
    }

    // --- FISCAL YEAR RESOLUTION ------------------------------------------
    stage = 'fetch_year_start'
    const { data: parentProfile } = await supabase
      .from('business_profiles')
      .select('fiscal_year_start')
      .eq('business_id', group.business_id)
      .maybeSingle()
    const yearStartMonth =
      parentProfile?.fiscal_year_start ?? DEFAULT_YEAR_START_MONTH
    const fyMonths = generateFiscalMonthKeys(
      fiscal_year,
      yearStartMonth,
    ) as readonly string[]

    // --- ENGINE (with FX wiring) -----------------------------------------
    stage = 'engine'
    const report = await buildConsolidation(supabase, {
      groupId: group.id,
      reportMonth: report_month,
      fiscalYear: fiscal_year,
      fyMonths,
      translate: async (member, lines) => {
        // Engine short-circuits AUD members before reaching here, so any
        // invocation is for a non-presentation-currency member.
        const pair = `${member.functional_currency}/${group.presentation_currency}`
        stage = 'load_rates'
        // Cast to the narrow SupabaseLike shape loadFxRates expects. The real
        // client's `.eq().eq()` chain is a thenable `PostgrestFilterBuilder`
        // which satisfies the loader's Promise-returning contract at runtime.
        const rates = await loadFxRates(
          supabase as unknown as Parameters<typeof loadFxRates>[0],
          pair,
          'monthly_average',
          Array.from(fyMonths),
        )
        const { translated, missing } = translatePLAtMonthlyAverage(
          lines,
          rates,
        )
        const ratesUsed: Record<string, number> = {}
        for (const [m, r] of rates.entries()) {
          ratesUsed[`${pair}::${m}`] = r
        }
        return { translated, missing, ratesUsed }
      },
    })

    return NextResponse.json({ success: true, report })
  } catch (err) {
    console.error(
      '[Consolidated Report] unhandled error, stage:',
      stage,
      err,
    )
    return NextResponse.json(
      { error: 'Internal error', stage, detail: String(err) },
      { status: 500 },
    )
  }
}
