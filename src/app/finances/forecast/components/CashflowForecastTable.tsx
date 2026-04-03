'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { CashflowForecastData, CashflowForecastMonth, CashflowLine, CashflowExpenseGroup } from '../types'

interface CashflowForecastTableProps {
  data: CashflowForecastData
}

function fmtCash(value: number): string {
  if (Math.abs(value) < 0.01) return '-'
  const formatted = new Intl.NumberFormat('en-AU', {
    style: 'currency', currency: 'AUD', minimumFractionDigits: 0, maximumFractionDigits: 0
  }).format(Math.abs(value))
  return value < 0 ? `(${formatted})` : formatted
}

function valueClass(value: number, bold?: boolean): string {
  const base = bold ? 'font-semibold' : 'font-normal'
  if (value < -0.01) return `${base} text-red-600`
  return `${base} text-gray-900`
}

export default function CashflowForecastTable({ data }: CashflowForecastTableProps) {
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({})

  const toggleGroup = (group: string) => {
    setCollapsedGroups(prev => ({ ...prev, [group]: !prev[group] }))
  }

  const allColumns = data.months

  return (
    <div className="bg-white rounded-lg shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-xs">
          <thead>
            {/* Actual / Forecast label row */}
            <tr className="bg-brand-navy text-white">
              <th className="sticky left-0 z-10 bg-brand-navy px-3 py-1 text-left" />
              {allColumns.map((col) => {
                const label = col.source === 'actual' ? 'Actual' : 'Forecast'
                return (
                  <th
                    key={`source-${col.month}`}
                    className="px-2 py-1 text-right min-w-[90px]"
                  >
                    {label && (
                      <span className={`text-[9px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded-sm ${
                        col.source === 'actual' ? 'bg-green-500/20 text-green-300' : 'bg-white/10 text-white/60'
                      }`}>
                        {label}
                      </span>
                    )}
                  </th>
                )
              })}
            </tr>
            {/* Month name row */}
            <tr className="bg-brand-navy text-white">
              <th className="sticky left-0 z-10 bg-brand-navy px-3 py-2 text-left font-semibold min-w-[200px] w-[200px]">
                Cashflow Forecast
              </th>
              {allColumns.map((col) => (
                <th
                  key={col.month}
                  className="px-2 py-2 text-right font-semibold min-w-[90px] whitespace-nowrap"
                >
                  {col.monthLabel}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* Bank at Beginning */}
            <BankRow label="Bank at Beginning" columns={allColumns} getValue={(c) => c.bank_at_beginning} variant="beginning" />

            {/* Income Section */}
            <SectionHeader label="Income" colCount={allColumns.length + 1} />
            {renderLineRows(getAllIncomeLabels(data), allColumns, (col, label) =>
              col.income_lines.find(l => l.label === label)?.value || 0
            )}
            <SubtotalRow label="Cash Inflows from Operations" columns={allColumns} getValue={(c) => c.cash_inflows} />

            {/* Cost of Sales */}
            <SectionHeader label="Cost of Sales" colCount={allColumns.length + 1} />
            {renderLineRows(getAllCOGSLabels(data), allColumns, (col, label) =>
              col.cogs_lines.find(l => l.label === label)?.value || 0
            )}

            {/* Expenses */}
            <SectionHeader label="Expenses" colCount={allColumns.length + 1} />
            {renderExpenseGroups(data, allColumns, collapsedGroups, toggleGroup)}

            {/* Cash Outflows */}
            <SubtotalRow label="Cash Outflows from Operations" columns={allColumns} getValue={(c) => -c.cash_outflows} negative />

            {/* Assets */}
            {hasAssetLines(data) && (
              <>
                <SectionHeader label="Balance Sheet — Assets" colCount={allColumns.length + 1} />
                {renderLineRows(getAllAssetLabels(data), allColumns, (col, label) =>
                  col.asset_lines.find(l => l.label === label)?.value || 0
                )}
                <SubtotalRow label="Movement in Assets" columns={allColumns} getValue={(c) => c.movement_in_assets} />
              </>
            )}

            {/* Liabilities */}
            {hasLiabilityLines(data) && (
              <>
                <SectionHeader label="Balance Sheet — Liabilities" colCount={allColumns.length + 1} />
                {renderLineRows(getAllLiabilityLabels(data), allColumns, (col, label) =>
                  col.liability_lines.find(l => l.label === label)?.value || 0
                )}
                <SubtotalRow label="Movement in Liabilities" columns={allColumns} getValue={(c) => c.movement_in_liabilities} />
              </>
            )}

            {/* Other Income */}
            {hasOtherIncomeLines(data) && (
              <>
                <SectionHeader label="Other Income" colCount={allColumns.length + 1} />
                {renderLineRows(getAllOtherIncomeLabels(data), allColumns, (col, label) =>
                  col.other_income_lines.find(l => l.label === label)?.value || 0
                )}
                <SubtotalRow label="Other Inflows" columns={allColumns} getValue={(c) => c.other_inflows} />
              </>
            )}

            {/* Net Movement */}
            <SubtotalRow label="Net Movement" columns={allColumns} getValue={(c) => c.net_movement} bold />

            {/* Bank at End */}
            <BankRow label="Bank at End" columns={allColumns} getValue={(c) => c.bank_at_end} variant="end" />
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ============================================================================
// Row Components
// ============================================================================

function BankRow({ label, columns, getValue, variant }: {
  label: string
  columns: CashflowForecastMonth[]
  getValue: (col: CashflowForecastMonth) => number
  variant: 'beginning' | 'end'
}) {
  const bgClass = variant === 'end' ? 'bg-brand-navy text-white' : 'bg-brand-navy-800 text-white'

  return (
    <tr className={bgClass}>
      <td className={`sticky left-0 z-10 ${bgClass} px-3 py-2.5 font-bold text-sm`}>
        {label}
      </td>
      {columns.map((col) => {
        const val = getValue(col)
        return (
          <td
            key={col.month}
            className={`px-2 py-2.5 text-right font-bold text-sm ${variant === 'end' && val < 0 ? 'text-red-400' : ''}`}
          >
            {fmtCash(val)}
          </td>
        )
      })}
    </tr>
  )
}

function SectionHeader({ label, colCount }: { label: string; colCount: number }) {
  return (
    <tr className="bg-gray-100">
      <td colSpan={colCount} className="sticky left-0 z-10 bg-gray-100 px-3 py-2 text-xs font-semibold text-gray-700 uppercase tracking-wide">
        {label}
      </td>
    </tr>
  )
}

function SubtotalRow({ label, columns, getValue, negative, bold }: {
  label: string
  columns: CashflowForecastMonth[]
  getValue: (col: CashflowForecastMonth) => number
  negative?: boolean
  bold?: boolean
}) {
  return (
    <tr className="bg-gray-50 border-t border-b border-gray-200">
      <td className="sticky left-0 z-10 bg-gray-50 px-3 py-2 font-semibold text-xs text-gray-900">
        {label}
      </td>
      {columns.map((col) => {
        const val = getValue(col)
        return (
          <td
            key={col.month}
            className={`px-2 py-2 text-right text-xs ${valueClass(val, true)}`}
          >
            {fmtCash(val)}
          </td>
        )
      })}
    </tr>
  )
}

// ============================================================================
// Line Rendering Helpers
// ============================================================================

function renderLineRows(
  labels: string[],
  columns: CashflowForecastMonth[],
  getValue: (col: CashflowForecastMonth, label: string) => number,
) {
  return labels.map((label) => (
    <tr key={label} className="border-b border-gray-100 hover:bg-gray-50">
      <td className="sticky left-0 z-10 bg-white hover:bg-gray-50 px-3 py-1.5 text-xs text-gray-700 pl-6 truncate max-w-[200px]">
        {label}
      </td>
      {columns.map((col) => {
        const val = getValue(col, label)
        return (
          <td
            key={col.month}
            className={`px-2 py-1.5 text-right text-xs ${valueClass(val)} ${
              col.source === 'actual' ? 'bg-green-50/50' : ''
            }`}
          >
            {fmtCash(val)}
          </td>
        )
      })}
    </tr>
  ))
}

function renderExpenseGroups(
  data: CashflowForecastData,
  columns: CashflowForecastMonth[],
  collapsedGroups: Record<string, boolean>,
  toggleGroup: (group: string) => void,
) {
  const allGroups = getAllExpenseGroups(data)

  return allGroups.map((groupName) => {
    const isCollapsed = collapsedGroups[groupName]
    const labels = getAllExpenseLabelsInGroup(data, groupName)

    return (
      <ExpenseGroupRows
        key={groupName}
        groupName={groupName}
        labels={labels}
        columns={columns}
        isCollapsed={isCollapsed}
        onToggle={() => toggleGroup(groupName)}
        data={data}
      />
    )
  })
}

function ExpenseGroupRows({ groupName, labels, columns, isCollapsed, onToggle, data }: {
  groupName: string
  labels: string[]
  columns: CashflowForecastMonth[]
  isCollapsed: boolean
  onToggle: () => void
  data: CashflowForecastData
}) {
  return (
    <>
      {/* Group Header */}
      <tr className="bg-gray-50/70 cursor-pointer hover:bg-gray-100" onClick={onToggle}>
        <td className="sticky left-0 z-10 bg-gray-50/70 hover:bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-800 flex items-center gap-1">
          {isCollapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          {groupName}
        </td>
        {columns.map((col) => {
          const group = col.expense_groups.find(g => g.group === groupName)
          const val = group?.subtotal || 0
          return (
            <td
              key={col.month}
              className={`px-2 py-1.5 text-right text-xs font-semibold ${valueClass(val)}`}
            >
              {isCollapsed ? fmtCash(val) : ''}
            </td>
          )
        })}
      </tr>

      {/* Detail Lines (if expanded) */}
      {!isCollapsed && labels.map((label) => (
        <tr key={`${groupName}-${label}`} className="border-b border-gray-100 hover:bg-gray-50">
          <td className="sticky left-0 z-10 bg-white hover:bg-gray-50 px-3 py-1.5 text-xs text-gray-600 pl-8 truncate max-w-[200px]">
            {label}
          </td>
          {columns.map((col) => {
            const group = col.expense_groups.find(g => g.group === groupName)
            const val = group?.lines.find(l => l.label === label)?.value || 0
            return (
              <td
                key={col.month}
                className={`px-2 py-1.5 text-right text-xs ${valueClass(val)} ${
                  col.source === 'actual' ? 'bg-green-50/50' : ''
                }`}
              >
                {fmtCash(val)}
              </td>
            )
          })}
        </tr>
      ))}

      {/* Group Subtotal (if expanded) */}
      {!isCollapsed && (
        <tr className="border-b border-gray-200">
          <td className="sticky left-0 z-10 bg-white px-3 py-1 text-xs font-medium text-gray-500 pl-6 italic">
            Subtotal {groupName}
          </td>
          {columns.map((col) => {
            const group = col.expense_groups.find(g => g.group === groupName)
            const val = group?.subtotal || 0
            return (
              <td
                key={col.month}
                className={`px-2 py-1 text-right text-xs font-medium italic ${valueClass(val)}`}
              >
                {fmtCash(val)}
              </td>
            )
          })}
        </tr>
      )}
    </>
  )
}

// ============================================================================
// Data Aggregation Helpers
// ============================================================================

function getAllIncomeLabels(data: CashflowForecastData): string[] {
  const labels = new Set<string>()
  for (const m of data.months) for (const l of m.income_lines) labels.add(l.label)
  return Array.from(labels)
}

function getAllCOGSLabels(data: CashflowForecastData): string[] {
  const labels = new Set<string>()
  for (const m of data.months) for (const l of m.cogs_lines) labels.add(l.label)
  return Array.from(labels)
}

function getAllAssetLabels(data: CashflowForecastData): string[] {
  const labels = new Set<string>()
  for (const m of data.months) for (const l of m.asset_lines) labels.add(l.label)
  return Array.from(labels)
}

function getAllLiabilityLabels(data: CashflowForecastData): string[] {
  const labels = new Set<string>()
  for (const m of data.months) for (const l of m.liability_lines) labels.add(l.label)
  return Array.from(labels)
}

function getAllOtherIncomeLabels(data: CashflowForecastData): string[] {
  const labels = new Set<string>()
  for (const m of data.months) for (const l of m.other_income_lines) labels.add(l.label)
  return Array.from(labels)
}

function getAllExpenseGroups(data: CashflowForecastData): string[] {
  const groups = new Set<string>()
  for (const m of data.months) for (const g of m.expense_groups) groups.add(g.group)
  return Array.from(groups)
}

function getAllExpenseLabelsInGroup(data: CashflowForecastData, groupName: string): string[] {
  const labels = new Set<string>()
  for (const m of data.months) {
    const group = m.expense_groups.find(g => g.group === groupName)
    if (group) for (const l of group.lines) labels.add(l.label)
  }
  return Array.from(labels)
}

function hasAssetLines(data: CashflowForecastData): boolean {
  return data.months.some(m => m.asset_lines.length > 0)
}

function hasLiabilityLines(data: CashflowForecastData): boolean {
  return data.months.some(m => m.liability_lines.length > 0)
}

function hasOtherIncomeLines(data: CashflowForecastData): boolean {
  return data.months.some(m => m.other_income_lines.length > 0)
}
