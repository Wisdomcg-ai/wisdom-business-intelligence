'use client'

import { useState } from 'react'
import { Pencil, Check, X, Plus } from 'lucide-react'
import type { GeneratedReport, ReportLine, ReportSection, MonthlyReportSettings, VarianceCommentary, VendorSummary, ReportTab } from '../types'

interface BudgetVsActualTableProps {
  report: GeneratedReport
  commentary?: VarianceCommentary
  commentaryLoading?: boolean
  onCommentaryChange?: (accountName: string, text: string) => void
  onTabChange?: (tab: ReportTab) => void
}

function fmt(value: number | null, dash = false): string {
  if (value === null || (dash && value === 0)) return '—'
  const abs = Math.abs(value)
  const formatted = abs.toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
  return value < 0 ? `-$${formatted}` : `$${formatted}`
}

function fmtPct(value: number | null): string {
  if (value === null) return '—'
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`
}

function varianceColor(amount: number, isRevenue: boolean): string {
  if (amount === 0) return ''
  const favorable = isRevenue ? amount > 0 : amount > 0
  return favorable ? 'text-green-700' : 'text-red-600'
}

// Returns true if a line has no meaningful data to display
function isEmptyLine(line: ReportLine): boolean {
  return (
    line.actual === 0 &&
    line.budget === 0 &&
    line.ytd_actual === 0 &&
    line.ytd_budget === 0 &&
    line.budget_annual_total === 0 &&
    (line.prior_year === null || line.prior_year === 0)
  )
}

function LineRow({
  line,
  isRevenue,
  settings,
}: {
  line: ReportLine
  isRevenue: boolean
  settings: MonthlyReportSettings
}) {
  const isBudgetOnly = line.is_budget_only

  return (
    <tr className={`border-b border-gray-100 hover:bg-gray-50 ${isBudgetOnly ? 'opacity-60 italic' : ''}`}>
      <td className="px-3 py-2 text-sm text-gray-900 whitespace-nowrap">
        {line.account_name}
        {isBudgetOnly && <span className="ml-1 text-xs text-gray-400">(budget only)</span>}
      </td>
      {/* Month group */}
      <td className="px-3 py-2 text-sm text-right text-gray-600 whitespace-nowrap border-l-2 border-gray-200">{fmt(line.budget)}</td>
      <td className="px-3 py-2 text-sm text-right font-medium text-gray-900 whitespace-nowrap">{fmt(line.actual)}</td>
      <td className={`px-3 py-2 text-sm text-right whitespace-nowrap ${varianceColor(line.variance_amount, isRevenue)}`}>
        {fmt(line.variance_amount)}
      </td>
      <td className={`px-3 py-2 text-sm text-right whitespace-nowrap ${varianceColor(line.variance_amount, isRevenue)}`}>
        {fmtPct(line.variance_percent)}
      </td>
      {/* YTD group */}
      {settings.show_ytd && (
        <>
          <td className="px-3 py-2 text-sm text-right text-gray-600 whitespace-nowrap border-l-2 border-gray-200">{fmt(line.ytd_budget)}</td>
          <td className="px-3 py-2 text-sm text-right font-medium text-gray-900 whitespace-nowrap">{fmt(line.ytd_actual)}</td>
          <td className={`px-3 py-2 text-sm text-right whitespace-nowrap ${varianceColor(line.ytd_variance_amount, isRevenue)}`}>
            {fmt(line.ytd_variance_amount)}
          </td>
          <td className={`px-3 py-2 text-sm text-right whitespace-nowrap ${varianceColor(line.ytd_variance_amount, isRevenue)}`}>
            {fmtPct(line.ytd_variance_percent)}
          </td>
        </>
      )}
      {/* Extras group */}
      {settings.show_unspent_budget && (
        <td className="px-3 py-2 text-sm text-right text-gray-600 whitespace-nowrap border-l-2 border-gray-200">{fmt(line.unspent_budget)}</td>
      )}
      {settings.show_budget_next_month && (
        <td className={`px-3 py-2 text-sm text-right text-gray-600 whitespace-nowrap ${!settings.show_unspent_budget ? 'border-l-2 border-gray-200' : ''}`}>{fmt(line.budget_next_month)}</td>
      )}
      {settings.show_budget_annual_total && (
        <td className={`px-3 py-2 text-sm text-right text-gray-600 whitespace-nowrap ${!settings.show_unspent_budget && !settings.show_budget_next_month ? 'border-l-2 border-gray-200' : ''}`}>{fmt(line.budget_annual_total)}</td>
      )}
      {settings.show_prior_year && (
        <td className={`px-3 py-2 text-sm text-right text-gray-500 whitespace-nowrap ${!settings.show_unspent_budget && !settings.show_budget_next_month && !settings.show_budget_annual_total ? 'border-l-2 border-gray-200' : ''}`}>{fmt(line.prior_year, true)}</td>
      )}
    </tr>
  )
}

function SubtotalRow({
  line,
  label,
  bgClass,
  textClass,
  settings,
  isRevenue,
}: {
  line: ReportLine
  label: string
  bgClass: string
  textClass: string
  settings: MonthlyReportSettings
  isRevenue: boolean
}) {
  const isDark = bgClass.includes('brand-navy') || bgClass.includes('gray-800')
  const borderColor = isDark ? 'border-white/20' : 'border-gray-300'

  return (
    <tr className={`${bgClass} font-semibold`}>
      <td className={`px-3 py-2 text-sm ${textClass}`}>{label}</td>
      {/* Month group */}
      <td className={`px-3 py-2 text-sm text-right ${textClass} border-l-2 ${borderColor}`}>{fmt(line.budget)}</td>
      <td className={`px-3 py-2 text-sm text-right ${textClass}`}>{fmt(line.actual)}</td>
      <td className={`px-3 py-2 text-sm text-right ${textClass}`}>{fmt(line.variance_amount)}</td>
      <td className={`px-3 py-2 text-sm text-right ${textClass}`}>{fmtPct(line.variance_percent)}</td>
      {/* YTD group */}
      {settings.show_ytd && (
        <>
          <td className={`px-3 py-2 text-sm text-right ${textClass} border-l-2 ${borderColor}`}>{fmt(line.ytd_budget)}</td>
          <td className={`px-3 py-2 text-sm text-right ${textClass}`}>{fmt(line.ytd_actual)}</td>
          <td className={`px-3 py-2 text-sm text-right ${textClass}`}>{fmt(line.ytd_variance_amount)}</td>
          <td className={`px-3 py-2 text-sm text-right ${textClass}`}>{fmtPct(line.ytd_variance_percent)}</td>
        </>
      )}
      {/* Extras group */}
      {settings.show_unspent_budget && (
        <td className={`px-3 py-2 text-sm text-right ${textClass} border-l-2 ${borderColor}`}>{fmt(line.unspent_budget)}</td>
      )}
      {settings.show_budget_next_month && (
        <td className={`px-3 py-2 text-sm text-right ${textClass} ${!settings.show_unspent_budget ? `border-l-2 ${borderColor}` : ''}`}>{fmt(line.budget_next_month)}</td>
      )}
      {settings.show_budget_annual_total && (
        <td className={`px-3 py-2 text-sm text-right ${textClass} ${!settings.show_unspent_budget && !settings.show_budget_next_month ? `border-l-2 ${borderColor}` : ''}`}>{fmt(line.budget_annual_total)}</td>
      )}
      {settings.show_prior_year && (
        <td className={`px-3 py-2 text-sm text-right ${textClass} ${!settings.show_unspent_budget && !settings.show_budget_next_month && !settings.show_budget_annual_total ? `border-l-2 ${borderColor}` : ''}`}>{fmt(line.prior_year, true)}</td>
      )}
    </tr>
  )
}

function formatVendorAmount(amount: number): string {
  const abs = Math.abs(amount)
  const formatted = abs.toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
  return `$${formatted}`
}

function VendorSummaryDisplay({ vendors }: { vendors: VendorSummary[] }) {
  if (vendors.length === 0) return null
  return (
    <span className="text-xs text-gray-600">
      {vendors.map((v, i) => (
        <span key={v.vendor}>
          {i > 0 && ', '}
          {v.vendor} ({formatVendorAmount(v.amount)})
        </span>
      ))}
    </span>
  )
}

function CommentaryLine({
  accountName,
  vendors,
  coachNote,
  detailTabRef,
  onNoteChange,
  onTabChange,
}: {
  accountName: string
  vendors: VendorSummary[]
  coachNote: string
  detailTabRef?: 'subscriptions' | 'wages' | null
  onNoteChange?: (accountName: string, note: string) => void
  onTabChange?: (tab: ReportTab) => void
}) {
  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState(coachNote)

  const handleSave = () => {
    onNoteChange?.(accountName, editText)
    setEditing(false)
  }

  const handleCancel = () => {
    setEditText(coachNote)
    setEditing(false)
  }

  const tabLabel = detailTabRef === 'subscriptions' ? 'Subscriptions' : detailTabRef === 'wages' ? 'Wages' : null

  return (
    <div className="py-1.5 px-3 rounded hover:bg-gray-50 group">
      <div className="flex items-start gap-2">
        <div className="flex-1 text-xs">
          <span className="font-semibold text-gray-900">{accountName}</span>
          {vendors.length > 0 && (
            <>
              <span className="text-gray-400 mx-1">|</span>
              <VendorSummaryDisplay vendors={vendors} />
            </>
          )}
          {detailTabRef && tabLabel && onTabChange && (
            <button
              onClick={() => onTabChange(detailTabRef)}
              className="ml-2 text-brand-orange hover:text-brand-orange-600 font-medium"
            >
              See {tabLabel} tab →
            </button>
          )}
        </div>
        {!editing && onNoteChange && (
          <button
            onClick={() => setEditing(true)}
            className="p-0.5 text-gray-300 hover:text-gray-500 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
            title="Add note"
          >
            {coachNote ? <Pencil className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
          </button>
        )}
      </div>
      {/* Coach note display / edit */}
      {editing ? (
        <div className="mt-1 flex items-start gap-1 ml-0">
          <textarea
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            placeholder="Add coach note..."
            className="flex-1 text-xs border border-gray-300 rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-brand-orange"
            rows={2}
            autoFocus
          />
          <button onClick={handleSave} className="p-1 text-green-600 hover:text-green-800">
            <Check className="w-3.5 h-3.5" />
          </button>
          <button onClick={handleCancel} className="p-1 text-gray-400 hover:text-gray-600">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : coachNote ? (
        <p className="mt-0.5 ml-0 text-xs text-brand-orange-600 italic">{coachNote}</p>
      ) : null}
    </div>
  )
}

export default function BudgetVsActualTable({ report, commentary, commentaryLoading, onCommentaryChange, onTabChange }: BudgetVsActualTableProps) {
  const settings = report.settings

  const colCount =
    5 + // Account + Budget + Actual + Var$ + Var%
    (settings.show_ytd ? 4 : 0) +
    (settings.show_unspent_budget ? 1 : 0) +
    (settings.show_budget_next_month ? 1 : 0) +
    (settings.show_budget_annual_total ? 1 : 0) +
    (settings.show_prior_year ? 1 : 0)

  const sectionStyles: Record<string, { header: string; subtotalBg: string; subtotalText: string }> = {
    'Revenue': { header: 'bg-green-50 text-green-800', subtotalBg: 'bg-green-50', subtotalText: 'text-green-800' },
    'Cost of Sales': { header: 'bg-red-50 text-red-800', subtotalBg: 'bg-red-50', subtotalText: 'text-red-800' },
    'Operating Expenses': { header: 'bg-amber-50 text-amber-800', subtotalBg: 'bg-amber-50', subtotalText: 'text-amber-800' },
    'Other Income': { header: 'bg-blue-50 text-blue-800', subtotalBg: 'bg-blue-50', subtotalText: 'text-blue-800' },
    'Other Expenses': { header: 'bg-gray-100 text-gray-800', subtotalBg: 'bg-gray-100', subtotalText: 'text-gray-800' },
  }

  return (
    <div className="bg-white rounded-lg shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px]">
          <thead>
            <tr className="bg-brand-navy text-white text-xs">
              <th className="px-3 py-3 text-left font-semibold">Account</th>
              <th className="px-3 py-3 text-right font-semibold border-l-2 border-white/20">Budget</th>
              <th className="px-3 py-3 text-right font-semibold">Actual</th>
              <th className="px-3 py-3 text-right font-semibold">Var ($)</th>
              <th className="px-3 py-3 text-right font-semibold">Var (%)</th>
              {settings.show_ytd && (
                <>
                  <th className="px-3 py-3 text-right font-semibold border-l-2 border-white/20">YTD Budget</th>
                  <th className="px-3 py-3 text-right font-semibold">YTD Actual</th>
                  <th className="px-3 py-3 text-right font-semibold">YTD Var ($)</th>
                  <th className="px-3 py-3 text-right font-semibold">YTD Var (%)</th>
                </>
              )}
              {settings.show_unspent_budget && (
                <th className="px-3 py-3 text-right font-semibold border-l-2 border-white/20">Unspent Budget</th>
              )}
              {settings.show_budget_next_month && (
                <th className={`px-3 py-3 text-right font-semibold ${!settings.show_unspent_budget ? 'border-l-2 border-white/20' : ''}`}>Next Month</th>
              )}
              {settings.show_budget_annual_total && (
                <th className={`px-3 py-3 text-right font-semibold ${!settings.show_unspent_budget && !settings.show_budget_next_month ? 'border-l-2 border-white/20' : ''}`}>Annual Total</th>
              )}
              {settings.show_prior_year && (
                <th className={`px-3 py-3 text-right font-semibold ${!settings.show_unspent_budget && !settings.show_budget_next_month && !settings.show_budget_annual_total ? 'border-l-2 border-white/20' : ''}`}>Prior Year</th>
              )}
            </tr>
          </thead>
          <tbody>
            {report.sections.map((section) => {
              const style = sectionStyles[section.category] || sectionStyles['Operating Expenses']
              const isRevenue = section.category === 'Revenue' || section.category === 'Other Income'
              const visibleLines = section.lines.filter(line => !isEmptyLine(line))

              // Skip entire section if no visible lines
              if (visibleLines.length === 0) return null

              return (
                <React.Fragment key={section.category}>
                  {/* Section header */}
                  <tr className={style.header}>
                    <td colSpan={colCount} className="px-3 py-2 text-sm font-bold">
                      {section.category}
                    </td>
                  </tr>
                  {/* Lines — only rows with non-zero data */}
                  {visibleLines.map((line, idx) => (
                    <LineRow
                      key={`${section.category}-${idx}`}
                      line={line}
                      isRevenue={isRevenue}
                      settings={settings}
                    />
                  ))}
                  {/* Subtotal */}
                  <SubtotalRow
                    line={section.subtotal}
                    label={section.subtotal.account_name}
                    bgClass={style.subtotalBg}
                    textClass={style.subtotalText}
                    settings={settings}
                    isRevenue={isRevenue}
                  />

                  {/* Gross Profit row after Cost of Sales */}
                  {section.category === 'Cost of Sales' && (
                    <SubtotalRow
                      line={report.gross_profit_row}
                      label="Gross Profit"
                      bgClass="bg-blue-50"
                      textClass="text-blue-900"
                      settings={settings}
                      isRevenue={true}
                    />
                  )}
                </React.Fragment>
              )
            })}

            {/* Net Profit row at the end */}
            <SubtotalRow
              line={report.net_profit_row}
              label="Net Profit"
              bgClass="bg-brand-navy"
              textClass="text-white"
              settings={settings}
              isRevenue={true}
            />
          </tbody>
        </table>
      </div>

      {!report.has_budget && (
        <div className="p-4 bg-amber-50 border-t border-amber-200">
          <p className="text-sm text-amber-800">
            No budget forecast found. Set up a financial forecast to enable budget comparison.
          </p>
        </div>
      )}

      {/* Commentary section — expenses over budget, vendor breakdown */}
      {commentaryLoading && (
        <div className="p-4 border-t border-gray-200 text-center">
          <p className="text-xs text-gray-500 animate-pulse">Loading expense commentary...</p>
        </div>
      )}

      {commentary && Object.keys(commentary).length > 0 && (
        <div className="border-t border-gray-200 p-4">
          <h3 className="text-sm font-semibold text-gray-800 mb-3">Expense Commentary</h3>
          <div className="space-y-3">
            {report.sections
              .filter(s => ['Cost of Sales', 'Operating Expenses', 'Other Expenses'].includes(s.category))
              .map((section) => {
                const sectionComments = section.lines.filter(l => commentary[l.account_name])
                if (sectionComments.length === 0) return null
                return (
                  <div key={`commentary-section-${section.category}`}>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{section.category}</p>
                    {sectionComments.map(l => {
                      const entry = commentary[l.account_name]
                      return (
                        <CommentaryLine
                          key={`commentary-${l.account_name}`}
                          accountName={l.account_name}
                          vendors={entry.vendor_summary || []}
                          coachNote={entry.coach_note || ''}
                          detailTabRef={entry.detail_tab_ref}
                          onNoteChange={onCommentaryChange}
                          onTabChange={onTabChange}
                        />
                      )
                    })}
                  </div>
                )
              })}
          </div>
        </div>
      )}
    </div>
  )
}

// Need React import for JSX fragments
import React from 'react'
