'use client'

import { Plus } from 'lucide-react'
import type { ProcessSnapshot, SwimlaneDefinition } from '@/types/process-builder'
import { SWIMLANE_COLOR_PALETTE } from '@/types/process-builder'
import type { BuilderAction } from '../../types'
import LaneSection from './LaneSection'
import NotesSection from './NotesSection'

interface CapturePanelProps {
  snapshot: ProcessSnapshot
  selectedStepId: string | null
  dispatch: React.Dispatch<BuilderAction>
}

export default function CapturePanel({
  snapshot,
  selectedStepId,
  dispatch,
}: CapturePanelProps) {
  const sortedLanes = [...snapshot.swimlanes].sort((a, b) => a.order - b.order)

  const handleAddLane = () => {
    const colorIndex = snapshot.swimlanes.length % SWIMLANE_COLOR_PALETTE.length
    const newLane: SwimlaneDefinition = {
      id: crypto.randomUUID(),
      name: `Lane ${snapshot.swimlanes.length + 1}`,
      color: SWIMLANE_COLOR_PALETTE[colorIndex],
      order: snapshot.swimlanes.length,
    }
    dispatch({ type: 'ADD_SWIMLANE', payload: newLane })
  }

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 bg-white">
        <h2 className="text-sm font-semibold text-gray-800">Capture</h2>
        <p className="text-xs text-gray-400 mt-0.5">
          {snapshot.steps.length} steps across {sortedLanes.length} lanes
        </p>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {/* Lane sections */}
        {sortedLanes.map((lane) => (
          <LaneSection
            key={lane.id}
            lane={lane}
            steps={snapshot.steps}
            selectedStepId={selectedStepId}
            dispatch={dispatch}
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
