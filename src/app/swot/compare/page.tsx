'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { TrendingUp, TrendingDown, Minus, AlertCircle, GitCompare } from 'lucide-react'
import Link from 'next/link'
import { useBusinessContext } from '@/hooks/useBusinessContext'
import PageHeader from '@/components/ui/PageHeader'

interface SwotAnalysis {
  id: string
  quarter: number
  year: number
  status: string
  swot_items?: SwotItem[]
}

interface SwotItem {
  id: string
  category: 'strength' | 'weakness' | 'opportunity' | 'threat'
  title: string
  description: string | null
  impact_level: number
}

interface ComparisonData {
  category: string
  period1Count: number
  period2Count: number
  change: number
  items1: SwotItem[]
  items2: SwotItem[]
}

export default function SwotComparePage() {
  const router = useRouter()
  const supabase = createClient()
  const { activeBusiness, isLoading: contextLoading } = useBusinessContext()

  const [availableAnalyses, setAvailableAnalyses] = useState<SwotAnalysis[]>([])
  const [selectedPeriod1, setSelectedPeriod1] = useState<string>('')
  const [selectedPeriod2, setSelectedPeriod2] = useState<string>('')
  const [analysis1, setAnalysis1] = useState<SwotAnalysis | null>(null)
  const [analysis2, setAnalysis2] = useState<SwotAnalysis | null>(null)
  const [loading, setLoading] = useState(true)
  const [comparing, setComparing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!contextLoading) {
      loadAvailableAnalyses()
    }
  }, [contextLoading, activeBusiness?.id])

  const loadAvailableAnalyses = async () => {
    try {
      setLoading(true)
      setError(null)

      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError || !user) {
        setError('Please log in to compare analyses')
        return
      }

      // Use activeBusiness ownerId if viewing as coach, otherwise current user
      const targetUserId = activeBusiness?.ownerId || user.id

      const { data, error: fetchError } = await supabase
        .from('swot_analyses')
        .select('id, quarter, year, status')
        .eq('business_id', targetUserId)
        .order('year', { ascending: false })
        .order('quarter', { ascending: false })

      if (fetchError) throw fetchError

      setAvailableAnalyses(data || [])

      // Auto-select most recent two if available
      if (data && data.length >= 2) {
        setSelectedPeriod1(data[0].id)
        setSelectedPeriod2(data[1].id)
      }
    } catch (err) {
      console.error('Error loading analyses:', err)
      setError('Failed to load SWOT analyses')
    } finally {
      setLoading(false)
    }
  }

  const loadComparisonData = async () => {
    if (!selectedPeriod1 || !selectedPeriod2) return

    try {
      setComparing(true)
      setError(null)

      // Load both analyses with items
      const [result1, result2] = await Promise.all([
        supabase
          .from('swot_analyses')
          .select(`
            *,
            swot_items (*)
          `)
          .eq('id', selectedPeriod1)
          .single(),
        supabase
          .from('swot_analyses')
          .select(`
            *,
            swot_items (*)
          `)
          .eq('id', selectedPeriod2)
          .single()
      ])

      if (result1.error) throw result1.error
      if (result2.error) throw result2.error

      setAnalysis1(result1.data)
      setAnalysis2(result2.data)
    } catch (err) {
      console.error('Error loading comparison:', err)
      setError('Failed to load comparison data')
    } finally {
      setComparing(false)
    }
  }

  useEffect(() => {
    if (selectedPeriod1 && selectedPeriod2) {
      loadComparisonData()
    }
  }, [selectedPeriod1, selectedPeriod2])

  const getQuarterLabel = (quarter: number, year: number) => {
    return `Q${quarter} ${year}`
  }

  const calculateComparison = (): ComparisonData[] => {
    if (!analysis1 || !analysis2) return []

    const categories = ['strength', 'weakness', 'opportunity', 'threat']
    const categoryLabels: Record<string, string> = {
      strength: 'Strengths',
      weakness: 'Weaknesses',
      opportunity: 'Opportunities',
      threat: 'Threats'
    }

    return categories.map(category => {
      const items1 = (analysis1.swot_items || []).filter(i => i.category === category)
      const items2 = (analysis2.swot_items || []).filter(i => i.category === category)

      return {
        category: categoryLabels[category],
        period1Count: items1.length,
        period2Count: items2.length,
        change: items2.length - items1.length,
        items1,
        items2
      }
    })
  }

  const getTrendIcon = (change: number) => {
    if (change > 0) return <TrendingUp className="h-5 w-5 text-green-600" />
    if (change < 0) return <TrendingDown className="h-5 w-5 text-red-600" />
    return <Minus className="h-5 w-5 text-gray-400" />
  }

  const getTrendColor = (change: number) => {
    if (change > 0) return 'text-green-600'
    if (change < 0) return 'text-red-600'
    return 'text-gray-600'
  }

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'Strengths':
        return 'bg-green-50 border-green-200'
      case 'Weaknesses':
        return 'bg-red-50 border-red-200'
      case 'Opportunities':
        return 'bg-brand-orange-50 border-brand-orange-200'
      case 'Threats':
        return 'bg-brand-orange-50 border-brand-orange-200'
      default:
        return 'bg-gray-50 border-gray-200'
    }
  }

  const comparisonData = calculateComparison()

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-orange mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <PageHeader
        variant="banner"
        title="Compare SWOT Analyses"
        subtitle="Identify strategic shifts, recurring patterns, and areas of progress"
        icon={GitCompare}
        backLink={{ href: '/swot', label: 'Back to Current SWOT' }}
      />

      {/* Error Alert */}
      {error && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6">
          <div className="bg-red-50 border border-red-200 rounded-md p-4">
            <div className="flex">
              <AlertCircle className="h-5 w-5 text-red-400" />
              <div className="ml-3">
                <p className="text-sm text-red-800">{error}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {availableAnalyses.length < 2 ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
            <AlertCircle className="h-16 w-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">Need More Data</h3>
            <p className="text-gray-600 mb-6">
              You need at least 2 finalized SWOT analyses to compare.
            </p>
            <button
              onClick={() => router.push('/swot')}
              className="inline-flex items-center px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-brand-orange hover:bg-brand-orange-600"
            >
              Go to SWOT Analysis
            </button>
          </div>
        ) : (
          <>
            {/* Period Selectors */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Period 1 (Earlier)
                  </label>
                  <select
                    value={selectedPeriod1}
                    onChange={(e) => setSelectedPeriod1(e.target.value)}
                    className="block w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-orange"
                  >
                    <option value="">Select a period</option>
                    {availableAnalyses.map((analysis) => (
                      <option key={analysis.id} value={analysis.id}>
                        {getQuarterLabel(analysis.quarter, analysis.year)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Period 2 (Later)
                  </label>
                  <select
                    value={selectedPeriod2}
                    onChange={(e) => setSelectedPeriod2(e.target.value)}
                    className="block w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-orange"
                  >
                    <option value="">Select a period</option>
                    {availableAnalyses.map((analysis) => (
                      <option key={analysis.id} value={analysis.id}>
                        {getQuarterLabel(analysis.quarter, analysis.year)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Comparison Results */}
            {comparing ? (
              <div className="text-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-orange mx-auto"></div>
                <p className="mt-4 text-gray-600">Loading comparison...</p>
              </div>
            ) : analysis1 && analysis2 ? (
              <>
                {/* Strategic Overview */}
                <div className="bg-gradient-to-r from-brand-orange-50 to-brand-orange-50 border-2 border-brand-orange-200 rounded-lg p-6 mb-6">
                  <h2 className="text-2xl font-bold text-gray-900 mb-4">Strategic Comparison: {analysis1 && getQuarterLabel(analysis1.quarter, analysis1.year)} → {analysis2 && getQuarterLabel(analysis2.quarter, analysis2.year)}</h2>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {comparisonData.map((data) => {
                      const isPositive =
                        (data.category === 'Strengths' || data.category === 'Opportunities') ? data.change > 0 :
                        (data.category === 'Weaknesses' || data.category === 'Threats') ? data.change < 0 :
                        false;
                      const isNegative =
                        (data.category === 'Strengths' || data.category === 'Opportunities') ? data.change < 0 :
                        (data.category === 'Weaknesses' || data.category === 'Threats') ? data.change > 0 :
                        false;

                      return (
                        <div key={data.category} className="bg-white rounded-lg p-4 border border-gray-200">
                          <div className="text-sm text-gray-600 mb-1">{data.category}</div>
                          <div className="flex items-center justify-between">
                            <div className="text-2xl font-bold text-gray-900">
                              {data.period1Count} → {data.period2Count}
                            </div>
                            <div className={`text-lg font-bold ${isPositive ? 'text-green-600' : isNegative ? 'text-red-600' : 'text-gray-400'}`}>
                              {data.change > 0 ? '+' : ''}{data.change}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-4 p-4 bg-white rounded-lg border border-brand-orange-100">
                    <p className="text-base text-gray-700">
                      <span className="font-semibold text-brand-orange">Strategic Insight:</span>{' '}
                      {(() => {
                        const weaknessChange = comparisonData.find(d => d.category === 'Weaknesses')?.change || 0;
                        const strengthChange = comparisonData.find(d => d.category === 'Strengths')?.change || 0;

                        if (weaknessChange < 0 && strengthChange > 0) {
                          return 'Strong progress! You\'re building strengths and reducing weaknesses.';
                        } else if (weaknessChange < 0) {
                          return 'Good work addressing weaknesses. Now focus on building new strengths.';
                        } else if (strengthChange > 0) {
                          return 'Strengths growing, but watch your weaknesses - they need attention too.';
                        } else {
                          return 'Review the detailed comparison below to identify strategic shifts.';
                        }
                      })()}
                    </p>
                  </div>
                </div>

                {/* Category Comparisons */}
                <div className="space-y-6">
                  {comparisonData.map((data) => (
                    <div
                      key={data.category}
                      className={`rounded-lg shadow-sm border p-6 ${getCategoryColor(data.category)}`}
                    >
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold text-gray-900">{data.category}</h3>
                        <div className="flex items-center gap-2">
                          {getTrendIcon(data.change)}
                          <span className={`font-bold ${getTrendColor(data.change)}`}>
                            {data.change > 0 ? '+' : ''}{data.change}
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Period 1 */}
                        <div>
                          <div className="text-sm font-medium text-gray-700 mb-3">
                            {analysis1 && getQuarterLabel(analysis1.quarter, analysis1.year)} ({data.period1Count} items)
                          </div>
                          <div className="space-y-2">
                            {data.items1.length === 0 ? (
                              <p className="text-sm text-gray-500 italic">No items</p>
                            ) : (
                              data.items1.map((item) => (
                                <div key={item.id} className="bg-white rounded p-3 shadow-sm">
                                  <div className="font-medium text-sm text-gray-900">{item.title}</div>
                                  {item.description && (
                                    <div className="text-xs text-gray-600 mt-1">{item.description}</div>
                                  )}
                                </div>
                              ))
                            )}
                          </div>
                        </div>

                        {/* Period 2 */}
                        <div>
                          <div className="text-sm font-medium text-gray-700 mb-3">
                            {analysis2 && getQuarterLabel(analysis2.quarter, analysis2.year)} ({data.period2Count} items)
                          </div>
                          <div className="space-y-2">
                            {data.items2.length === 0 ? (
                              <p className="text-sm text-gray-500 italic">No items</p>
                            ) : (
                              data.items2.map((item) => (
                                <div key={item.id} className="bg-white rounded p-3 shadow-sm">
                                  <div className="font-medium text-sm text-gray-900">{item.title}</div>
                                  {item.description && (
                                    <div className="text-xs text-gray-600 mt-1">{item.description}</div>
                                  )}
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="text-center py-12 text-gray-500">
                Select two periods to compare
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
