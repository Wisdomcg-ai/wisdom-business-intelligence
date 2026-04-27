'use client'

import { Calendar } from 'lucide-react'

export interface PlanPeriodBannerProps {
  planStartDate: Date
  planEndDate: Date
  year1EndDate: Date
  rationale: string
  year1Months: number
  onAdjust: () => void
}

const MONTH_ABBREVS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function formatMonthYear(d: Date): string {
  return `${MONTH_ABBREVS[d.getMonth()]} ${d.getFullYear()}`
}

export function PlanPeriodBanner({
  planStartDate,
  planEndDate,
  year1EndDate: _year1EndDate,
  rationale,
  year1Months,
  onAdjust,
}: PlanPeriodBannerProps) {
  const startLabel = formatMonthYear(planStartDate)
  const endLabel   = formatMonthYear(planEndDate)
  const year1Suffix = year1Months === 12 ? 'Year 1 is 12 months' : `Year 1 is ${year1Months} months`

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 flex-1">
          <Calendar className="w-5 h-5 text-amber-700 mt-0.5 flex-shrink-0" />
          <div>
            <div className="text-xs font-bold uppercase tracking-wide text-amber-700 mb-1">
              Your Plan Period
            </div>
            <div className="text-sm font-semibold text-brand-navy">
              {startLabel} → {endLabel} · {year1Suffix}
            </div>
            <p className="text-xs text-gray-600 mt-1 leading-relaxed">
              {rationale}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onAdjust}
          className="text-xs font-semibold text-brand-orange hover:underline px-3 py-1.5 rounded-md border border-brand-orange/40 hover:bg-brand-orange/5 transition-colors flex-shrink-0"
        >
          Adjust
        </button>
      </div>
    </div>
  )
}

export default PlanPeriodBanner
