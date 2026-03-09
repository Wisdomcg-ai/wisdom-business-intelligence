'use client'

import { useState } from 'react'
import type { ProcessStepData, StepType } from '@/types/process-builder'

interface SVGStepToolbarProps {
  position: { x: number; y: number; stepId: string }
  step: ProcessStepData
  onChangeType: (type: StepType) => void
  onDelete: () => void
  onDuplicate: () => void
}

const TYPE_BUTTONS: { type: StepType; icon: string; label: string }[] = [
  { type: 'action', icon: '▶', label: 'Action' },
  { type: 'decision', icon: '◆', label: 'Decision' },
  { type: 'wait', icon: '⏳', label: 'Wait' },
  { type: 'automation', icon: '⚡', label: 'Automation' },
]

function ToolbarButton({
  icon,
  label,
  isActive,
  className,
  onClick,
}: {
  icon: string
  label: string
  isActive?: boolean
  className?: string
  onClick: (e: React.MouseEvent) => void
}) {
  const [showTooltip, setShowTooltip] = useState(false)

  return (
    <div className="relative">
      <button
        onClick={onClick}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        className={`px-1.5 py-1 text-[10px] rounded hover:bg-gray-100 transition-colors ${
          isActive
            ? 'bg-orange-50 text-orange-600 font-semibold'
            : className || 'text-gray-500'
        }`}
      >
        {icon}
      </button>
      {showTooltip && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 bg-gray-900 text-white text-[10px] font-medium rounded shadow-lg whitespace-nowrap pointer-events-none z-50">
          {label}
          <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-t-[4px] border-t-gray-900" />
        </div>
      )}
    </div>
  )
}

export default function SVGStepToolbar({
  position,
  step,
  onChangeType,
  onDelete,
  onDuplicate,
}: SVGStepToolbarProps) {
  if (!step) return null

  return (
    <div
      className="absolute z-30 pointer-events-auto"
      style={{
        left: position.x,
        top: Math.max(0, position.y),
        transform: 'translateX(-50%)',
      }}
    >
      <div className="flex items-center gap-0.5 bg-white rounded-lg shadow-lg border border-gray-200 px-1 py-0.5">
        {TYPE_BUTTONS.map(({ type, icon, label }) => (
          <ToolbarButton
            key={type}
            icon={icon}
            label={label}
            isActive={step.step_type === type}
            onClick={(e) => { e.stopPropagation(); onChangeType(type) }}
          />
        ))}
        <div className="w-px h-4 bg-gray-200 mx-0.5" />
        <ToolbarButton
          icon="📋"
          label="Duplicate"
          onClick={(e) => { e.stopPropagation(); onDuplicate() }}
        />
        <ToolbarButton
          icon="🗑"
          label="Delete"
          className="text-red-500 hover:bg-red-50"
          onClick={(e) => { e.stopPropagation(); onDelete() }}
        />
      </div>
    </div>
  )
}
