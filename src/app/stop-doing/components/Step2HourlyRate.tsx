'use client'

import { DollarSign, Calendar, Clock, Calculator } from 'lucide-react'

interface Step2HourlyRateProps {
  targetAnnualIncome: number
  workingWeeksPerYear: number
  hoursPerWeek: number
  calculatedHourlyRate: number
  onTargetIncomeChange: (value: number) => void
  onWorkingWeeksChange: (value: number) => void
  onHoursPerWeekChange: (value: number) => void
  onSave: () => void
  isSaving: boolean
}

export default function Step2HourlyRate({
  targetAnnualIncome,
  workingWeeksPerYear,
  hoursPerWeek,
  calculatedHourlyRate,
  onTargetIncomeChange,
  onWorkingWeeksChange,
  onHoursPerWeekChange,
  onSave,
  isSaving
}: Step2HourlyRateProps) {
  // Format currency for display
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value)
  }

  // Parse currency input
  const parseCurrencyInput = (value: string): number => {
    const cleaned = value.replace(/[^0-9.-]/g, '')
    return parseInt(cleaned) || 0
  }

  // Calculate annual hours
  const annualHours = workingWeeksPerYear * hoursPerWeek

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Calculate Your Hourly Rate</h2>
        <p className="text-gray-600 mt-1">
          Your hourly rate is the benchmark for deciding what tasks to delegate or stop doing
        </p>
      </div>

      {/* Formula Explanation */}
      <div className="bg-teal-50 border border-teal-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <Calculator className="w-5 h-5 text-teal-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-teal-900 font-medium">The Simple Formula</p>
            <p className="text-teal-800 text-sm mt-1">
              <strong>Target Income</strong> ÷ <strong>Working Weeks</strong> ÷ <strong>Hours per Week</strong> = <strong>Your Hourly Rate</strong>
            </p>
            <p className="text-teal-700 text-sm mt-2">
              Tasks that can be done for less than your hourly rate should be delegated or eliminated.
            </p>
          </div>
        </div>
      </div>

      {/* Input Form */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-6">
        {/* Target Annual Income */}
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-gray-900 mb-2">
            <DollarSign className="w-4 h-4 text-gray-500" />
            Target Annual Income
          </label>
          <p className="text-sm text-gray-600 mb-3">
            How much money do you want to make in the next 12 months? (Include salary, dividends, etc.)
          </p>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
            <input
              type="text"
              value={targetAnnualIncome ? targetAnnualIncome.toLocaleString() : ''}
              onChange={(e) => onTargetIncomeChange(parseCurrencyInput(e.target.value))}
              placeholder="e.g., 250,000"
              className="w-full pl-8 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-lg"
            />
          </div>
        </div>

        {/* Working Weeks */}
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-gray-900 mb-2">
            <Calendar className="w-4 h-4 text-gray-500" />
            Working Weeks per Year
          </label>
          <p className="text-sm text-gray-600 mb-3">
            52 weeks minus your planned holidays (e.g., 52 - 4 weeks holiday = 48 weeks)
          </p>
          <input
            type="number"
            value={workingWeeksPerYear || ''}
            onChange={(e) => onWorkingWeeksChange(parseInt(e.target.value) || 0)}
            placeholder="e.g., 48"
            min={1}
            max={52}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-lg"
          />
          <div className="mt-2 flex flex-wrap gap-2">
            {[44, 46, 48, 50].map((weeks) => (
              <button
                key={weeks}
                onClick={() => onWorkingWeeksChange(weeks)}
                className={`px-3 py-1 text-sm rounded-lg transition-colors ${
                  workingWeeksPerYear === weeks
                    ? 'bg-teal-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {weeks} weeks ({52 - weeks} weeks off)
              </button>
            ))}
          </div>
        </div>

        {/* Hours per Week */}
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-gray-900 mb-2">
            <Clock className="w-4 h-4 text-gray-500" />
            Hours per Week
          </label>
          <p className="text-sm text-gray-600 mb-3">
            How many hours per week do you intend to work?
          </p>
          <input
            type="number"
            value={hoursPerWeek || ''}
            onChange={(e) => onHoursPerWeekChange(parseInt(e.target.value) || 0)}
            placeholder="e.g., 40"
            min={1}
            max={80}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-lg"
          />
          <div className="mt-2 flex flex-wrap gap-2">
            {[30, 35, 40, 45, 50].map((hours) => (
              <button
                key={hours}
                onClick={() => onHoursPerWeekChange(hours)}
                className={`px-3 py-1 text-sm rounded-lg transition-colors ${
                  hoursPerWeek === hours
                    ? 'bg-teal-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {hours}h/week
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Result */}
      <div className="bg-gradient-to-r from-teal-600 to-teal-700 rounded-lg p-6 text-white">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Annual Hours */}
          <div className="text-center">
            <p className="text-teal-100 text-sm">Annual Hours</p>
            <p className="text-2xl font-bold mt-1">
              {annualHours.toLocaleString()}h
            </p>
            <p className="text-teal-200 text-xs mt-1">
              {workingWeeksPerYear} weeks × {hoursPerWeek}h
            </p>
          </div>

          {/* Target Income */}
          <div className="text-center">
            <p className="text-teal-100 text-sm">Target Income</p>
            <p className="text-2xl font-bold mt-1">
              {formatCurrency(targetAnnualIncome)}
            </p>
            <p className="text-teal-200 text-xs mt-1">per year</p>
          </div>

          {/* Hourly Rate */}
          <div className="text-center bg-white/10 rounded-lg p-4">
            <p className="text-teal-100 text-sm">Your Hourly Rate</p>
            <p className="text-4xl font-bold mt-1">
              {formatCurrency(calculatedHourlyRate)}
            </p>
            <p className="text-teal-200 text-xs mt-1">per hour</p>
          </div>
        </div>
      </div>

      {/* Key Insight */}
      {calculatedHourlyRate > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <p className="text-amber-900 font-medium">Key Insight</p>
          <p className="text-amber-800 text-sm mt-1">
            Any task that can be done by someone else for less than <strong>{formatCurrency(calculatedHourlyRate)}/hour</strong> should
            be delegated. You&apos;re losing money every time you do a low-value task yourself!
          </p>
        </div>
      )}

      {/* Save Button */}
      <div className="flex justify-center">
        <button
          onClick={onSave}
          disabled={isSaving || calculatedHourlyRate <= 0}
          className="px-8 py-3 bg-teal-600 text-white rounded-lg font-medium hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSaving ? 'Saving...' : 'Save & Continue'}
        </button>
      </div>
    </div>
  )
}
