'use client'

import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import type { WeeklyMetricsSnapshot } from '../services/weekly-metrics-service'
import type { QuarterColumn, QuarterInfo } from '../hooks/useBusinessDashboard'

interface MetricRowProps {
  label: string
  annualTarget: number
  quarterlyTarget: number
  metricKey: keyof WeeklyMetricsSnapshot
  columns: QuarterColumn[]
  currentSnapshot: WeeklyMetricsSnapshot | null
  currentQuarterInfo: QuarterInfo | null
  snapshots: WeeklyMetricsSnapshot[]
  weekPreference: 'ending' | 'beginning'
  formatValue: (value: number | undefined | null) => string
  parseValue: (value: string) => number
  isWeekEditable: (isCurrentWeek: boolean, weekDate?: string) => boolean
  updateCurrentSnapshot: (updates: Partial<WeeklyMetricsSnapshot>) => void
  updatePastSnapshot: (snapshot: WeeklyMetricsSnapshot | null, updates: Partial<WeeklyMetricsSnapshot>) => void
  toggleQuarter: (quarterKey: string) => void
  calculateQTD: (quarterSnapshots: WeeklyMetricsSnapshot[], metricKey: keyof WeeklyMetricsSnapshot) => number
  getQuarterProgress: (quarterInfo: QuarterInfo | null) => { currentWeek: number; totalWeeks: number; percentComplete: number }
  getTrendStatus: (actual: number, target: number, percentComplete: number) => 'ahead' | 'on-track' | 'behind'
  getQuarterWeeks: (quarterInfo: QuarterInfo) => string[]
  handleKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void
  inputType?: 'currency' | 'number' | 'percentage'
  placeholder?: string
}

export default function MetricRow({
  label,
  annualTarget,
  quarterlyTarget,
  metricKey,
  columns,
  currentSnapshot,
  currentQuarterInfo,
  snapshots,
  weekPreference,
  formatValue,
  parseValue,
  isWeekEditable,
  updateCurrentSnapshot,
  updatePastSnapshot,
  toggleQuarter,
  calculateQTD,
  getQuarterProgress,
  getTrendStatus,
  getQuarterWeeks,
  handleKeyDown,
  inputType = 'currency',
  placeholder = '$0'
}: MetricRowProps) {
  // Get QTD for current quarter
  const getQTDCell = () => {
    if (!currentQuarterInfo) {
      return (
        <td className="px-4 py-4 text-sm text-right sticky bg-white z-10" style={{ left: '460px', width: '120px', minWidth: '120px', maxWidth: '120px' }}></td>
      )
    }

    const quarterWeeks = getQuarterWeeks(currentQuarterInfo)
    const quarterSnapshots = quarterWeeks
      .map(date => snapshots.find(s => s.week_ending_date === date))
      .filter(Boolean) as WeeklyMetricsSnapshot[]

    const qtd = calculateQTD(quarterSnapshots, metricKey)
    const progress = getQuarterProgress(currentQuarterInfo)
    const trend = getTrendStatus(qtd, quarterlyTarget, progress.percentComplete)
    const bgColor = trend === 'ahead' ? 'bg-green-50' : trend === 'behind' ? 'bg-red-50' : 'bg-yellow-50'

    return (
      <td className={`px-4 py-4 text-sm text-right font-semibold sticky z-10 ${bgColor}`} style={{ left: '460px', width: '120px', minWidth: '120px', maxWidth: '120px' }}>
        {formatValue(qtd)}
      </td>
    )
  }

  const getTrendIcon = (trend: string) => {
    if (trend === 'ahead') return <TrendingUp className="w-3 h-3 ml-1 text-green-600" />
    if (trend === 'behind') return <TrendingDown className="w-3 h-3 ml-1 text-red-600" />
    return <Minus className="w-3 h-3 ml-1 text-yellow-600" />
  }

  const getTrendColor = (trend: string) => {
    if (trend === 'ahead') return 'bg-green-50'
    if (trend === 'behind') return 'bg-red-50'
    return 'bg-yellow-50'
  }

  return (
    <tr className="hover:bg-gray-50">
      <td className="px-6 py-4 text-sm font-medium text-gray-900 sticky left-0 bg-white z-10" style={{ width: '200px', minWidth: '200px', maxWidth: '200px' }}>
        {label}
      </td>
      <td className="px-4 py-4 text-sm text-right text-gray-600 font-semibold sticky bg-white z-10" style={{ left: '200px', width: '140px', minWidth: '140px', maxWidth: '140px' }}>
        {formatValue(annualTarget)}
      </td>
      <td className="px-4 py-4 text-sm text-right text-gray-600 font-semibold sticky bg-white z-10" style={{ left: '340px', width: '120px', minWidth: '120px', maxWidth: '120px' }}>
        {formatValue(quarterlyTarget)}
      </td>
      {getQTDCell()}
      {columns.map((col, idx) => {
        if (col.type === 'quarter-collapsed') {
          const qtd = calculateQTD(col.quarterSnapshots || [], metricKey)
          const progress = currentQuarterInfo ? getQuarterProgress(currentQuarterInfo) : { percentComplete: 0 }
          const trend = getTrendStatus(qtd, quarterlyTarget, progress.percentComplete)

          return (
            <td
              key={col.quarterKey}
              className={`px-3 py-4 text-sm text-center ${getTrendColor(trend)} cursor-pointer hover:opacity-80`}
              onClick={() => toggleQuarter(col.quarterKey!)}
            >
              <div className="flex flex-col items-center">
                <span className="text-gray-900 font-medium flex items-center">
                  {formatValue(qtd)}
                  {getTrendIcon(trend)}
                </span>
                <span className="text-xs text-gray-500">QTD</span>
              </div>
            </td>
          )
        } else if (col.type === 'quarter-header') {
          return (
            <td key={col.quarterKey} className="px-3 py-4 text-sm text-center bg-brand-orange-50 border-l-2 border-brand-orange-200"></td>
          )
        } else {
          const isEditable = isWeekEditable(col.isCurrentWeek || false, col.date)
          const value = col.isCurrentWeek
            ? currentSnapshot?.[metricKey]
            : col.snapshot?.[metricKey]

          return (
            <td key={col.date || idx} className={`px-3 py-4 text-sm text-center ${col.isCurrentWeek ? 'bg-brand-orange-50' : ''}`}>
              {isEditable ? (
                <input
                  type="text"
                  value={formatValue(value as number | undefined | null)}
                  onChange={(e) => {
                    const parsed = parseValue(e.target.value)
                    if (col.isCurrentWeek) {
                      updateCurrentSnapshot({ [metricKey]: parsed })
                    } else {
                      updatePastSnapshot(col.snapshot || null, { [metricKey]: parsed })
                    }
                  }}
                  onKeyDown={handleKeyDown}
                  className="w-full px-2 py-2 border border-gray-300 rounded-md text-sm text-center font-medium focus:outline-none focus:ring-2 focus:ring-brand-orange focus:border-transparent hover:border-brand-orange-300 transition-colors"
                  placeholder={placeholder}
                />
              ) : (
                <span className="text-gray-900 text-sm">{formatValue(value as number | undefined | null)}</span>
              )}
            </td>
          )
        }
      })}
    </tr>
  )
}
