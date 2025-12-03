import React, { useState } from 'react'
import { Info } from 'lucide-react'
import type { EngineData } from '../data/types'

interface EngineTooltipProps {
  engine: EngineData
  children: React.ReactNode
}

export function EngineTooltip({ engine, children }: EngineTooltipProps) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className="relative group">
      <div
        className="cursor-help"
        onMouseEnter={() => setIsOpen(true)}
        onMouseLeave={() => setIsOpen(false)}
        onClick={() => setIsOpen(!isOpen)}
      >
        {children}
        <button
          className="ml-1 inline-flex items-center opacity-50 group-hover:opacity-100 transition-opacity"
          aria-label={`Learn more about ${engine.name}`}
        >
          <Info className="h-3.5 w-3.5 text-gray-400" />
        </button>
      </div>

      {/* Tooltip */}
      {isOpen && (
        <div className="absolute z-50 top-full left-1/2 -translate-x-1/2 mt-2 w-64 sm:w-72">
          <div className="bg-gray-900 text-white rounded-lg shadow-xl p-3 text-left">
            {/* Arrow */}
            <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-0 h-0 border-l-8 border-r-8 border-b-8 border-l-transparent border-r-transparent border-b-gray-900" />

            <div className="font-semibold text-sm mb-1">{engine.name} Engine</div>
            <div className="text-xs text-gray-300 mb-2">{engine.subtitle}</div>
            <p className="text-xs text-gray-200 leading-relaxed">
              {engine.description}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
