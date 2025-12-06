'use client'

import React, { useState } from 'react'
import { Target, TrendingUp, DollarSign, Edit2, Check, X, AlertCircle, CheckCircle } from 'lucide-react'
import type { FinancialForecast } from '../types'

interface GoalsPanelProps {
  forecast: FinancialForecast
  currentForecastTotals: {
    revenue: number
    grossProfit: number
    netProfit: number
  }
  onUpdate: (goals: {
    revenue_goal?: number
    gross_profit_goal?: number
    net_profit_goal?: number
  }) => void
  onImportFromAnnualPlan: () => void
}

export default function GoalsPanel({
  forecast,
  currentForecastTotals,
  onUpdate,
  onImportFromAnnualPlan
}: GoalsPanelProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editedGoals, setEditedGoals] = useState({
    revenue: forecast.revenue_goal || 0,
    grossProfit: forecast.gross_profit_goal || 0,
    netProfit: forecast.net_profit_goal || 0
  })

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value)
  }

  const formatPercent = (value: number) => {
    return `${value.toFixed(1)}%`
  }

  const calculateVariance = (goal: number, current: number) => {
    const diff = current - goal
    const pct = goal > 0 ? (diff / goal) * 100 : 0
    return { diff, pct }
  }

  const getVarianceStatus = (variance: number) => {
    if (Math.abs(variance) < 2) return 'on-track'
    if (variance < 0) return 'below'
    return 'above'
  }

  const revenueVariance = forecast.revenue_goal
    ? calculateVariance(forecast.revenue_goal, currentForecastTotals.revenue)
    : null

  const gpVariance = forecast.gross_profit_goal
    ? calculateVariance(forecast.gross_profit_goal, currentForecastTotals.grossProfit)
    : null

  const npVariance = forecast.net_profit_goal
    ? calculateVariance(forecast.net_profit_goal, currentForecastTotals.netProfit)
    : null

  const gpMargin = currentForecastTotals.revenue > 0
    ? (currentForecastTotals.grossProfit / currentForecastTotals.revenue) * 100
    : 0

  const npMargin = currentForecastTotals.revenue > 0
    ? (currentForecastTotals.netProfit / currentForecastTotals.revenue) * 100
    : 0

  const handleSave = () => {
    onUpdate({
      revenue_goal: editedGoals.revenue,
      gross_profit_goal: editedGoals.grossProfit,
      net_profit_goal: editedGoals.netProfit
    })
    setIsEditing(false)
  }

  const handleCancel = () => {
    setEditedGoals({
      revenue: forecast.revenue_goal || 0,
      grossProfit: forecast.gross_profit_goal || 0,
      netProfit: forecast.net_profit_goal || 0
    })
    setIsEditing(false)
  }

  const hasGoals = forecast.revenue_goal || forecast.gross_profit_goal || forecast.net_profit_goal

  return (
    <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-brand-orange-100 rounded-lg flex items-center justify-center">
            <Target className="w-5 h-5 text-brand-orange" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900">FY{forecast.fiscal_year} Financial Goals</h2>
            {forecast.goal_source === 'annual_plan' && forecast.annual_plan_id && (
              <p className="text-sm text-gray-500">Imported from Annual Plan</p>
            )}
            {!hasGoals && (
              <p className="text-sm text-amber-600">No goals set - click to add targets</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {hasGoals && !isEditing && (
            <button
              onClick={() => setIsEditing(true)}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              <Edit2 className="w-4 h-4" />
              Edit Goals
            </button>
          )}

          {isEditing && (
            <>
              <button
                onClick={handleCancel}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                <X className="w-4 h-4" />
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-brand-orange rounded-lg hover:bg-brand-orange-600 transition-colors"
              >
                <Check className="w-4 h-4" />
                Save Goals
              </button>
            </>
          )}

          {!hasGoals && !isEditing && (
            <>
              <button
                onClick={onImportFromAnnualPlan}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-brand-orange bg-brand-orange-50 rounded-lg hover:bg-brand-orange-100 transition-colors"
              >
                <TrendingUp className="w-4 h-4" />
                Import from Annual Plan
              </button>
              <button
                onClick={() => setIsEditing(true)}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-brand-orange rounded-lg hover:bg-brand-orange-600 transition-colors"
              >
                <DollarSign className="w-4 h-4" />
                Set Goals Manually
              </button>
            </>
          )}
        </div>
      </div>

      {/* Goals Grid */}
      <div className="grid grid-cols-3 gap-6">
        {/* Revenue Goal */}
        <div className="border border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <DollarSign className="w-5 h-5 text-green-600" />
            <h3 className="text-sm font-medium text-gray-700">Annual Revenue</h3>
          </div>

          {isEditing ? (
            <input
              type="number"
              value={editedGoals.revenue}
              onChange={(e) => setEditedGoals({ ...editedGoals, revenue: parseFloat(e.target.value) || 0 })}
              className="w-full px-3 py-2 text-2xl font-bold text-gray-900 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-brand-orange-500"
              placeholder="0"
            />
          ) : (
            <>
              <div className="text-2xl font-bold text-gray-900 mb-2">
                {forecast.revenue_goal ? formatCurrency(forecast.revenue_goal) : '—'}
              </div>
              {revenueVariance && (
                <div className="flex items-center gap-2">
                  <div className="text-sm text-gray-600">
                    Current: {formatCurrency(currentForecastTotals.revenue)}
                  </div>
                  {getVarianceStatus(revenueVariance.pct) === 'on-track' && (
                    <CheckCircle className="w-4 h-4 text-green-600" />
                  )}
                  {getVarianceStatus(revenueVariance.pct) === 'below' && (
                    <AlertCircle className="w-4 h-4 text-amber-600" />
                  )}
                </div>
              )}
              {revenueVariance && (
                <div className={`text-xs font-medium mt-1 ${
                  getVarianceStatus(revenueVariance.pct) === 'below'
                    ? 'text-amber-600'
                    : 'text-green-600'
                }`}>
                  {revenueVariance.diff >= 0 ? '+' : ''}{formatCurrency(revenueVariance.diff)}
                  ({revenueVariance.pct >= 0 ? '+' : ''}{formatPercent(revenueVariance.pct)})
                </div>
              )}
            </>
          )}
        </div>

        {/* Gross Profit Goal */}
        <div className="border border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-5 h-5 text-brand-orange" />
            <h3 className="text-sm font-medium text-gray-700">Gross Profit</h3>
          </div>

          {isEditing ? (
            <>
              <input
                type="number"
                value={editedGoals.grossProfit}
                onChange={(e) => setEditedGoals({ ...editedGoals, grossProfit: parseFloat(e.target.value) || 0 })}
                className="w-full px-3 py-2 text-2xl font-bold text-gray-900 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-brand-orange-500 mb-2"
                placeholder="0"
              />
              {editedGoals.revenue > 0 && (
                <div className="text-xs text-gray-500">
                  {formatPercent((editedGoals.grossProfit / editedGoals.revenue) * 100)} margin
                </div>
              )}
            </>
          ) : (
            <>
              <div className="text-2xl font-bold text-gray-900 mb-2">
                {forecast.gross_profit_goal ? formatCurrency(forecast.gross_profit_goal) : '—'}
              </div>
              {forecast.gross_profit_goal && forecast.revenue_goal && (
                <div className="text-xs text-gray-500 mb-1">
                  Target: {formatPercent((forecast.gross_profit_goal / forecast.revenue_goal) * 100)} margin
                </div>
              )}
              {gpVariance && (
                <>
                  <div className="flex items-center gap-2">
                    <div className="text-sm text-gray-600">
                      Current: {formatCurrency(currentForecastTotals.grossProfit)}
                    </div>
                    {getVarianceStatus(gpVariance.pct) === 'on-track' && (
                      <CheckCircle className="w-4 h-4 text-green-600" />
                    )}
                    {getVarianceStatus(gpVariance.pct) === 'below' && (
                      <AlertCircle className="w-4 h-4 text-amber-600" />
                    )}
                  </div>
                  <div className="text-xs text-gray-500">
                    Actual Margin: {formatPercent(gpMargin)}
                  </div>
                  <div className={`text-xs font-medium mt-1 ${
                    getVarianceStatus(gpVariance.pct) === 'below'
                      ? 'text-amber-600'
                      : 'text-green-600'
                  }`}>
                    {gpVariance.diff >= 0 ? '+' : ''}{formatCurrency(gpVariance.diff)}
                    ({gpVariance.pct >= 0 ? '+' : ''}{formatPercent(gpVariance.pct)})
                  </div>
                </>
              )}
            </>
          )}
        </div>

        {/* Net Profit Goal */}
        <div className="border border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <Target className="w-5 h-5 text-brand-navy" />
            <h3 className="text-sm font-medium text-gray-700">Net Profit</h3>
          </div>

          {isEditing ? (
            <>
              <input
                type="number"
                value={editedGoals.netProfit}
                onChange={(e) => setEditedGoals({ ...editedGoals, netProfit: parseFloat(e.target.value) || 0 })}
                className="w-full px-3 py-2 text-2xl font-bold text-gray-900 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-brand-orange-500 mb-2"
                placeholder="0"
              />
              {editedGoals.revenue > 0 && (
                <div className="text-xs text-gray-500">
                  {formatPercent((editedGoals.netProfit / editedGoals.revenue) * 100)} margin
                </div>
              )}
            </>
          ) : (
            <>
              <div className="text-2xl font-bold text-gray-900 mb-2">
                {forecast.net_profit_goal ? formatCurrency(forecast.net_profit_goal) : '—'}
              </div>
              {forecast.net_profit_goal && forecast.revenue_goal && (
                <div className="text-xs text-gray-500 mb-1">
                  Target: {formatPercent((forecast.net_profit_goal / forecast.revenue_goal) * 100)} margin
                </div>
              )}
              {npVariance && (
                <>
                  <div className="flex items-center gap-2">
                    <div className="text-sm text-gray-600">
                      Current: {formatCurrency(currentForecastTotals.netProfit)}
                    </div>
                    {getVarianceStatus(npVariance.pct) === 'on-track' && (
                      <CheckCircle className="w-4 h-4 text-green-600" />
                    )}
                    {getVarianceStatus(npVariance.pct) === 'below' && (
                      <AlertCircle className="w-4 h-4 text-amber-600" />
                    )}
                  </div>
                  <div className="text-xs text-gray-500">
                    Actual Margin: {formatPercent(npMargin)}
                  </div>
                  <div className={`text-xs font-medium mt-1 ${
                    getVarianceStatus(npVariance.pct) === 'below'
                      ? 'text-amber-600'
                      : 'text-green-600'
                  }`}>
                    {npVariance.diff >= 0 ? '+' : ''}{formatCurrency(npVariance.diff)}
                    ({npVariance.pct >= 0 ? '+' : ''}{formatPercent(npVariance.pct)})
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
