import type { ProcessSnapshot, ProcessStepData, ProcessFlowData } from '@/types/process-builder'
import { DEFAULT_SNAPSHOT } from '@/types/process-builder'
import type { BuilderState, BuilderAction } from '../types'

const MAX_HISTORY = 50

/**
 * Repair decision flows missing condition_color or flow_type.
 * Handles flows from AI mapper (flow_type='sequential') and legacy flows.
 * Any non-auto flow from a decision step that has condition_label OR is flow_type='decision'
 * gets upgraded to flow_type='decision' and assigned a condition_color.
 */
function repairDecisionFlowColors(flows: ProcessFlowData[], steps: ProcessStepData[]): ProcessFlowData[] {
  let changed = false
  const repaired = flows.map((flow) => {
    // Skip flows that already have condition_color and correct flow_type
    if (flow.condition_color && flow.flow_type === 'decision') return flow

    const fromStep = steps.find((s) => s.id === flow.from_step_id)
    if (!fromStep || fromStep.step_type !== 'decision') return flow

    // Identify if this is a decision flow (vs auto-connected sequential)
    const isAutoFlow = flow.id.startsWith('auto-')
    const isDecisionFlow = flow.flow_type === 'decision' || !!flow.condition_label || !!flow.condition_color
    if (isAutoFlow && !isDecisionFlow) return flow

    // If it's a non-auto flow from a decision step but lacks markers,
    // check if there are enough non-auto flows to be decision branches
    if (!isDecisionFlow) {
      const nonAutoFlowsFromStep = flows.filter(
        (f) => f.from_step_id === flow.from_step_id && !f.id.startsWith('auto-')
      )
      // If there's only one non-auto flow, it might just be a regular sequential flow, not a decision branch
      if (nonAutoFlowsFromStep.length <= 1) return flow
    }

    const options = fromStep.decision_options && fromStep.decision_options.length > 0
      ? fromStep.decision_options
      : [{ label: 'Yes', color: 'green' }, { label: 'No', color: 'red' }]

    // Try matching by label first
    if (flow.condition_label) {
      const match = options.find((o) => o.label.toLowerCase() === flow.condition_label?.toLowerCase())
      if (match) {
        changed = true
        return { ...flow, flow_type: 'decision' as const, condition_color: match.color }
      }
    }

    // Fallback: assign by index among this decision's non-auto outgoing flows
    const decisionFlows = flows.filter(
      (f) => f.from_step_id === flow.from_step_id &&
        !f.id.startsWith('auto-') &&
        (f.flow_type === 'decision' || f.condition_label || f.condition_color ||
         flows.filter((ff) => ff.from_step_id === f.from_step_id && !ff.id.startsWith('auto-')).length > 1)
    )
    const myIdx = decisionFlows.findIndex((f) => f.id === flow.id)
    if (myIdx >= 0 && myIdx < options.length) {
      changed = true
      return {
        ...flow,
        flow_type: 'decision' as const,
        condition_color: options[myIdx].color,
        condition_label: flow.condition_label || options[myIdx].label,
      }
    }
    return flow
  })
  return changed ? repaired : flows
}

// ─── History helper ──────────────────────────────────────────────────

function pushHistory(state: BuilderState, newSnapshot: ProcessSnapshot): BuilderState {
  const pastHistory = state.history.slice(0, state.historyIndex + 1)
  const newHistory = [...pastHistory, newSnapshot].slice(-MAX_HISTORY)
  return {
    ...state,
    snapshot: newSnapshot,
    isDirty: true,
    history: newHistory,
    historyIndex: newHistory.length - 1,
  }
}

// ─── Auto-connect: rebuild within-lane sequential flows, preserve cross-lane ──

function autoConnect(snapshot: ProcessSnapshot): ProcessFlowData[] {
  // Keep non-sequential flows, decision flows, AND cross-lane sequential flows
  const preservedFlows = snapshot.flows.filter((f) => {
    if (f.flow_type === 'decision') return true
    if (f.flow_type !== 'sequential') return true
    // Keep flows with condition labels/colors (manually or decision-created)
    if (f.condition_label || f.condition_color) return true
    // Keep non-auto flows FROM decision steps — these are decision branches
    // (AI mapper creates them as flow_type='sequential' without markers)
    const from = snapshot.steps.find((s) => s.id === f.from_step_id)
    if (from?.step_type === 'decision' && !f.id.startsWith('auto-')) return true
    // Keep cross-lane sequential flows
    const to = snapshot.steps.find((s) => s.id === f.to_step_id)
    if (!from || !to) return false
    return from.swimlane_id !== to.swimlane_id
  })

  // Repair decision flows missing condition_color — assign from option order
  const repairedFlows = repairDecisionFlowColors(preservedFlows, snapshot.steps)

  // Build sets to prevent auto-flow through decision branches
  // Use repairedFlows which have corrected flow_type and condition_color
  const noAutoFlowFrom = new Set<string>()  // decision steps — their exits are handled by decision flows
  const noAutoFlowTo = new Set<string>()    // same-lane decision flow targets
  const preservedPairs = new Set<string>()  // dedup: skip if a preserved flow already connects these

  for (const flow of repairedFlows) {
    if (flow.flow_type !== 'decision' && !flow.condition_color && !flow.condition_label) continue
    const from = snapshot.steps.find((s) => s.id === flow.from_step_id)
    const to = snapshot.steps.find((s) => s.id === flow.to_step_id)
    if (!from || !to) continue
    noAutoFlowFrom.add(from.id)
    if (from.swimlane_id === to.swimlane_id) noAutoFlowTo.add(to.id)
  }

  for (const flow of repairedFlows) {
    preservedPairs.add(`${flow.from_step_id}→${flow.to_step_id}`)
  }

  // Rebuild within-lane sequential flows, respecting decision branches
  const withinLaneFlows: ProcessFlowData[] = []
  for (const lane of snapshot.swimlanes) {
    const laneSteps = snapshot.steps
      .filter((s) => s.swimlane_id === lane.id)
      .sort((a, b) => a.order_num - b.order_num)

    for (let i = 0; i < laneSteps.length - 1; i++) {
      const fromId = laneSteps[i].id
      const toId = laneSteps[i + 1].id
      // Don't auto-flow FROM a decision step (decision flows handle its exits)
      if (noAutoFlowFrom.has(fromId)) continue
      // Don't auto-flow TO a step that is a same-lane decision flow target
      if (noAutoFlowTo.has(toId)) continue
      // Don't duplicate a preserved flow
      if (preservedPairs.has(`${fromId}→${toId}`)) continue

      withinLaneFlows.push({
        id: `auto-${fromId}-${toId}`,
        from_step_id: fromId,
        to_step_id: toId,
        flow_type: 'sequential',
      })
    }
  }

  return [...repairedFlows, ...withinLaneFlows]
}

// ─── Column alignment: move target step under source on cross-lane flow ──

export function alignCrossLaneFlow(
  steps: ProcessStepData[],
  fromStepId: string,
  toStepId: string
): ProcessStepData[] {
  const fromStep = steps.find((s) => s.id === fromStepId)
  const toStep = steps.find((s) => s.id === toStepId)
  if (!fromStep || !toStep) return steps

  // Only align cross-lane flows
  if (fromStep.swimlane_id === toStep.swimlane_id) return steps

  const desiredColumn = fromStep.order_num

  // If target is already at or after the desired column, leave it
  if (toStep.order_num >= desiredColumn) return steps

  // Calculate shift needed
  const delta = desiredColumn - toStep.order_num

  // Get all steps in the target's lane, sorted by column
  const targetLaneSteps = steps
    .filter((s) => s.swimlane_id === toStep.swimlane_id)
    .sort((a, b) => a.order_num - b.order_num)

  // Find the target step's position in its lane
  const targetIdx = targetLaneSteps.findIndex((s) => s.id === toStepId)
  if (targetIdx === -1) return steps

  // Shift target and all steps after it in the lane by delta
  const stepsToShift = new Set(
    targetLaneSteps.slice(targetIdx).map((s) => s.id)
  )

  return steps.map((s) =>
    stepsToShift.has(s.id) ? { ...s, order_num: s.order_num + delta } : s
  )
}

// ─── Next available column for a lane ────────────────────────────────

function nextColumnInLane(steps: ProcessStepData[], swimlaneId: string): number {
  const laneSteps = steps.filter((s) => s.swimlane_id === swimlaneId)
  if (laneSteps.length === 0) return 0
  return Math.max(...laneSteps.map((s) => s.order_num)) + 1
}

// ─── Initial state factory ───────────────────────────────────────────

export function createInitialState(
  processId: string,
  name?: string,
  description?: string,
  snapshot?: ProcessSnapshot
): BuilderState {
  const snap = snapshot || DEFAULT_SNAPSHOT
  // Repair decision flows missing condition_color on initial load
  const repairedFlows = repairDecisionFlowColors(snap.flows, snap.steps)
  const repairedSnap = repairedFlows !== snap.flows
    ? { ...snap, flows: repairedFlows }
    : snap
  // If flows were repaired, mark as dirty so they get saved
  const needsSave = repairedFlows !== snap.flows
  return {
    processId,
    processName: name || '',
    description: description || '',
    snapshot: repairedSnap,
    selectedStepId: null,
    detailPanelOpen: false,
    zoom: 1,
    isDirty: needsSave,
    history: [repairedSnap],
    historyIndex: 0,
  }
}

// ─── Reducer ─────────────────────────────────────────────────────────

export function builderReducer(
  state: BuilderState,
  action: BuilderAction
): BuilderState {
  switch (action.type) {
    // ── Data lifecycle ──────────────────────────────────────────────
    case 'SET_DATA': {
      const snap = action.payload.snapshot
      return {
        ...state,
        processName: action.payload.name,
        description: action.payload.description,
        snapshot: snap,
        isDirty: false,
        history: [snap],
        historyIndex: 0,
      }
    }

    case 'MARK_SAVED': {
      return { ...state, isDirty: false }
    }

    // ── Process metadata ────────────────────────────────────────────
    case 'SET_NAME': {
      return { ...state, processName: action.payload, isDirty: true }
    }

    case 'SET_DESCRIPTION': {
      return { ...state, description: action.payload, isDirty: true }
    }

    // ── Sticky notes ────────────────────────────────────────────────
    case 'ADD_NOTE': {
      const newSnap: ProcessSnapshot = {
        ...state.snapshot,
        notes: [...state.snapshot.notes, action.payload],
      }
      return pushHistory(state, newSnap)
    }

    case 'UPDATE_NOTE': {
      const newSnap: ProcessSnapshot = {
        ...state.snapshot,
        notes: state.snapshot.notes.map((n) =>
          n.id === action.payload.id ? { ...n, ...action.payload.updates } : n
        ),
      }
      return pushHistory(state, newSnap)
    }

    case 'DELETE_NOTE': {
      const newSnap: ProcessSnapshot = {
        ...state.snapshot,
        notes: state.snapshot.notes.filter((n) => n.id !== action.payload),
      }
      return pushHistory(state, newSnap)
    }

    case 'ADD_NOTES_BATCH': {
      const newSnap: ProcessSnapshot = {
        ...state.snapshot,
        notes: [...state.snapshot.notes, ...action.payload],
      }
      return pushHistory(state, newSnap)
    }

    // ── Swimlanes ───────────────────────────────────────────────────
    case 'ADD_SWIMLANE': {
      const newSnap: ProcessSnapshot = {
        ...state.snapshot,
        swimlanes: [...state.snapshot.swimlanes, action.payload],
      }
      return pushHistory(state, newSnap)
    }

    case 'UPDATE_SWIMLANE': {
      const newSnap: ProcessSnapshot = {
        ...state.snapshot,
        swimlanes: state.snapshot.swimlanes.map((s) =>
          s.id === action.payload.id ? { ...s, ...action.payload.updates } : s
        ),
      }
      return pushHistory(state, newSnap)
    }

    case 'DELETE_SWIMLANE': {
      // Remove lane + move its steps back to notes
      const lane = state.snapshot.swimlanes.find((s) => s.id === action.payload)
      const stepsInLane = state.snapshot.steps.filter((s) => s.swimlane_id === action.payload)
      const notesFromSteps = stepsInLane.map((s) => ({
        id: s.id,
        text: s.action_name,
        color: lane?.color.tint || '#F1F5F9',
      }))

      const newSnap: ProcessSnapshot = {
        ...state.snapshot,
        swimlanes: state.snapshot.swimlanes.filter((s) => s.id !== action.payload),
        steps: state.snapshot.steps.filter((s) => s.swimlane_id !== action.payload),
        flows: state.snapshot.flows.filter((f) => {
          const fromStep = state.snapshot.steps.find((s) => s.id === f.from_step_id)
          const toStep = state.snapshot.steps.find((s) => s.id === f.to_step_id)
          return (
            fromStep?.swimlane_id !== action.payload &&
            toStep?.swimlane_id !== action.payload
          )
        }),
        notes: [...state.snapshot.notes, ...notesFromSteps],
      }
      return pushHistory(state, newSnap)
    }

    case 'REORDER_SWIMLANE': {
      const { id, newOrder } = action.payload
      const sorted = [...state.snapshot.swimlanes].sort((a, b) => a.order - b.order)
      const fromIdx = sorted.findIndex((s) => s.id === id)
      if (fromIdx === -1) return state
      const [moved] = sorted.splice(fromIdx, 1)
      sorted.splice(newOrder, 0, moved)
      const reordered = sorted.map((s, i) => ({ ...s, order: i }))
      const newSnap: ProcessSnapshot = { ...state.snapshot, swimlanes: reordered }
      return pushHistory(state, newSnap)
    }

    // ── Steps ───────────────────────────────────────────────────────
    case 'ADD_STEP': {
      // Place at the next available column in the lane
      const col = nextColumnInLane(state.snapshot.steps, action.payload.swimlane_id)
      const step = { ...action.payload, order_num: col }
      const newSnap: ProcessSnapshot = {
        ...state.snapshot,
        steps: [...state.snapshot.steps, step],
      }
      newSnap.flows = autoConnect(newSnap)
      return pushHistory(state, newSnap)
    }

    case 'UPDATE_STEP': {
      const newSnap: ProcessSnapshot = {
        ...state.snapshot,
        steps: state.snapshot.steps.map((s) =>
          s.id === action.payload.id ? { ...s, ...action.payload.updates } : s
        ),
      }
      return pushHistory(state, newSnap)
    }

    case 'DELETE_STEP': {
      const newSnap: ProcessSnapshot = {
        ...state.snapshot,
        steps: state.snapshot.steps.filter((s) => s.id !== action.payload),
        flows: state.snapshot.flows.filter(
          (f) => f.from_step_id !== action.payload && f.to_step_id !== action.payload
        ),
      }
      // Don't re-compact columns — gaps are fine, layout engine compacts at render time
      newSnap.flows = autoConnect(newSnap)

      return {
        ...pushHistory(state, newSnap),
        selectedStepId: state.selectedStepId === action.payload ? null : state.selectedStepId,
        detailPanelOpen: state.selectedStepId === action.payload ? false : state.detailPanelOpen,
      }
    }

    case 'MOVE_STEP': {
      const { stepId, targetSwimlaneId, targetIndex, targetOrderNum } = action.payload
      const step = state.snapshot.steps.find((s) => s.id === stepId)
      if (!step) return state

      // Use explicit targetOrderNum if provided, otherwise append to end
      let col: number
      if (targetOrderNum !== undefined) {
        col = targetOrderNum
      } else {
        col = nextColumnInLane(
          state.snapshot.steps.filter((s) => s.id !== stepId),
          targetSwimlaneId
        )
      }

      // Check for column conflict in target lane (another step at same order_num)
      const conflicting = state.snapshot.steps.find(
        (s) => s.id !== stepId && s.swimlane_id === targetSwimlaneId && s.order_num === col
      )

      let updatedSteps = state.snapshot.steps
      if (conflicting) {
        // Shift conflicting step and all later steps in that lane forward by 1
        const targetLaneSteps = updatedSteps
          .filter((s) => s.id !== stepId && s.swimlane_id === targetSwimlaneId)
          .sort((a, b) => a.order_num - b.order_num)
        const conflictIdx = targetLaneSteps.findIndex((s) => s.order_num >= col)
        if (conflictIdx !== -1) {
          const toShift = new Set(targetLaneSteps.slice(conflictIdx).map((s) => s.id))
          updatedSteps = updatedSteps.map((s) =>
            toShift.has(s.id) ? { ...s, order_num: s.order_num + 1 } : s
          )
        }
      }

      const movedStep: ProcessStepData = { ...step, swimlane_id: targetSwimlaneId, order_num: col }
      updatedSteps = updatedSteps.map((s) => (s.id === stepId ? movedStep : s))

      // Realign all cross-lane flows after the move
      for (const flow of state.snapshot.flows) {
        const from = updatedSteps.find((s) => s.id === flow.from_step_id)
        const to = updatedSteps.find((s) => s.id === flow.to_step_id)
        if (from && to && from.swimlane_id !== to.swimlane_id) {
          updatedSteps = alignCrossLaneFlow(updatedSteps, from.id, to.id)
        }
      }

      const newSnap: ProcessSnapshot = {
        ...state.snapshot,
        steps: updatedSteps,
      }
      newSnap.flows = autoConnect(newSnap)
      return pushHistory(state, newSnap)
    }

    case 'DROP_NOTE_TO_LANE': {
      const { noteId, swimlaneId } = action.payload
      const note = state.snapshot.notes.find((n) => n.id === noteId)
      if (!note) return state

      // Place at the next available column in the lane
      const col = nextColumnInLane(state.snapshot.steps, swimlaneId)

      const newStep: ProcessStepData = {
        id: note.id,
        swimlane_id: swimlaneId,
        order_num: col,
        action_name: note.text,
        step_type: 'action',
        systems_used: [],
        documents_needed: [],
      }

      const newSnap: ProcessSnapshot = {
        ...state.snapshot,
        notes: state.snapshot.notes.filter((n) => n.id !== noteId),
        steps: [...state.snapshot.steps, newStep],
      }
      newSnap.flows = autoConnect(newSnap)
      return pushHistory(state, newSnap)
    }

    // ── Flows ───────────────────────────────────────────────────────
    case 'ADD_FLOW': {
      // Align target step column for the new cross-lane flow
      let alignedSteps = alignCrossLaneFlow(
        state.snapshot.steps,
        action.payload.from_step_id,
        action.payload.to_step_id
      )

      // Re-align all existing cross-lane flows too
      const allFlows = [...state.snapshot.flows, action.payload]
      for (const flow of allFlows) {
        const from = alignedSteps.find((s) => s.id === flow.from_step_id)
        const to = alignedSteps.find((s) => s.id === flow.to_step_id)
        if (from && to && from.swimlane_id !== to.swimlane_id) {
          alignedSteps = alignCrossLaneFlow(alignedSteps, from.id, to.id)
        }
      }

      const newSnap: ProcessSnapshot = {
        ...state.snapshot,
        steps: alignedSteps,
        flows: allFlows,
      }
      newSnap.flows = autoConnect(newSnap)
      return pushHistory(state, newSnap)
    }

    case 'UPDATE_FLOW': {
      const newSnap: ProcessSnapshot = {
        ...state.snapshot,
        flows: state.snapshot.flows.map((f) =>
          f.id === action.payload.id ? { ...f, ...action.payload.updates } : f
        ),
      }
      return pushHistory(state, newSnap)
    }

    case 'DELETE_FLOW': {
      const newSnap: ProcessSnapshot = {
        ...state.snapshot,
        flows: state.snapshot.flows.filter((f) => f.id !== action.payload),
      }
      return pushHistory(state, newSnap)
    }

    case 'AUTO_CONNECT': {
      const newSnap: ProcessSnapshot = {
        ...state.snapshot,
        flows: autoConnect(state.snapshot),
      }
      return pushHistory(state, newSnap)
    }

    case 'CLEAR_ALL_FLOWS': {
      const newSnap: ProcessSnapshot = {
        ...state.snapshot,
        flows: [],
      }
      return pushHistory(state, newSnap)
    }

    // ── UI state ────────────────────────────────────────────────────
    case 'SELECT_STEP': {
      return {
        ...state,
        selectedStepId: action.payload,
        detailPanelOpen: action.payload !== null,
      }
    }

    case 'TOGGLE_DETAIL_PANEL': {
      const open = action.payload !== undefined ? action.payload : !state.detailPanelOpen
      return {
        ...state,
        detailPanelOpen: open,
        selectedStepId: open ? state.selectedStepId : null,
      }
    }

    case 'SET_ZOOM': {
      return { ...state, zoom: Math.min(2, Math.max(0.5, action.payload)) }
    }

    // ── Undo / Redo ─────────────────────────────────────────────────
    case 'UNDO': {
      if (state.historyIndex <= 0) return state
      const newIndex = state.historyIndex - 1
      return {
        ...state,
        snapshot: state.history[newIndex],
        historyIndex: newIndex,
        isDirty: true,
      }
    }

    case 'REDO': {
      if (state.historyIndex >= state.history.length - 1) return state
      const newIndex = state.historyIndex + 1
      return {
        ...state,
        snapshot: state.history[newIndex],
        historyIndex: newIndex,
        isDirty: true,
      }
    }

    default:
      return state
  }
}
