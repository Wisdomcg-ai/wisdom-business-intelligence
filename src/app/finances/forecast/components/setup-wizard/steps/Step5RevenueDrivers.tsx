'use client'

import React, { useState, useMemo, useEffect } from 'react'
import {
  Target,
  TrendingUp,
  Sparkles,
  ArrowRight,
  Calculator,
  Info,
  Users,
  Percent,
  ShoppingCart,
  RefreshCw,
  DollarSign,
  Lightbulb
} from 'lucide-react'
import type { SetupWizardData, FiveWaysData } from '../types'
import { getIndustryConfig, getAllIndustries } from '../industry-configs'

interface Step5Props {
  data: SetupWizardData
  onUpdate: (updates: Partial<SetupWizardData>) => void
  fiscalYear: number
  businessIndustry?: string
}

export default function Step5RevenueDrivers({
  data,
  onUpdate,
  fiscalYear,
  businessIndustry
}: Step5Props) {
  const [selectedIndustry, setSelectedIndustry] = useState(
    data.industryId || businessIndustry || 'other'
  )

  const industryConfig = useMemo(() => {
    return getIndustryConfig(selectedIndustry)
  }, [selectedIndustry])

  const industries = useMemo(() => getAllIndustries(), [])

  // Initialize 5 Ways data
  const [fiveWays, setFiveWays] = useState<FiveWaysData>(() => {
    if (data.fiveWaysData) return data.fiveWaysData

    // Default values based on goals and industry benchmarks
    const estimatedCustomers = data.priorYearAnalysis
      ? Math.round(data.priorYearAnalysis.totalRevenue / (industryConfig.benchmarks.avgTransactionsPerCustomer * 5000))
      : 100

    return {
      leads: { current: estimatedCustomers * 4, target: estimatedCustomers * 5, change: 0 },
      conversionRate: { current: industryConfig.benchmarks.avgConversionRate, target: industryConfig.benchmarks.avgConversionRate + 5, change: 0 },
      transactions: { current: industryConfig.benchmarks.avgTransactionsPerCustomer, target: industryConfig.benchmarks.avgTransactionsPerCustomer * 1.1, change: 0 },
      avgSaleValue: { current: 5000, target: 5500, change: 0 },
      margin: { current: industryConfig.benchmarks.avgMargin, target: industryConfig.benchmarks.avgMargin + 2, change: 0 },
      calculatedRevenue: 0,
      calculatedGrossProfit: 0,
      industryLabels: industryConfig.fiveWaysLabels
    }
  })

  // Calculate revenue from 5 Ways formula
  const calculations = useMemo(() => {
    const customers = (fiveWays.leads.target * fiveWays.conversionRate.target) / 100
    const revenue = customers * fiveWays.transactions.target * fiveWays.avgSaleValue.target
    const grossProfit = revenue * (fiveWays.margin.target / 100)

    const currentCustomers = (fiveWays.leads.current * fiveWays.conversionRate.current) / 100
    const currentRevenue = currentCustomers * fiveWays.transactions.current * fiveWays.avgSaleValue.current
    const currentGrossProfit = currentRevenue * (fiveWays.margin.current / 100)

    return {
      targetCustomers: customers,
      targetRevenue: revenue,
      targetGrossProfit: grossProfit,
      currentCustomers,
      currentRevenue,
      currentGrossProfit,
      revenueGap: data.revenueGoal - revenue,
      profitGap: data.grossProfitGoal - grossProfit
    }
  }, [fiveWays, data.revenueGoal, data.grossProfitGoal])

  // Update parent when data changes
  useEffect(() => {
    const updatedFiveWays = {
      ...fiveWays,
      calculatedRevenue: calculations.targetRevenue,
      calculatedGrossProfit: calculations.targetGrossProfit
    }
    onUpdate({
      fiveWaysData: updatedFiveWays,
      industryId: selectedIndustry
    })
  }, [fiveWays, calculations, selectedIndustry, onUpdate])

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: 'AUD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value)
  }

  const formatNumber = (value: number, decimals = 0) => {
    return new Intl.NumberFormat('en-AU', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    }).format(value)
  }

  const handleMetricChange = (
    metric: 'leads' | 'conversionRate' | 'transactions' | 'avgSaleValue' | 'margin',
    field: 'current' | 'target',
    value: number
  ) => {
    setFiveWays(prev => ({
      ...prev,
      [metric]: {
        ...prev[metric],
        [field]: value,
        change: field === 'target'
          ? ((value - prev[metric].current) / prev[metric].current) * 100
          : ((prev[metric].target - value) / value) * 100
      }
    }))
  }

  const isOnTrack = Math.abs(calculations.revenueGap) < data.revenueGoal * 0.05 // Within 5%

  return (
    <div className="space-y-6">
      {/* Teaching Banner */}
      <div className="bg-gradient-to-r from-teal-600 to-teal-700 rounded-lg p-5 text-white">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center flex-shrink-0">
            <Target className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="font-bold text-lg mb-1">Step 5: Understand Your Revenue Drivers</h3>
            <p className="text-teal-100 text-sm">
              Revenue doesn't just "happen". It's the result of 5 key drivers working together.
              Let's see what it takes to hit your goal.
            </p>
          </div>
        </div>
      </div>

      {/* Why This Matters */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <Sparkles className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
          <div>
            <h4 className="font-semibold text-amber-900 mb-1">The 5 Ways Formula</h4>
            <p className="text-sm text-amber-800">
              <strong>Revenue = Leads × Conversion Rate × Transactions × Average Sale Value</strong>
              <br />
              <strong>Gross Profit = Revenue × Margin</strong>
              <br /><br />
              A 10% improvement in each of these 5 drivers doesn't give you 50% more profit –
              it gives you <strong>61% more profit</strong> due to the compounding effect!
            </p>
          </div>
        </div>
      </div>

      {/* Industry Selector */}
      <div className="flex items-center gap-4">
        <label className="text-sm font-medium text-gray-700">
          Industry Template:
        </label>
        <select
          value={selectedIndustry}
          onChange={(e) => {
            setSelectedIndustry(e.target.value)
            const newConfig = getIndustryConfig(e.target.value)
            setFiveWays(prev => ({
              ...prev,
              conversionRate: {
                ...prev.conversionRate,
                current: newConfig.benchmarks.avgConversionRate,
                target: newConfig.benchmarks.avgConversionRate + 5
              },
              transactions: {
                ...prev.transactions,
                current: newConfig.benchmarks.avgTransactionsPerCustomer,
                target: newConfig.benchmarks.avgTransactionsPerCustomer * 1.1
              },
              margin: {
                ...prev.margin,
                current: newConfig.benchmarks.avgMargin,
                target: newConfig.benchmarks.avgMargin + 2
              },
              industryLabels: newConfig.fiveWaysLabels
            }))
          }}
          className="px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
        >
          {industries.map(ind => (
            <option key={ind.id} value={ind.id}>{ind.name}</option>
          ))}
        </select>
      </div>

      {/* 5 Ways Calculator */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 bg-gray-50">
          <div className="grid grid-cols-12 gap-4 text-xs font-medium text-gray-500 uppercase">
            <div className="col-span-4">Driver</div>
            <div className="col-span-3 text-center">Current</div>
            <div className="col-span-3 text-center">Target</div>
            <div className="col-span-2 text-center">Change</div>
          </div>
        </div>

        <div className="divide-y divide-gray-100">
          {/* Leads */}
          <div className="px-5 py-4 grid grid-cols-12 gap-4 items-center">
            <div className="col-span-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                  <Users className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <div className="font-medium text-gray-900">
                    {industryConfig.fiveWaysLabels.leads}
                  </div>
                  <div className="text-xs text-gray-500">
                    {industryConfig.fiveWaysLabels.leadsDescription}
                  </div>
                </div>
              </div>
            </div>
            <div className="col-span-3">
              <input
                type="number"
                value={fiveWays.leads.current}
                onChange={(e) => handleMetricChange('leads', 'current', parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 text-center border border-gray-200 rounded-lg focus:ring-2 focus:ring-teal-500"
              />
            </div>
            <div className="col-span-3">
              <input
                type="number"
                value={fiveWays.leads.target}
                onChange={(e) => handleMetricChange('leads', 'target', parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 text-center border border-teal-200 bg-teal-50 rounded-lg focus:ring-2 focus:ring-teal-500 font-semibold"
              />
            </div>
            <div className="col-span-2 text-center">
              <span className={`text-sm font-medium ${fiveWays.leads.change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {fiveWays.leads.change >= 0 ? '+' : ''}{fiveWays.leads.change.toFixed(0)}%
              </span>
            </div>
          </div>

          {/* Conversion Rate */}
          <div className="px-5 py-4 grid grid-cols-12 gap-4 items-center">
            <div className="col-span-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                  <Percent className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <div className="font-medium text-gray-900">
                    {industryConfig.fiveWaysLabels.conversion}
                  </div>
                  <div className="text-xs text-gray-500">
                    {industryConfig.fiveWaysLabels.conversionDescription}
                  </div>
                </div>
              </div>
            </div>
            <div className="col-span-3">
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  step="0.1"
                  value={fiveWays.conversionRate.current}
                  onChange={(e) => handleMetricChange('conversionRate', 'current', parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 text-center border border-gray-200 rounded-lg focus:ring-2 focus:ring-teal-500"
                />
                <span className="text-gray-500">%</span>
              </div>
            </div>
            <div className="col-span-3">
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  step="0.1"
                  value={fiveWays.conversionRate.target}
                  onChange={(e) => handleMetricChange('conversionRate', 'target', parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 text-center border border-teal-200 bg-teal-50 rounded-lg focus:ring-2 focus:ring-teal-500 font-semibold"
                />
                <span className="text-gray-500">%</span>
              </div>
            </div>
            <div className="col-span-2 text-center">
              <span className={`text-sm font-medium ${fiveWays.conversionRate.change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {fiveWays.conversionRate.change >= 0 ? '+' : ''}{fiveWays.conversionRate.change.toFixed(0)}%
              </span>
            </div>
          </div>

          {/* Transactions */}
          <div className="px-5 py-4 grid grid-cols-12 gap-4 items-center">
            <div className="col-span-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-teal-100 rounded-lg flex items-center justify-center">
                  <RefreshCw className="w-5 h-5 text-teal-600" />
                </div>
                <div>
                  <div className="font-medium text-gray-900">
                    {industryConfig.fiveWaysLabels.transactions}
                  </div>
                  <div className="text-xs text-gray-500">
                    {industryConfig.fiveWaysLabels.transactionsDescription}
                  </div>
                </div>
              </div>
            </div>
            <div className="col-span-3">
              <input
                type="number"
                step="0.1"
                value={fiveWays.transactions.current}
                onChange={(e) => handleMetricChange('transactions', 'current', parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 text-center border border-gray-200 rounded-lg focus:ring-2 focus:ring-teal-500"
              />
            </div>
            <div className="col-span-3">
              <input
                type="number"
                step="0.1"
                value={fiveWays.transactions.target}
                onChange={(e) => handleMetricChange('transactions', 'target', parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 text-center border border-teal-200 bg-teal-50 rounded-lg focus:ring-2 focus:ring-teal-500 font-semibold"
              />
            </div>
            <div className="col-span-2 text-center">
              <span className={`text-sm font-medium ${fiveWays.transactions.change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {fiveWays.transactions.change >= 0 ? '+' : ''}{fiveWays.transactions.change.toFixed(0)}%
              </span>
            </div>
          </div>

          {/* Average Sale Value */}
          <div className="px-5 py-4 grid grid-cols-12 gap-4 items-center">
            <div className="col-span-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
                  <ShoppingCart className="w-5 h-5 text-orange-600" />
                </div>
                <div>
                  <div className="font-medium text-gray-900">
                    {industryConfig.fiveWaysLabels.avgSale}
                  </div>
                  <div className="text-xs text-gray-500">
                    {industryConfig.fiveWaysLabels.avgSaleDescription}
                  </div>
                </div>
              </div>
            </div>
            <div className="col-span-3">
              <div className="flex items-center gap-1">
                <span className="text-gray-500">$</span>
                <input
                  type="number"
                  value={fiveWays.avgSaleValue.current}
                  onChange={(e) => handleMetricChange('avgSaleValue', 'current', parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 text-center border border-gray-200 rounded-lg focus:ring-2 focus:ring-teal-500"
                />
              </div>
            </div>
            <div className="col-span-3">
              <div className="flex items-center gap-1">
                <span className="text-gray-500">$</span>
                <input
                  type="number"
                  value={fiveWays.avgSaleValue.target}
                  onChange={(e) => handleMetricChange('avgSaleValue', 'target', parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 text-center border border-teal-200 bg-teal-50 rounded-lg focus:ring-2 focus:ring-teal-500 font-semibold"
                />
              </div>
            </div>
            <div className="col-span-2 text-center">
              <span className={`text-sm font-medium ${fiveWays.avgSaleValue.change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {fiveWays.avgSaleValue.change >= 0 ? '+' : ''}{fiveWays.avgSaleValue.change.toFixed(0)}%
              </span>
            </div>
          </div>

          {/* Margin */}
          <div className="px-5 py-4 grid grid-cols-12 gap-4 items-center bg-gray-50">
            <div className="col-span-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-teal-100 rounded-lg flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-teal-600" />
                </div>
                <div>
                  <div className="font-medium text-gray-900">
                    {industryConfig.fiveWaysLabels.margin}
                  </div>
                  <div className="text-xs text-gray-500">
                    {industryConfig.fiveWaysLabels.marginDescription}
                  </div>
                </div>
              </div>
            </div>
            <div className="col-span-3">
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  step="0.1"
                  value={fiveWays.margin.current}
                  onChange={(e) => handleMetricChange('margin', 'current', parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 text-center border border-gray-200 rounded-lg focus:ring-2 focus:ring-teal-500"
                />
                <span className="text-gray-500">%</span>
              </div>
            </div>
            <div className="col-span-3">
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  step="0.1"
                  value={fiveWays.margin.target}
                  onChange={(e) => handleMetricChange('margin', 'target', parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 text-center border border-teal-200 bg-teal-50 rounded-lg focus:ring-2 focus:ring-teal-500 font-semibold"
                />
                <span className="text-gray-500">%</span>
              </div>
            </div>
            <div className="col-span-2 text-center">
              <span className={`text-sm font-medium ${fiveWays.margin.change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {fiveWays.margin.change >= 0 ? '+' : ''}{fiveWays.margin.change.toFixed(0)}%
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Results */}
      <div className="grid grid-cols-3 gap-4">
        {/* Calculated Revenue */}
        <div className={`rounded-xl p-5 border-2 ${isOnTrack
            ? 'bg-green-50 border-green-200'
            : calculations.revenueGap > 0
              ? 'bg-red-50 border-red-200'
              : 'bg-blue-50 border-blue-200'
          }`}>
          <div className="flex items-center gap-2 mb-2">
            <Calculator className="w-5 h-5 text-gray-600" />
            <span className="text-sm font-medium text-gray-600">Calculated Revenue</span>
          </div>
          <div className="text-2xl font-bold text-gray-900">
            {formatCurrency(calculations.targetRevenue)}
          </div>
          <div className="text-sm mt-1">
            {isOnTrack ? (
              <span className="text-green-700">✓ On track to hit goal</span>
            ) : calculations.revenueGap > 0 ? (
              <span className="text-red-700">
                {formatCurrency(calculations.revenueGap)} short of goal
              </span>
            ) : (
              <span className="text-blue-700">
                {formatCurrency(Math.abs(calculations.revenueGap))} above goal!
              </span>
            )}
          </div>
        </div>

        {/* Customers */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-2">
            <Users className="w-5 h-5 text-gray-600" />
            <span className="text-sm font-medium text-gray-600">Target Customers</span>
          </div>
          <div className="text-2xl font-bold text-gray-900">
            {formatNumber(calculations.targetCustomers, 0)}
          </div>
          <div className="text-sm text-gray-500 mt-1">
            From {formatNumber(fiveWays.leads.target)} leads × {fiveWays.conversionRate.target}%
          </div>
        </div>

        {/* Gross Profit */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="w-5 h-5 text-gray-600" />
            <span className="text-sm font-medium text-gray-600">Calculated Gross Profit</span>
          </div>
          <div className="text-2xl font-bold text-gray-900">
            {formatCurrency(calculations.targetGrossProfit)}
          </div>
          <div className="text-sm text-gray-500 mt-1">
            {fiveWays.margin.target}% margin
          </div>
        </div>
      </div>

      {/* Coaching Tip */}
      <div className="bg-gradient-to-br from-teal-50 to-teal-100 border border-teal-200 rounded-xl p-5">
        <h4 className="font-semibold text-teal-900 mb-3 flex items-center gap-2">
          <Lightbulb className="w-5 h-5 text-teal-600" />
          Coaching Insight
        </h4>
        <p className="text-sm text-teal-800">
          {isOnTrack ? (
            <>
              Great work! Your 5 Ways targets align with your revenue goal.
              Now the key is to focus on <strong>1-2 drivers at a time</strong> rather than
              trying to improve all 5 at once. Which one would have the biggest impact for you?
            </>
          ) : calculations.revenueGap > 0 ? (
            <>
              You're {formatCurrency(calculations.revenueGap)} short of your revenue goal.
              Try increasing one or more drivers. A <strong>10% improvement in leads</strong> or
              a <strong>5% improvement in conversion</strong> could close the gap.
            </>
          ) : (
            <>
              You're projecting {formatCurrency(Math.abs(calculations.revenueGap))} above your goal!
              This is conservative – you might want to <strong>stretch your targets</strong> or
              use this as buffer to account for variability.
            </>
          )}
        </p>
      </div>

      {/* How We'll Use This */}
      <div className="bg-gray-50 rounded-lg p-4">
        <h4 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
          <ArrowRight className="w-4 h-4 text-teal-600" />
          How We'll Use This Data
        </h4>
        <ul className="space-y-2 text-sm text-gray-700">
          <li className="flex items-start gap-2">
            <span className="text-teal-600 font-bold">•</span>
            <span>
              Your target margin will be used to calculate COGS in the forecast
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-teal-600 font-bold">•</span>
            <span>
              We'll track these drivers as KPIs you can monitor throughout the year
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-teal-600 font-bold">•</span>
            <span>
              The calculated revenue validates your goals are achievable with realistic inputs
            </span>
          </li>
        </ul>
      </div>
    </div>
  )
}
