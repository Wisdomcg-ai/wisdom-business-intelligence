'use client'

import { useState } from 'react'
import { Trash2, Check } from 'lucide-react'
import type { PhaseDefinition, PhaseColor } from '@/types/process-builder'
import { PHASE_COLOR_PALETTE } from '@/types/process-builder'
import type { BuilderAction } from '../../types'

interface PhaseSectionProps {
  phase: PhaseDefinition
  stepCount: number
  dispatch: React.Dispatch<BuilderAction>
}

export default function PhaseSection({ phase, stepCount, dispatch }: PhaseSectionProps) {
  const [editingName, setEditingName] = useState(false)
  const [nameValue, setNameValue] = useState(phase.name)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const handleNameSave = () => {
    if (nameValue.trim() && nameValue !== phase.name) {
      dispatch({
        type: 'UPDATE_PHASE',
        payload: { id: phase.id, updates: { name: nameValue.trim() } },
      })
    }
    setEditingName(false)
  }

  const handleCycleColor = () => {
    const currentIdx = PHASE_COLOR_PALETTE.findIndex((c) => c.primary === phase.color.primary)
    const nextIdx = (currentIdx + 1) % PHASE_COLOR_PALETTE.length
    dispatch({
      type: 'UPDATE_PHASE',
      payload: { id: phase.id, updates: { color: PHASE_COLOR_PALETTE[nextIdx] } },
    })
  }

  const handleDelete = () => {
    if (!confirmDelete) {
      setConfirmDelete(true)
      setTimeout(() => setConfirmDelete(false), 3000)
      return
    }
    dispatch({ type: 'DELETE_PHASE', payload: phase.id })
  }

  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-lg">
      {/* Color dot (click to cycle) */}
      <button
        onClick={handleCycleColor}
        className="w-5 h-5 rounded-full shrink-0 border-2 border-white shadow-sm"
        style={{ backgroundColor: phase.color.primary }}
        title={`Color: ${phase.color.name} (click to cycle)`}
      />

      {/* Phase name */}
      {editingName ? (
        <input
          autoFocus
          value={nameValue}
          onChange={(e) => setNameValue(e.target.value)}
          onBlur={handleNameSave}
          onKeyDown={(e) => e.key === 'Enter' && handleNameSave()}
          className="flex-1 text-sm font-semibold border border-orange-300 rounded px-1.5 py-0.5 focus:outline-none"
        />
      ) : (
        <span
          className="flex-1 text-sm font-semibold text-gray-800 cursor-pointer"
          onDoubleClick={() => {
            setNameValue(phase.name)
            setEditingName(true)
          }}
          title="Double-click to rename"
        >
          {phase.name}
        </span>
      )}

      {/* Step count */}
      <span className="text-xs text-gray-400 shrink-0">
        {stepCount} step{stepCount !== 1 ? 's' : ''}
      </span>

      {/* Delete */}
      <button
        onClick={handleDelete}
        className={`p-1 rounded text-xs ${
          confirmDelete
            ? 'text-red-600 bg-red-50 hover:bg-red-100'
            : 'text-gray-300 hover:text-red-400 hover:bg-gray-100'
        }`}
        title={confirmDelete ? 'Click again to confirm' : 'Delete phase'}
      >
        {confirmDelete ? <Check className="w-3.5 h-3.5" /> : <Trash2 className="w-3.5 h-3.5" />}
      </button>
    </div>
  )
}
