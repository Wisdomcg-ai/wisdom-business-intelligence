'use client'

import { useState } from 'react'
import {
  Target, CheckCircle2, Clock, DollarSign, Trash2, Edit2,
  Calendar, User, FileText, ChevronDown, ChevronUp,
  TrendingUp, AlertCircle, PartyPopper
} from 'lucide-react'
import type { StopDoingItem, StopDoingStatus } from '../types'
import { ZONE_OPTIONS, FOCUS_FUNNEL_OPTIONS } from '../types'

interface Step5ActionPlanProps {
  stopDoingItems: StopDoingItem[]
  calculatedHourlyRate: number
  onUpdateItem: (id: string, updates: Partial<StopDoingItem>) => void
  onDeleteItem: (id: string) => void
  onUpdateStatus: (id: string, status: StopDoingStatus) => void
  getTotalMonthlyHoursFreed: () => number
  getTotalMonthlySavings: () => number
  getCompletedCount: () => number
  getInProgressCount: () => number
}

const STATUS_OPTIONS: { value: StopDoingStatus; label: string; color: string; bgColor: string }[] = [
  { value: 'identified', label: 'Identified', color: 'text-gray-600', bgColor: 'bg-gray-100' },
  { value: 'in_progress', label: 'In Progress', color: 'text-amber-600', bgColor: 'bg-amber-100' },
  { value: 'delegated', label: 'Delegated', color: 'text-blue-600', bgColor: 'bg-blue-100' },
  { value: 'automated', label: 'Automated', color: 'text-purple-600', bgColor: 'bg-purple-100' },
  { value: 'eliminated', label: 'Eliminated', color: 'text-red-600', bgColor: 'bg-red-100' },
  { value: 'completed', label: 'Completed', color: 'text-green-600', bgColor: 'bg-green-100' }
]

export default function Step5ActionPlan({
  stopDoingItems,
  calculatedHourlyRate,
  onUpdateItem,
  onDeleteItem,
  onUpdateStatus,
  getTotalMonthlyHoursFreed,
  getTotalMonthlySavings,
  getCompletedCount,
  getInProgressCount
}: Step5ActionPlanProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)

  // Format currency
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value)
  }

  // Get zone style
  const getZoneStyle = (zone: string | null) => {
    return ZONE_OPTIONS.find(z => z.zone === zone) || ZONE_OPTIONS[2]
  }

  // Get status style
  const getStatusStyle = (status: StopDoingStatus) => {
    return STATUS_OPTIONS.find(s => s.value === status) || STATUS_OPTIONS[0]
  }

  // Summary values
  const totalHoursFreed = getTotalMonthlyHoursFreed()
  const totalSavings = getTotalMonthlySavings()
  const completedCount = getCompletedCount()
  const inProgressCount = getInProgressCount()
  const totalItems = stopDoingItems.length

  // Calculate progress percentage
  const progressPercentage = totalItems > 0
    ? Math.round((completedCount / totalItems) * 100)
    : 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Your Stop Doing List</h2>
        <p className="text-gray-600 mt-1">
          Track your progress as you eliminate, automate, or delegate low-value activities.
        </p>
      </div>

      {/* Progress Overview */}
      <div className="bg-gradient-to-r from-teal-600 to-teal-700 rounded-lg p-6 text-white">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          <div className="text-center">
            <div className="flex items-center justify-center gap-2 text-teal-100 text-sm mb-1">
              <Clock className="w-4 h-4" />
              Hours Freed
            </div>
            <p className="text-3xl font-bold">{Math.round(totalHoursFreed * 10) / 10}h</p>
            <p className="text-teal-200 text-xs mt-1">per month</p>
          </div>

          <div className="text-center">
            <div className="flex items-center justify-center gap-2 text-teal-100 text-sm mb-1">
              <DollarSign className="w-4 h-4" />
              Value Created
            </div>
            <p className="text-3xl font-bold">{formatCurrency(totalSavings)}</p>
            <p className="text-teal-200 text-xs mt-1">per month</p>
          </div>

          <div className="text-center">
            <div className="flex items-center justify-center gap-2 text-teal-100 text-sm mb-1">
              <TrendingUp className="w-4 h-4" />
              In Progress
            </div>
            <p className="text-3xl font-bold">{inProgressCount}</p>
            <p className="text-teal-200 text-xs mt-1">items active</p>
          </div>

          <div className="text-center bg-white/10 rounded-lg py-3">
            <div className="flex items-center justify-center gap-2 text-teal-100 text-sm mb-1">
              <CheckCircle2 className="w-4 h-4" />
              Completed
            </div>
            <p className="text-3xl font-bold">{completedCount}/{totalItems}</p>
            <p className="text-teal-200 text-xs mt-1">{progressPercentage}% done</p>
          </div>
        </div>

        {/* Progress Bar */}
        {totalItems > 0 && (
          <div className="mt-4">
            <div className="h-2 bg-teal-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-white transition-all duration-500"
                style={{ width: `${progressPercentage}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Celebration when complete */}
      {totalItems > 0 && completedCount === totalItems && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-start gap-3">
          <PartyPopper className="w-6 h-6 text-green-600 flex-shrink-0" />
          <div>
            <p className="font-medium text-green-900">Congratulations!</p>
            <p className="text-green-700 text-sm mt-1">
              You&apos;ve completed your entire Stop Doing List! You&apos;re now freeing up{' '}
              <strong>{Math.round(totalHoursFreed)} hours</strong> every month for high-value activities.
            </p>
          </div>
        </div>
      )}

      {/* Action Items */}
      <div className="space-y-4">
        <h3 className="font-medium text-gray-900 flex items-center gap-2">
          <Target className="w-5 h-5 text-teal-600" />
          Stop Doing Items ({stopDoingItems.length})
        </h3>

        {stopDoingItems.length === 0 ? (
          <div className="text-center py-12 bg-gray-50 rounded-lg">
            <AlertCircle className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 mb-2">No items in your action plan yet.</p>
            <p className="text-gray-400 text-sm">Go back to Step 4 to select activities to stop doing.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {stopDoingItems.map((item) => {
              const zoneStyle = item.zone ? getZoneStyle(item.zone) : null
              const statusStyle = getStatusStyle(item.status)
              const isExpanded = expandedId === item.id
              const isEditing = editingId === item.id

              return (
                <div
                  key={item.id}
                  className={`bg-white border rounded-lg overflow-hidden transition-all ${
                    item.status === 'completed' ? 'border-green-200 bg-green-50/30' : 'border-gray-200'
                  }`}
                >
                  {/* Main Row */}
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 flex-wrap">
                          <h4 className={`font-medium ${item.status === 'completed' ? 'text-gray-500 line-through' : 'text-gray-900'}`}>
                            {item.item_name}
                          </h4>
                          {zoneStyle && (
                            <span className={`px-2 py-0.5 rounded text-xs ${zoneStyle.bgColor} ${zoneStyle.color} border ${zoneStyle.borderColor}`}>
                              {zoneStyle.label}
                            </span>
                          )}
                          <span className={`px-2 py-0.5 rounded text-xs ${statusStyle.bgColor} ${statusStyle.color}`}>
                            {statusStyle.label}
                          </span>
                        </div>

                        <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                          <span>{Math.round((item.monthly_hours || 0) * 10) / 10}h/month</span>
                          <span>{formatCurrency(item.opportunity_cost_monthly || 0)}/month</span>
                          {item.suggested_decision && (
                            <span className="text-teal-600">→ {item.suggested_decision}</span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setExpandedId(isExpanded ? null : item.id)}
                          className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
                        >
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Expanded Details */}
                  {isExpanded && (
                    <div className="border-t border-gray-200 p-4 bg-gray-50 space-y-4">
                      {/* Status Selection */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
                        <div className="flex flex-wrap gap-2">
                          {STATUS_OPTIONS.map((option) => (
                            <button
                              key={option.value}
                              onClick={() => onUpdateStatus(item.id, option.value)}
                              className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                                item.status === option.value
                                  ? `${option.bgColor} ${option.color} ring-2 ring-offset-1 ring-${option.color.replace('text-', '')}`
                                  : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                              }`}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Delegation Details */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1">
                            <User className="w-4 h-4" />
                            Delegate To
                          </label>
                          <input
                            type="text"
                            value={item.delegate_to || ''}
                            onChange={(e) => onUpdateItem(item.id, { delegate_to: e.target.value })}
                            placeholder="e.g., Virtual Assistant, Team Member"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                          />
                        </div>

                        <div>
                          <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1">
                            <Calendar className="w-4 h-4" />
                            Target Date
                          </label>
                          <input
                            type="date"
                            value={item.target_date || ''}
                            onChange={(e) => onUpdateItem(item.id, { target_date: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                          />
                        </div>
                      </div>

                      {/* Delegation Rate */}
                      <div>
                        <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1">
                          <DollarSign className="w-4 h-4" />
                          Delegation Hourly Rate
                        </label>
                        <div className="flex items-center gap-3">
                          <div className="relative flex-1 max-w-[200px]">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                            <input
                              type="number"
                              value={item.delegation_rate || ''}
                              onChange={(e) => onUpdateItem(item.id, { delegation_rate: parseFloat(e.target.value) || 0 })}
                              placeholder="0"
                              className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                            />
                          </div>
                          <span className="text-sm text-gray-500">/hour</span>
                          {item.delegation_rate && item.delegation_rate < calculatedHourlyRate && (
                            <span className="text-sm text-green-600 flex items-center gap-1">
                              <CheckCircle2 className="w-4 h-4" />
                              Saves {formatCurrency(calculatedHourlyRate - item.delegation_rate)}/hr
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Notes */}
                      <div>
                        <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1">
                          <FileText className="w-4 h-4" />
                          Notes
                        </label>
                        <textarea
                          value={item.notes || ''}
                          onChange={(e) => onUpdateItem(item.id, { notes: e.target.value })}
                          placeholder="Add any notes about this item..."
                          rows={2}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                        />
                      </div>

                      {/* Delete Button */}
                      <div className="flex justify-end pt-2 border-t border-gray-200">
                        <button
                          onClick={() => {
                            if (confirm('Remove this item from your Stop Doing list?')) {
                              onDeleteItem(item.id)
                            }
                          }}
                          className="flex items-center gap-2 px-3 py-1.5 text-red-600 hover:bg-red-50 rounded-lg text-sm transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                          Remove
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Annual Impact Summary */}
      {totalItems > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <h4 className="font-medium text-amber-900 mb-2">Annual Impact</h4>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
            <div>
              <span className="text-amber-700">Time Reclaimed:</span>
              <span className="ml-2 font-bold text-amber-900">{Math.round(totalHoursFreed * 12)} hours/year</span>
            </div>
            <div>
              <span className="text-amber-700">Value Created:</span>
              <span className="ml-2 font-bold text-amber-900">{formatCurrency(totalSavings * 12)}/year</span>
            </div>
            <div>
              <span className="text-amber-700">Working Days Freed:</span>
              <span className="ml-2 font-bold text-amber-900">{Math.round((totalHoursFreed * 12) / 8)} days/year</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
