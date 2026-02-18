'use client'

import { useState } from 'react'
import { Settings, RefreshCw, AlertTriangle, Loader2, DollarSign } from 'lucide-react'
import type { PLLine, FinancialForecast } from '../types'
import { useCashflowForecast } from '../hooks/useCashflowForecast'
import CashflowForecastTable from './CashflowForecastTable'
import CashflowAssumptionsPanel from './CashflowAssumptionsPanel'

interface CashflowForecastTabProps {
  forecast: FinancialForecast
  plLines: PLLine[]
  businessId: string
  hasXeroConnection: boolean
}

export default function CashflowForecastTab({
  forecast,
  plLines,
  businessId,
  hasXeroConnection,
}: CashflowForecastTabProps) {
  const [showSettings, setShowSettings] = useState(false)

  const {
    data,
    assumptions,
    isLoading,
    isSyncing,
    saveAssumptions,
    syncFromXero,
    updateAssumption,
  } = useCashflowForecast({ forecast, plLines, businessId })

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow-sm p-8 text-center">
        <Loader2 className="w-8 h-8 animate-spin text-brand-orange mx-auto mb-3" />
        <p className="text-sm text-gray-600">Loading cashflow forecast...</p>
      </div>
    )
  }

  if (!data || plLines.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-sm p-8 text-center">
        <DollarSign className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <h3 className="text-lg font-medium text-gray-900">Cashflow Forecast</h3>
        <p className="text-sm text-gray-500 mt-1 max-w-md mx-auto">
          Complete your P&L forecast first, then switch to this tab to see your cash position month by month.
          {!hasXeroConnection && ' Connect Xero to auto-populate opening balances.'}
        </p>
        <div className="mt-4 flex items-center justify-center gap-3">
          <button
            onClick={() => setShowSettings(true)}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-brand-navy hover:bg-brand-navy-800 rounded-lg transition-colors"
          >
            <Settings className="w-4 h-4" />
            Configure Settings
          </button>
        </div>

        <CashflowAssumptionsPanel
          assumptions={assumptions}
          isOpen={showSettings}
          isSyncing={isSyncing}
          onClose={() => setShowSettings(false)}
          onUpdate={updateAssumption}
          onSave={saveAssumptions}
          onSyncFromXero={syncFromXero}
        />
      </div>
    )
  }

  const bankGoesNegative = data.lowest_bank_balance < 0

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {bankGoesNegative && (
            <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
              <AlertTriangle className="w-4 h-4 text-red-500" />
              <span className="text-sm font-medium text-red-800">
                Bank balance goes negative in {data.months.find(m => m.bank_at_end < 0)?.monthLabel || data.lowest_bank_month}
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {hasXeroConnection && (
            <button
              onClick={syncFromXero}
              disabled={isSyncing}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              Sync Balances
            </button>
          )}
          <button
            onClick={() => setShowSettings(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Settings className="w-3.5 h-3.5" />
            Settings
          </button>
        </div>
      </div>

      {/* Cashflow Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <SummaryCard
          label="Opening Balance"
          value={data.months[0]?.bank_at_beginning || 0}
        />
        <SummaryCard
          label="Closing Balance"
          value={data.months[data.months.length - 1]?.bank_at_end || 0}
          negative={data.months[data.months.length - 1]?.bank_at_end < 0}
        />
        <SummaryCard
          label="Total Inflows"
          value={data.totals.cash_inflows + data.totals.other_inflows}
        />
        <SummaryCard
          label="Total Outflows"
          value={data.totals.cash_outflows + Math.abs(data.totals.movement_in_liabilities)}
          negative
        />
      </div>

      {/* Main Table */}
      <CashflowForecastTable data={data} />

      {/* Footer Info */}
      <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
        <p className="text-xs text-blue-800">
          Cashflow forecast converts your accrual P&L into cash timing.
          DSO {assumptions.dso_days} days | DPO {assumptions.dpo_days} days
          {assumptions.gst_registered && ` | GST ${assumptions.gst_reporting_frequency}`}
          {assumptions.balance_date && ` | Balances from ${assumptions.balance_date}`}
        </p>
      </div>

      {/* Settings Panel (slide-out) */}
      <CashflowAssumptionsPanel
        assumptions={assumptions}
        isOpen={showSettings}
        isSyncing={isSyncing}
        onClose={() => setShowSettings(false)}
        onUpdate={updateAssumption}
        onSave={saveAssumptions}
        onSyncFromXero={syncFromXero}
      />
    </div>
  )
}

function SummaryCard({ label, value, negative }: {
  label: string
  value: number
  negative?: boolean
}) {
  const formatted = Math.abs(value).toLocaleString('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })
  const display = value < 0 ? `-${formatted}` : formatted

  return (
    <div className="bg-white rounded-lg shadow-sm p-3 border border-gray-100">
      <p className="text-xs text-gray-500 font-medium">{label}</p>
      <p className={`text-lg font-bold mt-1 ${value < 0 || negative ? 'text-red-600' : 'text-gray-900'}`}>
        {display}
      </p>
    </div>
  )
}
