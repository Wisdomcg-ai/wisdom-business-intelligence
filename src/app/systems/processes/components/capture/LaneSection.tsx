'use client'

import { useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  Plus,
  Trash2,
  Check,
} from 'lucide-react'
import type {
  ProcessStepData,
  SwimlaneDefinition,
  SwimlaneColor,
  PhaseDefinition,
} from '@/types/process-builder'
import type { BuilderAction } from '../../types'
import CaptureStepRow from './CaptureStepRow'

interface LaneSectionProps {
  lane: SwimlaneDefinition
  steps: ProcessStepData[]
  selectedStepId: string | null
  dispatch: React.Dispatch<BuilderAction>
  phases?: PhaseDefinition[]
}

export default function LaneSection({
  lane,
  steps,
  selectedStepId,
  dispatch,
  phases,
}: LaneSectionProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [nameValue, setNameValue] = useState(lane.name)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const laneSteps = steps
    .filter((s) => s.swimlane_id === lane.id)
    .sort((a, b) => a.order_num - b.order_num)

  const filledSteps = laneSteps.filter(
    (s) => s.description || s.systems_used.length > 0 || s.documents_needed.length > 0 || s.estimated_duration
  ).length
  const progress = laneSteps.length > 0 ? (filledSteps / laneSteps.length) * 100 : 0

  const handleNameSave = () => {
    if (nameValue.trim() && nameValue !== lane.name) {
      dispatch({
        type: 'UPDATE_SWIMLANE',
        payload: { id: lane.id, updates: { name: nameValue.trim() } },
      })
    }
    setEditingName(false)
  }

  const handleAddStep = () => {
    dispatch({
      type: 'ADD_STEP',
      payload: {
        id: crypto.randomUUID(),
        swimlane_id: lane.id,
        order_num: 0,
        action_name: 'New Step',
        step_type: 'action',
        systems_used: [],
        documents_needed: [],
      },
    })
  }

  const handleDeleteLane = () => {
    if (!confirmDelete) {
      setConfirmDelete(true)
      setTimeout(() => setConfirmDelete(false), 3000)
      return
    }
    dispatch({ type: 'DELETE_SWIMLANE', payload: lane.id })
  }

  const handleMoveStep = (stepId: string, direction: 'up' | 'down') => {
    const idx = laneSteps.findIndex((s) => s.id === stepId)
    if (idx < 0) return
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= laneSteps.length) return

    dispatch({
      type: 'SWAP_STEP_ORDER',
      payload: { stepIdA: laneSteps[idx].id, stepIdB: laneSteps[swapIdx].id },
    })
  }

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden bg-white">
      {/* Lane header */}
      <div
        className="flex items-center gap-2 px-3 py-2.5 cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={() => setCollapsed(!collapsed)}
      >
        {/* Color bar */}
        <div
          className="w-1 self-stretch rounded-full shrink-0"
          style={{ backgroundColor: lane.color.border }}
        />

        {/* Lane name */}
        {editingName ? (
          <input
            autoFocus
            value={nameValue}
            onChange={(e) => setNameValue(e.target.value)}
            onBlur={handleNameSave}
            onKeyDown={(e) => e.key === 'Enter' && handleNameSave()}
            onClick={(e) => e.stopPropagation()}
            className="flex-1 text-sm font-semibold border border-orange-300 rounded px-1.5 py-0.5 focus:outline-none"
          />
        ) : (
          <span
            className="flex-1 text-sm font-semibold text-gray-800"
            onDoubleClick={(e) => {
              e.stopPropagation()
              setNameValue(lane.name)
              setEditingName(true)
            }}
          >
            {lane.name}
          </span>
        )}

        {/* Step count */}
        <span className="text-xs text-gray-400">
          {laneSteps.length} step{laneSteps.length !== 1 ? 's' : ''}
        </span>

        {/* Progress bar */}
        {laneSteps.length > 0 && (
          <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden shrink-0">
            <div
              className="h-full bg-emerald-400 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}

        {/* Delete lane */}
        <button
          onClick={(e) => {
            e.stopPropagation()
            handleDeleteLane()
          }}
          className={`p-1 rounded text-xs ${
            confirmDelete
              ? 'text-red-600 bg-red-50 hover:bg-red-100'
              : 'text-gray-300 hover:text-red-400 hover:bg-gray-100'
          }`}
          title={confirmDelete ? 'Click again to confirm' : 'Delete lane'}
        >
          {confirmDelete ? <Check className="w-3.5 h-3.5" /> : <Trash2 className="w-3.5 h-3.5" />}
        </button>

        {/* Collapse chevron */}
        {collapsed ? (
          <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
        )}
      </div>

      {/* Steps list */}
      {!collapsed && (
        <div className="px-3 pb-3 space-y-1.5">
          {laneSteps.map((step, idx) => (
            <CaptureStepRow
              key={step.id}
              step={step}
              orderInLane={idx + 1}
              laneColor={lane.color}
              isSelected={selectedStepId === step.id}
              isFirst={idx === 0}
              isLast={idx === laneSteps.length - 1}
              onSelect={() => dispatch({ type: 'SELECT_STEP', payload: step.id })}
              onUpdate={(updates) =>
                dispatch({ type: 'UPDATE_STEP', payload: { id: step.id, updates } })
              }
              onDelete={() => dispatch({ type: 'DELETE_STEP', payload: step.id })}
              onMoveUp={() => handleMoveStep(step.id, 'up')}
              onMoveDown={() => handleMoveStep(step.id, 'down')}
              phases={phases}
            />
          ))}

          {/* Add step button */}
          <button
            onClick={handleAddStep}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-md border border-dashed border-gray-200 transition-colors"
          >
            <Plus className="w-3 h-3" />
            Add step
          </button>
        </div>
      )}
    </div>
  )
}
