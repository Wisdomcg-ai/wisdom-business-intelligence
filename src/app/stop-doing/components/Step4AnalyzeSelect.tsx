'use client'

import { useState, useMemo } from 'react'
import { BarChart3, CheckCircle, Circle, ArrowUpDown, DollarSign, Clock, AlertTriangle, TrendingUp } from 'lucide-react'
import type { Activity, StopDoingItem, Zone, FocusFunnelOutcome } from '../types'
import {
  ZONE_OPTIONS,
  FOCUS_FUNNEL_OPTIONS,
  calculateMonthlyHours,
  calculateOpportunityCost,
  getSuggestedDecision
} from '../types'

interface Step4AnalyzeSelectProps {
  activities: Activity[]
  stopDoingItems: StopDoingItem[]
  calculatedHourlyRate: number
  onSelectActivity: (activity: Activity) => Promise<void>
  onUpdateActivity: (id: string, updates: Partial<Activity>) => void
}

type SortField = 'zone' | 'hours' | 'cost' | 'name'
type SortDirection = 'asc' | 'desc'

export default function Step4AnalyzeSelect({
  activities,
  stopDoingItems,
  calculatedHourlyRate,
  onSelectActivity,
  onUpdateActivity
}: Step4AnalyzeSelectProps) {
  const [sortField, setSortField] = useState<SortField>('zone')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [filterZone, setFilterZone] = useState<Zone | 'all'>('all')
  const [isSelecting, setIsSelecting] = useState<string | null>(null)

  // Get zone priority (lower = should stop sooner)
  const getZonePriority = (zone: Zone): number => {
    const priorities: Record<Zone, number> = {
      incompetence: 1,
      competence: 2,
      excellence: 3,
      genius: 4
    }
    return priorities[zone]
  }

  // Get zone style
  const getZoneStyle = (zone: Zone) => {
    return ZONE_OPTIONS.find(z => z.zone === zone) || ZONE_OPTIONS[2]
  }

  // Check if activity is already selected
  const isActivitySelected = (activityId: string) => {
    return stopDoingItems.some(item => item.activity_id === activityId)
  }

  // Calculate activity metrics
  const getActivityMetrics = (activity: Activity) => {
    const monthlyHours = calculateMonthlyHours(activity.duration_minutes, activity.frequency)
    const opportunityCost = calculateOpportunityCost(monthlyHours, calculatedHourlyRate)
    const annualCost = opportunityCost * 12
    const suggestedDecision = getSuggestedDecision(activity.zone, activity.focus_funnel_outcome)

    return {
      monthlyHours,
      opportunityCost,
      annualCost,
      suggestedDecision
    }
  }

  // Sort and filter activities
  const sortedActivities = useMemo(() => {
    let filtered = [...activities]

    // Apply filter
    if (filterZone !== 'all') {
      filtered = filtered.filter(a => a.zone === filterZone)
    }

    // Apply sort
    filtered.sort((a, b) => {
      let comparison = 0

      switch (sortField) {
        case 'zone':
          comparison = getZonePriority(a.zone) - getZonePriority(b.zone)
          break
        case 'hours':
          comparison = calculateMonthlyHours(a.duration_minutes, a.frequency) -
                       calculateMonthlyHours(b.duration_minutes, b.frequency)
          break
        case 'cost':
          comparison = calculateOpportunityCost(
            calculateMonthlyHours(a.duration_minutes, a.frequency),
            calculatedHourlyRate
          ) - calculateOpportunityCost(
            calculateMonthlyHours(b.duration_minutes, b.frequency),
            calculatedHourlyRate
          )
          break
        case 'name':
          comparison = a.activity_name.localeCompare(b.activity_name)
          break
      }

      return sortDirection === 'asc' ? comparison : -comparison
    })

    return filtered
  }, [activities, filterZone, sortField, sortDirection, calculatedHourlyRate])

  // Toggle sort
  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  // Handle selection
  const handleSelect = async (activity: Activity) => {
    if (isSelecting) return

    setIsSelecting(activity.id)
    try {
      await onSelectActivity(activity)
    } finally {
      setIsSelecting(null)
    }
  }

  // Summary calculations
  const summary = useMemo(() => {
    const totalMonthlyHours = activities.reduce((sum, a) =>
      sum + calculateMonthlyHours(a.duration_minutes, a.frequency), 0
    )

    const stopDoingHours = activities
      .filter(a => a.zone === 'incompetence' || a.zone === 'competence')
      .reduce((sum, a) => sum + calculateMonthlyHours(a.duration_minutes, a.frequency), 0)

    const stopDoingCost = calculateOpportunityCost(stopDoingHours, calculatedHourlyRate)

    const selectedCount = stopDoingItems.length

    return {
      totalMonthlyHours: Math.round(totalMonthlyHours * 10) / 10,
      stopDoingHours: Math.round(stopDoingHours * 10) / 10,
      stopDoingCost: Math.round(stopDoingCost),
      selectedCount
    }
  }, [activities, stopDoingItems, calculatedHourlyRate])

  // Format currency
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Analyze & Select</h2>
        <p className="text-gray-600 mt-1">
          Review your activities and select which ones to stop doing. Focus on low-value tasks that drain your energy.
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
            <Clock className="w-4 h-4" />
            Total Monthly Hours
          </div>
          <p className="text-2xl font-bold text-gray-900">{summary.totalMonthlyHours}h</p>
        </div>

        <div className="bg-red-50 rounded-lg border border-red-200 p-4">
          <div className="flex items-center gap-2 text-red-600 text-sm mb-1">
            <AlertTriangle className="w-4 h-4" />
            Hours to Reclaim
          </div>
          <p className="text-2xl font-bold text-red-700">{summary.stopDoingHours}h</p>
          <p className="text-xs text-red-600 mt-1">In low-value zones</p>
        </div>

        <div className="bg-amber-50 rounded-lg border border-amber-200 p-4">
          <div className="flex items-center gap-2 text-amber-600 text-sm mb-1">
            <DollarSign className="w-4 h-4" />
            Potential Savings
          </div>
          <p className="text-2xl font-bold text-amber-700">{formatCurrency(summary.stopDoingCost)}/mo</p>
          <p className="text-xs text-amber-600 mt-1">{formatCurrency(summary.stopDoingCost * 12)}/year</p>
        </div>

        <div className="bg-brand-orange-50 rounded-lg border border-brand-orange-200 p-4">
          <div className="flex items-center gap-2 text-brand-orange text-sm mb-1">
            <CheckCircle className="w-4 h-4" />
            Selected Items
          </div>
          <p className="text-2xl font-bold text-brand-orange-700">{summary.selectedCount}</p>
          <p className="text-xs text-brand-orange mt-1">Ready for action plan</p>
        </div>
      </div>

      {/* Filters & Sort */}
      <div className="flex flex-wrap items-center gap-4 bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-700">Filter by Zone:</span>
          <select
            value={filterZone}
            onChange={(e) => setFilterZone(e.target.value as Zone | 'all')}
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-orange"
          >
            <option value="all">All Zones</option>
            {ZONE_OPTIONS.map((opt) => (
              <option key={opt.zone} value={opt.zone}>{opt.label}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-700">Sort by:</span>
          <div className="flex gap-1">
            {[
              { field: 'zone' as SortField, label: 'Zone' },
              { field: 'hours' as SortField, label: 'Hours' },
              { field: 'cost' as SortField, label: 'Cost' },
              { field: 'name' as SortField, label: 'Name' }
            ].map(({ field, label }) => (
              <button
                key={field}
                onClick={() => toggleSort(field)}
                className={`px-3 py-1.5 text-sm rounded-lg flex items-center gap-1 transition-colors ${
                  sortField === field
                    ? 'bg-brand-orange text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {label}
                {sortField === field && (
                  <ArrowUpDown className="w-3 h-3" />
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Activity List */}
      <div className="space-y-3">
        {sortedActivities.length === 0 ? (
          <div className="text-center py-12 bg-gray-50 rounded-lg">
            <p className="text-gray-500">
              {activities.length === 0
                ? 'No activities yet. Go back to Step 3 to add activities.'
                : 'No activities match the current filter.'
              }
            </p>
          </div>
        ) : (
          sortedActivities.map((activity) => {
            const metrics = getActivityMetrics(activity)
            const zoneStyle = getZoneStyle(activity.zone)
            const isSelected = isActivitySelected(activity.id)
            const isLoading = isSelecting === activity.id

            return (
              <div
                key={activity.id}
                className={`bg-white border-2 rounded-lg p-4 transition-all ${
                  isSelected
                    ? 'border-brand-orange-500 bg-brand-orange-50/30'
                    : `${zoneStyle.borderColor} hover:shadow-md`
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  {/* Left: Activity Info */}
                  <div className="flex-1">
                    <div className="flex items-center gap-3 flex-wrap">
                      <h3 className="font-medium text-gray-900">{activity.activity_name}</h3>
                      <span className={`px-2 py-0.5 rounded text-xs ${zoneStyle.bgColor} ${zoneStyle.color} border ${zoneStyle.borderColor}`}>
                        <span className="font-bold">{activity.zone.charAt(0).toUpperCase() + activity.zone.slice(1)}</span>
                        <span className="opacity-75"> · {zoneStyle.label}</span>
                      </span>
                      {activity.focus_funnel_outcome && (
                        <span className="px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-600 flex items-center gap-1">
                          {FOCUS_FUNNEL_OPTIONS.find(f => f.value === activity.focus_funnel_outcome)?.icon}
                          {FOCUS_FUNNEL_OPTIONS.find(f => f.value === activity.focus_funnel_outcome)?.label}
                        </span>
                      )}
                    </div>

                    {/* Metrics Row */}
                    <div className="flex items-center gap-6 mt-3 text-sm">
                      <div>
                        <span className="text-gray-500">Monthly Hours:</span>
                        <span className="ml-1 font-medium text-gray-900">{Math.round(metrics.monthlyHours * 10) / 10}h</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Opportunity Cost:</span>
                        <span className="ml-1 font-medium text-amber-600">{formatCurrency(metrics.opportunityCost)}/mo</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Annual Impact:</span>
                        <span className="ml-1 font-medium text-red-600">{formatCurrency(metrics.annualCost)}/yr</span>
                      </div>
                    </div>

                    {/* Suggestion */}
                    {metrics.suggestedDecision && (
                      <div className="mt-2 flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-brand-orange" />
                        <span className="text-sm text-brand-orange-700">
                          Suggested: <strong>{metrics.suggestedDecision}</strong>
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Right: Selection */}
                  <div className="flex items-center">
                    {isSelected ? (
                      <div className="flex items-center gap-2 text-brand-orange">
                        <CheckCircle className="w-6 h-6" />
                        <span className="text-sm font-medium">Selected</span>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleSelect(activity)}
                        disabled={isLoading || activity.zone === 'genius'}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                          activity.zone === 'genius'
                            ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                            : 'bg-brand-orange text-white hover:bg-brand-orange-600'
                        }`}
                        title={activity.zone === 'genius' ? 'Keep doing Genius zone activities!' : 'Add to Stop Doing list'}
                      >
                        {isLoading ? (
                          <>
                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            Adding...
                          </>
                        ) : (
                          <>
                            <Circle className="w-4 h-4" />
                            Add to List
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Zone Guide */}
      <div className="bg-gray-50 rounded-lg p-4">
        <h4 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
          <BarChart3 className="w-4 h-4" />
          Priority Guide
        </h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {ZONE_OPTIONS.map((option, index) => (
            <div key={option.zone} className={`p-3 rounded-lg ${option.bgColor} border ${option.borderColor}`}>
              <div className="flex items-center gap-2">
                <span className={`font-medium text-sm ${option.color}`}>
                  {index + 1}. {option.label}
                </span>
              </div>
              <p className="text-xs text-gray-600 mt-1">{option.description}</p>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-500 mt-3 text-center">
          Start with #1 (Incompetence) and work your way up. Keep your Genius zone activities!
        </p>
      </div>
    </div>
  )
}
