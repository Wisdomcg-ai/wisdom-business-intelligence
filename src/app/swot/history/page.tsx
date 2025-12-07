'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Calendar, TrendingUp, Eye, Clock, AlertTriangle, Target, Shield, Lightbulb, History } from 'lucide-react'
import Link from 'next/link'
import { useBusinessContext } from '@/hooks/useBusinessContext'
import PageHeader from '@/components/ui/PageHeader'

interface SwotAnalysis {
  id: string
  quarter: number
  year: number
  type: string
  status: string
  created_at: string
  updated_at: string
  item_counts?: {
    strengths: number
    weaknesses: number
    opportunities: number
    threats: number
    total: number
  }
}

export default function SwotHistoryPage() {
  const router = useRouter()
  const supabase = createClient()
  const { activeBusiness, isLoading: contextLoading } = useBusinessContext()

  const [analyses, setAnalyses] = useState<SwotAnalysis[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!contextLoading) {
      loadHistory()
    }
  }, [contextLoading, activeBusiness?.id])

  const loadHistory = async () => {
    try {
      setLoading(true)
      setError(null)

      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError || !user) {
        setError('Please log in to view history')
        return
      }

      // Use activeBusiness ownerId if viewing as coach, otherwise current user
      const targetUserId = activeBusiness?.ownerId || user.id

      // Fetch all SWOT analyses for this user
      const { data: swots, error: fetchError } = await supabase
        .from('swot_analyses')
        .select(`
          *,
          swot_items (category)
        `)
        .eq('business_id', targetUserId)
        .order('year', { ascending: false })
        .order('quarter', { ascending: false })

      if (fetchError) throw fetchError

      // Count items by category for each analysis
      const analysesWithCounts = swots.map((swot: any) => {
        const items = swot.swot_items || []
        const counts = {
          strengths: items.filter((i: any) => i.category === 'strength').length,
          weaknesses: items.filter((i: any) => i.category === 'weakness').length,
          opportunities: items.filter((i: any) => i.category === 'opportunity').length,
          threats: items.filter((i: any) => i.category === 'threat').length,
          total: items.length
        }

        return {
          ...swot,
          item_counts: counts
        }
      })

      setAnalyses(analysesWithCounts)
    } catch (err) {
      console.error('Error loading history:', err)
      setError('Failed to load SWOT history')
    } finally {
      setLoading(false)
    }
  }

  const getQuarterLabel = (quarter: number, year: number) => {
    return `Q${quarter} ${year}`
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-orange mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading history...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <PageHeader
        variant="banner"
        title="SWOT History"
        subtitle="Track your strategic evolution over time"
        icon={History}
        backLink={{ href: '/swot', label: 'Back to Current SWOT' }}
        actions={
          <button
            onClick={() => router.push('/swot/compare')}
            className="inline-flex items-center px-4 py-2 border border-white/30 rounded-lg text-sm font-medium text-white bg-white/10 hover:bg-white/20 transition-colors"
          >
            <TrendingUp className="h-4 w-4 mr-2" />
            Compare Quarters
          </button>
        }
      />

      {/* Error Alert */}
      {error && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6">
          <div className="bg-red-50 border border-red-200 rounded-md p-4">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        </div>
      )}

      {/* Strategic Insights */}
      {analyses.length >= 2 && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6">
          <div className="bg-gradient-to-r from-brand-orange-50 to-brand-orange-50 border-2 border-brand-orange-200 rounded-lg p-6">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="h-6 w-6 text-brand-orange" />
              <h2 className="text-2xl font-bold text-gray-900">Strategic Insights</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Evolution Summary */}
              <div className="bg-white rounded-lg p-4 border border-brand-orange-100">
                <h3 className="text-base font-semibold text-gray-900 mb-2">📈 Your Strategic Evolution</h3>
                <p className="text-base text-gray-700">
                  Tracking <span className="font-bold text-brand-orange">{analyses.length} quarters</span> of SWOT analyses.
                  {analyses.length >= 4 ? ' You have a full year of strategic data!' : ' Keep building your strategic history for deeper insights.'}
                </p>
              </div>

              {/* Most Recent Trend */}
              <div className="bg-white rounded-lg p-4 border border-brand-orange-100">
                <h3 className="text-base font-semibold text-gray-900 mb-2">🎯 Latest Focus</h3>
                <p className="text-base text-gray-700">
                  Most recent analysis: <span className="font-bold text-brand-orange">
                    {getQuarterLabel(analyses[0].quarter, analyses[0].year)}
                  </span>
                  {' '}with {analyses[0].item_counts?.total || 0} strategic items identified.
                </p>
              </div>

              {/* Quarter-over-Quarter Progress */}
              {analyses.length >= 2 && (
                <div className="bg-white rounded-lg p-4 border border-brand-orange-100">
                  <h3 className="text-base font-semibold text-gray-900 mb-2">📊 Recent Progress</h3>
                  <div className="space-y-2 text-sm">
                    {(() => {
                      const latest = analyses[0].item_counts;
                      const previous = analyses[1].item_counts;
                      const strengthChange = (latest?.strengths || 0) - (previous?.strengths || 0);
                      const weaknessChange = (latest?.weaknesses || 0) - (previous?.weaknesses || 0);

                      return (
                        <div className="space-y-1">
                          {strengthChange !== 0 && (
                            <p className={strengthChange > 0 ? 'text-green-700' : 'text-brand-orange-700'}>
                              <Shield className="inline h-4 w-4 mr-1" />
                              Strengths: {strengthChange > 0 ? '+' : ''}{strengthChange}
                            </p>
                          )}
                          {weaknessChange !== 0 && (
                            <p className={weaknessChange < 0 ? 'text-green-700' : 'text-red-700'}>
                              <AlertTriangle className="inline h-4 w-4 mr-1" />
                              Weaknesses: {weaknessChange > 0 ? '+' : ''}{weaknessChange}
                              {weaknessChange < 0 && ' (Good!)'}
                            </p>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              )}

              {/* Coaching Tip */}
              <div className="bg-amber-50 rounded-lg p-4 border border-amber-200">
                <h3 className="text-base font-semibold text-amber-900 mb-2">💡 Coaching Tip</h3>
                <p className="text-base text-amber-800">
                  Use the Compare tool to identify recurring weaknesses - they signal systemic issues that need strategic solutions, not just tactical fixes.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* History List */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {analyses.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
            <Calendar className="h-16 w-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No History Yet</h3>
            <p className="text-gray-600 mb-6">
              You haven't completed any SWOT analyses yet.
            </p>
            <button
              onClick={() => router.push('/swot')}
              className="inline-flex items-center px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-brand-orange hover:bg-brand-orange-600"
            >
              Start Your First SWOT
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {analyses.map((analysis) => (
              <div
                key={analysis.id}
                className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-3">
                      <h3 className="text-2xl font-bold text-gray-900">
                        {getQuarterLabel(analysis.quarter, analysis.year)}
                      </h3>
                      <span className="text-sm text-gray-500">
                        {analysis.item_counts?.total || 0} total items
                      </span>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-4">
                      {/* Created Date */}
                      <div>
                        <div className="text-sm text-gray-500 mb-1">Created</div>
                        <div className="text-sm font-medium text-gray-900">
                          {new Date(analysis.created_at).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric'
                          })}
                        </div>
                      </div>

                      {/* Strengths */}
                      <div>
                        <div className="text-sm text-gray-500 mb-1">Strengths</div>
                        <div className="text-2xl font-bold text-green-600">
                          {analysis.item_counts?.strengths || 0}
                        </div>
                      </div>

                      {/* Weaknesses */}
                      <div>
                        <div className="text-sm text-gray-500 mb-1">Weaknesses</div>
                        <div className="text-2xl font-bold text-red-600">
                          {analysis.item_counts?.weaknesses || 0}
                        </div>
                      </div>

                      {/* Opportunities */}
                      <div>
                        <div className="text-sm text-gray-500 mb-1">Opportunities</div>
                        <div className="text-2xl font-bold text-brand-orange">
                          {analysis.item_counts?.opportunities || 0}
                        </div>
                      </div>

                      {/* Threats */}
                      <div>
                        <div className="text-sm text-gray-500 mb-1">Threats</div>
                        <div className="text-2xl font-bold text-brand-orange-600">
                          {analysis.item_counts?.threats || 0}
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 flex items-center gap-4 text-sm text-gray-500">
                      <div className="flex items-center gap-1">
                        <Calendar className="h-4 w-4" />
                        Created {new Date(analysis.created_at).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric'
                        })}
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock className="h-4 w-4" />
                        Last updated {new Date(analysis.updated_at).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric'
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <button
                      onClick={() => router.push(`/swot/${analysis.id}`)}
                      className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                    >
                      <Eye className="h-4 w-4 mr-2" />
                      View Details
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
