'use client'

import { useParams } from 'next/navigation'
import Link from 'next/link'
import { TrendingUp, ArrowLeft, Loader2 } from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'
import QuarterProgressCard from '@/app/business-dashboard/components/QuarterProgressCard'
import { useBusinessDashboard } from '@/app/business-dashboard/hooks/useBusinessDashboard'
import WeeklyMetricsService from '@/app/business-dashboard/services/weekly-metrics-service'
import type { WeeklyMetricsSnapshot } from '@/app/business-dashboard/services/weekly-metrics-service'

export default function CoachClientKPIPage() {
  const params = useParams()
  const { id } = params as { id: string }

  const {
    isLoading,
    businessId,
    financialData,
    snapshots,
    weekPreference,
    currentQuarterInfo,
    calculateQTD,
    getQuarterProgress,
    getTrendStatus,
    formatCurrency,
  } = useBusinessDashboard(id)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen p-4">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-brand-orange mx-auto mb-4" />
          <p className="text-sm sm:text-base text-gray-600">Loading client KPI dashboard...</p>
        </div>
      </div>
    )
  }

  // Calculate quarter progress data
  const progress = currentQuarterInfo
    ? getQuarterProgress(currentQuarterInfo)
    : { currentWeek: 0, totalWeeks: 0, percentComplete: 0 }

  // Get quarter snapshots for QTD calculations
  const quarterWeeks = currentQuarterInfo
    ? WeeklyMetricsService.getWeeksInRange(
        currentQuarterInfo.startDate,
        currentQuarterInfo.endDate,
        weekPreference
      )
    : []

  const quarterSnapshots = quarterWeeks
    .map((date: string) => snapshots.find((s: WeeklyMetricsSnapshot) => s.week_ending_date === date))
    .filter(Boolean) as WeeklyMetricsSnapshot[]

  // Calculate QTD actuals
  const revenueQTD = calculateQTD(quarterSnapshots, 'revenue_actual')
  const grossProfitQTD = calculateQTD(quarterSnapshots, 'gross_profit_actual')
  const netProfitQTD = calculateQTD(quarterSnapshots, 'net_profit_actual')

  // Get quarter targets (annual / 4)
  const revenueTarget = (financialData?.revenue?.year1 || 0) / 4
  const grossProfitTarget = (financialData?.grossProfit?.year1 || 0) / 4
  const netProfitTarget = (financialData?.netProfit?.year1 || 0) / 4

  // Calculate trends
  const revenueTrend = getTrendStatus(revenueQTD, revenueTarget, progress.percentComplete)
  const grossProfitTrend = getTrendStatus(grossProfitQTD, grossProfitTarget, progress.percentComplete)
  const netProfitTrend = getTrendStatus(netProfitQTD, netProfitTarget, progress.percentComplete)

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Back link */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4">
        <Link
          href={`/coach/clients/${id}`}
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-brand-orange transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to client
        </Link>
      </div>

      {/* Page Header */}
      <PageHeader
        variant="banner"
        title="KPI Dashboard"
        subtitle="Read-only view of client financial metrics"
        icon={TrendingUp}
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Read-only notice */}
        <div className="mb-4 px-4 py-2 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">
          Read-only view — client data cannot be edited from this screen.
        </div>

        {/* Quarter Progress Card */}
        {currentQuarterInfo && (
          <QuarterProgressCard
            currentQuarterInfo={currentQuarterInfo}
            progress={progress}
            revenueQTD={revenueQTD}
            grossProfitQTD={grossProfitQTD}
            netProfitQTD={netProfitQTD}
            revenueTarget={revenueTarget}
            grossProfitTarget={grossProfitTarget}
            netProfitTarget={netProfitTarget}
            revenueTrend={revenueTrend}
            grossProfitTrend={grossProfitTrend}
            netProfitTrend={netProfitTrend}
            formatCurrency={formatCurrency}
          />
        )}

        {!currentQuarterInfo && !isLoading && (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-500">
            No quarter data available for this client.
          </div>
        )}

        {/* Key Metrics Summary */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-base font-semibold text-gray-900 mb-4">QTD Metrics vs Quarterly Target</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Revenue QTD</p>
              <p className="text-xl font-bold text-gray-900">{formatCurrency(revenueQTD)}</p>
              <p className="text-xs text-gray-500 mt-1">
                vs target {formatCurrency(revenueTarget)}
              </p>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Gross Profit QTD</p>
              <p className="text-xl font-bold text-gray-900">{formatCurrency(grossProfitQTD)}</p>
              <p className="text-xs text-gray-500 mt-1">
                vs target {formatCurrency(grossProfitTarget)}
              </p>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Net Profit QTD</p>
              <p className="text-xl font-bold text-gray-900">{formatCurrency(netProfitQTD)}</p>
              <p className="text-xs text-gray-500 mt-1">
                vs target {formatCurrency(netProfitTarget)}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
