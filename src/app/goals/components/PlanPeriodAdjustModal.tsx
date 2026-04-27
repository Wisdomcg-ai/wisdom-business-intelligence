'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { suggestPlanPeriod } from '../utils/suggest-plan-period'

export interface PlanPeriodAdjustModalProps {
  initialPlanStart: Date
  initialPlanEnd: Date
  initialYear1End: Date
  fiscalYearStart: number  // 1-12
  onClose: () => void
  onSave: (period: { planStartDate: Date; planEndDate: Date; year1EndDate: Date }) => void
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function fromIsoDate(s: string): Date {
  // "YYYY-MM-DD" -> local Date
  const [y, m, day] = s.split('-').map(Number)
  return new Date(y, m - 1, day)
}

function monthDiffInclusive(start: Date, end: Date): number {
  return (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1
}

export function PlanPeriodAdjustModal({
  initialPlanStart,
  initialPlanEnd,
  initialYear1End,
  fiscalYearStart,
  onClose,
  onSave,
}: PlanPeriodAdjustModalProps) {
  const [planStart, setPlanStart] = useState<Date>(initialPlanStart)
  const [year1End, setYear1End]   = useState<Date>(initialYear1End)
  const [planEnd, setPlanEnd]     = useState<Date>(initialPlanEnd)

  const year1Months = monthDiffInclusive(planStart, year1End)
  const isOutOfRange = year1Months < 12 || year1Months > 15  // v1 clamp per 42-RESEARCH.md Open Question 1

  const handleResetToSuggestion = () => {
    const s = suggestPlanPeriod(new Date(), fiscalYearStart)
    setPlanStart(s.planStartDate)
    setYear1End(s.year1EndDate)
    setPlanEnd(s.planEndDate)
  }

  const handleSave = () => {
    if (isOutOfRange) return
    onSave({ planStartDate: planStart, planEndDate: planEnd, year1EndDate: year1End })
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-brand-navy">Adjust Plan Period</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Plan start date</label>
            <input
              type="date"
              value={toIsoDate(planStart)}
              onChange={(e) => setPlanStart(fromIsoDate(e.target.value))}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Year 1 end date</label>
            <input
              type="date"
              value={toIsoDate(year1End)}
              onChange={(e) => setYear1End(fromIsoDate(e.target.value))}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            />
            <p className="text-xs text-gray-500 mt-1">
              Year 1 is {year1Months} month{year1Months === 1 ? '' : 's'}
              {isOutOfRange && (
                <span className="text-red-600 ml-1">
                  · Year 1 must be between 12 and 15 months
                </span>
              )}
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Year 3 end date (plan end)</label>
            <input
              type="date"
              value={toIsoDate(planEnd)}
              onChange={(e) => setPlanEnd(fromIsoDate(e.target.value))}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            />
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-md p-3 text-xs text-gray-700">
            <strong>Note:</strong> Switching to a standard 12-month plan will hide
            Step 4&apos;s &ldquo;current remainder&rdquo; column. Existing initiatives in that
            bucket are not deleted &mdash; switch back to a 13-15 month plan to see them again.
          </div>
        </div>

        <div className="flex items-center justify-between mt-6 gap-2">
          <button
            type="button"
            onClick={handleResetToSuggestion}
            className="text-xs font-semibold text-brand-orange hover:underline"
          >
            Reset to suggestion
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-md"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isOutOfRange}
              className="px-4 py-2 text-sm font-semibold text-white bg-brand-orange rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-brand-orange/90"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default PlanPeriodAdjustModal
