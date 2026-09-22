'use client'

import { Calendar } from 'lucide-react'

interface MonthSelectorProps {
  selectedMonth: string
  fiscalYear: number
  onChange: (month: string) => void
  /**
   * WA.4 — fiscal-year navigation. `fiscalYear` used to be set from the clock
   * once and never change, so the page could only ever address months of the
   * current FY (in early July: exactly one month). Omitted → no FY dropdown,
   * preserving the old single-FY rendering for any caller that doesn't wire it.
   */
  fiscalYearOptions?: number[]
  onFiscalYearChange?: (fiscalYear: number) => void
}

function getMonthOptions(fiscalYear: number): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = []
  const now = new Date()
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  // FY starts July of (fiscalYear - 1), ends June of fiscalYear
  const startYear = fiscalYear - 1
  const startMonth = 7 // July

  for (let i = 0; i < 12; i++) {
    const m = ((startMonth - 1 + i) % 12) + 1
    const y = startYear + Math.floor((startMonth - 1 + i) / 12)
    const key = `${y}-${String(m).padStart(2, '0')}`

    // Only show months up to current month
    if (key > currentMonthKey) break

    const date = new Date(y, m - 1)
    const label = date.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })
    options.push({ value: key, label })
  }

  return options.reverse() // Most recent first
}

export default function MonthSelector({
  selectedMonth,
  fiscalYear,
  onChange,
  fiscalYearOptions,
  onFiscalYearChange,
}: MonthSelectorProps) {
  const options = getMonthOptions(fiscalYear)

  return (
    <div className="flex items-center gap-3 mb-6">
      <Calendar className="w-5 h-5 text-gray-400" />
      {fiscalYearOptions && fiscalYearOptions.length > 0 && onFiscalYearChange && (
        <select
          aria-label="Fiscal year"
          value={fiscalYear}
          onChange={(e) => onFiscalYearChange(Number(e.target.value))}
          className="block w-32 rounded-lg border-gray-300 shadow-sm focus:border-brand-orange focus:ring-brand-orange text-sm font-medium"
        >
          {fiscalYearOptions.map((fy) => (
            <option key={fy} value={fy}>FY{fy}</option>
          ))}
        </select>
      )}
      <select
        aria-label="Report month"
        value={selectedMonth}
        onChange={(e) => onChange(e.target.value)}
        className="block w-64 rounded-lg border-gray-300 shadow-sm focus:border-brand-orange focus:ring-brand-orange text-sm font-medium"
      >
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  )
}
