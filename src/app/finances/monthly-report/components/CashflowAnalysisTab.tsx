'use client'

import Link from 'next/link'
import { Loader2, DollarSign, Settings, RefreshCw, ArrowRight } from 'lucide-react'
import {
  BarChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ComposedChart,
} from 'recharts'
import type { CashflowReportData, CashflowKPI } from '../types'

interface CashflowAnalysisTabProps {
  data: CashflowReportData | null
  isLoading: boolean
  error: string | null
  needsReconnect?: boolean
  onOpenSettings?: () => void
  onRetry?: () => void
  onReconnectXero?: () => void
}

function fmt(value: number): string {
  const abs = Math.abs(value)
  const formatted = abs.toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
  return value < 0 ? `-$${formatted}` : `$${formatted}`
}

function varianceColor(variance: number): string {
  if (variance === 0) return ''
  return variance > 0 ? 'text-green-700' : 'text-red-600'
}

function statusColor(status: CashflowKPI['status']): {
  border: string
  dot: string
  bg: string
} {
  switch (status) {
    case 'good':
      return { border: 'border-l-green-500', dot: 'bg-green-500', bg: 'bg-green-50' }
    case 'warning':
      return { border: 'border-l-amber-500', dot: 'bg-amber-500', bg: 'bg-amber-50' }
    case 'critical':
      return { border: 'border-l-red-500', dot: 'bg-red-500', bg: 'bg-red-50' }
  }
}

export default function CashflowAnalysisTab({ data, isLoading, error, needsReconnect, onOpenSettings, onRetry, onReconnectXero }: CashflowAnalysisTabProps) {
  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow-sm p-8 text-center">
        <Loader2 className="w-8 h-8 animate-spin text-brand-orange mx-auto mb-3" />
        <p className="text-sm text-gray-600">Loading cashflow analysis...</p>
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

  if (needsReconnect) {
    return (
      <div className="bg-white rounded-lg shadow-sm p-8 text-center">
        <RefreshCw className="w-12 h-12 text-amber-400 mx-auto mb-3" />
        <h3 className="text-lg font-medium text-gray-900">Reconnect Xero for Cashflow</h3>
        <p className="text-sm text-gray-500 mt-1 max-w-md mx-auto">
          Cashflow analysis requires an updated Xero connection with finance permissions.
          Disconnect and reconnect Xero to grant the required access.
        </p>
        {onReconnectXero && (
          <button
            onClick={onReconnectXero}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-brand-orange hover:bg-brand-orange-600 rounded-lg transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Reconnect Xero
          </button>
        )}
      </div>
    )
  }

  if (!data || data.sections.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-sm p-8 text-center">
        <DollarSign className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <h3 className="text-lg font-medium text-gray-900">Cashflow Analysis</h3>
        <p className="text-sm text-gray-500 mt-1 max-w-md mx-auto">
          Connect Xero and generate a report to see your cashflow analysis. This uses
          the Cash Flow Statement from Xero to show where cash is coming from and going.
        </p>
        <div className="mt-4 flex items-center justify-center gap-3">
          {onRetry && (
            <button
              onClick={onRetry}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-brand-orange hover:bg-brand-orange-600 rounded-lg transition-colors"
            >
              Retry
            </button>
          )}
          {onOpenSettings && (
            <button
              onClick={onOpenSettings}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-brand-navy hover:bg-brand-navy-800 rounded-lg transition-colors"
            >
              <Settings className="w-4 h-4" />
              Open Settings
            </button>
          )}
        </div>
      </div>
    )
  }

  const hasBudget = data.sections.some(s =>
    s.subtotal.budget !== 0 || s.lines.some(l => l.budget !== 0)
  )

  return (
    <div className="space-y-6">
      {/* Link to Forecast Cashflow Tab */}
      <Link
        href="/finances/cashflow"
        className="block bg-gradient-to-r from-brand-navy to-brand-navy-800 rounded-lg p-4 text-white hover:from-brand-navy-800 hover:to-brand-navy-900 transition-all group"
      >
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold">Cashflow Forecast Available</h3>
            <p className="text-xs text-white/80 mt-0.5">
              See your month-by-month cash budget with DSO/DPO timing, GST, and BAS payments in the Forecast module.
            </p>
          </div>
          <ArrowRight className="w-5 h-5 text-white/80 group-hover:translate-x-1 transition-transform" />
        </div>
      </Link>

      {/* KPI Cards */}
      {data.kpis.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {data.kpis.map((kpi) => {
            const colors = statusColor(kpi.status)
            return (
              <div
                key={kpi.label}
                className={`bg-white rounded-lg shadow-sm border-l-4 ${colors.border} p-4`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className={`w-2 h-2 rounded-full ${colors.dot}`} />
                  <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                    {kpi.label}
                  </span>
                </div>
                <div className="text-2xl font-bold text-gray-900 mb-1">
                  {kpi.value}
                </div>
                <p className="text-xs text-gray-500">{kpi.description}</p>
              </div>
            )
          })}
        </div>
      )}

      {/* Cashflow Statement Table */}
      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-brand-navy text-white text-xs">
                <th className="px-4 py-3 text-left font-semibold">Category</th>
                <th className="px-4 py-3 text-right font-semibold">Actual</th>
                {hasBudget && (
                  <>
                    <th className="px-4 py-3 text-right font-semibold">Budget</th>
                    <th className="px-4 py-3 text-right font-semibold">Variance</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {data.sections.map((section, sIdx) => (
                <SectionRows
                  key={sIdx}
                  section={section}
                  hasBudget={hasBudget}
                />
              ))}

              {/* Net Cash Movement */}
              <tr className="bg-brand-navy text-white font-semibold">
                <td className="px-4 py-3 text-sm">{data.net_cash_movement.label}</td>
                <td className="px-4 py-3 text-sm text-right">{fmt(data.net_cash_movement.actual)}</td>
                {hasBudget && (
                  <>
                    <td className="px-4 py-3 text-sm text-right">{fmt(data.net_cash_movement.budget)}</td>
                    <td className="px-4 py-3 text-sm text-right">{fmt(data.net_cash_movement.variance)}</td>
                  </>
                )}
              </tr>

              {/* Opening Balance */}
              <tr className="border-b border-gray-100">
                <td className="px-4 py-2 text-sm text-gray-600">Opening Cash Balance</td>
                <td className="px-4 py-2 text-sm text-right text-gray-600">{fmt(data.opening_balance)}</td>
                {hasBudget && (
                  <>
                    <td className="px-4 py-2 text-sm text-right text-gray-400">—</td>
                    <td className="px-4 py-2 text-sm text-right text-gray-400">—</td>
                  </>
                )}
              </tr>

              {/* Closing Balance */}
              <tr className="bg-gray-100 font-semibold">
                <td className="px-4 py-3 text-sm text-gray-900">Closing Cash Balance</td>
                <td className="px-4 py-3 text-sm text-right text-gray-900">{fmt(data.closing_balance)}</td>
                {hasBudget && (
                  <>
                    <td className="px-4 py-3 text-sm text-right text-gray-400">—</td>
                    <td className="px-4 py-3 text-sm text-right text-gray-400">—</td>
                  </>
                )}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* 6-Month Cash Position Trend */}
      {data.trend.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Cash Position — 6 Month Trend</h3>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data.trend} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis
                  dataKey="monthLabel"
                  tick={{ fontSize: 12, fill: '#6b7280' }}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#6b7280' }}
                  tickFormatter={(v: number) => {
                    if (Math.abs(v) >= 1000000) return `$${(v / 1000000).toFixed(1)}M`
                    if (Math.abs(v) >= 1000) return `$${(v / 1000).toFixed(0)}K`
                    return `$${v}`
                  }}
                />
                <Tooltip
                  formatter={(value: number, name: string) => [
                    fmt(value),
                    name,
                  ]}
                  labelStyle={{ fontWeight: 'bold' }}
                />
                <Legend />
                <Bar
                  dataKey="operating"
                  name="Operating"
                  fill="#3b82f6"
                  stackId="cashflow"
                  radius={[0, 0, 0, 0]}
                />
                <Bar
                  dataKey="investing"
                  name="Investing"
                  fill="#f59e0b"
                  stackId="cashflow"
                  radius={[0, 0, 0, 0]}
                />
                <Bar
                  dataKey="financing"
                  name="Financing"
                  fill="#9ca3af"
                  stackId="cashflow"
                  radius={[2, 2, 0, 0]}
                />
                <Line
                  type="monotone"
                  dataKey="closing_balance"
                  name="Closing Balance"
                  stroke="#1e293b"
                  strokeWidth={2}
                  dot={{ r: 4, fill: '#1e293b' }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Info note */}
      <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
        <p className="text-xs text-blue-800">
          Cashflow data sourced from Xero Cash Flow Statement (direct method).
          {hasBudget
            ? ' Budget derived from your P&L forecast — Investing & Financing budgets are not available from P&L data.'
            : ' Connect a budget forecast to see budget comparison.'}
        </p>
      </div>
    </div>
  )
}

/** Renders the rows for a single cashflow section (Operating, Investing, or Financing) */
function SectionRows({
  section,
  hasBudget,
}: {
  section: CashflowReportData['sections'][0]
  hasBudget: boolean
}) {
  return (
    <>
      {/* Section header */}
      <tr className="bg-amber-50">
        <td colSpan={hasBudget ? 4 : 2} className="px-4 py-2 text-sm font-semibold text-amber-900">
          {section.title}
        </td>
      </tr>

      {/* Detail lines */}
      {section.lines.map((line, idx) => (
        <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50">
          <td className="px-4 py-2 text-sm text-gray-700 pl-8">{line.label}</td>
          <td className="px-4 py-2 text-sm text-right font-medium text-gray-900">{fmt(line.actual)}</td>
          {hasBudget && (
            <>
              <td className="px-4 py-2 text-sm text-right text-gray-600">
                {line.budget !== 0 ? fmt(line.budget) : '—'}
              </td>
              <td className={`px-4 py-2 text-sm text-right ${line.budget !== 0 ? varianceColor(line.variance) : 'text-gray-400'}`}>
                {line.budget !== 0 ? fmt(line.variance) : '—'}
              </td>
            </>
          )}
        </tr>
      ))}

      {/* Section subtotal */}
      <tr className="bg-amber-50/50 border-b border-amber-200">
        <td className="px-4 py-2 text-sm font-semibold text-gray-900">{section.subtotal.label}</td>
        <td className="px-4 py-2 text-sm text-right font-semibold text-gray-900">{fmt(section.subtotal.actual)}</td>
        {hasBudget && (
          <>
            <td className="px-4 py-2 text-sm text-right font-semibold text-gray-600">
              {section.subtotal.budget !== 0 ? fmt(section.subtotal.budget) : '—'}
            </td>
            <td className={`px-4 py-2 text-sm text-right font-semibold ${section.subtotal.budget !== 0 ? varianceColor(section.subtotal.variance) : 'text-gray-400'}`}>
              {section.subtotal.budget !== 0 ? fmt(section.subtotal.variance) : '—'}
            </td>
          </>
        )}
      </tr>
    </>
  )
}
