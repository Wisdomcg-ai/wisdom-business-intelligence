import { YearType } from '../../types'
import { getFiscalYear } from '@/lib/utils/fiscal-year-utils'

export interface YearLabel {
  main: string
  subtitle: string | null
}

export interface MetricConfig {
  label: string
  key: string
  isPercentage: boolean
}

export interface PlanPeriodForLabel {
  planStartDate: Date
  planEndDate: Date
  year1EndDate: Date
  fiscalYearStart: number  // 1-12
}

const MONTH_ABBREVS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function formatEndDate(d: Date): string {
  return `${d.getDate()} ${MONTH_ABBREVS[d.getMonth()]} ${d.getFullYear()}`
}

function monthDiffInclusive(start: Date, end: Date): number {
  return (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1
}

/**
 * Phase 42: Year labels are derived purely from the persisted plan period dates.
 * No runtime date calls, no `currentYear` parameter, no extended-period flag.
 *
 * Defensive default: if planPeriod is undefined (initial render before hook
 * load completes), returns a generic "Year N" label so labels are stable.
 */
export function getYearLabel(
  idx: number,
  yearType: YearType,
  planPeriod?: PlanPeriodForLabel
): YearLabel {
  if (idx === 0) return { main: 'Current', subtitle: null }

  if (!planPeriod) {
    // Defensive default for the brief moment before hook load completes.
    return { main: `Year ${idx}`, subtitle: null }
  }

  const { planStartDate, planEndDate, year1EndDate, fiscalYearStart } = planPeriod
  const prefix = yearType === 'CY' ? 'CY' : 'FY'

  if (idx === 1) {
    const startFY = getFiscalYear(planStartDate, fiscalYearStart)
    const endFY = getFiscalYear(year1EndDate, fiscalYearStart)
    const months = monthDiffInclusive(planStartDate, year1EndDate)

    if (startFY !== endFY) {
      // Extended: Year 1 spans two FYs (e.g., FY26 rem + FY27)
      return {
        main: `${prefix}${startFY.toString().slice(-2)} rem + ${prefix}${endFY.toString().slice(-2)}`,
        subtitle: `${months} months`,
      }
    }
    // Standard 12-month
    return {
      main: `${prefix}${endFY.toString().slice(-2)}`,
      subtitle: `Ending ${formatEndDate(year1EndDate)}`,
    }
  }

  // Year 2 / Year 3 — derive from year1EndDate forward (12 months each).
  const year1FY = getFiscalYear(year1EndDate, fiscalYearStart)
  const targetFY = year1FY + (idx - 1)  // idx=2 -> +1, idx=3 -> +2

  // For Year 3 specifically, the actual end date is planEndDate (computed once
  // at suggest time). For Year 2 we synthesize a label only.
  if (idx === 3) {
    return {
      main: `${prefix}${targetFY.toString().slice(-2)}`,
      subtitle: `Ending ${formatEndDate(planEndDate)}`,
    }
  }
  return {
    main: `${prefix}${targetFY.toString().slice(-2)}`,
    subtitle: null,
  }
}

export const FINANCIAL_METRICS: MetricConfig[] = [
  { label: 'Revenue ($)', key: 'revenue', isPercentage: false },
  { label: 'Gross Profit ($)', key: 'grossProfit', isPercentage: false },
  { label: 'Gross Margin (%)', key: 'grossMargin', isPercentage: true },
  { label: 'Net Profit ($)', key: 'netProfit', isPercentage: false },
  { label: 'Net Margin (%)', key: 'netMargin', isPercentage: true }
]
