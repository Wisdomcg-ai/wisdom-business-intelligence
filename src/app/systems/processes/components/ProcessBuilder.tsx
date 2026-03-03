'use client'

import { useCallback, useState } from 'react'
import { useProcessBuilder } from '../hooks/useProcessBuilder'
import ProcessToolbar from './ProcessToolbar'
import CapturePanel from './capture/CapturePanel'
import SVGPreviewPanel from './svg/SVGPreviewPanel'
import AIMapperPanel from './ai/AIMapperPanel'
import type { ProcessSnapshot } from '@/types/process-builder'
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
    <div className="h-full flex flex-col bg-gray-50">
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
        {/* Left: Capture Panel + AI Mapper */}
        <div
          className="flex flex-col shrink-0"
          style={{ width: captureWidth }}
        >
          <div className={`flex-1 min-h-0 ${aiPanelOpen ? 'max-h-[60%]' : ''}`}>
            <CapturePanel
              snapshot={state.snapshot}
              selectedStepId={state.selectedStepId}
              dispatch={dispatch}
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
        />
      </div>
    </div>
  )
}
