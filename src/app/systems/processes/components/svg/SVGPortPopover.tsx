'use client'

import { useEffect, useRef, useState } from 'react'
import type { ProcessSnapshot, StepType } from '@/types/process-builder'

export interface PortPopoverState {
  stepId: string
  port: 'right' | 'bottom' | 'left' | 'top'
  x: number  // container-relative px
  y: number  // container-relative px
}

interface SVGPortPopoverProps {
  state: PortPopoverState
  snapshot: ProcessSnapshot
  onClose: () => void
  onAddStep: (sourceStepId: string, port: 'right' | 'bottom' | 'left' | 'top', stepType: StepType, targetLaneId?: string) => void
  onConvertToDecision: (stepId: string) => void
  onReplaceConnection: (sourceStepId: string, port: 'right' | 'bottom' | 'left' | 'top', stepType: StepType, targetLaneId?: string) => void
}

const STEP_TYPES: { type: StepType; label: string; icon: string }[] = [
  { type: 'action', label: 'Action', icon: '▶' },
  { type: 'decision', label: 'Decision', icon: '◆' },
  { type: 'wait', label: 'Wait', icon: '⏳' },
  { type: 'automation', label: 'Automation', icon: '⚡' },
]

export default function SVGPortPopover({
  state,
  snapshot,
  onClose,
  onAddStep,
  onConvertToDecision,
  onReplaceConnection,
}: SVGPortPopoverProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [showReplaceTypes, setShowReplaceTypes] = useState(false)

  const sourceStep = snapshot.steps.find((s) => s.id === state.stepId)
  const sortedLanes = [...snapshot.swimlanes].sort((a, b) => a.order - b.order)

  // For NON-DECISION steps: bottom port defaults to next lane down, top to previous lane up.
  // For DECISION steps: all ports default to same lane (Yes/No branches stay in-lane).
  const getDefaultLane = () => {
    const fallback = sourceStep?.swimlane_id || sortedLanes[0]?.id || ''
    if (!sourceStep || sortedLanes.length <= 1) return fallback
    if (sourceStep.step_type === 'decision') return fallback
    const idx = sortedLanes.findIndex((l) => l.id === sourceStep.swimlane_id)
    if (idx < 0) return fallback
    if (state.port === 'bottom' && idx < sortedLanes.length - 1) return sortedLanes[idx + 1].id
    if (state.port === 'top' && idx > 0) return sortedLanes[idx - 1].id
    return fallback
  }
  const [selectedLaneId, setSelectedLaneId] = useState<string>(getDefaultLane())

  // Dismiss on click outside, Escape, scroll
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

  // Reset replace submenu when snapshot changes (e.g. after convert-to-decision)
  useEffect(() => {
    setShowReplaceTypes(false)
  }, [snapshot])

  // Bottom/top port on a non-decision step with existing outgoing flows:
  // auto-convert to decision so the user can branch without replacing.
  // The existing connection becomes the Yes path; the new one becomes No.
  // NOTE: declared above the `if (!sourceStep) return null` early-return so
  // the hooks run on every render (rules-of-hooks).
  const [autoConverted, setAutoConverted] = useState(false)

  const isDecision = sourceStep?.step_type === 'decision'
  const outgoingFlows = sourceStep
    ? snapshot.flows.filter((f) => f.from_step_id === state.stepId)
    : []
  const hasConflict = !!sourceStep && !isDecision && outgoingFlows.length > 0
  const showLanePicker = sortedLanes.length > 1

  useEffect(() => {
    if (hasConflict && (state.port === 'bottom' || state.port === 'top') && !autoConverted) {
      onConvertToDecision(state.stepId)
      setAutoConverted(true)
    }
  }, [hasConflict, state.port, state.stepId, onConvertToDecision, autoConverted])

  if (!sourceStep) return null

  const menuStyle: React.CSSProperties = {
    position: 'absolute',
    left: state.x,
    top: state.y,
    zIndex: 50,
  }

  // Lane picker section (shared between normal and replace menus)
  const lanePicker = showLanePicker && (
    <>
      <div className="h-px bg-gray-100 my-1" />
      <div className="px-3 py-1 text-[10px] text-gray-400 uppercase tracking-wider">Place in lane</div>
      <div className="px-2 pb-1 flex flex-wrap gap-1">
        {sortedLanes.map((lane) => (
          <button
            key={lane.id}
            onClick={() => setSelectedLaneId(lane.id)}
            className={`px-2 py-0.5 rounded text-[10px] font-medium border transition-colors ${
              selectedLaneId === lane.id
                ? 'text-white border-transparent'
                : 'text-gray-600 border-gray-200 hover:border-gray-300 bg-white'
            }`}
            style={selectedLaneId === lane.id ? { backgroundColor: lane.color.border } : undefined}
          >
            {lane.name}
          </button>
        ))}
      </div>
    </>
  )

  // Step type buttons factory
  const stepTypeButtons = (onClick: (type: StepType) => void) =>
    STEP_TYPES.map(({ type, label, icon }) => (
      <button
        key={type}
        onClick={() => onClick(type)}
        className="w-full text-left px-3 py-1.5 hover:bg-gray-50 text-gray-700 flex items-center gap-2"
      >
        <span className="w-4 text-center text-[10px]">{icon}</span>
        {label}
      </button>
    ))

  // Normal menu: add next step with 4 type buttons + lane picker
  if (!hasConflict) {
    return (
      <div ref={menuRef} style={menuStyle}>
        <div className="bg-white rounded-lg shadow-xl border border-gray-200 py-1 min-w-[180px] text-xs">
          <div className="px-3 py-1 text-[10px] text-gray-400 uppercase tracking-wider">Add next step</div>
          {stepTypeButtons((type) => {
            onAddStep(state.stepId, state.port, type, selectedLaneId)
            onClose()
          })}
          {lanePicker}
        </div>
      </div>
    )
  }

  // Guardrail menu: non-decision step already has outgoing flow
  return (
    <div ref={menuRef} style={menuStyle}>
      <div className="bg-white rounded-lg shadow-xl border border-gray-200 py-1 min-w-[200px] text-xs">
        <div className="px-3 py-1 text-[10px] text-gray-400">This step already has a connection</div>

        {!showReplaceTypes ? (
          <>
            <button
              onClick={() => setShowReplaceTypes(true)}
              className="w-full text-left px-3 py-1.5 hover:bg-gray-50 text-gray-700 flex items-center gap-2"
            >
              <span className="w-4 text-center text-[10px]">🔄</span>
              Replace existing connection
            </button>
            <button
              onClick={() => onConvertToDecision(state.stepId)}
              className="w-full text-left px-3 py-1.5 hover:bg-gray-50 text-gray-700 flex items-center gap-2"
            >
              <span className="w-4 text-center text-[10px]">◆</span>
              Convert to Decision (multiple paths)
            </button>
            <div className="h-px bg-gray-100 my-1" />
            <button
              onClick={onClose}
              className="w-full text-left px-3 py-1.5 hover:bg-gray-50 text-gray-500 flex items-center gap-2"
            >
              <span className="w-4 text-center text-[10px]">✕</span>
              Cancel
            </button>
          </>
        ) : (
          <>
            <div className="px-3 py-1 text-[10px] text-gray-400 uppercase tracking-wider">Replace with</div>
            {stepTypeButtons((type) => {
              onReplaceConnection(state.stepId, state.port, type, selectedLaneId)
              onClose()
            })}
            {lanePicker}
            <div className="h-px bg-gray-100 my-1" />
            <button
              onClick={() => setShowReplaceTypes(false)}
              className="w-full text-left px-3 py-1.5 hover:bg-gray-50 text-gray-500 flex items-center gap-2"
            >
              <span className="w-4 text-center text-[10px]">←</span>
              Back
            </button>
          </>
        )}
      </div>
    </div>
  )
}
