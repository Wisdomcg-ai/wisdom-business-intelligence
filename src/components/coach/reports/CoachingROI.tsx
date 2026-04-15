'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  TrendingUp,
  DollarSign,
  Target,
  Calendar,
  Users,
  CheckCircle,
  Loader2,
  ArrowUp,
  ArrowDown,
  Minus
} from 'lucide-react'

interface ClientROI {
  businessId: string
  businessName: string
  engagementStartDate: string
  engagementMonths: number
  currentRevenue: number | null
  assessmentFirst: number | null
  assessmentLatest: number | null
  assessmentDelta: number | null
  rocksCompleted: number
  actionsCompleted: number
  roiIndicator: 'green' | 'amber' | 'red'
}

interface ROISummary {
  totalClients: number
  avgEngagementMonths: number
  totalRocksCompleted: number
  totalActionsCompleted: number
}

function formatCurrency(amount: number): string {
  if (amount >= 1_000_000) {
    return `$${(amount / 1_000_000).toFixed(1)}M`
  }
  if (amount >= 1_000) {
    return `$${(amount / 1_000).toFixed(0)}K`
  }
  return `$${amount.toLocaleString()}`
}

function monthsBetween(startDate: string, endDate: Date): number {
  const start = new Date(startDate)
  const diffMs = endDate.getTime() - start.getTime()
  const diffMonths = diffMs / (1000 * 60 * 60 * 24 * 30.44)
  return Math.max(1, Math.round(diffMonths))
}

function determineROIIndicator(
  assessmentDelta: number | null,
  hasRevenue: boolean
): 'green' | 'amber' | 'red' {
  if (assessmentDelta === null) return 'amber'
  if (assessmentDelta > 0) return 'green'
  if (assessmentDelta < 0) return 'red'
  return 'amber'
}

export function CoachingROI() {
  const [loading, setLoading] = useState(true)
  const [clients, setClients] = useState<ClientROI[]>([])
  const [summary, setSummary] = useState<ROISummary | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    const supabase = createClient()

    try {
      setLoading(true)
      setError(null)

      // Get current user and verify coach role
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setError('Not authenticated')
        return
      }

      // Check coach role
      const { data: roleData } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('role', 'coach')
        .maybeSingle()

      if (!roleData) {
        setError('Coach access required')
        return
      }

      // Load businesses assigned to this coach
      const { data: businesses } = await supabase
        .from('businesses')
        .select('id, business_name, engagement_start_date, created_at, status, owner_id')
        .eq('assigned_coach_id', user.id)

      if (!businesses || businesses.length === 0) {
        setClients([])
        setSummary(null)
        return
      }

      const businessIds = businesses.map(b => b.id)
      const ownerIds = businesses.map(b => b.owner_id).filter(Boolean) as string[]
      const now = new Date()

      // Get business_profiles for revenue and for strategic_initiatives FK
      const { data: profiles } = await supabase
        .from('business_profiles')
        .select('id, business_id, annual_revenue')
        .in('business_id', businessIds)

      const profileByBusinessId = new Map<string, { profileId: string; annualRevenue: number | null }>()
      const profileIds: string[] = []
      profiles?.forEach(p => {
        profileByBusinessId.set(p.business_id, {
          profileId: p.id,
          annualRevenue: p.annual_revenue
        })
        profileIds.push(p.id)
      })

      // Parallel queries for actions, rocks, and assessments
      const [actionsResult, rocksResult, assessmentsResult] = await Promise.all([
        // Session actions completed per business
        businessIds.length > 0
          ? supabase
              .from('session_actions')
              .select('id, business_id, status')
              .in('business_id', businessIds)
              .eq('status', 'completed')
          : Promise.resolve({ data: [] }),

        // Strategic initiatives (rocks) completed — uses business_profiles.id
        profileIds.length > 0
          ? supabase
              .from('strategic_initiatives')
              .select('id, business_id, status')
              .in('business_id', profileIds)
              .eq('status', 'completed')
          : Promise.resolve({ data: [] }),

        // Assessments for all owners — get all completed to find first and latest
        ownerIds.length > 0
          ? supabase
              .from('assessments')
              .select('user_id, percentage, created_at')
              .in('user_id', ownerIds)
              .eq('status', 'completed')
              .order('created_at', { ascending: true })
          : Promise.resolve({ data: [] })
      ])

      // Build lookup maps
      // Actions: count completed per business_id
      const actionsCountByBusiness = new Map<string, number>()
      actionsResult.data?.forEach(a => {
        const count = actionsCountByBusiness.get(a.business_id) || 0
        actionsCountByBusiness.set(a.business_id, count + 1)
      })

      // Rocks: count completed per profile_id, then map back to business_id
      const rocksCountByProfileId = new Map<string, number>()
      rocksResult.data?.forEach(r => {
        const count = rocksCountByProfileId.get(r.business_id) || 0
        rocksCountByProfileId.set(r.business_id, count + 1)
      })

      // Assessments: find first and latest per user_id
      const assessmentsByUser = new Map<string, { first: number | null; latest: number | null }>()
      assessmentsResult.data?.forEach(a => {
        if (a.percentage == null) return
        const existing = assessmentsByUser.get(a.user_id)
        if (!existing) {
          assessmentsByUser.set(a.user_id, { first: a.percentage, latest: a.percentage })
        } else {
          // Data is ordered ascending by created_at, so each subsequent entry is newer
          existing.latest = a.percentage
        }
      })

      // Build client ROI rows
      const clientRows: ClientROI[] = businesses.map(biz => {
        const engagementStart = biz.engagement_start_date || biz.created_at
        const months = monthsBetween(engagementStart, now)
        const profile = profileByBusinessId.get(biz.id)
        const currentRevenue = profile?.annualRevenue ?? null
        const profileId = profile?.profileId
        const rocksCompleted = profileId ? (rocksCountByProfileId.get(profileId) || 0) : 0
        const actionsCompleted = actionsCountByBusiness.get(biz.id) || 0

        // Assessment improvement
        const assessments = biz.owner_id ? assessmentsByUser.get(biz.owner_id) : undefined
        const assessmentFirst = assessments?.first ?? null
        const assessmentLatest = assessments?.latest ?? null
        const assessmentDelta =
          assessmentFirst !== null && assessmentLatest !== null
            ? Math.round(assessmentLatest - assessmentFirst)
            : null

        const roiIndicator = determineROIIndicator(assessmentDelta, currentRevenue !== null)

        return {
          businessId: biz.id,
          businessName: biz.business_name || 'Unnamed Business',
          engagementStartDate: engagementStart,
          engagementMonths: months,
          currentRevenue,
          assessmentFirst,
          assessmentLatest,
          assessmentDelta,
          rocksCompleted,
          actionsCompleted,
          roiIndicator
        }
      })

      // Sort by engagement months descending (longest-standing clients first)
      clientRows.sort((a, b) => b.engagementMonths - a.engagementMonths)

      setClients(clientRows)

      // Build summary
      const totalClients = clientRows.length
      const avgEngagementMonths = totalClients > 0
        ? Math.round(clientRows.reduce((sum, c) => sum + c.engagementMonths, 0) / totalClients)
        : 0
      const totalRocksCompleted = clientRows.reduce((sum, c) => sum + c.rocksCompleted, 0)
      const totalActionsCompleted = clientRows.reduce((sum, c) => sum + c.actionsCompleted, 0)

      setSummary({
        totalClients,
        avgEngagementMonths,
        totalRocksCompleted,
        totalActionsCompleted
      })

    } catch (err) {
      console.error('Error loading coaching ROI data:', err)
      setError('Failed to load ROI data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-brand-orange mx-auto mb-3" />
          <p className="text-gray-500 text-sm">Loading ROI data...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
        <p className="text-red-600 font-medium">{error}</p>
      </div>
    )
  }

  if (!summary || clients.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <Users className="w-8 h-8 text-gray-400" />
        </div>
        <h3 className="text-lg font-medium text-gray-900 mb-1">No clients yet</h3>
        <p className="text-gray-500">
          ROI metrics will appear here once you have clients assigned.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Coaching ROI</h2>
      </div>

      {/* Summary Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Total Clients</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">{summary.totalClients}</p>
            </div>
            <div className="w-12 h-12 bg-brand-orange-100 rounded-xl flex items-center justify-center">
              <Users className="w-6 h-6 text-brand-orange" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Avg Engagement</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">
                {summary.avgEngagementMonths}
                <span className="text-lg font-normal text-gray-500 ml-1">mo</span>
              </p>
            </div>
            <div className="w-12 h-12 bg-brand-navy-50 rounded-xl flex items-center justify-center">
              <Calendar className="w-6 h-6 text-brand-navy" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Rocks Completed</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">{summary.totalRocksCompleted}</p>
            </div>
            <div className="w-12 h-12 bg-brand-teal-100 rounded-xl flex items-center justify-center">
              <Target className="w-6 h-6 text-brand-teal" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Actions Completed</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">{summary.totalActionsCompleted}</p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
              <CheckCircle className="w-6 h-6 text-green-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Client ROI Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="font-semibold text-gray-900">Client ROI Breakdown</h3>
          <p className="text-sm text-gray-500 mt-1">Return on coaching investment per client</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Client
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Engagement
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Revenue
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Assessment
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Rocks
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  ROI
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {clients.map(client => (
                <tr key={client.businessId} className="hover:bg-gray-50 transition-colors">
                  {/* Client Name */}
                  <td className="px-6 py-4">
                    <p className="font-medium text-gray-900">{client.businessName}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Since {new Date(client.engagementStartDate).toLocaleDateString('en-AU', {
                        month: 'short',
                        year: 'numeric'
                      })}
                    </p>
                  </td>

                  {/* Engagement Duration */}
                  <td className="px-6 py-4">
                    <span className="text-gray-900 font-medium">
                      {client.engagementMonths}
                      <span className="text-gray-500 font-normal ml-1">mo</span>
                    </span>
                  </td>

                  {/* Current Revenue */}
                  <td className="px-6 py-4">
                    {client.currentRevenue !== null ? (
                      <div className="flex items-center gap-1.5">
                        <DollarSign className="w-4 h-4 text-gray-400" />
                        <span className="text-gray-900 font-medium">
                          {formatCurrency(client.currentRevenue)}
                        </span>
                      </div>
                    ) : (
                      <span className="text-gray-400 text-sm italic">No financial data</span>
                    )}
                  </td>

                  {/* Assessment Improvement */}
                  <td className="px-6 py-4">
                    {client.assessmentDelta !== null ? (
                      <div className="flex items-center gap-1.5">
                        {client.assessmentDelta > 0 ? (
                          <ArrowUp className="w-4 h-4 text-green-600" />
                        ) : client.assessmentDelta < 0 ? (
                          <ArrowDown className="w-4 h-4 text-red-600" />
                        ) : (
                          <Minus className="w-4 h-4 text-gray-400" />
                        )}
                        <span className={`font-medium ${
                          client.assessmentDelta > 0
                            ? 'text-green-600'
                            : client.assessmentDelta < 0
                            ? 'text-red-600'
                            : 'text-gray-600'
                        }`}>
                          {client.assessmentDelta > 0 ? '+' : ''}{client.assessmentDelta}%
                        </span>
                        <span className="text-xs text-gray-400">
                          ({client.assessmentFirst}% → {client.assessmentLatest}%)
                        </span>
                      </div>
                    ) : (
                      <span className="text-gray-400 text-sm italic">No assessments</span>
                    )}
                  </td>

                  {/* Rocks Completed */}
                  <td className="px-6 py-4 text-center">
                    <span className="text-gray-900 font-medium">{client.rocksCompleted}</span>
                  </td>

                  {/* Actions Completed */}
                  <td className="px-6 py-4 text-center">
                    <span className="text-gray-900 font-medium">{client.actionsCompleted}</span>
                  </td>

                  {/* ROI Indicator */}
                  <td className="px-6 py-4 text-center">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${
                      client.roiIndicator === 'green'
                        ? 'bg-green-100 text-green-700'
                        : client.roiIndicator === 'red'
                        ? 'bg-red-100 text-red-700'
                        : 'bg-amber-100 text-amber-700'
                    }`}>
                      {client.roiIndicator === 'green' ? (
                        <TrendingUp className="w-3 h-3" />
                      ) : client.roiIndicator === 'red' ? (
                        <ArrowDown className="w-3 h-3" />
                      ) : (
                        <Minus className="w-3 h-3" />
                      )}
                      {client.roiIndicator === 'green'
                        ? 'Growing'
                        : client.roiIndicator === 'red'
                        ? 'Declining'
                        : 'Neutral'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export default CoachingROI
