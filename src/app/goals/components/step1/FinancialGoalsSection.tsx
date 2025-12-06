'use client'

import { ChevronDown, ChevronUp, DollarSign, Calculator } from 'lucide-react'
import { FinancialData, CoreMetricsData, YearType } from '../../types'
import { formatDollar, parseDollarInput } from '../../utils/formatting'
import { getYearLabel, FINANCIAL_METRICS } from './types'
import { ProfitCalculatorModal } from '../ProfitCalculatorModal'
import { useState } from 'react'

interface FinancialGoalsSectionProps {
  financialData: FinancialData
  updateFinancialValue: (metric: keyof FinancialData, period: 'current' | 'year1' | 'year2' | 'year3', value: number, isPercentage?: boolean) => void
  yearType: YearType
  isCollapsed: boolean
  onToggle: () => void
  industry: string
  coreMetrics: CoreMetricsData
  updateCoreMetric: (metric: keyof CoreMetricsData, period: 'current' | 'year1' | 'year2' | 'year3', value: number) => void
}

export default function FinancialGoalsSection({
  financialData,
  updateFinancialValue,
  yearType,
  isCollapsed,
  onToggle,
  industry,
  coreMetrics,
  updateCoreMetric
}: FinancialGoalsSectionProps) {
  const currentYear = new Date().getFullYear()
  const [showCalculator, setShowCalculator] = useState(false)

  const handleApplyCalculator = (calculatedFinancialData: FinancialData, calculatedCoreMetrics: CoreMetricsData) => {
    Object.entries(calculatedFinancialData).forEach(([metric, values]) => {
      Object.entries(values).forEach(([period, value]) => {
        if (period === 'current' || period === 'year1' || period === 'year2' || period === 'year3') {
          const isPercentage = metric === 'grossMargin' || metric === 'netMargin'
          updateFinancialValue(metric as keyof FinancialData, period, value as number, isPercentage)
        }
      })
    })

    Object.entries(calculatedCoreMetrics).forEach(([metric, values]) => {
      Object.entries(values).forEach(([period, value]) => {
        if (period === 'current' || period === 'year1' || period === 'year2' || period === 'year3') {
          updateCoreMetric(metric as keyof CoreMetricsData, period, value as number)
        }
      })
    })
  }

  return (
    <>
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-5 flex items-center justify-between">
          <div
            onClick={onToggle}
            className="cursor-pointer flex items-center gap-3 flex-1 hover:opacity-80 transition-opacity"
          >
            <div className="p-2 bg-brand-orange-100 rounded-lg">
              <DollarSign className="w-5 h-5 text-brand-orange" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Financial Goals</h3>
              <p className="text-sm text-gray-600">3-year revenue and profit targets</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={(e) => {
                e.stopPropagation()
                setShowCalculator(true)
              }}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-brand-orange to-brand-orange-700 text-white rounded-lg hover:from-brand-orange-700 hover:to-brand-orange-800 transition-all shadow-sm hover:shadow-md font-medium text-sm"
            >
              <Calculator className="w-4 h-4" />
              Quick Start Calculator
            </button>
            <button
              onClick={onToggle}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              {isCollapsed ? (
                <ChevronDown className="w-5 h-5 text-gray-400" />
              ) : (
                <ChevronUp className="w-5 h-5 text-gray-400" />
              )}
            </button>
          </div>
        </div>

        {!isCollapsed && (
          <div className="border-t border-gray-200 p-4 sm:p-6 bg-gradient-to-b from-white to-gray-50">
            {/* Mobile Card View */}
            <div className="sm:hidden space-y-4">
              {FINANCIAL_METRICS.map((metric) => (
                <div key={metric.key} className="bg-white rounded-lg border border-gray-200 p-4">
                  <div className="font-semibold text-gray-900 text-sm mb-3">
                    {metric.label}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {(['current', 'year1', 'year2', 'year3'] as const).map((period, idx) => {
                      const label = getYearLabel(idx, yearType, currentYear)
                      return (
                        <div key={period}>
                          <label className="text-xs text-gray-500 block mb-1">
                            {label.main}
                          </label>
                          <input
                            type="text"
                            value={metric.isPercentage
                              ? `${(financialData as any)[metric.key]?.[period] || 0}%`
                              : formatDollar((financialData as any)[metric.key]?.[period] || 0)
                            }
                            onChange={(e) => {
                              const numValue = metric.isPercentage
                                ? parseFloat(e.target.value.replace('%', '')) || 0
                                : parseDollarInput(e.target.value)
                              updateFinancialValue(metric.key as keyof FinancialData, period, numValue, metric.isPercentage)
                            }}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-center font-medium focus:outline-none focus:ring-2 focus:ring-brand-orange focus:border-transparent"
                            placeholder={metric.isPercentage ? '0%' : '$0'}
                          />
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop Table View */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-gradient-to-r from-brand-orange-50 to-brand-orange-100 border-b-2 border-brand-orange-200">
                    <th className="text-left p-3 text-sm font-bold text-gray-700 sticky left-0 bg-brand-orange-50 z-10 w-[250px]">
                      Financial Metric
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
                  {FINANCIAL_METRICS.map((metric, index) => (
                    <tr
                      key={metric.key}
                      className={`border-b border-gray-200 hover:bg-brand-orange-50 transition-colors ${
                        index % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                      }`}
                    >
                      <td className="p-3 sticky left-0 z-10 bg-inherit">
                        <span className="font-semibold text-gray-900 text-sm">
                          {metric.label}
                        </span>
                      </td>
                      {(['current', 'year1', 'year2', 'year3'] as const).map(period => (
                        <td key={period} className="p-2 text-center">
                          <input
                            type="text"
                            value={metric.isPercentage
                              ? `${(financialData as any)[metric.key]?.[period] || 0}%`
                              : formatDollar((financialData as any)[metric.key]?.[period] || 0)
                            }
                            onChange={(e) => {
                              const numValue = metric.isPercentage
                                ? parseFloat(e.target.value.replace('%', '')) || 0
                                : parseDollarInput(e.target.value)
                              updateFinancialValue(metric.key as keyof FinancialData, period, numValue, metric.isPercentage)
                            }}
                            className="w-full px-2 py-2 border border-gray-300 rounded-md text-sm text-center font-medium focus:outline-none focus:ring-2 focus:ring-brand-orange focus:border-transparent hover:border-brand-orange-300 transition-colors"
                            placeholder={metric.isPercentage ? '0%' : '$0'}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <ProfitCalculatorModal
        isOpen={showCalculator}
        onClose={() => setShowCalculator(false)}
        industry={industry}
        onApply={handleApplyCalculator}
      />
    </>
  )
}
