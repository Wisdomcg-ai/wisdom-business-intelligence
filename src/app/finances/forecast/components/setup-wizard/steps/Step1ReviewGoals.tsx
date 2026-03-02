'use client'

import React, { useState } from 'react'
import {
  Target,
  CheckCircle,
  ExternalLink,
  RefreshCw,
  MessageSquare,
  TrendingUp,
  DollarSign,
  ArrowRight,
  Info,
  Edit3
} from 'lucide-react'
import type { SetupWizardData } from '../types'
import { getIndustryConfig } from '../industry-configs'

interface Step1Props {
  data: SetupWizardData
  onUpdate: (updates: Partial<SetupWizardData>) => void
  onImportFromGoalsWizard: () => Promise<void>
  isImporting: boolean
  fiscalYear: number
}

export default function Step1ReviewGoals({
  data,
  onUpdate,
  onImportFromGoalsWizard,
  isImporting,
  fiscalYear
}: Step1Props) {
  const [isEditing, setIsEditing] = useState(false)
  const [editValues, setEditValues] = useState({
    revenueGoal: data.revenueGoal,
    grossProfitGoal: data.grossProfitGoal,
    netProfitGoal: data.netProfitGoal
  })

  const hasGoals = data.revenueGoal > 0
  const industryConfig = getIndustryConfig(data.industryId)

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: 'AUD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value)
  }

  const grossMargin = data.revenueGoal > 0
    ? ((data.grossProfitGoal / data.revenueGoal) * 100)
    : 0

  const netMargin = data.revenueGoal > 0
    ? ((data.netProfitGoal / data.revenueGoal) * 100)
    : 0

  // Industry benchmark comparisons
  const benchmarkMargin = industryConfig.benchmarks.avgMargin
  const marginDiff = grossMargin - benchmarkMargin
  const isMarginHealthy = marginDiff >= -5 // Within 5% of benchmark is OK

  const handleSaveEdit = () => {
    onUpdate({
      revenueGoal: editValues.revenueGoal,
      grossProfitGoal: editValues.grossProfitGoal,
      netProfitGoal: editValues.netProfitGoal,
      goalsSource: 'manual'
    })
    setIsEditing(false)
  }

  const handleCancelEdit = () => {
    setEditValues({
      revenueGoal: data.revenueGoal,
      grossProfitGoal: data.grossProfitGoal,
      netProfitGoal: data.netProfitGoal
    })
    setIsEditing(false)
  }

  // CFO Insight based on the numbers
  const getCFOInsight = () => {
    if (!hasGoals) return null

    const monthlyRevenue = data.revenueGoal / 12
    const opexBudget = data.grossProfitGoal - data.netProfitGoal

    if (grossMargin >= benchmarkMargin && netMargin >= 10) {
      return {
        type: 'success' as const,
        message: `Your targets look healthy. You're keeping ${grossMargin.toFixed(0)}% of revenue after delivery costs and ${netMargin.toFixed(0)}% as real profit. That's in line with industry norms. Now let's make sure the numbers add up.`
      }
    } else if (grossMargin < benchmarkMargin - 10) {
      return {
        type: 'warning' as const,
        message: `You're only keeping ${grossMargin.toFixed(0)}% of revenue after delivery costs - that's below the typical ${benchmarkMargin}%. This leaves less room for running costs. We should look at your pricing or cost structure.`
      }
    } else if (netMargin < 5) {
      return {
        type: 'warning' as const,
        message: `Keeping only ${netMargin.toFixed(0)}% as profit is tight. Your running costs budget is ${formatCurrency(opexBudget)} - we'll need to be careful with expenses in the next steps.`
      }
    } else {
      return {
        type: 'info' as const,
        message: `With ${formatCurrency(monthlyRevenue)}/month coming in and keeping ${netMargin.toFixed(0)}% as profit, you have ${formatCurrency(opexBudget)} for running costs. Let's see how that breaks down.`
      }
    }
  }

  const cfoInsight = getCFOInsight()

  return (
    <div className="space-y-6">
      {/* CFO Header */}
      <div className="bg-gradient-to-r from-brand-navy to-brand-navy-800 rounded-xl p-6 text-white">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 bg-white/10 rounded-full flex items-center justify-center flex-shrink-0">
            <MessageSquare className="w-6 h-6 text-white" />
          </div>
          <div>
            <h3 className="font-bold text-xl mb-2">Let's Start with Your Plan</h3>
            <p className="text-white/80">
              I've pulled in your targets from your Goals & Targets wizard.
              Let's confirm these are still the numbers you're working towards for FY{fiscalYear}.
            </p>
          </div>
        </div>
      </div>

      {/* Goals Display */}
      {hasGoals ? (
        <div className="space-y-5">
          {/* Source & Actions */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-600" />
              <span className="text-sm font-medium text-gray-700">
                {data.goalsSource === 'goals_wizard' ? (
                  <>Imported from <span className="text-brand-orange">Goals & Targets Wizard</span></>
                ) : (
                  <>Manually entered</>
                )}
              </span>
              {data.goalsLastUpdated && (
                <span className="text-xs text-gray-500">
                  ({new Date(data.goalsLastUpdated).toLocaleDateString()})
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={onImportFromGoalsWizard}
                disabled={isImporting}
                className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${isImporting ? 'animate-spin' : ''}`} />
                Refresh
              </button>
              {!isEditing && (
                <button
                  onClick={() => setIsEditing(true)}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm text-brand-orange hover:bg-brand-orange-50 rounded-lg transition-colors"
                >
                  <Edit3 className="w-4 h-4" />
                  Adjust
                </button>
              )}
            </div>
          </div>

          {/* Goals Cards */}
          {isEditing ? (
            <div className="bg-white border-2 border-brand-orange-200 rounded-xl p-6 space-y-4">
              <h4 className="font-semibold text-gray-900">Adjust Your Targets</h4>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Revenue Goal
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                    <input
                      type="number"
                      value={editValues.revenueGoal || ''}
                      onChange={(e) => setEditValues({ ...editValues, revenueGoal: Number(e.target.value) })}
                      className="w-full pl-8 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-transparent"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    What You Make <span className="text-gray-400 font-normal">(Gross)</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                    <input
                      type="number"
                      value={editValues.grossProfitGoal || ''}
                      onChange={(e) => setEditValues({ ...editValues, grossProfitGoal: Number(e.target.value) })}
                      className="w-full pl-8 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-transparent"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    What You Keep <span className="text-gray-400 font-normal">(Net)</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                    <input
                      type="number"
                      value={editValues.netProfitGoal || ''}
                      onChange={(e) => setEditValues({ ...editValues, netProfitGoal: Number(e.target.value) })}
                      className="w-full pl-8 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-transparent"
                    />
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={handleCancelEdit}
                  className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveEdit}
                  className="px-4 py-2 bg-brand-orange text-white rounded-lg hover:bg-brand-orange-600 transition-colors"
                >
                  Save Changes
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-4">
              {/* Revenue Goal */}
              <div className="bg-white border-2 border-brand-orange-200 rounded-xl p-5 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-20 h-20 bg-brand-orange-50 rounded-bl-full" />
                <div className="relative">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-8 h-8 bg-brand-orange-100 rounded-lg flex items-center justify-center">
                      <DollarSign className="w-4 h-4 text-brand-orange" />
                    </div>
                    <span className="text-sm font-medium text-gray-600">Revenue</span>
                  </div>
                  <div className="text-2xl font-bold text-gray-900 mb-1">
                    {formatCurrency(data.revenueGoal)}
                  </div>
                  <div className="text-xs text-gray-500">
                    {formatCurrency(data.revenueGoal / 12)}/month avg
                  </div>
                </div>
              </div>

              {/* Gross Profit Goal */}
              <div className="bg-white border border-gray-200 rounded-xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                    <TrendingUp className="w-4 h-4 text-green-600" />
                  </div>
                  <div>
                    <span className="text-sm font-medium text-gray-600">What You Make</span>
                    <span className="text-xs text-gray-400 ml-1">(Gross Profit)</span>
                  </div>
                </div>
                <div className="text-2xl font-bold text-gray-900 mb-1">
                  {formatCurrency(data.grossProfitGoal)}
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className={`font-semibold ${isMarginHealthy ? 'text-green-600' : 'text-amber-600'}`}>
                    {grossMargin.toFixed(0)}% of revenue
                  </span>
                  <span className="text-gray-400">|</span>
                  <span className="text-gray-500">
                    Typical: {benchmarkMargin}%
                  </span>
                </div>
              </div>

              {/* Net Profit Goal */}
              <div className="bg-white border border-gray-200 rounded-xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 bg-brand-navy/10 rounded-lg flex items-center justify-center">
                    <Target className="w-4 h-4 text-brand-navy" />
                  </div>
                  <div>
                    <span className="text-sm font-medium text-gray-600">What You Keep</span>
                    <span className="text-xs text-gray-400 ml-1">(Net Profit)</span>
                  </div>
                </div>
                <div className="text-2xl font-bold text-gray-900 mb-1">
                  {formatCurrency(data.netProfitGoal)}
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className={`font-semibold ${netMargin >= 10 ? 'text-green-600' : netMargin >= 5 ? 'text-amber-600' : 'text-red-600'}`}>
                    {netMargin.toFixed(0)}% of revenue
                  </span>
                  <span className="text-gray-400">|</span>
                  <span className="text-gray-500">
                    Healthy: 10%+
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* CFO Insight */}
          {cfoInsight && !isEditing && (
            <div className={`rounded-xl p-5 flex items-start gap-4 ${
              cfoInsight.type === 'success' ? 'bg-green-50 border border-green-200' :
              cfoInsight.type === 'warning' ? 'bg-amber-50 border border-amber-200' :
              'bg-blue-50 border border-blue-200'
            }`}>
              <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                cfoInsight.type === 'success' ? 'bg-green-100' :
                cfoInsight.type === 'warning' ? 'bg-amber-100' :
                'bg-blue-100'
              }`}>
                <MessageSquare className={`w-5 h-5 ${
                  cfoInsight.type === 'success' ? 'text-green-600' :
                  cfoInsight.type === 'warning' ? 'text-amber-600' :
                  'text-blue-600'
                }`} />
              </div>
              <div>
                <h4 className={`font-semibold mb-1 ${
                  cfoInsight.type === 'success' ? 'text-green-900' :
                  cfoInsight.type === 'warning' ? 'text-amber-900' :
                  'text-blue-900'
                }`}>
                  CFO Insight
                </h4>
                <p className={`text-sm ${
                  cfoInsight.type === 'success' ? 'text-green-800' :
                  cfoInsight.type === 'warning' ? 'text-amber-800' :
                  'text-blue-800'
                }`}>
                  {cfoInsight.message}
                </p>
              </div>
            </div>
          )}

          {/* What This Means - Simplified */}
          {!isEditing && (
            <div className="bg-gray-50 rounded-xl p-5">
              <h4 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <ArrowRight className="w-4 h-4 text-brand-orange" />
                What This Means for Your Forecast
              </h4>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div className="bg-white rounded-lg p-4 border border-gray-200">
                  <div className="text-gray-500 mb-1">Delivery costs</div>
                  <div className="text-lg font-bold text-gray-900">
                    {formatCurrency(data.revenueGoal - data.grossProfitGoal)}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    What it costs to do the work
                  </div>
                </div>
                <div className="bg-white rounded-lg p-4 border border-gray-200">
                  <div className="text-gray-500 mb-1">Running costs budget</div>
                  <div className="text-lg font-bold text-gray-900">
                    {formatCurrency(data.grossProfitGoal - data.netProfitGoal)}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    For team, rent, marketing, etc.
                  </div>
                </div>
                <div className="bg-white rounded-lg p-4 border border-gray-200">
                  <div className="text-gray-500 mb-1">Monthly breakeven</div>
                  <div className="text-lg font-bold text-gray-900">
                    {formatCurrency((data.revenueGoal - data.grossProfitGoal + data.grossProfitGoal - data.netProfitGoal) / 12)}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    Minimum monthly costs
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* No Goals State */
        <div className="text-center py-12 bg-white rounded-xl border-2 border-dashed border-gray-300">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Target className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            No Targets Found
          </h3>
          <p className="text-sm text-gray-600 mb-6 max-w-md mx-auto">
            I need your revenue and profit targets to build a forecast.
            You can import them from your Goals wizard or enter them here.
          </p>
          <div className="flex items-center justify-center gap-4">
            <button
              onClick={onImportFromGoalsWizard}
              disabled={isImporting}
              className="flex items-center gap-2 px-5 py-2.5 bg-brand-orange text-white rounded-lg hover:bg-brand-orange-600 transition-colors disabled:opacity-50 font-medium"
            >
              <RefreshCw className={`w-4 h-4 ${isImporting ? 'animate-spin' : ''}`} />
              Import from Goals Wizard
            </button>
            <a
              href="/goals"
              target="_blank"
              className="flex items-center gap-2 px-5 py-2.5 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors font-medium"
            >
              <ExternalLink className="w-4 h-4" />
              Open Goals Wizard
            </a>
          </div>

          {/* Manual Entry Option */}
          <div className="mt-8 pt-6 border-t border-gray-200">
            <button
              onClick={() => {
                setEditValues({ revenueGoal: 0, grossProfitGoal: 0, netProfitGoal: 0 })
                setIsEditing(true)
                onUpdate({ revenueGoal: 1, goalsSource: 'manual' }) // Trigger hasGoals
              }}
              className="text-sm text-gray-500 hover:text-brand-orange transition-colors"
            >
              Or enter targets manually →
            </button>
          </div>
        </div>
      )}

      {/* Industry Context */}
      <div className="bg-brand-navy/5 rounded-xl p-4 flex items-start gap-3">
        <Info className="w-5 h-5 text-brand-navy mt-0.5 flex-shrink-0" />
        <div className="text-sm text-gray-700">
          <span className="font-medium">Industry:</span> {industryConfig.name} —
          Most businesses keep {benchmarkMargin}% after delivery costs, and 10-15% as real profit
        </div>
      </div>
    </div>
  )
}
