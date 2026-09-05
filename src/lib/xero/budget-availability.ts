/**
 * Shapes and the one pure rule behind GET /api/Xero/budgets.
 *
 * Lives outside the route file because Next.js App Router route modules may
 * only export HTTP handlers and route config — a helper export fails the
 * production build's route type check. The UI (PR 4) imports these types too.
 */
import type { XeroBudgetType } from './budgets'

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

/**
 * Combine per-org states into the one the empty state renders. Precedence:
 * any org with a budget → available; else any org lacking the scope →
 * scope_missing (the fix is a reconnect, not "no budget"); else any org that
 * could not be checked → error; else none. No connections → not_connected.
 */
export function combineOrgStates(orgs: Array<{ state: OrgBudgetState }>): BudgetAvailabilityState {
  if (orgs.length === 0) return 'not_connected'
  if (orgs.some((o) => o.state === 'available')) return 'available'
  if (orgs.some((o) => o.state === 'scope_missing')) return 'scope_missing'
  if (orgs.some((o) => o.state === 'error')) return 'error'
  return 'none'
}
