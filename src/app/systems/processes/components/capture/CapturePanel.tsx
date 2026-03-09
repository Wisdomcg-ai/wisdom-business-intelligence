'use client'

import { Plus } from 'lucide-react'
import type { ProcessSnapshot, SwimlaneDefinition, PhaseDefinition } from '@/types/process-builder'
import { SWIMLANE_COLOR_PALETTE, PHASE_COLOR_PALETTE } from '@/types/process-builder'
import type { BuilderAction } from '../../types'
import LaneSection from './LaneSection'
import NotesSection from './NotesSection'
import PhaseSection from './PhaseSection'

interface CapturePanelProps {
  snapshot: ProcessSnapshot
  selectedStepId: string | null
  dispatch: React.Dispatch<BuilderAction>
  onCollapse?: () => void
}

export default function CapturePanel({
  snapshot,
  selectedStepId,
  dispatch,
  onCollapse,
}: CapturePanelProps) {
  const sortedLanes = [...snapshot.swimlanes].sort((a, b) => a.order - b.order)
  const sortedPhases = [...(snapshot.phases || [])].sort((a, b) => a.order - b.order)

  const handleAddLane = () => {
    const colorIndex = snapshot.swimlanes.length % SWIMLANE_COLOR_PALETTE.length
    const maxOrder = snapshot.swimlanes.length > 0
      ? Math.max(...snapshot.swimlanes.map((l) => l.order))
      : -1
    const newLane: SwimlaneDefinition = {
      id: crypto.randomUUID(),
      name: `Lane ${snapshot.swimlanes.length + 1}`,
      color: SWIMLANE_COLOR_PALETTE[colorIndex],
      order: maxOrder + 1,
    }
    dispatch({ type: 'ADD_SWIMLANE', payload: newLane })
  }

  const handleAddPhase = () => {
    const phases = snapshot.phases || []
    const colorIndex = phases.length % PHASE_COLOR_PALETTE.length
    const maxOrder = phases.length > 0
      ? Math.max(...phases.map((p) => p.order))
      : -1
    const newPhase: PhaseDefinition = {
      id: crypto.randomUUID(),
      name: `Phase ${phases.length + 1}`,
      color: PHASE_COLOR_PALETTE[colorIndex],
      order: maxOrder + 1,
    }
    dispatch({ type: 'ADD_PHASE', payload: newPhase })
  }

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 bg-white flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-gray-800">Capture</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            {snapshot.steps.length} steps across {sortedLanes.length} lanes
          </p>
        </div>
        {onCollapse && (
          <button
            onClick={onCollapse}
            className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-600 transition-colors"
            title="Collapse panel"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
        )}
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {/* Business Functions (Phases) */}
        {(sortedPhases.length > 0 || sortedLanes.length > 0) && (
          <div className="space-y-1.5">
            <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide px-1">
              Business Functions
            </h3>
            {sortedPhases.map((phase) => (
              <PhaseSection
                key={phase.id}
                phase={phase}
                stepCount={snapshot.steps.filter((s) => s.phase_id === phase.id).length}
                dispatch={dispatch}
              />
            ))}
            <button
              onClick={handleAddPhase}
              className="w-full flex items-center justify-center gap-2 py-2 text-xs text-gray-500 hover:text-gray-700 hover:bg-white border-2 border-dashed border-gray-200 rounded-lg transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Phase
            </button>
            {sortedPhases.length > 0 && (
              <p className="text-[10px] text-gray-400 px-1">
                Click the phase pill on each step below to assign it to a phase.
              </p>
            )}
          </div>
        )}

        {/* Lane sections */}
        {sortedLanes.map((lane) => (
          <LaneSection
            key={lane.id}
            lane={lane}
            steps={snapshot.steps}
            selectedStepId={selectedStepId}
            dispatch={dispatch}
            phases={sortedPhases}
          />
        ))}

        {/* Add lane button */}
        <button
          onClick={handleAddLane}
          className="w-full flex items-center justify-center gap-2 py-3 text-sm text-gray-500 hover:text-gray-700 hover:bg-white border-2 border-dashed border-gray-200 rounded-xl transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Lane
        </button>

        {/* Brainstorm notes */}
        <NotesSection notes={snapshot.notes} dispatch={dispatch} />

        {/* Empty state */}
        {sortedLanes.length === 0 && (
          <div className="text-center py-8">
            <div className="w-12 h-12 mx-auto bg-gray-100 rounded-xl flex items-center justify-center mb-3">
              <Plus className="w-6 h-6 text-gray-300" />
            </div>
            <p className="text-sm font-medium text-gray-500">Start by adding a lane</p>
            <p className="text-xs text-gray-400 mt-1">
              Each lane represents a person or team in your process
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
