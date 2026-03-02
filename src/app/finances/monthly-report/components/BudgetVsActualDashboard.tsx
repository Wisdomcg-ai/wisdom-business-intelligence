'use client'

import type { GeneratedReport, VarianceCommentary, ReportTab } from '../types'
import ReportSummaryCards from './ReportSummaryCards'
import BudgetVsActualTable from './BudgetVsActualTable'

interface BudgetVsActualDashboardProps {
  report: GeneratedReport
  commentary?: VarianceCommentary
  commentaryLoading?: boolean
  onCommentaryChange?: (accountName: string, text: string) => void
  onTabChange?: (tab: ReportTab) => void
}

export default function BudgetVsActualDashboard({ report, commentary, commentaryLoading, onCommentaryChange, onTabChange }: BudgetVsActualDashboardProps) {
  return (
    <div>
      {report.budget_forecast_name && (
        <p className="text-xs text-gray-500 mb-4">
          Comparing to budget: <span className="font-medium text-gray-700">{report.budget_forecast_name}</span>
        </p>
      )}

      <ReportSummaryCards
        summary={report.summary}
        hasBudget={report.has_budget}
      />

      <BudgetVsActualTable
        report={report}
        commentary={commentary}
        commentaryLoading={commentaryLoading}
        onCommentaryChange={onCommentaryChange}
        onTabChange={onTabChange}
      />
    </div>
  )
}
