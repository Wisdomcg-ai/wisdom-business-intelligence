'use client'

import { useState } from 'react'
import { HelpCircle } from 'lucide-react'

// Shared formatters and utilities for monthly report charts

export function fmtCurrency(value: number): string {
  const abs = Math.abs(value)
  const formatted = abs.toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
  return value < 0 ? `-$${formatted}` : `$${formatted}`
}

export function fmtAxisTick(v: number): string {
  const abs = Math.abs(v)
  const sign = v < 0 ? '-' : ''
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(0)}K`
  return `${sign}$${abs.toFixed(0)}`
}

export function fmtPct(value: number): string {
  return `${value >= 0 ? '' : '-'}${Math.abs(value).toFixed(1)}%`
}

export function getMonthLabel(monthKey: string): string {
  const date = new Date(monthKey + '-01')
  return date.toLocaleDateString('en-AU', { month: 'short' })
}

export function ChartCard({ title, subtitle, tooltip, children }: { title: string; subtitle?: string; tooltip?: string; children: React.ReactNode }) {
  const [showTooltip, setShowTooltip] = useState(false)

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
          {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
        </div>
        {tooltip && (
          <div className="relative">
            <button
              onClick={() => setShowTooltip(!showTooltip)}
              onBlur={() => setTimeout(() => setShowTooltip(false), 150)}
              className="text-gray-400 hover:text-gray-600 transition-colors p-0.5"
              aria-label="What does this chart show?"
            >
              <HelpCircle className="w-4 h-4" />
            </button>
            {showTooltip && (
              <div className="absolute right-0 top-7 z-10 w-64 bg-gray-900 text-white text-xs rounded-lg p-3 shadow-lg leading-relaxed">
                {tooltip}
                <div className="absolute -top-1.5 right-2 w-3 h-3 bg-gray-900 rotate-45" />
              </div>
            )}
          </div>
        )}
      </div>
      <div className="mt-3">{children}</div>
    </div>
  )
}
