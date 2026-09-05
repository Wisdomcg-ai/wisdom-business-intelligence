/**
 * POST /api/forecast/seed-from-xero-budget
 * body: { businessId, targetFiscalYear, tenantId, budgetId }
 *
 * Starts a forecast from the client's Xero Budget Manager budget. Opt-in,
 * one-shot (see .planning/XERO-BUDGET-SEED-PLAN.md). Mirrors
 * /api/forecast/seed-from-prior step for step:
 *   1. Auth (401 before 403) — businessId-first, verbatim from generate route
 *   2. Section permission gate
 *   3. The tenant must be one of THIS business's active Xero connections
 *      (connections live in businesses-space; forecasts in
 *      business_profiles-space — resolved separately, never joined)
 *   4. Target FY forecast row must exist (page load creates it)
 *   5. Idempotency gate — isForecastSeedable (409 if the wizard has data)
 *   6. Fetch the budget for FY..FY+duration−1, the catalog, the P&L actuals
 *   7. Pure transform → assumptions + report
 *   8. Persist forecast_duration, materialise via convertAssumptionsToPLLines,
 *      atomic write via save_assumptions_and_materialize
 *
 * Error contract the UI relies on:
 *   422 code 'xero_budget_scope_missing' → render "Reconnect Xero to enable"
 *   404 budget not found · 409 seed refused · 503 Xero daily rate limit
 */
import { NextResponse } from 'next/server'
import { z } from 'zod'
import * as Sentry from '@sentry/nextjs'
import { createRouteHandlerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin'
import { resolveBusinessProfileIds } from '@/lib/business/resolveBusinessProfileIds'
import { resolveXeroConnections } from '@/lib/business/resolveXeroBusinessId'
import { getValidAccessToken } from '@/lib/xero/token-manager'
import { isForecastSeedable } from '@/lib/services/forecast-seed-service'
import { seedForecastFromXeroBudget, completedMonthKeysFor } from '@/lib/services/xero-budget-seed-service'
import { loadAccountsCatalog, loadAccountActuals } from '@/lib/services/xero-budget-seed-data'
import { getXeroBudget, BudgetsScopeMissingError } from '@/lib/xero/budgets'
import { RateLimitDailyExceededError, XeroHttpError } from '@/lib/xero/xero-api-client'
import { convertAssumptionsToPLLines } from '@/app/finances/forecast/services/assumptions-to-pl-lines'
import { requireSectionPermission } from '@/lib/permissions/requireSectionPermission'
import { enforceSectionPermission } from '@/lib/permissions/sectionPermissionConfig'
import { withSchema } from '@/lib/api/with-schema'
import { generateFiscalMonthKeys, DEFAULT_YEAR_START_MONTH } from '@/lib/utils/fiscal-year-utils'

export const dynamic = 'force-dynamic'

const PostSchema = z
  .object({
    businessId: z.string(),
    targetFiscalYear: z.number(),
    tenantId: z.string(),
    budgetId: z.string(),
  })
  .passthrough()

const ROUTE = 'forecast/seed-from-xero-budget'

async function postHandler(request: Request) {
  try {
    const supabase = await createRouteHandlerClient()

    // ── 1. Auth — getUser first (401 before 403) ─────────────────────────────
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const { businessId, targetFiscalYear, tenantId, budgetId } = body as {
      businessId?: string; targetFiscalYear?: number; tenantId?: string; budgetId?: string
    }
    if (!businessId || !targetFiscalYear || !tenantId || !budgetId) {
      return NextResponse.json(
        { error: 'businessId, targetFiscalYear, tenantId and budgetId are required' },
        { status: 400 },
      )
    }

    // businessId-first access check (verbatim pattern from seed-from-prior).
    const { data: business, error: bizError } = await supabase
      .from('businesses')
      .select('id, owner_id')
      .eq('id', businessId)
      .maybeSingle()
    if (bizError || !business) {
      return NextResponse.json({ error: 'Business not found or access denied' }, { status: 403 })
    }
    if (business.owner_id !== user.id) {
      const { data: teamMember } = await supabase
        .from('business_users')
        .select('id')
        .eq('business_id', businessId)
        .eq('user_id', user.id)
        .eq('status', 'active')
        .maybeSingle()
      if (!teamMember) {
        const { data: roleData } = await supabase
          .from('system_roles')
          .select('role')
          .eq('user_id', user.id)
          .maybeSingle()
        const isCoachOrAdmin = roleData?.role === 'coach' || roleData?.role === 'super_admin'
        if (!isCoachOrAdmin) {
          return NextResponse.json({ error: 'Business not found or access denied' }, { status: 403 })
        }
      }
    }

    // ── 2. Section permission ────────────────────────────────────────────────
    const _sectionVerdict = await requireSectionPermission(supabase, user.id, businessId, 'finances')
    const _sectionBlocked = enforceSectionPermission(_sectionVerdict, 'finances', `api/${ROUTE}`, user.id, businessId)
    if (_sectionBlocked) return _sectionBlocked

    // ── 3. The tenant must belong to this business ───────────────────────────
    const { connections } = await resolveXeroConnections(supabase, businessId)
    const connection = connections.find((c: { tenant_id: string }) => c.tenant_id === tenantId)
    if (!connection) {
      return NextResponse.json({ error: 'Xero organisation is not connected to this business' }, { status: 403 })
    }

    // ── 4. Target forecast row (forecasts are business_profiles-space) ───────
    const ids = await resolveBusinessProfileIds(supabase, businessId)
    const { data: targetForecast } = await supabase
      .from('financial_forecasts')
      .select('id, assumptions, forecast_start_month, forecast_end_month, forecast_duration')
      .in('business_id', ids.all)
      .eq('fiscal_year', targetFiscalYear)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!targetForecast) {
      return NextResponse.json(
        { error: `No FY${targetFiscalYear} forecast row found. Visit the page first.` },
        { status: 404 },
      )
    }

    // ── 5. Idempotency gate ──────────────────────────────────────────────────
    const { count: plLineCount } = await supabase
      .from('forecast_pl_lines')
      .select('id', { count: 'exact', head: true })
      .eq('forecast_id', targetForecast.id)
    if (!isForecastSeedable(targetForecast.assumptions, plLineCount ?? 0)) {
      return NextResponse.json({ error: 'Target forecast already has data. Seed refused.' }, { status: 409 })
    }

    // ── 6. Fetch budget + catalog + actuals ──────────────────────────────────
    const duration = Math.min(3, Math.max(1, Number(targetForecast.forecast_duration ?? 1))) as 1 | 2 | 3
    const token = await getValidAccessToken(connection, supabase)
    if (!token.success || !token.accessToken) {
      return NextResponse.json(
        { error: 'Could not reach Xero for this organisation', code: token.shouldDeactivate ? 'requires_reconnect' : 'token_failed' },
        { status: 502 },
      )
    }
    const auth = { accessToken: token.accessToken, tenantId }
    const window = {
      from: generateFiscalMonthKeys(targetFiscalYear, DEFAULT_YEAR_START_MONTH)[0],
      to: generateFiscalMonthKeys(targetFiscalYear + duration - 1, DEFAULT_YEAR_START_MONTH)[11],
    }
    let budget
    try {
      budget = await getXeroBudget(auth, budgetId, window)
    } catch (err) {
      if (err instanceof BudgetsScopeMissingError) {
        return NextResponse.json(
          { error: 'This Xero organisation has not granted budget access yet. Reconnect Xero to enable.', code: 'xero_budget_scope_missing' },
          { status: 422 },
        )
      }
      if (err instanceof RateLimitDailyExceededError) {
        return NextResponse.json({ error: 'Xero daily limit reached for this organisation. Try again tomorrow.', code: 'xero_daily_rate_limit' }, { status: 503 })
      }
      if (err instanceof XeroHttpError) {
        Sentry.captureException(err, { tags: { route: ROUTE, tenant_id: tenantId }, extra: { context: 'budget fetch failed' } } as any)
        return NextResponse.json({ error: 'Xero returned an error fetching the budget', code: 'xero_error' }, { status: 502 })
      }
      throw err
    }
    if (!budget) {
      return NextResponse.json({ error: 'Budget not found in Xero' }, { status: 404 })
    }

    // Service-role reads for the reference data. Access to the business and the
    // tenant has already been proven above; the chart-of-accounts RLS admits
    // only the owner and the assigned coach, so a super-admin's own session
    // reads an EMPTY catalog and every account falls back to the P&L mirror —
    // accounts with no history then come back "unclassified" (Urban Road, 5 Sep
    // 2026: Bank Revaluations, FX Gain/Loss, General Expenses).
    const admin = createServiceRoleClient()
    const [catalog, actuals] = await Promise.all([
      loadAccountsCatalog(admin, tenantId),
      loadAccountActuals(admin, tenantId),
    ])

    // ── 7. Transform ─────────────────────────────────────────────────────────
    const { assumptions, forecastDuration, report } = seedForecastFromXeroBudget({
      budget: { budgetId: budget.budgetId, name: budget.name, type: budget.type, updatedAt: budget.updatedAt, lines: budget.lines },
      org: {
        tenantId,
        orgName: connection.display_name || connection.tenant_name || 'Xero org',
        functionalCurrency: connection.functional_currency ?? null,
      },
      catalog,
      actuals,
      fiscalYear: targetFiscalYear,
      forecastDuration: duration,
      completedMonthKeys: completedMonthKeysFor(targetFiscalYear, new Date()),
    })

    // ── 8. Persist (same shape as seed-from-prior) ───────────────────────────
    const { error: durErr } = await supabase
      .from('financial_forecasts')
      .update({ forecast_duration: forecastDuration })
      .eq('id', targetForecast.id)
    if (durErr) {
      Sentry.captureException(durErr, { tags: { route: ROUTE, invariant: 'forecast_duration_write_failed' }, extra: { context: 'forecast_duration update failed' } } as any)
      return NextResponse.json({ error: `forecast_duration update failed: ${durErr.message}` }, { status: 500 })
    }

    const generatedLines = convertAssumptionsToPLLines({
      assumptions,
      forecastStartMonth: targetForecast.forecast_start_month as string,
      forecastEndMonth: targetForecast.forecast_end_month as string,
      fiscalYear: targetFiscalYear,
      forecastDuration,
      existingLines: [],
    })
    const rpcPLLines = generatedLines.map((line, i) => ({
      account_name: line.account_name,
      account_code: line.account_code ?? null,
      category: line.category,
      subcategory: line.subcategory ?? null,
      sort_order: line.sort_order ?? i,
      actual_months: line.actual_months || {},
      forecast_months: line.forecast_months || {},
      is_from_xero: line.is_from_xero || false,
    }))
    const { error: rpcError } = await supabase.rpc('save_assumptions_and_materialize', {
      p_forecast_id: targetForecast.id,
      p_assumptions: assumptions,
      p_pl_lines: rpcPLLines,
    })
    if (rpcError) {
      Sentry.captureException(rpcError, { tags: { route: ROUTE, invariant: 'seed_atomic_save_failed' }, extra: { context: 'Atomic save failed' } } as any)
      return NextResponse.json({ error: `Seed failed: ${rpcError.message}`, code: (rpcError as { code?: string }).code }, { status: 500 })
    }

    return NextResponse.json({ success: true, forecastId: targetForecast.id, report })
  } catch (err) {
    Sentry.captureException(err, { tags: { route: ROUTE }, extra: { context: 'Unexpected error' } } as any)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const POST = withSchema(ROUTE, PostSchema, postHandler)
