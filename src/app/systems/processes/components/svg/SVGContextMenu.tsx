'use client'

import { useEffect, useRef } from 'react'
import type { ProcessSnapshot, StepType } from '@/types/process-builder'

interface ContextMenuState {
  type: 'step' | 'empty'
  x: number
  y: number
  stepId?: string
  laneId?: string
  orderNum?: number
}

interface SVGContextMenuProps {
  state: ContextMenuState
  snapshot: ProcessSnapshot
  onClose: () => void
  onEditName: (stepId: string) => void
  onChangeType: (stepId: string, type: StepType) => void
  onDuplicate: (stepId: string) => void
  onDelete: (stepId: string) => void
  onAddStepHere: (laneId: string, orderNum: number) => void
}

const STEP_TYPES: { type: StepType; label: string; icon: string }[] = [
  { type: 'action', label: 'Action', icon: '▶' },
  { type: 'decision', label: 'Decision', icon: '◆' },
  { type: 'wait', label: 'Wait', icon: '⏳' },
  { type: 'automation', label: 'Automation', icon: '⚡' },
]

export default function SVGContextMenu({
  state,
  snapshot,
  onClose,
  onEditName,
  onChangeType,
  onDuplicate,
  onDelete,
  onAddStepHere,
}: SVGContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    function handleScroll() { onClose() }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('scroll', handleScroll, true)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('scroll', handleScroll, true)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])

  // Boundary detection
  const menuStyle: React.CSSProperties = {
    position: 'absolute',
    left: state.x,
    top: state.y,
    zIndex: 50,
  }

  const step = state.stepId ? snapshot.steps.find((s) => s.id === state.stepId) : null

  if (state.type === 'step' && step) {
    return (
      <div ref={menuRef} style={menuStyle}>
        <div className="bg-white rounded-lg shadow-xl border border-gray-200 py-1 min-w-[180px] text-xs">
          <button
            onClick={() => onEditName(step.id)}
            className="w-full text-left px-3 py-1.5 hover:bg-gray-50 text-gray-700 flex items-center gap-2"
          >
            <span className="text-gray-400 w-4 text-center">✏️</span>
            Edit Name
          </button>

          <div className="h-px bg-gray-100 my-1" />

          <div className="px-3 py-1 text-[10px] text-gray-400 uppercase tracking-wider">Change Type</div>
          {STEP_TYPES.map(({ type, label, icon }) => (
            <button
              key={type}
              onClick={() => onChangeType(step.id, type)}
              className={`w-full text-left px-3 py-1.5 hover:bg-gray-50 flex items-center gap-2 ${
                step.step_type === type ? 'text-orange-600 font-semibold' : 'text-gray-700'
              }`}
            >
              <span className="w-4 text-center text-[10px]">{icon}</span>
              {label}
            </button>
          ))}

          <div className="h-px bg-gray-100 my-1" />

          <button
            onClick={() => onDuplicate(step.id)}
            className="w-full text-left px-3 py-1.5 hover:bg-gray-50 text-gray-700 flex items-center gap-2"
          >
            <span className="text-gray-400 w-4 text-center">📋</span>
            Duplicate
          </button>
          <button
            onClick={() => onDelete(step.id)}
            className="w-full text-left px-3 py-1.5 hover:bg-red-50 text-red-600 flex items-center gap-2"
          >
            <span className="w-4 text-center">🗑️</span>
            Delete
          </button>
        </div>
      </div>
    )
  }

  if (state.type === 'empty' && state.laneId) {
    return (
      <div ref={menuRef} style={menuStyle}>
        <div className="bg-white rounded-lg shadow-xl border border-gray-200 py-1 min-w-[160px] text-xs">
          <button
            onClick={() => onAddStepHere(state.laneId!, state.orderNum ?? 0)}
            className="w-full text-left px-3 py-1.5 hover:bg-gray-50 text-gray-700 flex items-center gap-2"
          >
            <span className="text-gray-400 w-4 text-center">➕</span>
            Add Step Here
          </button>
        </div>
      </div>
    )
  }

  return null
}
