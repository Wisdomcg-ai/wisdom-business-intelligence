import { FinancialData, CoreMetricsData, KPIData, YearType } from '../../types'

export interface YearLabel {
  main: string
  subtitle: string | null
}

export interface MetricConfig {
  label: string
  key: string
  isPercentage: boolean
}

export interface YearLabelProps {
  yearType: YearType
  currentYear: number
}

export function getYearLabel(idx: number, yearType: YearType, currentYear: number): YearLabel {
  if (idx === 0) return { main: 'Current', subtitle: null }

  const today = new Date()
  const currentMonth = today.getMonth()

  if (yearType === 'FY') {
    let fyYear = currentYear
    if (currentMonth >= 3) {
      fyYear += 1
    }
    const year = fyYear + idx - 1
    return {
      main: `FY${year.toString().slice(-2)}`,
      subtitle: `Ending 30 June ${year}`
    }
  }

  let cyYear = currentYear
  if (currentMonth >= 9) {
    cyYear += 1
  }
  const year = cyYear + idx - 1
  return {
    main: `CY${year.toString().slice(-2)}`,
    subtitle: `Ending 31 Dec ${year}`
  }
}

export const FINANCIAL_METRICS: MetricConfig[] = [
  { label: 'Revenue ($)', key: 'revenue', isPercentage: false },
  { label: 'Gross Profit ($)', key: 'grossProfit', isPercentage: false },
  { label: 'Gross Margin (%)', key: 'grossMargin', isPercentage: true },
  { label: 'Net Profit ($)', key: 'netProfit', isPercentage: false },
  { label: 'Net Margin (%)', key: 'netMargin', isPercentage: true }
]
