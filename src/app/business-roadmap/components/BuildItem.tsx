import React from 'react'
import { RoadmapBuild } from '../data/types'

interface BuildItemProps {
  build: RoadmapBuild
  isComplete: boolean
  completionPercentage?: number // New: from completion checks
  onClick: () => void
  onToggleComplete: (e: React.MouseEvent) => void
}

export function BuildItem({
  build,
  isComplete,
  completionPercentage,
  onClick,
  onToggleComplete
}: BuildItemProps) {
  return (
    <div className="flex items-start gap-2 p-2 hover:bg-gray-50 rounded transition-colors group">
      <input
        type="checkbox"
        checked={isComplete}
        onChange={() => {}}
        onClick={onToggleComplete}
        className="mt-1 w-4 h-4 accent-brand-orange rounded border-gray-300 focus:ring-brand-orange cursor-pointer flex-shrink-0"
      />
      <button
        onClick={onClick}
        className="text-left flex-1 text-sm text-gray-700 hover:text-brand-orange transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className={isComplete ? 'line-through text-gray-500' : ''}>{build.name}</span>

          {/* Completion indicator */}
          {!isComplete && completionPercentage !== undefined && completionPercentage > 0 && (
            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${
              completionPercentage < 33 ? 'bg-red-100 text-red-700' :
              completionPercentage < 66 ? 'bg-brand-orange-100 text-brand-orange-700' :
              completionPercentage < 100 ? 'bg-amber-100 text-amber-700' :
              'bg-green-100 text-green-700'
            }`}>
              {completionPercentage}%
            </span>
          )}

          {/* Click to assess hint for items not started */}
          {!isComplete && (completionPercentage === undefined || completionPercentage === 0) && (
            <span className="opacity-0 group-hover:opacity-100 text-xs text-brand-orange-500 transition-opacity">
              Click to assess →
            </span>
          )}
        </div>
      </button>
    </div>
  )
}
