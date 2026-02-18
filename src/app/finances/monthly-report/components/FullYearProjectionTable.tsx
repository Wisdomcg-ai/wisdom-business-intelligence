'use client'

import React from 'react'
import type { FullYearReport, FullYearLine, FullYearSection } from '../types'

interface FullYearProjectionTableProps {
  report: FullYearReport
}

function fmt(value: number): string {
  const abs = Math.abs(value)
  const formatted = abs.toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
  return value < 0 ? `-$${formatted}` : `$${formatted}`
}

function fmtPct(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`
}

function getMonthLabel(monthKey: string): string {
  const date = new Date(monthKey + '-01')
  return date.toLocaleDateString('en-AU', { month: 'short' })
}

const sectionStyles: Record<string, { header: string; subtotalBg: string; subtotalText: string }> = {
  'Revenue': { header: 'bg-green-50 text-green-800', subtotalBg: 'bg-green-50', subtotalText: 'text-green-800' },
  'Cost of Sales': { header: 'bg-red-50 text-red-800', subtotalBg: 'bg-red-50', subtotalText: 'text-red-800' },
  'Operating Expenses': { header: 'bg-amber-50 text-amber-800', subtotalBg: 'bg-amber-50', subtotalText: 'text-amber-800' },
  'Other Income': { header: 'bg-blue-50 text-blue-800', subtotalBg: 'bg-blue-50', subtotalText: 'text-blue-800' },
  'Other Expenses': { header: 'bg-gray-100 text-gray-800', subtotalBg: 'bg-gray-100', subtotalText: 'text-gray-800' },
}

function MonthCell({ value, source }: { value: number; source: 'actual' | 'forecast' }) {
  const isForecast = source === 'forecast'
  return (
    <td
      className={`px-2 py-2 text-xs text-right whitespace-nowrap ${
        isForecast ? 'italic bg-gray-50 text-gray-500' : 'text-gray-900'
      }`}
    >
      {fmt(value)}
    </td>
  )
}

function LineRow({ line, lastActualMonth }: { line: FullYearLine; lastActualMonth: string }) {
  return (
    <tr className="border-b border-gray-100 hover:bg-gray-50">
      <td className="px-3 py-2 text-sm text-gray-900 whitespace-nowrap sticky left-0 bg-white z-10 min-w-[180px]">
        {line.account_name}
      </td>
      {line.months.map((md) => (
        <MonthCell
          key={md.month}
          value={md.source === 'actual' ? md.actual : md.budget}
          source={md.source}
        />
      ))}
      <td className="px-2 py-2 text-xs text-right font-semibold text-gray-900 whitespace-nowrap">
        {fmt(line.projected_total)}
      </td>
      <td className="px-2 py-2 text-xs text-right text-gray-600 whitespace-nowrap">
        {fmt(line.annual_budget)}
      </td>
      <td className={`px-2 py-2 text-xs text-right whitespace-nowrap ${
        line.variance_amount >= 0 ? 'text-green-700' : 'text-red-600'
      }`}>
        {fmt(line.variance_amount)}
      </td>
      <td className={`px-2 py-2 text-xs text-right whitespace-nowrap ${
        line.variance_amount >= 0 ? 'text-green-700' : 'text-red-600'
      }`}>
        {fmtPct(line.variance_percent)}
      </td>
    </tr>
  )
}

function SubtotalRow({
  line,
  bgClass,
  textClass,
}: {
  line: FullYearLine
  bgClass: string
  textClass: string
}) {
  return (
    <tr className={`${bgClass} font-semibold`}>
      <td className={`px-3 py-2 text-sm ${textClass} sticky left-0 z-10 ${bgClass}`}>
        {line.account_name}
      </td>
      {line.months.map((md) => (
        <td key={md.month} className={`px-2 py-2 text-xs text-right ${textClass} whitespace-nowrap`}>
          {fmt(md.source === 'actual' ? md.actual : md.budget)}
        </td>
      ))}
      <td className={`px-2 py-2 text-xs text-right ${textClass} whitespace-nowrap`}>
        {fmt(line.projected_total)}
      </td>
      <td className={`px-2 py-2 text-xs text-right ${textClass} whitespace-nowrap`}>
        {fmt(line.annual_budget)}
      </td>
      <td className={`px-2 py-2 text-xs text-right ${textClass} whitespace-nowrap`}>
        {fmt(line.variance_amount)}
      </td>
      <td className={`px-2 py-2 text-xs text-right ${textClass} whitespace-nowrap`}>
        {fmtPct(line.variance_percent)}
      </td>
    </tr>
  )
}

export default function FullYearProjectionTable({ report }: FullYearProjectionTableProps) {
  const monthHeaders = report.sections[0]?.lines[0]?.months.map(m => m.month) ||
    report.gross_profit.months.map(m => m.month)

  const colCount = 1 + monthHeaders.length + 4 // account + months + projected + annual + var$ + var%

  return (
    <div className="bg-white rounded-lg shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Full Year Projection — FY{report.fiscal_year}</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Actuals through {getMonthLabel(report.last_actual_month)} {report.last_actual_month.split('-')[0]}, then budget forecast
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-500">
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded bg-white border border-gray-300" />
            Actual
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded bg-gray-100 border border-gray-300 italic" />
            Forecast
          </span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1200px]">
          <thead>
            <tr className="bg-brand-navy text-white text-xs">
              <th className="px-3 py-3 text-left font-semibold sticky left-0 bg-brand-navy z-10 min-w-[180px]">Account</th>
              {monthHeaders.map(m => (
                <th key={m} className="px-2 py-3 text-right font-semibold whitespace-nowrap">
                  {getMonthLabel(m)}
                </th>
              ))}
              <th className="px-2 py-3 text-right font-semibold whitespace-nowrap">Projected</th>
              <th className="px-2 py-3 text-right font-semibold whitespace-nowrap">Budget</th>
              <th className="px-2 py-3 text-right font-semibold whitespace-nowrap">Var ($)</th>
              <th className="px-2 py-3 text-right font-semibold whitespace-nowrap">Var (%)</th>
            </tr>
          </thead>
          <tbody>
            {report.sections.map((section) => {
              const style = sectionStyles[section.category] || sectionStyles['Operating Expenses']

              return (
                <React.Fragment key={section.category}>
                  {/* Section header */}
                  <tr className={style.header}>
                    <td colSpan={colCount} className="px-3 py-2 text-sm font-bold">
                      {section.category}
                    </td>
                  </tr>
                  {/* Lines */}
                  {section.lines.map((line, idx) => (
                    <LineRow
                      key={`${section.category}-${idx}`}
                      line={line}
                      lastActualMonth={report.last_actual_month}
                    />
                  ))}
                  {/* Subtotal */}
                  <SubtotalRow
                    line={section.subtotal}
                    bgClass={style.subtotalBg}
                    textClass={style.subtotalText}
                  />

                  {/* Gross Profit after Cost of Sales */}
                  {section.category === 'Cost of Sales' && (
                    <SubtotalRow
                      line={report.gross_profit}
                      bgClass="bg-blue-50"
                      textClass="text-blue-900"
                    />
                  )}
                </React.Fragment>
              )
            })}

            {/* Net Profit */}
            <SubtotalRow
              line={report.net_profit}
              bgClass="bg-brand-navy"
              textClass="text-white"
            />
          </tbody>
        </table>
      </div>
    </div>
  )
}
