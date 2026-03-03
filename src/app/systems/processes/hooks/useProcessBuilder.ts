'use client'

import { useReducer, useCallback, useRef, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useBusinessContext } from '@/hooks/useBusinessContext'
import { builderReducer, createInitialState } from '../utils/builder-reducer'
import type { BuilderState, BuilderAction } from '../types'
import type { ProcessSnapshot } from '@/types/process-builder'

interface UseProcessBuilderOptions {
  processId: string
  initialName?: string
  initialDescription?: string
  initialSnapshot?: ProcessSnapshot
}

export function useProcessBuilder({
  processId,
  initialName,
  initialDescription,
  initialSnapshot,
}: UseProcessBuilderOptions) {
  const supabase = createClient()
  const { activeBusiness } = useBusinessContext()
  const activeBusinessRef = useRef(activeBusiness)
  activeBusinessRef.current = activeBusiness

  const [state, dispatch] = useReducer(
    builderReducer,
    createInitialState(processId, initialName, initialDescription, initialSnapshot)
  )

  // Refs for auto-save
  const stateRef = useRef<BuilderState>(state)
  stateRef.current = state
  const lastSavedRef = useRef<string>(JSON.stringify(initialSnapshot || {}))
  const saveTimeoutRef = useRef<NodeJS.Timeout>()

  // Save to server
  const save = useCallback(async () => {
    const current = stateRef.current
    const snapStr = JSON.stringify(current.snapshot)
    if (snapStr === lastSavedRef.current && !current.isDirty) return

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const biz = activeBusinessRef.current
      const targetUserId = biz?.ownerId || user.id

      const res = await fetch(`/api/processes/${processId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: current.processName,
          description: current.description,
          process_data: current.snapshot,
          step_count: current.snapshot.steps.length,
          decision_count: current.snapshot.steps.filter((s) => s.step_type === 'decision').length,
          swimlane_count: current.snapshot.swimlanes.length,
          user_id: targetUserId,
        }),
      })

      if (res.ok) {
        lastSavedRef.current = snapStr
        dispatch({ type: 'MARK_SAVED' })
      }
    } catch (error) {
      console.error('Error saving process:', error)
    }
  }, [processId, supabase])

  // Schedule auto-save on dirty
  useEffect(() => {
    if (!state.isDirty) return

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }

    saveTimeoutRef.current = setTimeout(() => {
      save()
    }, 2000)

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
    }
  }, [state.isDirty, state.snapshot, state.processName, state.description, save])

  // Keyboard shortcuts for undo/redo
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        dispatch({ type: 'UNDO' })
      } else if (
        ((e.ctrlKey || e.metaKey) && e.key === 'y') ||
        ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'z')
      ) {
        e.preventDefault()
        dispatch({ type: 'REDO' })
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const canUndo = state.historyIndex > 0
  const canRedo = state.historyIndex < state.history.length - 1

  return {
    state,
    dispatch,
    save,
    canUndo,
    canRedo,
  }
}
