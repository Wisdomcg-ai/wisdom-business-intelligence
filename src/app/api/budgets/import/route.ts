/**
 * POST /api/budgets/import
 *
 * Read a Xero budget into a locked budget version — the yardstick the monthly
 * report measures against, kept apart from the forecast that predicts where the
 * year lands. See .planning/BUDGET-STORE-PLAN.md.
 *
 * Two things distinguish it from the forecast seed, which reads the same Xero
 * budget through the same helpers:
 *
 *   1. It takes the WHOLE fiscal year, elapsed months included. The seed drops
 *      closed months — right for a forecast, fatal for a budget, because every
 *      monthly report is about a closed month.
 *   2. It never overwrites. A revision is a new version_number, and
 *      effective_from applies it prospectively so a month already reported
 *      keeps the budget it was reported against.
 *
 * Nothing reads the result until a version is pinned; importing is not itself
 * a switch-over.
 */
import { NextResponse } from 'next/server'
import { z } from 'zod'
import * as Sentry from '@sentry/nextjs'
import { createRouteHandlerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { getSupabaseSecretKey } from '@/lib/supabase/keys'
import { verifyBusinessAccess } from '@/lib/utils/verify-business-access'
import { requireSectionPermission } from '@/lib/permissions/requireSectionPermission'
import { enforceSectionPermission } from '@/lib/permissions/sectionPermissionConfig'
import { resolveXeroConnections } from '@/lib/business/resolveXeroBusinessId'
import { getValidAccessToken } from '@/lib/xero/token-manager'
import { getXeroBudget, BudgetsScopeMissingError } from '@/lib/xero/budgets'
import { RateLimitDailyExceededError } from '@/lib/xero/xero-api-client'
import { loadAccountsCatalog, loadAccountActuals } from '@/lib/services/xero-budget-seed-data'
import { buildBudgetFromXero, defaultEffectiveFrom } from '@/lib/budgets/import-xero-budget'
import { generateFiscalMonthKeys, DEFAULT_YEAR_START_MONTH } from '@/lib/utils/fiscal-year-utils'
import { withSchema } from '@/lib/api/with-schema'

export const dynamic = 'force-dynamic'

const ROUTE = 'budgets/import'

const PostSchema = z
  .object({
    businessId: z.string(),
    tenantId: z.string(),
    fiscalYear: z.number(),
    budgetId: z.string(),
    /**
     * 'YYYY-MM'. Omit to default to the first month with no finalised report —
     * the period boundary. Never offer a month already reported.
     */
    effectiveFrom: z.string().optional(),
    label: z.string().optional(),
  })
  .passthrough()

/** Writes go through the service role; RLS makes both tables read-only to users. */
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, getSupabaseSecretKey())

async function postHandler(request: Request) {
  try {
    const supabase = await createRouteHandlerClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const { businessId, tenantId, fiscalYear, budgetId, effectiveFrom, label } = body as {
      businessId?: string; tenantId?: string; fiscalYear?: number; budgetId?: string
      effectiveFrom?: string; label?: string
    }
    if (!businessId || !tenantId || !fiscalYear || !budgetId) {
      return NextResponse.json(
        { error: 'businessId, tenantId, fiscalYear and budgetId are required' },
        { status: 400 },
      )
    }

    // ── Access ───────────────────────────────────────────────────────────────
    if (!(await verifyBusinessAccess(user.id, businessId))) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }
    const verdict = await requireSectionPermission(supabase, user.id, businessId, 'finances')
    const blocked = enforceSectionPermission(verdict, 'finances', `api/${ROUTE}`, user.id, businessId)
    if (blocked) return blocked

    // The org must belong to THIS business — otherwise the tenant id is a
    // capability for reading another client's budget.
    const { connections } = await resolveXeroConnections(admin, businessId)
    const connection = connections.find((c: { tenant_id: string }) => c.tenant_id === tenantId)
    if (!connection) {
      return NextResponse.json({ error: 'Xero organisation is not connected to this business' }, { status: 403 })
    }

    // ── Fetch the budget for the WHOLE fiscal year ───────────────────────────
    const fyMonthKeys = generateFiscalMonthKeys(fiscalYear, DEFAULT_YEAR_START_MONTH)
    const token = await getValidAccessToken(connection, admin)
    if (!token.success || !token.accessToken) {
      return NextResponse.json(
        { error: 'Could not reach Xero for this organisation', code: token.shouldDeactivate ? 'requires_reconnect' : 'token_failed' },
        { status: 502 },
      )
    }

    let budget
    try {
      budget = await getXeroBudget(
        { accessToken: token.accessToken, tenantId },
        budgetId,
        { from: fyMonthKeys[0], to: fyMonthKeys[fyMonthKeys.length - 1] },
      )
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
      Sentry.captureException(err, { tags: { route: ROUTE, tenant_id: tenantId } } as any)
      return NextResponse.json({ error: 'Xero returned an error fetching the budget', code: 'xero_error' }, { status: 502 })
    }
    if (!budget) {
      return NextResponse.json({ error: 'Budget not found in Xero' }, { status: 404 })
    }

    // ── Classify, once, and shape the rows ───────────────────────────────────
    const [catalog, actuals] = await Promise.all([
      loadAccountsCatalog(admin, tenantId),
      loadAccountActuals(admin, tenantId),
    ])

    const built = buildBudgetFromXero({
      budgetLines: budget.lines,
      catalog,
      actuals,
      fyMonthKeys,
    })

    if (built.lines.length === 0) {
      return NextResponse.json(
        { error: 'That Xero budget has no amounts inside this fiscal year', code: 'empty_budget' },
        { status: 422 },
      )
    }

    // ── Where this version takes effect ──────────────────────────────────────
    // A revision must not restate a month already issued.
    const { data: finalised } = await admin
      .from('monthly_report_snapshots')
      .select('report_month')
      .eq('business_id', businessId)
      .eq('fiscal_year', fiscalYear)
      .neq('status', 'draft')

    const effective = effectiveFrom
      ?? defaultEffectiveFrom(fyMonthKeys, (finalised ?? []).map((r: { report_month: string }) => r.report_month))

    // ── Next version number for this (business, tenant, FY) ──────────────────
    const { data: existing } = await admin
      .from('budget_versions')
      .select('version_number')
      .eq('business_id', businessId)
      .eq('tenant_id', tenantId)
      .eq('fiscal_year', fiscalYear)
      .order('version_number', { ascending: false })
      .limit(1)
      .maybeSingle()
    const versionNumber = (existing?.version_number ?? 0) + 1

    // ── Insert: version unlocked → lines → lock ──────────────────────────────
    // supabase-js cannot span two inserts in one transaction, so completeness is
    // structural instead: the resolver reads only locked rows, and a half-written
    // import stays invisible rather than blanking a client's budget column.
    const { data: version, error: versionError } = await admin
      .from('budget_versions')
      .insert({
        business_id: businessId,
        tenant_id: tenantId,
        fiscal_year: fiscalYear,
        source: 'xero',
        xero_budget_id: budget.budgetId,
        xero_budget_type: budget.type,
        xero_updated_at: budget.updatedAt ?? null,
        currency: connection.functional_currency ?? null,
        label: label || budget.name || 'Xero budget',
        version_number: versionNumber,
        effective_from: effective,
        locked_at: null,
        imported_by: user.id,
        months_covered: built.monthsCovered,
        first_period: built.firstPeriod,
        last_period: built.lastPeriod,
      })
      .select('id')
      .single()

    if (versionError || !version) {
      Sentry.captureException(versionError, { tags: { route: ROUTE, invariant: 'budget_version_insert_failed' } } as any)
      return NextResponse.json({ error: `Could not create the budget version: ${versionError?.message}` }, { status: 500 })
    }

    const { error: linesError } = await admin.from('budget_lines').insert(
      built.lines.map((line) => ({
        budget_version_id: version.id,
        business_id: businessId,
        tenant_id: tenantId,
        account_code: line.account_code,
        account_name: line.account_name,
        category: line.category,
        account_type: line.account_type,
        month: line.month,
        amount: line.amount,
      })),
    )

    if (linesError) {
      // Leave the version unlocked — it is invisible to the resolver — and say
      // so rather than reporting a success that has no numbers behind it.
      Sentry.captureException(linesError, { tags: { route: ROUTE, invariant: 'budget_lines_insert_failed' }, extra: { versionId: version.id } } as any)
      return NextResponse.json({ error: `Could not write the budget lines: ${linesError.message}` }, { status: 500 })
    }

    const { error: lockError } = await admin
      .from('budget_versions')
      .update({ locked_at: new Date().toISOString() })
      .eq('id', version.id)

    if (lockError) {
      Sentry.captureException(lockError, { tags: { route: ROUTE, invariant: 'budget_version_lock_failed' }, extra: { versionId: version.id } } as any)
      return NextResponse.json({ error: `Budget imported but could not be locked: ${lockError.message}` }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      versionId: version.id,
      versionNumber,
      effectiveFrom: effective,
      label: label || budget.name,
      monthsCovered: built.monthsCovered,
      firstPeriod: built.firstPeriod,
      lastPeriod: built.lastPeriod,
      lineCount: built.lines.length,
      // Surfaced, not swallowed — a partial or partly-unclassified import must
      // be visible to the operator who ran it.
      unclassified: built.unclassified,
      zeroBudgetAccounts: built.zeroBudgetAccounts,
      warnings: built.warnings,
    })
  } catch (error) {
    Sentry.captureException(error, { tags: { route: ROUTE } } as any)
    return NextResponse.json({ error: 'Failed to import the budget' }, { status: 500 })
  }
}

export const POST = withSchema(ROUTE, PostSchema, postHandler)
