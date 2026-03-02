'use client'

import { useState } from 'react'
import { Loader2, DollarSign, Table2, BarChart3 } from 'lucide-react'
import type { CashflowForecastData } from '@/app/finances/forecast/types'
import CashflowForecastTable from '@/app/finances/forecast/components/CashflowForecastTable'
import CashflowForecastChart from '@/app/finances/forecast/components/CashflowForecastChart'

interface CashflowTabProps {
  data: CashflowForecastData | null
  isLoading: boolean
  error?: string | null
}

export default function CashflowTab({ data, isLoading, error }: CashflowTabProps) {
  const [viewMode, setViewMode] = useState<'table' | 'chart'>('table')

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow-sm p-8 text-center">
        <Loader2 className="w-8 h-8 animate-spin text-brand-orange mx-auto mb-3" />
        <p className="text-sm text-gray-600">Loading cashflow forecast...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="mb-6 p-4 bg-red-50 rounded-lg border border-red-200">
        <p className="text-sm text-red-800">{error}</p>
      </div>
    )
  }

  if (!data || data.months.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-sm p-8 text-center">
        <DollarSign className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <h3 className="text-lg font-medium text-gray-900">Cashflow Forecast</h3>
        <p className="text-sm text-gray-500 mt-1 max-w-md mx-auto">
          Set up a financial forecast with P&L lines to see your cashflow projection here.
        </p>
      </div>
    )
  }

  return (
    <div>
      {/* View mode toggle */}
      <div className="flex justify-end mb-4">
        <div className="inline-flex rounded-lg border border-gray-200 bg-white">
          <button
            onClick={() => setViewMode('table')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-l-lg transition-colors ${
              viewMode === 'table' ? 'bg-brand-orange text-white' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Table2 className="w-4 h-4" />
            Table
          </button>
          <button
            onClick={() => setViewMode('chart')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-r-lg transition-colors ${
              viewMode === 'chart' ? 'bg-brand-orange text-white' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            Chart
          </button>
        </div>
      </div>

      {viewMode === 'table' ? (
        <CashflowForecastTable data={data} />
      ) : (
        <CashflowForecastChart data={data} />
      )}
    </div>
  )
}
