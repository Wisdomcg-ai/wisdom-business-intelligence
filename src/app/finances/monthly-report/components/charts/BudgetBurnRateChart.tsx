'use client'

import type { GeneratedReport } from '../../types'
import { CHART_COLORS } from './chart-colors'
import { fmtCurrency, fmtPct, ChartCard } from './chart-utils'

export interface BurnRateItem {
  label: string
  ytdActual: number
  annualBudget: number
  pctConsumed: number
  pctElapsed: number
  status: 'good' | 'warning' | 'over'
}

export function transformBurnRateData(report: GeneratedReport): BurnRateItem[] {
  // Calculate % of current Australian FY (Jul-Jun) elapsed based on report month
  const [y, m] = report.report_month.split('-').map(Number)
  const fyStartYear = m >= 7 ? y : y - 1
  const fyStart = new Date(fyStartYear, 6, 1) // 1 July
  const fyEnd = new Date(fyStartYear + 1, 5, 30) // 30 June
  const reportDate = new Date(y, m - 1, 28) // end of report month approx

  // Only show data for the current FY — skip if report is outside this FY
  if (reportDate < fyStart || reportDate > fyEnd) return []

  const pctElapsed = Math.min(100, ((reportDate.getTime() - fyStart.getTime()) / (fyEnd.getTime() - fyStart.getTime())) * 100)

  const items: BurnRateItem[] = []

  // Only show expense categories (not Revenue or Other Income)
  const expenseCategories = ['Cost of Sales', 'Operating Expenses', 'Other Expenses']

  for (const section of report.sections) {
    if (!expenseCategories.includes(section.category)) continue
    const sub = section.subtotal
    if (sub.budget_annual_total <= 0) continue

    const pctConsumed = (sub.ytd_actual / sub.budget_annual_total) * 100
    const status = pctConsumed > pctElapsed + 10 ? 'over' : pctConsumed > pctElapsed - 5 ? 'warning' : 'good'

    items.push({
      label: section.category,
      ytdActual: sub.ytd_actual,
      annualBudget: sub.budget_annual_total,
      pctConsumed,
      pctElapsed,
      status,
    })
  }

  return items
}

interface Props {
  report: GeneratedReport
}

export default function BudgetBurnRateChart({ report }: Props) {
  const data = transformBurnRateData(report)
  if (data.length === 0) return null

  const pctElapsed = data[0]?.pctElapsed || 0

  const getBarColor = (status: string) => {
    if (status === 'over') return CHART_COLORS.negative.hex
    if (status === 'warning') return CHART_COLORS.warning.hex
    return CHART_COLORS.positive.hex
  }

  return (
    <ChartCard title="Budget Burn Rate" subtitle={`Expense budgets for current FY (${pctElapsed.toFixed(0)}% of year elapsed)`} tooltip="Shows how fast you're spending through each annual expense budget in the current financial year. The coloured bar is how much you've used so far, and the dashed line marks where you should be based on how far through the year you are. If the bar passes the line, you're spending faster than planned.">
      <div className="space-y-4">
        {data.map(item => (
          <div key={item.label}>
            <div className="flex justify-between items-baseline mb-1">
              <span className="text-sm font-medium text-gray-700">{item.label}</span>
              <span className="text-xs text-gray-500">
                {fmtCurrency(item.ytdActual)} of {fmtCurrency(item.annualBudget)} ({fmtPct(item.pctConsumed)})
              </span>
            </div>
            <div className="relative h-5 bg-gray-100 rounded-full overflow-hidden">
              {/* Consumed bar */}
              <div
                className="absolute h-full rounded-full transition-all"
                style={{
                  width: `${Math.min(100, item.pctConsumed)}%`,
                  backgroundColor: getBarColor(item.status),
                }}
              />
              {/* Elapsed marker */}
              <div
                className="absolute top-0 h-full border-r-2 border-dashed border-gray-500"
                style={{ left: `${Math.min(100, pctElapsed)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-1 mt-3 text-xs text-gray-400">
        <span className="border-r-2 border-dashed border-gray-400 h-3 mr-1" />
        Dashed line = % of financial year elapsed
      </div>
    </ChartCard>
  )
}
