// /app/goals/components/ProfitCalculatorModal.tsx
'use client'

import { useState } from 'react'
import { Calculator, X, TrendingUp } from 'lucide-react'
import { FinancialData, CoreMetricsData } from '../types'

interface ProfitCalculatorModalProps {
  isOpen: boolean
  onClose: () => void
  industry: string
  onApply: (financialData: FinancialData, coreMetrics: CoreMetricsData) => void
}

// Industry benchmarks - Based on ATO Small Business Benchmarks 2022-23 & Industry Data
// Source: Australian Taxation Office + Master Builders Australia + Industry Reports
const INDUSTRY_BENCHMARKS: Record<string, { grossMargin: number; netMargin: number; name: string }> = {
  'building_construction': { grossMargin: 35, netMargin: 6, name: 'Building & Construction' },
  'allied_health': { grossMargin: 80, netMargin: 28, name: 'Allied Health' },
  'professional_services': { grossMargin: 70, netMargin: 20, name: 'Professional Services' },
  'retail': { grossMargin: 35, netMargin: 8, name: 'Retail' },
  'hospitality_tourism': { grossMargin: 62, netMargin: 12, name: 'Hospitality & Tourism' },
  'manufacturing': { grossMargin: 30, netMargin: 8, name: 'Manufacturing' },
  'technology': { grossMargin: 75, netMargin: 22, name: 'Technology/SaaS' },
  'trades': { grossMargin: 40, netMargin: 12, name: 'Trades & Services' }
}

export function ProfitCalculatorModal({ isOpen, onClose, industry, onApply }: ProfitCalculatorModalProps) {
  const benchmark = INDUSTRY_BENCHMARKS[industry] || INDUSTRY_BENCHMARKS['building_construction']

  const [currentRevenue, setCurrentRevenue] = useState(500000)
  const [grossMargin, setGrossMargin] = useState(benchmark.grossMargin)
  const [netMargin, setNetMargin] = useState(benchmark.netMargin)
  const [growthRate, setGrowthRate] = useState(50) // % growth per year

  if (!isOpen) return null

  // Calculate projections
  const year1Revenue = Math.round(currentRevenue * (1 + growthRate / 100))
  const year2Revenue = Math.round(year1Revenue * (1 + growthRate / 100))
  const year3Revenue = Math.round(year2Revenue * (1 + growthRate / 100))

  const currentGrossProfit = Math.round(currentRevenue * (grossMargin / 100))
  const year1GrossProfit = Math.round(year1Revenue * (grossMargin / 100))
  const year2GrossProfit = Math.round(year2Revenue * (grossMargin / 100))
  const year3GrossProfit = Math.round(year3Revenue * (grossMargin / 100))

  const currentNetProfit = Math.round(currentRevenue * (netMargin / 100))
  const year1NetProfit = Math.round(year1Revenue * (netMargin / 100))
  const year2NetProfit = Math.round(year2Revenue * (netMargin / 100))
  const year3NetProfit = Math.round(year3Revenue * (netMargin / 100))

  const handleApply = () => {
    const financialData: FinancialData = {
      revenue: {
        current: currentRevenue,
        year1: year1Revenue,
        year2: year2Revenue,
        year3: year3Revenue
      },
      grossProfit: {
        current: currentGrossProfit,
        year1: year1GrossProfit,
        year2: year2GrossProfit,
        year3: year3GrossProfit
      },
      grossMargin: {
        current: grossMargin,
        year1: grossMargin,
        year2: grossMargin,
        year3: grossMargin
      },
      netProfit: {
        current: currentNetProfit,
        year1: year1NetProfit,
        year2: year2NetProfit,
        year3: year3NetProfit
      },
      netMargin: {
        current: netMargin,
        year1: netMargin,
        year2: netMargin,
        year3: netMargin
      },
      customers: {
        current: 0,
        year1: 0,
        year2: 0,
        year3: 0
      },
      employees: {
        current: 0,
        year1: 0,
        year2: 0,
        year3: 0
      }
    }

    // Basic core metrics estimation
    const coreMetrics: CoreMetricsData = {
      leadsPerMonth: {
        current: 0,
        year1: 0,
        year2: 0,
        year3: 0
      },
      conversionRate: {
        current: 0,
        year1: 0,
        year2: 0,
        year3: 0
      },
      avgTransactionValue: {
        current: 0,
        year1: 0,
        year2: 0,
        year3: 0
      },
      teamHeadcount: {
        current: 0,
        year1: 0,
        year2: 0,
        year3: 0
      },
      ownerHoursPerWeek: {
        current: 50,
        year1: 40,
        year2: 30,
        year3: 20
      }
    }

    onApply(financialData, coreMetrics)
    onClose()
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: 'AUD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value)
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-teal-100 rounded-lg">
              <Calculator className="w-6 h-6 text-teal-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Quick Start Calculator</h2>
              <p className="text-sm text-gray-600">Set your targets in 60 seconds</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Industry Benchmark Info */}
          <div className="bg-teal-50 border border-teal-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <TrendingUp className="w-5 h-5 text-teal-600 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-semibold text-teal-900 mb-2">Industry: {benchmark.name}</h3>
                <div className="grid grid-cols-2 gap-4 text-sm mb-2">
                  <div>
                    <span className="text-teal-700">Typical Gross Margin:</span>
                    <span className="ml-2 font-semibold text-teal-900">{benchmark.grossMargin}%</span>
                  </div>
                  <div>
                    <span className="text-teal-700">Typical Net Margin:</span>
                    <span className="ml-2 font-semibold text-teal-900">{benchmark.netMargin}%</span>
                  </div>
                </div>
                <p className="text-xs text-teal-600 italic">
                  Based on ATO Small Business Benchmarks 2022-23 & Australian industry data
                </p>
              </div>
            </div>
          </div>

          {/* Input Section */}
          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Current Annual Revenue
              </label>
              <input
                type="number"
                value={currentRevenue}
                onChange={(e) => setCurrentRevenue(Number(e.target.value))}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                placeholder="500000"
              />
              <p className="text-xs text-gray-500 mt-1">Your current yearly revenue</p>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Annual Growth Rate (%)
              </label>
              <input
                type="number"
                value={growthRate}
                onChange={(e) => setGrowthRate(Number(e.target.value))}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                placeholder="50"
              />
              <p className="text-xs text-gray-500 mt-1">Expected growth per year</p>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Target Gross Margin (%)
              </label>
              <input
                type="number"
                value={grossMargin}
                onChange={(e) => setGrossMargin(Number(e.target.value))}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                placeholder="25"
              />
              <p className="text-xs text-gray-500 mt-1">Benchmark: {benchmark.grossMargin}%</p>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Target Net Margin (%)
              </label>
              <input
                type="number"
                value={netMargin}
                onChange={(e) => setNetMargin(Number(e.target.value))}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                placeholder="8"
              />
              <p className="text-xs text-gray-500 mt-1">Benchmark: {benchmark.netMargin}%</p>
            </div>
          </div>

          {/* Projections Table */}
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="bg-gray-50 border-b px-4 py-3">
              <h3 className="font-semibold text-gray-900">3-Year Projections</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left px-4 py-3 text-sm font-semibold text-gray-700">Metric</th>
                    <th className="text-right px-4 py-3 text-sm font-semibold text-gray-700">Current</th>
                    <th className="text-right px-4 py-3 text-sm font-semibold text-gray-700">Year 1</th>
                    <th className="text-right px-4 py-3 text-sm font-semibold text-gray-700">Year 2</th>
                    <th className="text-right px-4 py-3 text-sm font-semibold text-gray-700">Year 3</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  <tr className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">Revenue</td>
                    <td className="px-4 py-3 text-sm text-right text-gray-700">{formatCurrency(currentRevenue)}</td>
                    <td className="px-4 py-3 text-sm text-right text-gray-700">{formatCurrency(year1Revenue)}</td>
                    <td className="px-4 py-3 text-sm text-right text-gray-700">{formatCurrency(year2Revenue)}</td>
                    <td className="px-4 py-3 text-sm text-right text-gray-700">{formatCurrency(year3Revenue)}</td>
                  </tr>
                  <tr className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">Gross Profit ({grossMargin}%)</td>
                    <td className="px-4 py-3 text-sm text-right text-gray-700">{formatCurrency(currentGrossProfit)}</td>
                    <td className="px-4 py-3 text-sm text-right text-gray-700">{formatCurrency(year1GrossProfit)}</td>
                    <td className="px-4 py-3 text-sm text-right text-gray-700">{formatCurrency(year2GrossProfit)}</td>
                    <td className="px-4 py-3 text-sm text-right text-gray-700">{formatCurrency(year3GrossProfit)}</td>
                  </tr>
                  <tr className="hover:bg-gray-50 bg-green-50">
                    <td className="px-4 py-3 text-sm font-semibold text-gray-900">Net Profit ({netMargin}%)</td>
                    <td className="px-4 py-3 text-sm text-right font-semibold text-green-700">{formatCurrency(currentNetProfit)}</td>
                    <td className="px-4 py-3 text-sm text-right font-semibold text-green-700">{formatCurrency(year1NetProfit)}</td>
                    <td className="px-4 py-3 text-sm text-right font-semibold text-green-700">{formatCurrency(year2NetProfit)}</td>
                    <td className="px-4 py-3 text-sm text-right font-semibold text-green-700">{formatCurrency(year3NetProfit)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Info Box */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <p className="text-sm text-yellow-900">
              <span className="font-semibold">Note:</span> These projections will pre-fill your Financial Goals.
              You can adjust any values manually after applying.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-gray-50 border-t px-6 py-4 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 hover:bg-gray-200 rounded-lg transition-colors font-medium"
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            className="px-6 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors font-medium flex items-center gap-2"
          >
            <Calculator className="w-4 h-4" />
            Apply to Goals
          </button>
        </div>
      </div>
    </div>
  )
}
