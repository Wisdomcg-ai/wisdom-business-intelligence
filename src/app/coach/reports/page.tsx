'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { CoachPerformance } from '@/components/coach/reports/CoachPerformance'
import { ClientProgressTable, type ClientProgress } from '@/components/coach/reports/ClientProgressTable'
import PageHeader from '@/components/ui/PageHeader'
import {
  Loader2,
  Download,
  FileText,
  BarChart3,
  RefreshCw
} from 'lucide-react'

interface CoachPerformanceData {
  sessionsThisMonth: number
  sessionsLastMonth: number
  totalClients: number
  activeClients: number
  avgSessionDuration: number
  responseTime: number
  clientRetention: number
  avgClientHealth: number
  goalsCompleted: number
  actionsCompleted: number
  messagesThisWeek: number
}

export default function ReportsPage() {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [performanceData, setPerformanceData] = useState<CoachPerformanceData | null>(null)
  const [clientProgress, setClientProgress] = useState<ClientProgress[]>([])
  const [dateRange, setDateRange] = useState<'week' | 'month' | 'quarter' | 'year'>('month')

  useEffect(() => {
    loadReportData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange])

  async function loadReportData() {
    try {
      if (!loading) setRefreshing(true)

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Get date range boundaries
      const now = new Date()
      const startDate = new Date()
      const lastPeriodStart = new Date()
      const lastPeriodEnd = new Date()

      switch (dateRange) {
        case 'week':
          startDate.setDate(now.getDate() - 7)
          lastPeriodStart.setDate(now.getDate() - 14)
          lastPeriodEnd.setDate(now.getDate() - 7)
          break
        case 'month':
          startDate.setMonth(now.getMonth() - 1)
          lastPeriodStart.setMonth(now.getMonth() - 2)
          lastPeriodEnd.setMonth(now.getMonth() - 1)
          break
        case 'quarter':
          startDate.setMonth(now.getMonth() - 3)
          lastPeriodStart.setMonth(now.getMonth() - 6)
          lastPeriodEnd.setMonth(now.getMonth() - 3)
          break
        case 'year':
          startDate.setFullYear(now.getFullYear() - 1)
          lastPeriodStart.setFullYear(now.getFullYear() - 2)
          lastPeriodEnd.setFullYear(now.getFullYear() - 1)
          break
      }

      // Load clients
      const { data: clientsData } = await supabase
        .from('businesses')
        .select('id, business_name, industry, status, created_at')
        .eq('assigned_coach_id', user.id)

      const totalClients = clientsData?.length || 0
      const activeClients = clientsData?.filter(c => c.status === 'active').length || 0

      // Load sessions for this period
      const { data: sessionsThisPeriod } = await supabase
        .from('sessions')
        .select('id, duration_minutes, scheduled_at')
        .eq('coach_id', user.id)
        .gte('scheduled_at', startDate.toISOString())
        .lte('scheduled_at', now.toISOString())

      // Load sessions for last period
      const { data: sessionsLastPeriod } = await supabase
        .from('sessions')
        .select('id')
        .eq('coach_id', user.id)
        .gte('scheduled_at', lastPeriodStart.toISOString())
        .lte('scheduled_at', lastPeriodEnd.toISOString())

      const sessionsThisMonth = sessionsThisPeriod?.length || 0
      const sessionsLastMonth = sessionsLastPeriod?.length || 0
      const avgSessionDuration = sessionsThisPeriod?.length
        ? Math.round(sessionsThisPeriod.reduce((acc, s) => acc + (s.duration_minutes || 60), 0) / sessionsThisPeriod.length)
        : 60

      // Load goals completed
      const { data: goalsData } = await supabase
        .from('goals')
        .select('id, status')
        .in('business_id', clientsData?.map(c => c.id) || [])

      const goalsCompleted = goalsData?.filter(g => g.status === 'completed').length || 0

      // Load actions completed
      const { data: actionsData } = await supabase
        .from('action_items')
        .select('id, status, completed_at')
        .in('business_id', clientsData?.map(c => c.id) || [])

      const actionsCompleted = actionsData?.filter(a => a.status === 'completed').length || 0

      // Calculate client retention (simplified - clients active > 3 months / total)
      const threeMonthsAgo = new Date()
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3)
      const retainedClients = clientsData?.filter(c =>
        c.status === 'active' && new Date(c.created_at) < threeMonthsAgo
      ).length || 0
      const clientRetention = totalClients > 0 ? Math.round((retainedClients / totalClients) * 100) : 100

      // Set performance data
      setPerformanceData({
        sessionsThisMonth,
        sessionsLastMonth,
        totalClients,
        activeClients,
        avgSessionDuration,
        responseTime: 4, // Placeholder - would come from messages
        clientRetention,
        avgClientHealth: 72, // Placeholder - would come from health scores
        goalsCompleted,
        actionsCompleted,
        messagesThisWeek: 24 // Placeholder - would come from messages
      })

      // Build client progress data
      const progressData: ClientProgress[] = []

      for (const client of clientsData || []) {
        // Get client sessions
        const { data: clientSessions } = await supabase
          .from('sessions')
          .select('id, scheduled_at')
          .eq('business_id', client.id)
          .order('scheduled_at', { ascending: false })

        // Get client goals
        const { data: clientGoals } = await supabase
          .from('goals')
          .select('id, status')
          .eq('business_id', client.id)

        const totalGoals = clientGoals?.length || 0
        const completedGoals = clientGoals?.filter(g => g.status === 'completed').length || 0
        const goalsProgress = totalGoals > 0 ? Math.round((completedGoals / totalGoals) * 100) : 0

        // Get client actions
        const { data: clientActions } = await supabase
          .from('action_items')
          .select('id, status')
          .eq('business_id', client.id)

        const completedActions = clientActions?.filter(a => a.status === 'completed').length || 0
        const pendingActions = clientActions?.filter(a => a.status !== 'completed' && a.status !== 'cancelled').length || 0

        // Calculate health score (simplified)
        let healthScore = 50
        if (goalsProgress > 50) healthScore += 20
        if (completedActions > 5) healthScore += 15
        if (clientSessions && clientSessions.length > 0) {
          const lastSession = new Date(clientSessions[0].scheduled_at)
          const daysSinceSession = Math.floor((now.getTime() - lastSession.getTime()) / (1000 * 60 * 60 * 24))
          if (daysSinceSession < 14) healthScore += 15
          else if (daysSinceSession > 30) healthScore -= 20
        }
        healthScore = Math.min(100, Math.max(0, healthScore))

        progressData.push({
          id: client.id,
          businessName: client.business_name || 'Unnamed Business',
          industry: client.industry || undefined,
          healthScore,
          healthTrend: Math.floor(Math.random() * 20) - 10, // Placeholder - would calculate from history
          sessionsCompleted: clientSessions?.length || 0,
          goalsProgress,
          actionsCompleted: completedActions,
          actionsPending: pendingActions,
          lastSessionDate: clientSessions?.[0]?.scheduled_at || undefined,
          status: client.status === 'active'
            ? (healthScore < 50 ? 'at-risk' : 'active')
            : client.status === 'pending' ? 'pending' : 'inactive'
        })
      }

      setClientProgress(progressData)

    } catch (error) {
      console.error('Error loading report data:', error)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  const handleRefresh = () => {
    loadReportData()
  }

  const handleExportReport = () => {
    // Generate CSV export
    const headers = ['Business Name', 'Industry', 'Health Score', 'Sessions', 'Goals Progress', 'Actions Completed', 'Status']
    const rows = clientProgress.map(client => [
      client.businessName,
      client.industry || '',
      `${client.healthScore}%`,
      client.sessionsCompleted.toString(),
      `${client.goalsProgress}%`,
      client.actionsCompleted.toString(),
      client.status
    ])

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `coach-report-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    window.URL.revokeObjectURL(url)
  }

  const handleGenerateClientReport = (clientId: string) => {
    const client = clientProgress.find(c => c.id === clientId)
    if (!client) return

    // Generate individual client report
    const report = `
CLIENT PROGRESS REPORT
=====================
Business: ${client.businessName}
Industry: ${client.industry || 'Not specified'}
Generated: ${new Date().toLocaleDateString()}

METRICS
-------
Health Score: ${client.healthScore}% (${client.healthTrend >= 0 ? '+' : ''}${client.healthTrend}% vs last period)
Sessions Completed: ${client.sessionsCompleted}
Goals Progress: ${client.goalsProgress}%
Actions Completed: ${client.actionsCompleted}
Actions Pending: ${client.actionsPending}
Status: ${client.status}

Last Session: ${client.lastSessionDate ? new Date(client.lastSessionDate).toLocaleDateString() : 'Never'}
    `.trim()

    const blob = new Blob([report], { type: 'text/plain' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${client.businessName.replace(/\s+/g, '-').toLowerCase()}-report-${new Date().toISOString().split('T')[0]}.txt`
    a.click()
    window.URL.revokeObjectURL(url)
  }

  // Summary stats
  const summaryStats = useMemo(() => {
    if (clientProgress.length === 0) return null

    const avgHealth = Math.round(clientProgress.reduce((acc, c) => acc + c.healthScore, 0) / clientProgress.length)
    const atRiskCount = clientProgress.filter(c => c.status === 'at-risk').length
    const totalSessions = clientProgress.reduce((acc, c) => acc + c.sessionsCompleted, 0)
    const avgGoalsProgress = Math.round(clientProgress.reduce((acc, c) => acc + c.goalsProgress, 0) / clientProgress.length)

    return { avgHealth, atRiskCount, totalSessions, avgGoalsProgress }
  }, [clientProgress])

  if (loading) {
    return (
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <Loader2 className="w-8 h-8 animate-spin text-brand-orange mx-auto mb-4" />
            <p className="text-gray-500">Loading reports...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* Header */}
      <PageHeader
        variant="banner"
        title="Reports & Analytics"
        subtitle="Track performance and client progress"
        icon={BarChart3}
        actions={
          <>
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value as typeof dateRange)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-orange"
            >
              <option value="week">Last 7 days</option>
              <option value="month">Last 30 days</option>
              <option value="quarter">Last 90 days</option>
              <option value="year">Last year</option>
            </select>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="p-2 text-gray-600 hover:text-gray-900 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
              title="Refresh data"
            >
              <RefreshCw className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={handleExportReport}
              className="flex items-center gap-2 px-4 py-2 text-sm sm:text-base text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Export</span>
            </button>
          </>
        }
      />

      <div className="space-y-6">
        {/* Quick Summary */}
        {summaryStats && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-gradient-to-br from-brand-orange to-brand-navy rounded-xl p-4 sm:p-5 text-white">
              <p className="text-brand-orange-100 text-sm">Avg Client Health</p>
              <p className="text-2xl sm:text-3xl font-bold mt-1">{summaryStats.avgHealth}%</p>
            </div>
            <div className="bg-gradient-to-br from-amber-500 to-amber-600 rounded-xl p-4 sm:p-5 text-white">
              <p className="text-amber-100 text-sm">At-Risk Clients</p>
              <p className="text-2xl sm:text-3xl font-bold mt-1">{summaryStats.atRiskCount}</p>
            </div>
            <div className="bg-gradient-to-br from-brand-teal to-brand-teal-600 rounded-xl p-4 sm:p-5 text-white">
              <p className="text-brand-teal-100 text-sm">Total Sessions</p>
              <p className="text-2xl sm:text-3xl font-bold mt-1">{summaryStats.totalSessions}</p>
            </div>
            <div className="bg-gradient-to-br from-brand-navy to-brand-navy-600 rounded-xl p-4 sm:p-5 text-white">
              <p className="text-brand-navy-100 text-sm">Avg Goals Progress</p>
              <p className="text-2xl sm:text-3xl font-bold mt-1">{summaryStats.avgGoalsProgress}%</p>
            </div>
          </div>
        )}

        {/* Coach Performance */}
        {performanceData && (
          <CoachPerformance data={performanceData} period={dateRange} />
        )}

        {/* Client Progress Table */}
        <ClientProgressTable
          clients={clientProgress}
          onGenerateReport={handleGenerateClientReport}
        />

        {/* Empty State */}
        {clientProgress.length === 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-8 sm:p-12 text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <FileText className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-1">No client data available</h3>
            <p className="text-gray-500">
              Add clients to start tracking their progress and generating reports.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
