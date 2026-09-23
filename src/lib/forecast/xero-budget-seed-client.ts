/**
 * Client-side helpers for the "Start from Xero budget" entry point.
 *
 * Pure functions over the availability response (GET /api/Xero/budgets) and
 * the seed report (POST /api/forecast/seed-from-xero-budget) so the empty
 * state and the page handler stay thin and the wording is unit-tested.
 */
import type { BudgetAvailabilityResponse } from '@/lib/xero/budget-availability'
import type { XeroBudgetType } from '@/lib/xero/budgets'
import type { XeroBudgetSeedReport } from '@/lib/services/xero-budget-seed-service'

export interface BudgetChoice {
  tenantId: string
  orgName: string
  functionalCurrency: string | null
  budgetId: string
  name: string
  type: XeroBudgetType
  updatedAt: string | null
  lineCount: number
  coverage: { firstPeriod: string | null; lastPeriod: string | null; monthsInFY: number }
}

/** Every (org, budget) pair the operator may import — only orgs that have one. */
export function listBudgetChoices(response: BudgetAvailabilityResponse | null | undefined): BudgetChoice[] {
  if (!response) return []
  const out: BudgetChoice[] = []
  for (const org of response.orgs) {
    if (org.state !== 'available') continue
    for (const b of org.budgets) {
      // Belt and braces with the route: a budget with nothing in this FY
      // cannot seed it.
      if (b.coverage.monthsInFY <= 0 || b.lineCount <= 0) continue
      out.push({
        tenantId: org.tenantId,
        orgName: org.orgName,
        functionalCurrency: org.functionalCurrency,
        budgetId: b.budgetId,
        name: b.name,
        type: b.type,
        updatedAt: b.updatedAt,
        lineCount: b.lineCount,
        coverage: b.coverage,
      })
    }
  }
  return out
}

/**
 * The pre-selected option in the picker: the OVERALL budget of the first org
 * (the org list is in connection order, primary first), else the first budget.
 */
export function pickDefaultBudget(choices: BudgetChoice[]): BudgetChoice | null {
  if (choices.length === 0) return null
  const firstTenant = choices[0].tenantId
  return choices.find((c) => c.tenantId === firstTenant && c.type === 'OVERALL') ?? choices[0]
}

/** True when the offered budgets come from orgs reporting in different currencies. */
export function hasMixedCurrencies(choices: BudgetChoice[]): boolean {
  const set = new Set(choices.map((c) => (c.functionalCurrency ?? '').toUpperCase()).filter(Boolean))
  return set.size > 1
}

/** "covers 12 of 12 months" / "covers 9 of 12 months" / "no months in FY27". */
export function describeCoverage(coverage: BudgetChoice['coverage'], fiscalYear: number): string {
  if (coverage.monthsInFY <= 0) return `no months in FY${fiscalYear}`
  return `covers ${coverage.monthsInFY} of 12 months`
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`
}

/**
 * The toast shown after a successful seed. Title carries the counts the
 * operator will look for; the detail names what still needs their hand.
 */
export function describeSeedReport(
  report: XeroBudgetSeedReport,
  budgetName?: string,
): { title: string; detail: string | null } {
  const { counts } = report
  const from = budgetName ? ` from “${budgetName}”` : ' from your Xero budget'
  const title = `Imported ${counts.revenue} revenue, ${counts.cogs} COGS and ${counts.opex} OpEx lines${from}.`

  const parts: string[] = []
  if (report.teamCostBudget.lines.length > 0) {
    parts.push(
      `${plural(report.teamCostBudget.lines.length, 'wages/super account')} left to Step 4 — payroll replaces them once staff are imported.`,
    )
  }
  if (report.zeroBudgetLines.length > 0) {
    parts.push(`${plural(report.zeroBudgetLines.length, 'unbudgeted account')} set to $0.`)
  }
  if (report.unclassified.length > 0) {
    parts.push(`${plural(report.unclassified.length, 'account needs', 'accounts need')} a category.`)
  }
  if (report.coverage.monthsFilled > 0) {
    parts.push(`${plural(report.coverage.monthsFilled, 'month')} outside the budget filled from last year.`)
  }
  return { title, detail: parts.length > 0 ? parts.join(' ') : null }
}

/** 7 Sep 2026 style date for the provenance banners. */
export function formatSeedDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}
