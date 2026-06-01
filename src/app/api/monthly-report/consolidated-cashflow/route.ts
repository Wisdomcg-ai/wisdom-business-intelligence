/**
 * POST /api/monthly-report/consolidated-cashflow
 *
 * Consolidated Cashflow Forecast endpoint (Phase 34, Iteration 34.2).
 *
 * Input:  { business_id, fiscal_year }
 * Output: ConsolidatedCashflowReport — per-tenant 12-month forecasts +
 *         combined consolidated series + diagnostics.
 *
 * Behaviour: mirrors /api/monthly-report/consolidated-bs but:
 *   - no as-of date (cashflow is a 12-month window)
 *   - fyStartDate derived from the business's fiscal_year_start profile
 *   - fyMonths generated via the shared fiscal-year-utils helper
 *
 * Security:
 *   - Auth-gated (401)
 *   - Access check: owner_id or assigned_coach_id OR super_admin
 *   - Rate-limited using the shared `report` bucket
 *   - Stage-tracked error responses
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
import {
  generateFiscalMonthKeys,
  DEFAULT_YEAR_START_MONTH,
} from '@/lib/utils/fiscal-year-utils'
import { buildConsolidatedCashflow } from '@/lib/consolidation/cashflow'
import { resolveBusinessProfileIds } from '@/lib/business/resolveBusinessProfileIds'
import { z } from 'zod'
import { withSchema } from '@/lib/api/with-schema'

export const dynamic = 'force-dynamic'

// VALID-05a (observe mode): POST builds the consolidated cashflow. Body may be empty.
const ConsolidatedCashflowPostSchema = z.object({
  business_id: z.string().optional(),
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
    const {
      data: { user },
      error: authError,
    } = await authSupabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const { business_id, fiscal_year } = body ?? {}
    if (!business_id || !fiscal_year) {
      return NextResponse.json(
        { error: 'business_id and fiscal_year are required' },
        { status: 400 },
      )
    }

    // Resolve dual IDs using the module-level service-role client — business_profiles
    // may be RLS-restricted for the auth-bound client.
    stage = 'resolve_business_ids'
    const ids = await resolveBusinessProfileIds(supabase, business_id)

    stage = 'rate_limit'
    const rl = await checkRateLimit(
      createRateLimitKey('consolidated-cashflow', user.id),
      RATE_LIMIT_CONFIGS.report,
    )
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Try again later.' },
        { status: 429 },
      )
    }

    // Access check: owner / assigned coach / super_admin. Mirrors the BS route.
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
      'api/monthly-report/consolidated-cashflow',
      user.id,
      ids.businessId,
    )
    if (_sectionBlocked) return _sectionBlocked

    stage = 'fetch_year_start'
    const { data: parentProfile } = await supabase
      .from('business_profiles')
      .select('fiscal_year_start')
      .eq('business_id', ids.businessId)
      .maybeSingle()
    const yearStartMonth =
      parentProfile?.fiscal_year_start ?? DEFAULT_YEAR_START_MONTH

    const fyMonths = generateFiscalMonthKeys(
      fiscal_year,
      yearStartMonth,
    ) as readonly string[]
    const fyStartDate = `${fyMonths[0]}-01`

    stage = 'engine'
    const report = await buildConsolidatedCashflow(supabase, {
      businessId: ids.businessId,
      fiscalYear: fiscal_year,
      fyMonths,
      fyStartDate,
    })

    return NextResponse.json({ success: true, report })
  } catch (err) {
    Sentry.captureException(err, { tags: { route: 'monthly-report/consolidated-cashflow' }, extra: { context: 'unhandled error', stage } } as any)
    return NextResponse.json(
      { error: 'Internal error', stage, detail: String(err) },
      { status: 500 },
    )
  }
}

export const POST = withSchema('monthly-report/consolidated-cashflow', ConsolidatedCashflowPostSchema, postHandler)
