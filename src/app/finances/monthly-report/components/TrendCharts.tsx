'use client'

import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import type { FullYearReport, TrendDataPoint } from '../types'

interface TrendChartsProps {
  report: FullYearReport
}

function getMonthLabel(monthKey: string): string {
  const date = new Date(monthKey + '-01')
  return date.toLocaleDateString('en-AU', { month: 'short' })
}

function fmt(value: number): string {
  const abs = Math.abs(value)
  if (abs >= 1000) {
    return `${value < 0 ? '-' : ''}$${(abs / 1000).toFixed(1)}k`
  }
  return `${value < 0 ? '-' : ''}$${abs.toFixed(0)}`
}

interface ChartDataPoint extends TrendDataPoint {
  expenses_actual: number
  expenses_budget: number
  expenses_prior_year: number
}

function deriveTrendData(report: FullYearReport): ChartDataPoint[] {
  const revSection = report.sections.find(s => s.category === 'Revenue')
  const cogsSection = report.sections.find(s => s.category === 'Cost of Sales')
  const opexSection = report.sections.find(s => s.category === 'Operating Expenses')
  const otherIncSection = report.sections.find(s => s.category === 'Other Income')
  const otherExpSection = report.sections.find(s => s.category === 'Other Expenses')

  const months = report.gross_profit.months

  return months.map((gpMonth, i) => {
    const revActual = (revSection?.subtotal.months[i].actual || 0) + (otherIncSection?.subtotal.months[i].actual || 0)
    const revBudget = (revSection?.subtotal.months[i].budget || 0) + (otherIncSection?.subtotal.months[i].budget || 0)
    const revPriorYear = (revSection?.subtotal.months[i].prior_year || 0) + (otherIncSection?.subtotal.months[i].prior_year || 0)
    const cogsActual = cogsSection?.subtotal.months[i].actual || 0
    const cogsBudget = cogsSection?.subtotal.months[i].budget || 0
    const cogsPriorYear = cogsSection?.subtotal.months[i].prior_year || 0
    const opexActual = (opexSection?.subtotal.months[i].actual || 0) + (otherExpSection?.subtotal.months[i].actual || 0)
    const opexBudget = (opexSection?.subtotal.months[i].budget || 0) + (otherExpSection?.subtotal.months[i].budget || 0)
    const opexPriorYear = (opexSection?.subtotal.months[i].prior_year || 0) + (otherExpSection?.subtotal.months[i].prior_year || 0)

    const gpActual = revActual - cogsActual
    const gpBudget = revBudget - cogsBudget
    const npActual = gpActual - opexActual
    const npBudget = gpBudget - opexBudget

    const gpPct = revActual !== 0 ? (gpActual / revActual) * 100 : 0
    const npPct = revActual !== 0 ? (npActual / revActual) * 100 : 0
    const gpPctBudget = revBudget !== 0 ? (gpBudget / revBudget) * 100 : 0
    const npPctBudget = revBudget !== 0 ? (npBudget / revBudget) * 100 : 0

    // For months that are forecast, use budget values for actuals too
    const isActual = gpMonth.source === 'actual'
    return {
      month: gpMonth.month,
      monthLabel: getMonthLabel(gpMonth.month),
      revenue_actual: isActual ? revActual : revBudget,
      revenue_budget: revBudget,
      revenue_prior_year: revPriorYear,
      cogs_actual: isActual ? cogsActual : cogsBudget,
      cogs_budget: cogsBudget,
      cogs_prior_year: cogsPriorYear,
      opex_actual: isActual ? opexActual : opexBudget,
      opex_budget: opexBudget,
      opex_prior_year: opexPriorYear,
      expenses_actual: isActual ? (cogsActual + opexActual) : (cogsBudget + opexBudget),
      expenses_budget: cogsBudget + opexBudget,
      expenses_prior_year: cogsPriorYear + opexPriorYear,
      gp_percent: isActual ? gpPct : gpPctBudget,
      np_percent: isActual ? npPct : npPctBudget,
      gp_percent_budget: gpPctBudget,
      np_percent_budget: npPctBudget,
    }
  })
}

const currencyFormatter = (value: number) => fmt(value)
const pctFormatter = (value: number) => `${value.toFixed(1)}%`

export default function TrendCharts({ report }: TrendChartsProps) {
  const trendData = deriveTrendData(report)
  const lastActualIdx = trendData.findIndex(d => d.month > report.last_actual_month)
  const actualMonths = lastActualIdx === -1 ? trendData.length : lastActualIdx

  return (
    <div className="space-y-6">
      {/* Chart 1: Revenue & Expenses Bar Chart */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-1">Revenue &amp; Expenses</h3>
        <p className="text-xs text-gray-500 mb-4">Monthly actual vs budget comparison — FY{report.fiscal_year}</p>

        <ResponsiveContainer width="100%" height={400}>
          <BarChart data={trendData} barGap={0} barCategoryGap="15%">
            <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
            <XAxis
              dataKey="monthLabel"
              tick={{ fontSize: 12 }}
              tickLine={false}
            />
            <YAxis
              tickFormatter={currencyFormatter}
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              formatter={(value: number, name: string) => [fmt(value), name]}
              contentStyle={{ fontSize: 12, borderRadius: 6, border: '1px solid #E5E7EB' }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="revenue_actual" name="Revenue (Actual)" fill="#22c55e" radius={[2, 2, 0, 0]} />
            <Bar dataKey="revenue_budget" name="Revenue (Budget)" fill="#86efac" radius={[2, 2, 0, 0]} />
            <Bar dataKey="revenue_prior_year" name="Revenue (Prior Year)" fill="#064e3b" radius={[2, 2, 0, 0]} />
            <Bar dataKey="expenses_actual" name="Expenses (Actual)" fill="#ef4444" radius={[2, 2, 0, 0]} />
            <Bar dataKey="expenses_budget" name="Expenses (Budget)" fill="#fca5a5" radius={[2, 2, 0, 0]} />
            <Bar dataKey="expenses_prior_year" name="Expenses (Prior Year)" fill="#7f1d1d" radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>

        {actualMonths < trendData.length && (
          <p className="text-xs text-gray-400 text-center mt-2">
            Months after {getMonthLabel(report.last_actual_month)} show budget forecast values
          </p>
        )}
      </div>

      {/* Chart 2: GP% and NP% Trend Lines */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-1">Profit Margin Trends</h3>
        <p className="text-xs text-gray-500 mb-4">Gross Profit % and Net Profit % — FY{report.fiscal_year}</p>

        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={trendData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
            <XAxis
              dataKey="monthLabel"
              tick={{ fontSize: 12 }}
              tickLine={false}
            />
            <YAxis
              tickFormatter={pctFormatter}
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              domain={['auto', 'auto']}
            />
            <Tooltip
              formatter={(value: number, name: string) => [`${value.toFixed(1)}%`, name]}
              contentStyle={{ fontSize: 12, borderRadius: 6, border: '1px solid #E5E7EB' }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line
              type="monotone"
              dataKey="gp_percent"
              name="GP% (Actual)"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
            />
            <Line
              type="monotone"
              dataKey="gp_percent_budget"
              name="GP% (Budget)"
              stroke="#3b82f6"
              strokeWidth={1}
              strokeDasharray="5 5"
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="np_percent"
              name="NP% (Actual)"
              stroke="#f97316"
              strokeWidth={2}
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
            />
            <Line
              type="monotone"
              dataKey="np_percent_budget"
              name="NP% (Budget)"
              stroke="#f97316"
              strokeWidth={1}
              strokeDasharray="5 5"
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
