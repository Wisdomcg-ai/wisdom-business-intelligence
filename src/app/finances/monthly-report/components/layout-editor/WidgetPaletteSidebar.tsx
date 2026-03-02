'use client'

import { useState, useMemo } from 'react'
import { Search } from 'lucide-react'
import type { WidgetType } from '../../types/pdf-layout'
import { WIDGET_CATEGORIES, getWidgetsByCategory } from '../../constants/widget-registry'
import PaletteWidgetCard from './PaletteWidgetCard'

interface WidgetPaletteSidebarProps {
  placedWidgetTypes: Set<WidgetType>
  availableData: {
    report: boolean
    fullYear: boolean
    cashflow: boolean
    subscriptions: boolean
    wages: boolean
  }
}

export default function WidgetPaletteSidebar({
  placedWidgetTypes,
  availableData,
}: WidgetPaletteSidebarProps) {
  const [search, setSearch] = useState('')

  const isDataAvailable = (dep?: string): boolean => {
    if (!dep) return true
    return availableData[dep as keyof typeof availableData] ?? false
  }

  return (
    <div className="w-[260px] bg-gray-50 border-l border-gray-200 flex flex-col shrink-0">
      <div className="p-3 border-b border-gray-200">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Widgets</h3>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter widgets..."
            className="w-full pl-7 pr-2 py-1.5 text-xs bg-white border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-brand-orange focus:border-brand-orange"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {WIDGET_CATEGORIES.map(cat => {
          const widgets = getWidgetsByCategory(cat.key).filter(w =>
            !search || w.label.toLowerCase().includes(search.toLowerCase())
          )
          if (widgets.length === 0) return null

          return (
            <div key={cat.key} className="mb-3">
              <h4 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5 px-1">
                {cat.label}
              </h4>
              <div className="space-y-1">
                {widgets.map(w => (
                  <PaletteWidgetCard
                    key={w.type}
                    definition={w}
                    isPlaced={placedWidgetTypes.has(w.type)}
                    isAvailable={isDataAvailable(w.dataDependency)}
                  />
                ))}
              </div>
            </div>
          )
        })}
      </div>

      <div className="p-2 border-t border-gray-200">
        <p className="text-[10px] text-gray-400 text-center">
          Drag widgets onto the page canvas
        </p>
      </div>
    </div>
  )
}
