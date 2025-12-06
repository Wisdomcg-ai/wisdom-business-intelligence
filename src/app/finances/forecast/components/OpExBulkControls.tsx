'use client'

import React, { useState } from 'react'
import { Sparkles } from 'lucide-react'

interface OpExBulkControlsProps {
  onApplyBulkIncrease: (percentageIncrease: number) => void
}

export default function OpExBulkControls({ onApplyBulkIncrease }: OpExBulkControlsProps) {
  const [annualIncrease, setAnnualIncrease] = useState<string>('5')

  const handleApply = () => {
    const percentage = parseFloat(annualIncrease) || 0
    onApplyBulkIncrease(percentage)
  }

  return (
    <div className="bg-gradient-to-r from-brand-orange-50 to-brand-orange-50 border border-brand-orange-200 rounded-xl p-6">
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0">
          <div className="w-10 h-10 bg-brand-orange rounded-lg flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
        </div>

        <div className="flex-1">
          <h3 className="text-base font-semibold text-gray-900 mb-1">
            Quick Setup: Apply Annual Increase
          </h3>
          <p className="text-sm text-gray-600 mb-4">
            Set all OpEx lines to "Match FY25 Pattern" with an annual increase. You can customize individual lines afterward.
          </p>

          <div className="flex items-end gap-4">
            <div className="flex-1 max-w-xs">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Annual Increase (%)
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  value={annualIncrease}
                  onChange={(e) => setAnnualIncrease(e.target.value)}
                  className="w-24 px-4 py-2.5 text-lg font-semibold text-gray-900 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-brand-orange-500 transition-all"
                  placeholder="5"
                  step="0.5"
                  min="0"
                  max="100"
                />
                <span className="text-lg font-medium text-gray-700">%</span>
              </div>
            </div>

            <button
              onClick={handleApply}
              className="px-8 py-2.5 bg-brand-orange text-white text-sm font-semibold rounded-lg hover:bg-brand-orange-600 active:bg-brand-orange-800 transition-colors shadow-sm hover:shadow-md"
            >
              Apply to All Lines
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
