'use client'

import { ChevronDown, ChevronUp, TrendingUp } from 'lucide-react'
import { FinancialData, CoreMetricsData, YearType } from '../../types'
import { formatDollar, parseDollarInput } from '../../utils/formatting'
import { getYearLabel } from './types'

interface CoreMetricsSectionProps {
  coreMetrics: CoreMetricsData
  updateCoreMetric: (metric: keyof CoreMetricsData, period: 'current' | 'year1' | 'year2' | 'year3', value: number) => void
  financialData: FinancialData
  yearType: YearType
  isCollapsed: boolean
  onToggle: () => void
}

export default function CoreMetricsSection({
  coreMetrics,
  updateCoreMetric,
  financialData,
  yearType,
  isCollapsed,
  onToggle
}: CoreMetricsSectionProps) {
  const currentYear = new Date().getFullYear()

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      <div
        onClick={onToggle}
        className="cursor-pointer p-5 flex items-center justify-between hover:bg-brand-orange-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="p-2 bg-brand-orange-100 rounded-lg">
            <TrendingUp className="w-5 h-5 text-brand-orange" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Core Business Metrics</h3>
            <p className="text-sm text-gray-600">Essential metrics that drive your revenue and growth</p>
          </div>
        </div>
        {isCollapsed ? (
          <ChevronDown className="w-5 h-5 text-gray-400" />
        ) : (
          <ChevronUp className="w-5 h-5 text-gray-400" />
        )}
      </div>

      {!isCollapsed && (
        <div className="border-t border-gray-200 p-6 bg-gradient-to-b from-white to-gray-50">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-gradient-to-r from-brand-orange-50 to-brand-orange-100 border-b-2 border-brand-orange-200">
                  <th className="text-left p-3 text-sm font-bold text-gray-700 sticky left-0 bg-brand-orange-50 z-10 w-[250px]">
                    Core Metric
                  </th>
                  {[0, 1, 2, 3].map(idx => {
                    const label = getYearLabel(idx, yearType, currentYear)
                    return (
                      <th key={idx} className="text-center p-3 text-sm font-bold text-gray-700 w-[150px]">
                        <div>{label.main}</div>
                        {label.subtitle && (
                          <div className="text-xs font-normal text-gray-500 mt-1">
                            {label.subtitle}
                          </div>
                        )}
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {/* Leads Per Month */}
                <MetricRow
                  label="Leads per Month"
                  type="number"
                  values={coreMetrics.leadsPerMonth}
                  onChange={(period, value) => updateCoreMetric('leadsPerMonth', period, value)}
                />

                {/* Conversion Rate */}
                <MetricRow
                  label="Conversion Rate (%)"
                  type="percentage"
                  values={coreMetrics.conversionRate}
                  onChange={(period, value) => updateCoreMetric('conversionRate', period, value)}
                  rowIndex={1}
                />

                {/* Average Transaction Value */}
                <MetricRow
                  label="Avg Transaction Value ($)"
                  type="dollar"
                  values={coreMetrics.avgTransactionValue}
                  onChange={(period, value) => updateCoreMetric('avgTransactionValue', period, value)}
                />

                {/* Team Headcount */}
                <MetricRow
                  label="Team Headcount (FTE)"
                  type="decimal"
                  values={coreMetrics.teamHeadcount}
                  onChange={(period, value) => updateCoreMetric('teamHeadcount', period, value)}
                  rowIndex={1}
                />

                {/* Revenue per Employee (Calculated) */}
                <tr className="border-b border-gray-200 bg-brand-orange-50/50">
                  <td className="p-3 sticky left-0 z-10 bg-brand-orange-50/50">
                    <span className="font-semibold text-gray-900 text-sm flex items-center gap-2">
                      Revenue per Employee ($)
                      <span className="text-xs text-gray-500 font-normal italic">(calculated)</span>
                    </span>
                  </td>
                  {(['current', 'year1', 'year2', 'year3'] as const).map(period => (
                    <td key={period} className="p-2 text-center">
                      <div className="px-2 py-2 bg-gray-100 rounded-md text-sm text-center font-medium text-gray-700 border border-gray-200">
                        {coreMetrics.teamHeadcount[period] > 0
                          ? formatDollar(Math.round(financialData.revenue[period] / coreMetrics.teamHeadcount[period]))
                          : '$0'}
                      </div>
                    </td>
                  ))}
                </tr>

                {/* Owner Hours Per Week */}
                <MetricRow
                  label="Owner Hours per Week"
                  type="number"
                  values={coreMetrics.ownerHoursPerWeek}
                  onChange={(period, value) => updateCoreMetric('ownerHoursPerWeek', period, value)}
                />
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// Reusable metric row component
interface MetricRowProps {
  label: string
  type: 'number' | 'percentage' | 'dollar' | 'decimal'
  values: { current: number; year1: number; year2: number; year3: number }
  onChange: (period: 'current' | 'year1' | 'year2' | 'year3', value: number) => void
  rowIndex?: number
}

function MetricRow({ label, type, values, onChange, rowIndex = 0 }: MetricRowProps) {
  const formatValue = (value: number) => {
    switch (type) {
      case 'percentage':
        return `${value || 0}%`
      case 'dollar':
        return formatDollar(value || 0)
      default:
        return value || 0
    }
  }

  const parseValue = (inputValue: string) => {
    switch (type) {
      case 'percentage':
        return parseFloat(inputValue.replace('%', '')) || 0
      case 'dollar':
        return parseDollarInput(inputValue)
      default:
        return parseFloat(inputValue) || 0
    }
  }

  return (
    <tr className={`border-b border-gray-200 hover:bg-brand-orange-50 transition-colors ${
      rowIndex % 2 === 0 ? 'bg-white' : 'bg-gray-50'
    }`}>
      <td className="p-3 sticky left-0 z-10 bg-inherit">
        <span className="font-semibold text-gray-900 text-sm">{label}</span>
      </td>
      {(['current', 'year1', 'year2', 'year3'] as const).map(period => (
        <td key={period} className="p-2 text-center">
          <input
            type={type === 'decimal' ? 'number' : 'text'}
            step={type === 'decimal' ? '0.1' : undefined}
            value={formatValue(values[period])}
            onChange={(e) => onChange(period, parseValue(e.target.value))}
            className="w-full px-2 py-2 border border-gray-300 rounded-md text-sm text-center font-medium focus:outline-none focus:ring-2 focus:ring-brand-orange focus:border-transparent hover:border-brand-orange-300 transition-colors"
            placeholder={type === 'percentage' ? '0%' : type === 'dollar' ? '$0' : '0'}
          />
        </td>
      ))}
    </tr>
  )
}
