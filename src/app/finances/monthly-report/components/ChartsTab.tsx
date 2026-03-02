'use client'

import { Loader2 } from 'lucide-react'
import type { ReportSections, GeneratedReport, FullYearReport, SubscriptionDetailData, WagesDetailData } from '../types'
import type { CashflowForecastData } from '@/app/finances/forecast/types'
import {
  RevenueVsExpensesTrendChart,
  RevenueBreakdownChart,
  BreakEvenChart,
  VarianceHeatmapChart,
  BudgetBurnRateChart,
  CashRunwayChart,
  CumulativeNetCashChart,
  WorkingCapitalGapChart,
  TeamCostPctChart,
  CostPerEmployeeChart,
  SubscriptionCreepChart,
} from './charts'

interface ChartsTabProps {
  sections: ReportSections
  report: GeneratedReport | null
  fullYearReport: FullYearReport | null
  fullYearLoading: boolean
  cashflowForecast: CashflowForecastData | null
  cashflowLoading: boolean
  wagesDetail: WagesDetailData | null
  wagesLoading: boolean
  subscriptionDetail: SubscriptionDetailData | null
  subscriptionLoading: boolean
  wagesAccountNames: string[]
}

function LoadingBlock({ label }: { label: string }) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
      <Loader2 className="w-6 h-6 animate-spin text-brand-orange mx-auto mb-2" />
      <p className="text-sm text-gray-500">Loading {label}...</p>
    </div>
  )
}

function EmptyBlock({ label, hint }: { label: string; hint: string }) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 text-center">
      <p className="text-sm font-medium text-gray-600">{label}</p>
      <p className="text-xs text-gray-400 mt-1">{hint}</p>
    </div>
  )
}

export default function ChartsTab({
  sections,
  report,
  fullYearReport,
  fullYearLoading,
  cashflowForecast,
  cashflowLoading,
  wagesDetail,
  wagesLoading,
  subscriptionDetail,
  subscriptionLoading,
  wagesAccountNames,
}: ChartsTabProps) {
  const hasPLCharts = sections.chart_revenue_vs_expenses || sections.chart_revenue_breakdown || sections.chart_break_even || sections.chart_variance_heatmap || sections.chart_budget_burn_rate
  const hasCashflowCharts = sections.chart_cash_runway || sections.chart_cumulative_net_cash || sections.chart_working_capital_gap
  const hasPeopleCharts = sections.chart_team_cost_pct || sections.chart_cost_per_employee || sections.chart_subscription_creep

  return (
    <div className="space-y-8">
      {/* P&L Analysis Charts */}
      {hasPLCharts && (
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">P&L Analysis</h2>
          {fullYearLoading && <LoadingBlock label="P&L data" />}
          {!fullYearLoading && !fullYearReport && !report && (
            <EmptyBlock label="No report data available" hint="Generate a report first" />
          )}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {sections.chart_revenue_breakdown && report && (
              <RevenueBreakdownChart report={report} />
            )}
            {sections.chart_budget_burn_rate && report && (
              <BudgetBurnRateChart report={report} />
            )}
            {sections.chart_revenue_vs_expenses && fullYearReport && (
              <div className="lg:col-span-2">
                <RevenueVsExpensesTrendChart fullYearReport={fullYearReport} />
              </div>
            )}
            {sections.chart_break_even && fullYearReport && (
              <div className="lg:col-span-2">
                <BreakEvenChart fullYearReport={fullYearReport} />
              </div>
            )}
            {sections.chart_variance_heatmap && fullYearReport && (
              <div className="lg:col-span-2">
                <VarianceHeatmapChart fullYearReport={fullYearReport} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Cashflow Analysis Charts */}
      {hasCashflowCharts && (
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Cashflow Analysis</h2>
          {cashflowLoading && <LoadingBlock label="cashflow forecast" />}
          {!cashflowLoading && !cashflowForecast && (
            <EmptyBlock label="No cashflow forecast available" hint="Set up a forecast with cashflow assumptions to see these charts" />
          )}
          {cashflowForecast && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {sections.chart_cash_runway && (
                <CashRunwayChart cashflowForecast={cashflowForecast} />
              )}
              {sections.chart_cumulative_net_cash && (
                <CumulativeNetCashChart cashflowForecast={cashflowForecast} />
              )}
              {sections.chart_working_capital_gap && (
                <div className="lg:col-span-2">
                  <WorkingCapitalGapChart cashflowForecast={cashflowForecast} />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* People & Subscriptions Charts */}
      {hasPeopleCharts && (
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">People & Subscriptions</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {sections.chart_team_cost_pct && (
              <>
                {fullYearLoading && <LoadingBlock label="team cost data" />}
                {fullYearReport && !fullYearLoading && (
                  <div className="lg:col-span-2">
                    <TeamCostPctChart fullYearReport={fullYearReport} wagesAccountNames={wagesAccountNames} />
                  </div>
                )}
                {!fullYearReport && !fullYearLoading && (
                  <EmptyBlock label="Full year report needed" hint="Configure wages accounts in Settings" />
                )}
              </>
            )}
            {sections.chart_cost_per_employee && (
              <>
                {wagesLoading && <LoadingBlock label="wages data" />}
                {wagesDetail && !wagesLoading && (
                  <CostPerEmployeeChart wagesDetail={wagesDetail} />
                )}
                {!wagesDetail && !wagesLoading && (
                  <EmptyBlock label="No wages data available" hint="Configure wages accounts in Settings" />
                )}
              </>
            )}
            {sections.chart_subscription_creep && (
              <>
                {subscriptionLoading && <LoadingBlock label="subscription data" />}
                {subscriptionDetail && !subscriptionLoading && (
                  <SubscriptionCreepChart subscriptionDetail={subscriptionDetail} />
                )}
                {!subscriptionDetail && !subscriptionLoading && (
                  <EmptyBlock label="No subscription data available" hint="Configure subscription accounts in Settings" />
                )}
              </>
            )}
          </div>
        </div>
      )}

      {!hasPLCharts && !hasCashflowCharts && !hasPeopleCharts && (
        <div className="bg-white rounded-lg shadow-sm p-8 text-center">
          <p className="text-gray-500">No charts enabled. Open Settings to toggle chart visibility.</p>
        </div>
      )}
    </div>
  )
}
