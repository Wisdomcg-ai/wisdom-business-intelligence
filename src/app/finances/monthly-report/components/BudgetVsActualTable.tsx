'use client'

import { useState } from 'react'
import { Pencil, Check, X, Plus, ChevronDown, ChevronRight, MessageSquarePlus, FileText, Landmark } from 'lucide-react'
import type { GeneratedReport, ReportLine, ReportSection, MonthlyReportSettings, VarianceCommentary, VendorSummary, VendorTransaction, ReportTab } from '../types'

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

function formatDate(dateStr: string): string {
  if (!dateStr) return ''
  try {
    return new Date(dateStr).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
  } catch {
    return dateStr
  }
}

function TransactionDrillDown({ vendors }: { vendors: VendorSummary[] }) {
  const [expanded, setExpanded] = useState(false)
  const totalTransactions = vendors.reduce((sum, v) => sum + (v.transactions?.length || 0), 0)

  if (vendors.length === 0) return null

  return (
    <div className="mt-2">
      {/* Vendor pills */}
      <div className="flex flex-wrap gap-1.5 items-center">
        {vendors.map((v) => (
          <span
            key={v.vendor}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700"
          >
            {v.vendor}
            <span className="text-gray-500">{formatVendorAmount(v.amount)}</span>
          </span>
        ))}
      </div>

      {/* Drill-down toggle */}
      {totalTransactions > 0 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-1.5 inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 transition-colors"
        >
          {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          {expanded ? 'Hide' : 'Show'} {totalTransactions} transaction{totalTransactions !== 1 ? 's' : ''}
        </button>
      )}

      {/* Transaction details */}
      {expanded && (
        <div className="mt-2 border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 text-gray-600">
                <th className="px-3 py-1.5 text-left font-medium">Date</th>
                <th className="px-3 py-1.5 text-left font-medium">Vendor</th>
                <th className="px-3 py-1.5 text-left font-medium w-8">Type</th>
                <th className="px-3 py-1.5 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {vendors.flatMap(v =>
                (v.transactions || []).map((txn, i) => (
                  <tr key={`${v.vendor}-${i}`} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="px-3 py-1.5 text-gray-600 whitespace-nowrap">{formatDate(txn.date)}</td>
                    <td className="px-3 py-1.5">
                      <div className="font-medium text-gray-800">{txn.vendor || v.vendor}</div>
                      {txn.context && (
                        <div className="text-gray-500 truncate max-w-[300px]" title={txn.context}>{txn.context}</div>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-gray-400" title={txn.type === 'invoice' ? 'Invoice' : 'Bank Transaction'}>
                      {txn.type === 'invoice' ? (
                        <FileText className="w-3 h-3" />
                      ) : (
                        <Landmark className="w-3 h-3" />
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-right text-gray-800 whitespace-nowrap">{formatVendorAmount(txn.amount)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function CommentaryLine({
  accountName,
  variance,
  vendors,
  coachNote,
  detailTabRef,
  onNoteChange,
  onTabChange,
}: {
  accountName: string
  variance: number
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
    <div className="py-3 px-4 rounded-lg border border-gray-200 bg-white">
      {/* Header row */}
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-900">{accountName}</span>
            <span className="text-xs font-medium text-red-600 bg-red-50 px-1.5 py-0.5 rounded">
              {formatVendorAmount(Math.abs(variance))} over budget
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {detailTabRef && tabLabel && onTabChange && (
            <button
              onClick={() => onTabChange(detailTabRef)}
              className="text-xs text-brand-orange hover:text-brand-orange-600 font-medium"
            >
              {tabLabel} tab →
            </button>
          )}
        </div>
      </div>

      {/* Vendor drill-down */}
      <TransactionDrillDown vendors={vendors} />

      {/* Coach note section */}
      <div className="mt-2">
        {editing ? (
          <div className="flex items-start gap-2">
            <textarea
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              placeholder="Add your coaching note — what caused this variance? What should the client do about it?"
              className="flex-1 text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-brand-orange focus:border-brand-orange"
              rows={3}
              autoFocus
            />
            <div className="flex flex-col gap-1">
              <button onClick={handleSave} className="p-1.5 text-green-600 hover:text-green-800 bg-green-50 hover:bg-green-100 rounded" title="Save note">
                <Check className="w-4 h-4" />
              </button>
              <button onClick={handleCancel} className="p-1.5 text-gray-400 hover:text-gray-600 bg-gray-50 hover:bg-gray-100 rounded" title="Cancel">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        ) : coachNote ? (
          <div className="flex items-start gap-2 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2">
            <MessageSquarePlus className="w-3.5 h-3.5 text-brand-orange mt-0.5 flex-shrink-0" />
            <p className="flex-1 text-sm text-gray-800">{coachNote}</p>
            {onNoteChange && (
              <button
                onClick={() => setEditing(true)}
                className="p-1 text-gray-400 hover:text-gray-600 flex-shrink-0"
                title="Edit note"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ) : onNoteChange ? (
          <button
            onClick={() => setEditing(true)}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-brand-orange transition-colors px-1 py-0.5"
          >
            <MessageSquarePlus className="w-4 h-4" />
            Add coaching note
          </button>
        ) : null}
      </div>
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
        <div className="border-t-2 border-red-200 bg-red-50/30 p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-1 h-5 bg-red-500 rounded-full" />
            <h3 className="text-base font-bold text-gray-900">Expense Commentary</h3>
            <span className="text-xs text-gray-500">
              {Object.keys(commentary).length} account{Object.keys(commentary).length !== 1 ? 's' : ''} over budget
            </span>
          </div>
          <div className="space-y-4">
            {report.sections
              .filter(s => ['Cost of Sales', 'Operating Expenses', 'Other Expenses'].includes(s.category))
              .map((section) => {
                const sectionComments = section.lines.filter(l => commentary[l.account_name])
                if (sectionComments.length === 0) return null
                return (
                  <div key={`commentary-section-${section.category}`}>
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 ml-1">{section.category}</p>
                    <div className="space-y-2">
                      {sectionComments.map(l => {
                        const entry = commentary[l.account_name]
                        return (
                          <CommentaryLine
                            key={`commentary-${l.account_name}`}
                            accountName={l.account_name}
                            variance={l.variance_amount}
                            vendors={entry.vendor_summary || []}
                            coachNote={entry.coach_note || ''}
                            detailTabRef={entry.detail_tab_ref}
                            onNoteChange={onCommentaryChange}
                            onTabChange={onTabChange}
                          />
                        )
                      })}
                    </div>
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
