/**
 * A Full Year subtotal row: a section's "Total Operating Expenses", or one
 * expense group's "Total Bank and Other Fees".
 *
 * Lives here rather than in the full-year route because three things build one
 * now — the route (section totals), and the PDF and the browser tab (group
 * totals) — and a Next route module may export only its handlers. Two copies
 * of the arithmetic is how a group subtotal ends up summing to something other
 * than the section total printed under it.
 */

import type { FullYearLine, FullYearMonthData } from '@/app/finances/monthly-report/types'

/**
 * Sum the approved budget across lines for one month, or null when none of them
 * carry one. Null is deliberate: a subtotal of "no approved budget" must not
 * read as $0, which a reader takes for a real budget of nothing.
 */
function sumApproved(lines: readonly FullYearLine[], i: number): number | null {
  const present = lines.filter((l) => l.months[i]?.approved_budget !== null && l.months[i]?.approved_budget !== undefined)
  if (present.length === 0) return null
  return present.reduce((s, l) => s + (l.months[i].approved_budget ?? 0), 0)
}

/**
 * @param category the section the lines belong to. It decides the variance
 *                 sign: projection above forecast is favourable for Revenue and
 *                 Other Income, unfavourable for everything else — the same
 *                 rule each line's own variance was built with.
 */
export function buildFullYearSubtotal(
  lines: readonly FullYearLine[],
  label: string,
  category: string,
  allMonths: readonly string[],
): FullYearLine {
  const months: FullYearMonthData[] = allMonths.map((m, i) => ({
    month: m,
    actual: lines.reduce((s, l) => s + l.months[i].actual, 0),
    budget: lines.reduce((s, l) => s + l.months[i].budget, 0),
    approved_budget: sumApproved(lines, i),
    prior_year: lines.reduce((s, l) => s + (l.months[i].prior_year || 0), 0),
    source: lines.length > 0 ? lines[0].months[i].source : 'forecast' as const,
  }))

  const projectedTotal = lines.reduce((s, l) => s + l.projected_total, 0)
  const annualBudget = lines.reduce((s, l) => s + l.annual_budget, 0)
  const isRevenue = category === 'Revenue' || category === 'Other Income'
  const varianceAmount = isRevenue
    ? projectedTotal - annualBudget
    : annualBudget - projectedTotal
  const variancePercent = annualBudget !== 0 ? (varianceAmount / Math.abs(annualBudget)) * 100 : 0

  return {
    account_name: label,
    category,
    months,
    projected_total: projectedTotal,
    annual_budget: annualBudget,
    approved_annual_budget: months.some((md) => md.approved_budget !== null)
      ? months.reduce((sum, md) => sum + (md.approved_budget ?? 0), 0)
      : null,
    variance_amount: varianceAmount,
    variance_percent: variancePercent,
  }
}
