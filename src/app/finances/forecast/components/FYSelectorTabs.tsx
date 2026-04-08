'use client'

import { Lock } from 'lucide-react'
import { getFiscalYearDateRange } from '../utils/fiscal-year'

export interface FYOption {
  year: number
  label: string
  isCurrent: boolean
}

interface FYSelectorTabsProps {
  availableYears: FYOption[]
  selectedYear: number
  onSelectYear: (year: number) => void
  isLockedMap?: Record<number, boolean>
}

export function FYSelectorTabs({
  availableYears,
  selectedYear,
  onSelectYear,
  isLockedMap = {},
}: FYSelectorTabsProps) {
  // If only one year, render as informational label rather than interactive selector
  if (availableYears.length <= 1) {
    const single = availableYears[0]
    if (!single) return null
    return (
      <div className="flex items-center gap-2 px-1">
        <span className="text-sm font-medium text-gray-700">{single.label}</span>
        <span className="text-xs text-gray-400">{getFiscalYearDateRange(single.year)}</span>
        {isLockedMap[single.year] && (
          <Lock className="w-3 h-3 text-gray-400" />
        )}
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {availableYears.map((fy) => {
        const isSelected = fy.year === selectedYear
        const isLocked = isLockedMap[fy.year] === true

        return (
          <button
            key={fy.year}
            onClick={() => onSelectYear(fy.year)}
            className={`
              flex flex-col items-center px-4 py-2 rounded-full border transition-all text-left min-w-[100px]
              ${isSelected
                ? 'bg-brand-navy text-white border-brand-navy shadow-sm'
                : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-100 hover:border-gray-300'
              }
            `}
          >
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-semibold leading-none">{fy.label}</span>
              {isLocked && (
                <Lock
                  className={`w-3 h-3 ${isSelected ? 'text-white/70' : 'text-gray-400'}`}
                />
              )}
            </div>
            <span
              className={`text-xs mt-0.5 leading-none ${
                isSelected ? 'text-white/70' : 'text-gray-400'
              }`}
            >
              {getFiscalYearDateRange(fy.year)}
            </span>
          </button>
        )
      })}
    </div>
  )
}
