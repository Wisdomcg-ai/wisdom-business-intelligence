/**
 * GET /api/Xero/budgets?business_id=&fiscal_year=
 *
 * "Does this business have a budget in Xero we could start a forecast from?"
 * Feeds the forecast empty state's third choice (opt-in — nothing is pulled
 * unless the user clicks it). See .planning/XERO-BUDGET-SEED-PLAN.md.
 *
 * Fail-open house rule — the answer is one of five states, and "could not
 * check" is never rendered as "no budget":
 *   available      ≥1 org returned ≥1 budget
 *   none           every org answered and none has a budget
 *   scope_missing  no org has granted accounting.budgets.read yet (reconnect)
 *   not_connected  the business has no active Xero connection
 *   error          at least one org could not be checked and none was available
 *
 * Per org we list budgets and fetch each one for the target FY window so the
 * UI can show coverage ("covers 12 of 12 months"). Budgets are few (usually
 * one), so this is a handful of calls; no caching in v1.
 */
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import * as Sentry from '@sentry/nextjs'
import { createRouteHandlerClient } from '@/lib/supabase/server'
import { verifyBusinessAccess } from '@/lib/utils/verify-business-access'
import { resolveXeroConnections } from '@/lib/business/resolveXeroBusinessId'
import { getValidAccessToken } from '@/lib/xero/token-manager'
import { requireSectionPermission } from '@/lib/permissions/requireSectionPermission'
import { enforceSectionPermission } from '@/lib/permissions/sectionPermissionConfig'
import { withQuerySchema } from '@/lib/api/with-schema'
import { generateFiscalMonthKeys, DEFAULT_YEAR_START_MONTH } from '@/lib/utils/fiscal-year-utils'
import {
  listXeroBudgets,
  getXeroBudget,
  budgetCoverage,
  BudgetsScopeMissingError,
  type XeroBudgetType,
} from '@/lib/xero/budgets'
import { RateLimitDailyExceededError } from '@/lib/xero/xero-api-client'

export const dynamic = 'force-dynamic'

const GetQuerySchema = z
  .object({
    business_id: z.string().optional(),
    fiscal_year: z.string().optional(),
  })
  .passthrough()

export type BudgetAvailabilityState = 'available' | 'none' | 'scope_missing' | 'not_connected' | 'error'
export type OrgBudgetState = 'available' | 'none' | 'scope_missing' | 'error'

export interface BudgetAvailabilityOrg {
  tenantId: string
  orgName: string
  functionalCurrency: string | null
  state: OrgBudgetState
  error?: string
  budgets: Array<{
    budgetId: string
    name: string
    type: XeroBudgetType
    updatedAt: string | null
    lineCount: number
    coverage: { firstPeriod: string | null; lastPeriod: string | null; monthsInFY: number }
  }>
}

export interface BudgetAvailabilityResponse {
  state: BudgetAvailabilityState
  fiscalYear: number
  orgs: BudgetAvailabilityOrg[]
}

/** Combine per-org states into the one the empty state renders. Exported for tests. */
export function combineOrgStates(orgs: Array<{ state: OrgBudgetState }>): BudgetAvailabilityState {
  if (orgs.length === 0) return 'not_connected'
  if (orgs.some((o) => o.state === 'available')) return 'available'
  if (orgs.some((o) => o.state === 'scope_missing')) return 'scope_missing'
  if (orgs.some((o) => o.state === 'error')) return 'error'
  return 'none'
}

async function getHandler(request: NextRequest) {
  try {
    const supabase = await createRouteHandlerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const businessId = searchParams.get('business_id')
    const fiscalYearParam = searchParams.get('fiscal_year')
    if (!businessId) {
      return NextResponse.json({ error: 'business_id is required' }, { status: 400 })
    }
    const fiscalYear = fiscalYearParam ? parseInt(fiscalYearParam, 10) : NaN
    if (!Number.isFinite(fiscalYear)) {
      return NextResponse.json({ error: 'fiscal_year is required' }, { status: 400 })
    }

    const hasAccess = await verifyBusinessAccess(user.id, businessId)
    if (!hasAccess) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }
    const _sectionVerdict = await requireSectionPermission(supabase, user.id, businessId, 'finances')
    const _sectionBlocked = enforceSectionPermission(_sectionVerdict, 'finances', 'api/Xero/budgets', user.id, businessId)
    if (_sectionBlocked) return _sectionBlocked

    const { connections } = await resolveXeroConnections(supabase, businessId)
    const fyKeys = generateFiscalMonthKeys(fiscalYear, DEFAULT_YEAR_START_MONTH)
    // Ask Xero for Y1..Y3 so multi-year budgets show their full coverage.
    const window = { from: fyKeys[0], to: generateFiscalMonthKeys(fiscalYear + 2, DEFAULT_YEAR_START_MONTH)[11] }

    const orgs: BudgetAvailabilityOrg[] = []
    for (const connection of connections) {
      const org: BudgetAvailabilityOrg = {
        tenantId: connection.tenant_id,
        orgName: connection.display_name || connection.tenant_name || 'Xero org',
        functionalCurrency: connection.functional_currency ?? null,
        state: 'none',
        budgets: [],
      }
      orgs.push(org)
      try {
        const token = await getValidAccessToken(connection, supabase)
        if (!token.success || !token.accessToken) {
          org.state = 'error'
          org.error = token.shouldDeactivate ? 'requires_reconnect' : 'token_failed'
          continue
        }
        const auth = { accessToken: token.accessToken, tenantId: connection.tenant_id }
        const summaries = await listXeroBudgets(auth)
        for (const s of summaries) {
          const detail = await getXeroBudget(auth, s.budgetId, window)
          if (!detail) continue
          const cov = budgetCoverage(detail.lines, fyKeys)
          org.budgets.push({
            budgetId: s.budgetId,
            name: s.name,
            type: s.type,
            updatedAt: s.updatedAt,
            lineCount: detail.lines.length,
            coverage: { firstPeriod: cov.firstPeriod, lastPeriod: cov.lastPeriod, monthsInFY: cov.monthsInFY },
          })
        }
        org.state = org.budgets.length > 0 ? 'available' : 'none'
      } catch (err) {
        if (err instanceof BudgetsScopeMissingError) {
          org.state = 'scope_missing'
          continue
        }
        org.state = 'error'
        org.error = err instanceof RateLimitDailyExceededError ? 'xero_daily_rate_limit' : 'xero_error'
        Sentry.captureException(err, {
          tags: { route: 'Xero/budgets', tenant_id: connection.tenant_id },
          extra: { context: '[Xero/budgets] org check failed', businessId },
        } as any)
      }
    }

    const body: BudgetAvailabilityResponse = { state: combineOrgStates(orgs), fiscalYear, orgs }
    return NextResponse.json(body)
  } catch (err) {
    Sentry.captureException(err, { tags: { route: 'Xero/budgets' }, extra: { context: '[Xero/budgets] Unexpected error' } } as any)
    return NextResponse.json({ error: 'Internal server error', state: 'error' }, { status: 500 })
  }
}

export const GET = withQuerySchema(
  'Xero/budgets',
  GetQuerySchema,
  getHandler as unknown as (request: Request) => Promise<Response>,
)
