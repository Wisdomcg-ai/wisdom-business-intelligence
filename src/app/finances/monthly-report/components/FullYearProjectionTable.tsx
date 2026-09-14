'use client'

import React from 'react'
import type { FullYearReport, FullYearLine, FullYearSection } from '../types'
import {
  hasApprovedBudget,
  formatApprovedAnnual,
  hasForecastBudget,
  formatForecastValue,
  VALUE_ABSENT,
} from '../utils/full-year-approved'
import {
  fullYearBasis,
  fullYearBasisNote,
  fullYearCell,
  fullYearProjected,
  fullYearVariance,
  deriveFullYearOperatingProfit,
  type FullYearBasis,
} from '../utils/full-year-basis'
import { groupFullYearLines } from '@/lib/monthly-report/full-year-groups'
import { withoutSilentFullYearLines } from '@/lib/monthly-report/empty-lines'

interface FullYearProjectionTableProps {
  report: FullYearReport
  /**
   * The coach's expense heading order, from the monthly report's settings —
   * the same value the Actual vs Budget tab groups with. Falls back to the copy
   * on the full-year payload, then to A-Z.
   */
  expenseGroupOrder?: readonly string[] | null
  /**
   * The client's budget_source setting, so a budget-store client whose approved
   * budget did not resolve is told the months are the forecast — the sentence
   * the pack prints on the same page.
   */
  budgetSource?: string | null
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

function MonthCell({
  value,
  source,
  hasFigure,
}: {
  value: number
  source: 'actual' | 'forecast'
  /** Is there anything behind an unclosed month on this basis? */
  hasFigure: boolean
}) {
  const isForecast = source === 'forecast'
  return (
    <td
      className={`px-2 py-2 text-xs text-right whitespace-nowrap ${
        isForecast ? 'italic bg-gray-50 text-gray-500' : 'text-gray-900'
      }`}
    >
      {/* A month that has not closed is a budget or forecast cell; with
          nothing behind it there is no figure, and 0 would read as "we expect
          nothing". Closed months are actuals and are unaffected. */}
      {isForecast ? formatForecastValue(value, hasFigure, fmt) : fmt(value)}
    </td>
  )
}

/**
 * What the page shows for a line, on the basis the pack uses.
 *
 * The months and Projected are the pack's own (full-year-basis): for a client
 * on the budget store the unclosed months are the APPROVED budget, where this
 * tab used to print the wizard forecast — Urban Road's September wages read
 * 76,182 here and 42,015 in the PDF Matt was about to send. The variance is
 * measured against the same basis, so it is never a variance to one yardstick
 * beside months from another.
 */
interface Basis {
  basis: FullYearBasis
  /** Is there a figure behind the unclosed months and the variance? */
  hasFigure: boolean
}

function variance(line: FullYearLine, b: Basis) {
  const v = fullYearVariance(line, b.basis)
  return {
    amount: formatForecastValue(v.amount, b.hasFigure, fmt),
    // Null, not 0.0%: a percentage of nothing is not "on budget".
    percent: b.hasFigure && v.percent !== null ? fmtPct(v.percent) : VALUE_ABSENT,
    tone: !b.hasFigure ? 'text-gray-400' : v.amount >= 0 ? 'text-green-700' : 'text-red-600',
  }
}

function LineRow({
  line,
  showApproved,
  hasForecast,
  b,
}: {
  line: FullYearLine
  showApproved: boolean
  hasForecast: boolean
  b: Basis
}) {
  const v = variance(line, b)
  return (
    <tr className="border-b border-gray-100 hover:bg-gray-50">
      <td className="px-3 py-2 text-sm text-gray-900 whitespace-nowrap sticky left-0 bg-white z-10 min-w-[180px]">
        {line.account_name}
      </td>
      {line.months.map((md) => (
        <MonthCell
          key={md.month}
          value={fullYearCell(md, b.basis)}
          source={md.source}
          hasFigure={b.hasFigure}
        />
      ))}
      <td className="px-2 py-2 text-xs text-right font-semibold text-gray-900 whitespace-nowrap">
        {fmt(fullYearProjected(line, b.basis))}
      </td>
      {showApproved && (
        <td className="px-2 py-2 text-xs text-right text-gray-900 font-medium bg-slate-50 whitespace-nowrap">
          {formatApprovedAnnual(line, fmt)}
        </td>
      )}
      <td className="px-2 py-2 text-xs text-right text-gray-600 whitespace-nowrap">
        {formatForecastValue(line.annual_budget, hasForecast, fmt)}
      </td>
      {/*
        With nothing to be a variance TO, a number comes out as the whole
        projection in green, because beating a budget of nothing is always
        favourable — so the tint goes with the number, not just the number.
      */}
      <td className={`px-2 py-2 text-xs text-right whitespace-nowrap ${v.tone}`}>{v.amount}</td>
      <td className={`px-2 py-2 text-xs text-right whitespace-nowrap ${v.tone}`}>{v.percent}</td>
    </tr>
  )
}

function SubtotalRow({
  line,
  label,
  bgClass,
  textClass,
  showApproved,
  hasForecast,
  b,
}: {
  line: FullYearLine
  /** Defaults to the line's own name; a group subtotal says "Total <group>". */
  label?: string
  bgClass: string
  textClass: string
  showApproved: boolean
  hasForecast: boolean
  b: Basis
}) {
  const v = variance(line, b)
  return (
    <tr className={`${bgClass} font-semibold`}>
      <td className={`px-3 py-2 text-sm ${textClass} sticky left-0 z-10 ${bgClass}`}>
        {label ?? line.account_name}
      </td>
      {line.months.map((md) => (
        <td key={md.month} className={`px-2 py-2 text-xs text-right ${textClass} whitespace-nowrap`}>
          {md.source === 'actual'
            ? fmt(md.actual)
            : formatForecastValue(fullYearCell(md, b.basis), b.hasFigure, fmt)}
        </td>
      ))}
      <td className={`px-2 py-2 text-xs text-right ${textClass} whitespace-nowrap`}>
        {fmt(fullYearProjected(line, b.basis))}
      </td>
      {showApproved && (
        <td className={`px-2 py-2 text-xs text-right ${textClass} whitespace-nowrap`}>
          {formatApprovedAnnual(line, fmt)}
        </td>
      )}
      <td className={`px-2 py-2 text-xs text-right ${textClass} whitespace-nowrap`}>
        {formatForecastValue(line.annual_budget, hasForecast, fmt)}
      </td>
      <td className={`px-2 py-2 text-xs text-right ${textClass} whitespace-nowrap`}>{v.amount}</td>
      <td className={`px-2 py-2 text-xs text-right ${textClass} whitespace-nowrap`}>{v.percent}</td>
    </tr>
  )
}

export default function FullYearProjectionTable({ report, expenseGroupOrder, budgetSource }: FullYearProjectionTableProps) {
  const monthHeaders = report.sections[0]?.lines[0]?.months.map(m => m.month) ||
    report.gross_profit.months.map(m => m.month)

  // Only when the budget store actually answered. An approved column that is
  // present but empty is worse than no column: a reader fills a blank budget
  // cell in as zero, and then reads the whole page as a rout.
  const showApproved = hasApprovedBudget(report)

  // The other half of the same question. There are three states per column,
  // not two: a value, a real zero, and "there is nothing here to compute it
  // from". The forecast columns fall into the third whenever no active
  // forecast exists for the year, and the note below says so — dashes with no
  // explanation get one supplied by the reader.
  const hasForecast = hasForecastBudget(report)

  // The pack's basis, so this tab and the page the client receives print the
  // same months and the same Projected Total.
  const basis = fullYearBasis(report)
  const onApproved = basis === 'approved_budget'
  const b: Basis = { basis, hasFigure: onApproved || hasForecast }
  // The pack's sentence about the unclosed months; on the approved basis the
  // only thing left to say is why the Forecast column is dashes.
  const note = fullYearBasisNote(report, budgetSource === 'budget_version')
    ?? (onApproved && !hasForecast
      ? `No forecast exists for FY${report.fiscal_year}, so the Forecast column is empty; the months and Projected follow the approved budget.`
      : null)
  const operatingProfit = deriveFullYearOperatingProfit(report)

  // account + months + projected + forecast + [approved] + var$ + var%
  const colCount = 1 + monthHeaders.length + (showApproved ? 5 : 4)

  const groupOrder = expenseGroupOrder ?? report.expense_group_order ?? null

  return (
    <div className="bg-white rounded-lg shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Full Year Projection — FY{report.fiscal_year}</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Actuals through {getMonthLabel(report.last_actual_month)} {report.last_actual_month.split('-')[0]}
            {onApproved ? ', then approved budget' : hasForecast ? ', then forecast' : ''}
            {showApproved && (
              <>
                {' · Approved budget: '}
                <span className="font-medium text-gray-700">
                  {report.approved_budget_label || 'unnamed version'}
                </span>
              </>
            )}
          </p>
          {note && (
            <p role="note" className="text-xs text-amber-700 mt-1">{note}</p>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-500">
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded bg-white border border-gray-300" />
            Actual
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded bg-gray-100 border border-gray-300 italic" />
            {onApproved ? 'Budget' : 'Forecast'}
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
              {/*
                With two money columns in play the old "Budget" heading no
                longer identifies either of them, so it becomes "Forecast" —
                the prediction — and the yardstick gets its own name. The
                variance headings say what they are measured against: the
                basis the months are filled from, which on the approved basis
                is the approved budget and never the forecast beside it.
              */}
              {showApproved && (
                <th className="px-2 py-3 text-right font-semibold whitespace-nowrap">Approved Budget</th>
              )}
              <th className="px-2 py-3 text-right font-semibold whitespace-nowrap">{showApproved ? 'Forecast' : 'Budget'}</th>
              <th className="px-2 py-3 text-right font-semibold whitespace-nowrap">{onApproved ? 'Var vs Budget ($)' : showApproved ? 'Var vs Fcst ($)' : 'Var ($)'}</th>
              <th className="px-2 py-3 text-right font-semibold whitespace-nowrap">{onApproved ? 'Var vs Budget (%)' : showApproved ? 'Var vs Fcst (%)' : 'Var (%)'}</th>
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
                  {/* Lines, under their expense group headings — the same
                      groups, order and shading as the Actual vs Budget tab and
                      the pack's Full Year page. Ungrouped clients take the
                      flat branch and render exactly as before. */}
                  {groupFullYearLines(withoutSilentFullYearLines(section.lines, basis), groupOrder, section.category).map((g, gi) => (
                    <React.Fragment key={`${section.category}-g${gi}`}>
                      {g.name && (
                        <tr className="bg-gray-50">
                          <td colSpan={colCount} className="px-3 py-1.5 text-xs font-semibold text-gray-600">
                            {g.name}
                          </td>
                        </tr>
                      )}
                      {g.lines.map((line, idx) => (
                        <LineRow
                          key={`${section.category}-${gi}-${idx}`}
                          line={line}
                          showApproved={showApproved}
                          hasForecast={hasForecast}
                          b={b}
                        />
                      ))}
                      {g.subtotal && (
                        <SubtotalRow
                          line={g.subtotal}
                          label={`Total ${g.name}`}
                          bgClass="bg-gray-50"
                          textClass="text-gray-800 font-semibold"
                          showApproved={showApproved}
                          hasForecast={hasForecast}
                          b={b}
                        />
                      )}
                    </React.Fragment>
                  ))}
                  {/* Subtotal */}
                  <SubtotalRow
                    line={section.subtotal}
                    bgClass={style.subtotalBg}
                    textClass={style.subtotalText}
                    showApproved={showApproved}
                    hasForecast={hasForecast}
                    b={b}
                  />

                  {/* Gross Profit after Cost of Sales */}
                  {section.category === 'Cost of Sales' && (
                    <SubtotalRow
                      line={report.gross_profit}
                      bgClass="bg-blue-50"
                      textClass="text-blue-900"
                      showApproved={showApproved}
                      hasForecast={hasForecast}
                      b={b}
                    />
                  )}

                  {/* Operating Profit after the expenses, as the pack prints it. */}
                  {section.category === 'Operating Expenses' && operatingProfit && (
                    <SubtotalRow
                      line={operatingProfit}
                      bgClass="bg-blue-50"
                      textClass="text-blue-900"
                      showApproved={showApproved}
                      hasForecast={hasForecast}
                      b={b}
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
              showApproved={showApproved}
              hasForecast={hasForecast}
              b={b}
            />
          </tbody>
        </table>
      </div>
    </div>
  )
}
