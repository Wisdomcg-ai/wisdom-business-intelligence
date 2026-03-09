'use client'

import { useCallback, useState, useEffect, useRef } from 'react'
import { useProcessBuilder } from '../hooks/useProcessBuilder'
import ProcessToolbar from './ProcessToolbar'
import CapturePanel from './capture/CapturePanel'
import SVGPreviewPanel from './svg/SVGPreviewPanel'
import AIMapperPanel from './ai/AIMapperPanel'
import type { ProcessSnapshot, ProcessStepData, StepType } from '@/types/process-builder'
import { SVG } from '../utils/svg-layout'

interface ProcessBuilderProps {
  processId: string
  initialName: string
  initialDescription: string
  initialSnapshot: ProcessSnapshot
}

export default function ProcessBuilder({
  processId,
  initialName,
  initialDescription,
  initialSnapshot,
}: ProcessBuilderProps) {
  const { state, dispatch, save, canUndo, canRedo } = useProcessBuilder({
    processId,
    initialName,
    initialDescription,
    initialSnapshot,
  })

  const [aiPanelOpen, setAiPanelOpen] = useState(false)
  const [captureWidth, setCaptureWidth] = useState(420)
  const [isDraggingDivider, setIsDraggingDivider] = useState(false)
  const [panelCollapsed, setPanelCollapsed] = useState(false)
  const [editingStepId, setEditingStepId] = useState<string | null>(null)
  const [newlyAddedStepId, setNewlyAddedStepId] = useState<string | null>(null)
  const [deletingStepIds, setDeletingStepIds] = useState<string[] | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Handle step click in SVG → select in capture panel
  const handleSVGStepClick = useCallback(
    (stepId: string) => {
      dispatch({ type: 'SELECT_STEP', payload: stepId })
    },
    [dispatch]
  )

  // Fit to screen zoom calculation
  const handleFitToScreen = useCallback(() => {
    const uniqueCols = new Set(state.snapshot.steps.map((s) => s.order_num)).size
    const contentW = SVG.SIDEBAR_W + SVG.PAD * 2 + Math.max(uniqueCols, 1) * (SVG.CARD_W + SVG.GAP_X)
    const viewportW = window.innerWidth - captureWidth - 48
    const idealZoom = Math.min(1.5, Math.max(0.3, viewportW / contentW))
    dispatch({ type: 'SET_ZOOM', payload: Math.round(idealZoom * 20) / 20 })
  }, [state.snapshot.steps, dispatch, captureWidth])

  // ─── Drag-and-drop handlers ─────────────────────────────────────────

  const handleStepMove = useCallback(
    (stepId: string, targetLaneId: string, targetOrderNum: number) => {
      const step = state.snapshot.steps.find((s) => s.id === stepId)
      if (!step) return

      // If lane and position didn't change, skip
      if (step.swimlane_id === targetLaneId && step.order_num === targetOrderNum) return

      // Single MOVE_STEP dispatch handles update + auto-connect + realignment
      dispatch({
        type: 'MOVE_STEP',
        payload: {
          stepId,
          targetSwimlaneId: targetLaneId,
          targetIndex: 0,
          targetOrderNum,
        },
      })
    },
    [dispatch, state.snapshot.steps]
  )

  const handleFlowCreate = useCallback(
    (fromStepId: string, toStepId: string, fromPort?: 'right' | 'bottom' | 'left' | 'top') => {
      // Don't create duplicate flows
      const exists = state.snapshot.flows.some(
        (f) => f.from_step_id === fromStepId && f.to_step_id === toStepId
      )
      if (exists) return

      // If source is a decision step, auto-assign the option label/color
      const fromStep = state.snapshot.steps.find((s) => s.id === fromStepId)
      let conditionLabel: string | undefined
      let conditionColor: string | undefined

      if (fromStep?.step_type === 'decision') {
        const options = fromStep.decision_options && fromStep.decision_options.length > 0
          ? fromStep.decision_options
          : fromStep.decision_yes_label || fromStep.decision_no_label
            ? [
                { label: fromStep.decision_yes_label || 'Yes', color: 'green' },
                { label: fromStep.decision_no_label || 'No', color: 'red' },
              ]
            : [{ label: 'Yes', color: 'green' }, { label: 'No', color: 'red' }]

        // Map port → option: try color-based match first, then index-based fallback
        const PORT_TO_COLOR: Record<string, string> = {
          right: 'green', bottom: 'red', left: 'blue', top: 'orange',
        }
        const PORT_TO_INDEX: Record<string, number> = {
          right: 0, bottom: 1, left: 2, top: 3,
        }

        if (fromPort) {
          // Try finding option by the port's expected color
          const portColor = PORT_TO_COLOR[fromPort]
          const portOption = options.find((o) => o.color === portColor)
          if (portOption) {
            conditionLabel = portOption.label
            conditionColor = portOption.color
          } else {
            // Fallback: use the option at the port's index position
            const idx = PORT_TO_INDEX[fromPort]
            if (idx < options.length) {
              conditionLabel = options[idx].label
              conditionColor = options[idx].color
            }
          }
        } else {
          // No port info — assign next available option by counting existing flows
          const existingFlowCount = state.snapshot.flows.filter(
            (f) => f.from_step_id === fromStepId
          ).length

          if (existingFlowCount < options.length) {
            conditionLabel = options[existingFlowCount].label
            conditionColor = options[existingFlowCount].color
          }
        }
      }

      dispatch({
        type: 'ADD_FLOW',
        payload: {
          id: crypto.randomUUID(),
          from_step_id: fromStepId,
          to_step_id: toStepId,
          flow_type: fromStep?.step_type === 'decision' ? 'decision' : 'sequential',
          condition_label: conditionLabel,
          condition_color: conditionColor,
        },
      })
    },
    [dispatch, state.snapshot.flows, state.snapshot.steps]
  )

  const handleFlowDelete = useCallback(
    (flowId: string) => {
      dispatch({ type: 'DELETE_FLOW', payload: flowId })
    },
    [dispatch]
  )

  // ─── Inline name editing ────────────────────────────────────────
  const handleStepNameCommit = useCallback(
    (stepId: string, newName: string) => {
      dispatch({ type: 'UPDATE_STEP', payload: { id: stepId, updates: { action_name: newName } } })
      setEditingStepId(null)
    },
    [dispatch]
  )

  const handleStepDoubleClick = useCallback((stepId: string) => {
    setEditingStepId(stepId)
    dispatch({ type: 'SELECT_STEP', payload: stepId })
  }, [dispatch])

  // ─── Add step on diagram ────────────────────────────────────────
  const handleDiagramStepAdd = useCallback(
    (laneId: string, orderNum: number): string => {
      const newId = crypto.randomUUID()
      const newStep: ProcessStepData = {
        id: newId,
        swimlane_id: laneId,
        order_num: orderNum,
        action_name: 'New Step',
        step_type: 'action',
        systems_used: [],
        documents_needed: [],
      }
      dispatch({ type: 'ADD_STEP', payload: newStep })
      dispatch({ type: 'SELECT_STEP', payload: newId })
      setNewlyAddedStepId(newId)
      setTimeout(() => setNewlyAddedStepId(null), 300)
      // Enter edit mode after a tick
      setTimeout(() => setEditingStepId(newId), 50)
      return newId
    },
    [dispatch]
  )

  // ─── Insert step between ────────────────────────────────────────
  const handleInsertStepBetween = useCallback(
    (fromStepId: string, toStepId: string, flowId: string): string => {
      const fromStep = state.snapshot.steps.find((s) => s.id === fromStepId)
      if (!fromStep) return ''
      const newId = crypto.randomUUID()
      const newStep: ProcessStepData = {
        id: newId,
        swimlane_id: fromStep.swimlane_id,
        order_num: 0,
        action_name: 'New Step',
        step_type: 'action',
        systems_used: [],
        documents_needed: [],
      }
      dispatch({
        type: 'INSERT_STEP_BETWEEN',
        payload: { newStep, fromStepId, toStepId, oldFlowId: flowId },
      })
      dispatch({ type: 'SELECT_STEP', payload: newId })
      setNewlyAddedStepId(newId)
      setTimeout(() => setNewlyAddedStepId(null), 300)
      setTimeout(() => setEditingStepId(newId), 50)
      return newId
    },
    [dispatch, state.snapshot.steps]
  )

  // ─── Delete with animation ──────────────────────────────────────
  const handleAnimatedDelete = useCallback(
    (stepIds: string | string[]) => {
      const ids = Array.isArray(stepIds) ? stepIds : [stepIds]
      if (ids.length === 0) return
      setDeletingStepIds(ids)
      setTimeout(() => {
        dispatch({ type: 'DELETE_STEP', payload: ids.length === 1 ? ids[0] : ids })
        setDeletingStepIds(null)
      }, 250)
    },
    [dispatch]
  )

  // ─── Port popover handlers ─────────────────────────────────────────

  const handlePortAddStep = useCallback(
    (sourceStepId: string, port: 'right' | 'bottom' | 'left' | 'top', stepType: StepType, overrideLaneId?: string) => {
      const sourceStep = state.snapshot.steps.find((s) => s.id === sourceStepId)
      if (!sourceStep) return

      // Use the lane chosen in the popover, or default to same lane
      const targetLaneId = overrideLaneId || sourceStep.swimlane_id
      const isCrossLane = targetLaneId !== sourceStep.swimlane_id
      // Cross-lane bottom/top: place at same column (directly below/above source step)
      // All other cases: place at next column (continue forward)
      const targetOrderNum = (isCrossLane && (port === 'bottom' || port === 'top'))
        ? sourceStep.order_num
        : sourceStep.order_num + 1

      const newId = crypto.randomUUID()
      const newStep: ProcessStepData = {
        id: newId,
        swimlane_id: targetLaneId,
        order_num: targetOrderNum,
        action_name: stepType === 'decision' ? 'New Decision' : 'New Step',
        step_type: stepType,
        systems_used: [],
        documents_needed: [],
        ...(stepType === 'decision' ? {
          decision_options: [
            { label: 'Yes', color: 'green' },
            { label: 'No', color: 'red' },
          ],
        } : {}),
      }

      dispatch({ type: 'ADD_STEP', payload: { ...newStep, allowSameColumn: true } })
      handleFlowCreate(sourceStepId, newId, port)
      dispatch({ type: 'SELECT_STEP', payload: newId })
      setNewlyAddedStepId(newId)
      setTimeout(() => setNewlyAddedStepId(null), 300)
      setTimeout(() => setEditingStepId(newId), 50)
    },
    [dispatch, state.snapshot.steps, state.snapshot.swimlanes, handleFlowCreate]
  )

  const handlePortReplaceConnection = useCallback(
    (sourceStepId: string, port: 'right' | 'bottom' | 'left' | 'top', stepType: StepType, overrideLaneId?: string) => {
      // Delete all outgoing flows from this step
      const outgoing = state.snapshot.flows.filter((f) => f.from_step_id === sourceStepId)
      for (const flow of outgoing) {
        dispatch({ type: 'DELETE_FLOW', payload: flow.id })
      }
      // Create new step + flow
      handlePortAddStep(sourceStepId, port, stepType, overrideLaneId)
    },
    [dispatch, state.snapshot.flows, handlePortAddStep]
  )

  const handleConvertToDecision = useCallback(
    (stepId: string) => {
      dispatch({
        type: 'UPDATE_STEP',
        payload: {
          id: stepId,
          updates: {
            step_type: 'decision' as StepType,
            decision_options: [
              { label: 'Yes', color: 'green' },
              { label: 'No', color: 'red' },
            ],
          },
        },
      })
      // Popover stays open — re-renders with normal menu since step is now a decision
    },
    [dispatch]
  )

  // ─── Keyboard shortcuts ──────────────────────────────────────────
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Skip if focus is on input/textarea
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (editingStepId) return

      switch (e.key) {
        case 'Delete':
        case 'Backspace': {
          if (state.selectedStepId) {
            e.preventDefault()
            handleAnimatedDelete(state.selectedStepId)
          }
          break
        }
        case 'Enter': {
          if (state.selectedStepId) {
            e.preventDefault()
            setEditingStepId(state.selectedStepId)
          }
          break
        }
        case 'Escape': {
          e.preventDefault()
          dispatch({ type: 'SELECT_STEP', payload: null })
          setEditingStepId(null)
          break
        }
        case 'n':
        case 'N': {
          if (!e.metaKey && !e.ctrlKey) {
            const selectedStep = state.selectedStepId
              ? state.snapshot.steps.find((s) => s.id === state.selectedStepId)
              : null
            const laneId = selectedStep?.swimlane_id || state.snapshot.swimlanes[0]?.id
            if (laneId) {
              e.preventDefault()
              handleDiagramStepAdd(laneId, 0)
            }
          }
          break
        }
        case 'Tab': {
          if (state.snapshot.steps.length > 0) {
            e.preventDefault()
            // Sort steps by lane order then column for visual navigation
            const sortedLanes = [...state.snapshot.swimlanes].sort((a, b) => a.order - b.order)
            const laneOrder = new Map(sortedLanes.map((l, i) => [l.id, i]))
            const steps = [...state.snapshot.steps].sort((a, b) => {
              const laneA = laneOrder.get(a.swimlane_id) ?? 0
              const laneB = laneOrder.get(b.swimlane_id) ?? 0
              if (laneA !== laneB) return laneA - laneB
              return a.order_num - b.order_num
            })
            const currentIdx = steps.findIndex((s) => s.id === state.selectedStepId)
            let nextIdx: number
            if (e.shiftKey) {
              nextIdx = currentIdx <= 0 ? steps.length - 1 : currentIdx - 1
            } else {
              nextIdx = currentIdx >= steps.length - 1 ? 0 : currentIdx + 1
            }
            dispatch({ type: 'SELECT_STEP', payload: steps[nextIdx].id })
          }
          break
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [state.selectedStepId, state.snapshot.steps, state.snapshot.swimlanes, editingStepId, dispatch, handleDiagramStepAdd, handleAnimatedDelete])

  // Resizable divider
  const handleDividerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsDraggingDivider(true)

    const startX = e.clientX
    const startWidth = captureWidth

    const handleMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - startX
      const newWidth = Math.min(600, Math.max(300, startWidth + delta))
      setCaptureWidth(newWidth)
    }

    const handleMouseUp = () => {
      setIsDraggingDivider(false)
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
  }, [captureWidth])

  return (
    <div ref={containerRef} className="h-full flex flex-col bg-gray-50">
      {/* Toolbar */}
      <ProcessToolbar
        name={state.processName}
        isDirty={state.isDirty}
        canUndo={canUndo}
        canRedo={canRedo}
        snapshot={state.snapshot}
        aiPanelOpen={aiPanelOpen}
        onNameChange={(name) => dispatch({ type: 'SET_NAME', payload: name })}
        onSave={save}
        onUndo={() => dispatch({ type: 'UNDO' })}
        onRedo={() => dispatch({ type: 'REDO' })}
        onToggleAI={() => setAiPanelOpen((prev) => !prev)}
      />

      {/* Two-panel layout */}
      <div className="flex-1 min-h-0 flex">
        {/* Left: Capture Panel + AI Mapper (collapsible) */}
        {panelCollapsed ? (
          <div className="w-6 shrink-0 bg-white border-r border-gray-200 flex flex-col items-center pt-3">
            <button
              onClick={() => setPanelCollapsed(false)}
              className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-600"
              title="Expand panel"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </div>
        ) : (
          <>
            <div
              className="flex flex-col shrink-0"
              style={{ width: captureWidth }}
            >
              <div className={`flex-1 min-h-0 ${aiPanelOpen ? 'max-h-[60%]' : ''}`}>
                <CapturePanel
                  snapshot={state.snapshot}
                  selectedStepId={state.selectedStepId}
                  dispatch={dispatch}
                  onCollapse={() => setPanelCollapsed(true)}
                />
              </div>

              {/* AI Mapper Panel (docked at bottom of capture panel) */}
              {aiPanelOpen && (
                <AIMapperPanel
                  snapshot={state.snapshot}
                  dispatch={dispatch}
                />
              )}
            </div>

            {/* Resizable divider */}
            <div
              className={`w-1 cursor-col-resize hover:bg-orange-300 transition-colors shrink-0 ${
                isDraggingDivider ? 'bg-orange-400' : 'bg-gray-200'
              }`}
              onMouseDown={handleDividerMouseDown}
            />
          </>
        )}

        {/* Right: SVG Preview */}
        <SVGPreviewPanel
          snapshot={state.snapshot}
          selectedStepId={state.selectedStepId}
          zoom={state.zoom}
          onStepClick={handleSVGStepClick}
          onZoomIn={() => dispatch({ type: 'SET_ZOOM', payload: state.zoom + 0.1 })}
          onZoomOut={() => dispatch({ type: 'SET_ZOOM', payload: state.zoom - 0.1 })}
          onFitToScreen={handleFitToScreen}
          onSetZoom={(z) => dispatch({ type: 'SET_ZOOM', payload: z })}
          onStepMove={handleStepMove}
          onFlowCreate={handleFlowCreate}
          onFlowDelete={handleFlowDelete}
          processName={state.processName}
          editingStepId={editingStepId}
          onSetEditingStepId={setEditingStepId}
          onStepDoubleClick={handleStepDoubleClick}
          onStepNameCommit={handleStepNameCommit}
          onStepAdd={handleDiagramStepAdd}
          onInsertStepBetween={handleInsertStepBetween}
          onAnimatedDelete={handleAnimatedDelete}
          newlyAddedStepId={newlyAddedStepId}
          deletingStepIds={deletingStepIds}
          onPortAddStep={handlePortAddStep}
          onPortReplaceConnection={handlePortReplaceConnection}
          onConvertToDecision={handleConvertToDecision}
          dispatch={dispatch}
        />
      </div>
    </div>
  )
}
