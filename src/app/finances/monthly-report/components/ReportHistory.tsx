'use client'

import { useState, useEffect } from 'react'
import { Clock, FileText, Download, CheckCircle } from 'lucide-react'
import type { ReportSnapshot, ReportSummary } from '../types'

interface ReportHistoryProps {
  businessId: string
  onLoadSnapshot: (reportMonth: string) => void
}

function fmt(value: number): string {
  const abs = Math.abs(value)
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `$${(value / 1_000).toFixed(1)}k`
  return `$${value.toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

export default function ReportHistory({ businessId, onLoadSnapshot }: ReportHistoryProps) {
  const [snapshots, setSnapshots] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/monthly-report/snapshot?business_id=${businessId}`)
        const data = await res.json()
        setSnapshots(data.snapshots || [])
      } catch (err) {
        console.error('[ReportHistory] Error loading snapshots:', err)
      } finally {
        setIsLoading(false)
      }
    }
    if (businessId) load()
  }, [businessId])

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow-sm p-8 text-center">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-48 mx-auto mb-4" />
          <div className="h-4 bg-gray-200 rounded w-64 mx-auto" />
        </div>
      </div>
    )
  }

  if (snapshots.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-sm p-8 text-center">
        <Clock className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <h3 className="text-lg font-medium text-gray-900">No Report History</h3>
        <p className="text-sm text-gray-500 mt-1">
          Generated reports will appear here. Go to the Report tab to generate your first report.
        </p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-200">
        <h3 className="text-sm font-semibold text-gray-900">Report History</h3>
      </div>
      <div className="divide-y divide-gray-100">
        {snapshots.map((snapshot: any) => {
          const monthDate = new Date(snapshot.report_month + '-01')
          const monthLabel = monthDate.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })
          const summary: ReportSummary | null = snapshot.summary
          const generatedDate = snapshot.generated_at
            ? new Date(snapshot.generated_at).toLocaleDateString('en-AU', {
                day: 'numeric', month: 'short', year: 'numeric',
                hour: '2-digit', minute: '2-digit',
              })
            : null

          return (
            <div
              key={snapshot.id}
              className="px-4 py-3 flex items-center justify-between hover:bg-gray-50 cursor-pointer"
              onClick={() => onLoadSnapshot(snapshot.report_month)}
            >
              <div className="flex items-center gap-3">
                <FileText className="w-5 h-5 text-gray-400" />
                <div>
                  <p className="text-sm font-medium text-gray-900">{monthLabel}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${
                      snapshot.status === 'final'
                        ? 'bg-green-50 text-green-700'
                        : 'bg-amber-50 text-amber-700'
                    }`}>
                      {snapshot.status === 'final' ? (
                        <><CheckCircle className="w-3 h-3 mr-0.5" /> Final</>
                      ) : (
                        'Draft'
                      )}
                    </span>
                    {generatedDate && (
                      <span className="text-xs text-gray-500">{generatedDate}</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4 text-right">
                {summary && (
                  <div className="text-xs text-gray-500">
                    <div>Revenue: {fmt(summary.revenue.actual)}</div>
                    <div>Net Profit: {fmt(summary.net_profit.actual)}</div>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
