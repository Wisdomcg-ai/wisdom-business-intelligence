'use client'

import { useState } from 'react'
import type { FullYearReport } from '../../types'
import { getHeatmapColor } from './chart-colors'
import { fmtCurrency, getMonthLabel, ChartCard } from './chart-utils'
import { hasApprovedBudget, hasForecastBudget } from '../../utils/full-year-approved'

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

/**
 * The word this chart puts in front of a reader.
 *
 * Every cell is measured against `budget`, which on the Full Year report is the
 * FORECAST. That word is now taken: the same pack's Full Year page shows an
 * approved budget beside a forecast, so an unqualified "Budget" on this chart
 * names neither of them. Only disambiguate where there is something to
 * disambiguate from.
 *
 * Exported because the PDF draws this same chart from the same data, and the
 * pack and the tab are not allowed to name one number two ways. Before this
 * existed the tab said "Forecast Variance Heatmap" and the pack, two clicks
 * later, said "Budget Variance Heatmap" over the identical grid.
 */
export function heatmapYardstick(report: FullYearReport): 'Forecast' | 'Budget' {
  return hasApprovedBudget(report) ? 'Forecast' : 'Budget'
}

/** The heading both surfaces use. */
export function heatmapTitle(report: FullYearReport): string {
  return `${heatmapYardstick(report)} Variance Heatmap`
}

/** The one-line description both surfaces use under that heading. */
export const HEATMAP_SUBTITLE =
  'Green = favorable, Red = unfavorable variance by category and month'

/**
 * Why this chart cannot be drawn, or null when it can.
 *
 * With no forecast at all every budget is 0, the divide-by-zero guard leaves
 * every variancePct at 0, and `getHeatmapColor(0)` takes its favourable branch:
 * a full five-category × twelve-month grid of on-track green, in a client's
 * pack, computed from an absent forecast. Distinct Directions is in exactly
 * that state today. The third state is a sentence, not a grid.
 */
export function heatmapUnavailableReason(report: FullYearReport): string | null {
  if (hasForecastBudget(report)) return null
  return (
    `No forecast exists for FY${report.fiscal_year}, so there is nothing to measure these ` +
    `categories against. Every cell would read 0%, which is not the same as being on track.`
  )
}

/** The heading that sentence sits under, on both surfaces. */
export const HEATMAP_UNAVAILABLE_TITLE = 'Variance Heatmap'

interface Props {
  fullYearReport: FullYearReport
}

export default function VarianceHeatmapChart({ fullYearReport }: Props) {
  const { cells, categories, months, forecastMonths } = transformVarianceHeatmapData(fullYearReport)
  const [hoveredCell, setHoveredCell] = useState<HeatmapCell | null>(null)

  if (cells.length === 0) return null

  const yardstick = heatmapYardstick(fullYearReport)
  const unavailable = heatmapUnavailableReason(fullYearReport)

  if (unavailable) {
    return (
      <ChartCard
        title={HEATMAP_UNAVAILABLE_TITLE}
        subtitle="Not available for this month"
        tooltip="This heatmap measures each category against the forecast. With no forecast for the year there is nothing to measure against, so no cell can be computed."
      >
        <p className="text-sm text-amber-700">{unavailable}</p>
      </ChartCard>
    )
  }

  const cellWidth = 100 / (months.length + 1)

  return (
    <ChartCard
      title={heatmapTitle(fullYearReport)}
      subtitle={HEATMAP_SUBTITLE}
      tooltip={`A quick way to spot trouble. Each cell shows how far actual results are from ${yardstick.toLowerCase()} for that category and month. Green means you're on track or better, red means you're over ${yardstick.toLowerCase()}. Hover on a cell for the exact numbers.`}
    >
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
          {hoveredCell.source === 'actual' ? ' Actual' : ` ${yardstick}`} {fmtCurrency(hoveredCell.actual)} vs {yardstick} {fmtCurrency(hoveredCell.budget)}
          ({hoveredCell.variancePct >= 0 ? '+' : ''}{hoveredCell.variancePct.toFixed(1)}%)
        </div>
      )}
    </ChartCard>
  )
}
