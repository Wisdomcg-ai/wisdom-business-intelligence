'use client'

import { useState } from 'react'
import type { FullYearReport } from '../../types'
import { getHeatmapColor } from './chart-colors'
import { fmtCurrency, getMonthLabel, ChartCard } from './chart-utils'

export interface HeatmapCell {
  category: string
  month: string
  monthLabel: string
  actual: number
  budget: number
  variancePct: number
  source: 'actual' | 'forecast'
}

export function transformVarianceHeatmapData(report: FullYearReport): { cells: HeatmapCell[]; categories: string[]; months: string[]; forecastMonths: Set<string> } {
  const categories = ['Revenue', 'Cost of Sales', 'Operating Expenses', 'Other Income', 'Other Expenses']
  const months = report.gross_profit.months.map(m => m.month)
  const forecastMonths = new Set<string>()
  const cells: HeatmapCell[] = []

  // Identify which months are forecast
  for (const gpMonth of report.gross_profit.months) {
    if (gpMonth.source === 'forecast') forecastMonths.add(gpMonth.month)
  }

  for (const cat of categories) {
    const section = report.sections.find(s => s.category === cat)
    if (!section) continue

    for (let i = 0; i < months.length; i++) {
      const actual = section.subtotal.months[i]?.actual || 0
      const budget = section.subtotal.months[i]?.budget || 0
      const isExpense = ['Cost of Sales', 'Operating Expenses', 'Other Expenses'].includes(cat)
      const source = report.gross_profit.months[i]?.source || 'actual'

      let variancePct = 0
      if (budget !== 0) {
        // For revenue: positive variance is good (actual > budget)
        // For expenses: negative variance is good (actual < budget)
        variancePct = isExpense
          ? ((budget - actual) / Math.abs(budget)) * 100
          : ((actual - budget) / Math.abs(budget)) * 100
      }

      cells.push({
        category: cat,
        month: months[i],
        monthLabel: getMonthLabel(months[i]),
        actual,
        budget,
        variancePct,
        source,
      })
    }
  }

  return { cells, categories: categories.filter(c => report.sections.some(s => s.category === c)), months, forecastMonths }
}

interface Props {
  fullYearReport: FullYearReport
}

export default function VarianceHeatmapChart({ fullYearReport }: Props) {
  const { cells, categories, months, forecastMonths } = transformVarianceHeatmapData(fullYearReport)
  const [hoveredCell, setHoveredCell] = useState<HeatmapCell | null>(null)

  if (cells.length === 0) return null

  const cellWidth = 100 / (months.length + 1)

  return (
    <ChartCard title="Budget Variance Heatmap" subtitle="Green = favorable, Red = unfavorable variance by category and month" tooltip="A quick way to spot trouble. Each cell shows how far actual results are from budget for that category and month. Green means you're on track or better, red means you're over budget. Hover on a cell for the exact numbers.">
      <div className="overflow-x-auto">
        <div className="min-w-[600px]">
          {/* Header row */}
          <div className="flex">
            <div className="text-xs font-medium text-gray-500 py-1.5 px-2" style={{ width: `${cellWidth}%` }}></div>
            {months.map(m => (
              <div key={m} className={`text-xs font-medium text-center py-1.5 ${forecastMonths.has(m) ? 'text-gray-400 italic' : 'text-gray-500'}`} style={{ width: `${cellWidth}%` }}>
                {getMonthLabel(m)}{forecastMonths.has(m) ? '*' : ''}
              </div>
            ))}
          </div>

          {/* Data rows */}
          {categories.map(cat => (
            <div key={cat} className="flex">
              <div className="text-xs font-medium text-gray-700 py-2 px-2 truncate" style={{ width: `${cellWidth}%` }}>
                {cat === 'Operating Expenses' ? 'OpEx' : cat === 'Cost of Sales' ? 'COGS' : cat === 'Other Income' ? 'Other Inc' : cat === 'Other Expenses' ? 'Other Exp' : cat}
              </div>
              {months.map(m => {
                const cell = cells.find(c => c.category === cat && c.month === m)
                if (!cell) return <div key={m} style={{ width: `${cellWidth}%` }} />
                const color = getHeatmapColor(cell.variancePct)
                return (
                  <div
                    key={m}
                    className="relative py-2 px-1 text-center cursor-pointer"
                    style={{ width: `${cellWidth}%` }}
                    onMouseEnter={() => setHoveredCell(cell)}
                    onMouseLeave={() => setHoveredCell(null)}
                  >
                    <div
                      className={`rounded px-1 py-1.5 text-xs font-medium ${cell.source === 'forecast' ? 'border border-dashed border-gray-300' : ''}`}
                      style={{
                        backgroundColor: cell.source === 'forecast' ? (color.hex + '18') : (color.hex + '30'),
                        color: Math.abs(cell.variancePct) > 10 ? color.hex : '#4b5563',
                      }}
                    >
                      {cell.variancePct >= 0 ? '+' : ''}{cell.variancePct.toFixed(0)}%
                    </div>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      {forecastMonths.size > 0 && (
        <div className="mt-2 text-xs text-gray-400 italic">* Forecast months — shown with dashed borders and lighter colours</div>
      )}

      {/* Tooltip */}
      {hoveredCell && (
        <div className="mt-3 p-3 bg-gray-50 rounded-lg text-xs">
          <span className="font-semibold">{hoveredCell.category}</span> — {hoveredCell.monthLabel}
          {hoveredCell.source === 'forecast' && <span className="ml-1 text-gray-400">(Forecast)</span>}:
          {hoveredCell.source === 'actual' ? ' Actual' : ' Budget'} {fmtCurrency(hoveredCell.actual)} vs Budget {fmtCurrency(hoveredCell.budget)}
          ({hoveredCell.variancePct >= 0 ? '+' : ''}{hoveredCell.variancePct.toFixed(1)}%)
        </div>
      )}
    </ChartCard>
  )
}
