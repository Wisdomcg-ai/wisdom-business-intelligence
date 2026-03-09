import type { ProcessSnapshot, ProcessStepData, ProcessFlowData, PhaseDefinition } from '@/types/process-builder'
import { DEFAULT_SNAPSHOT, PHASE_COLOR_PALETTE } from '@/types/process-builder'
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

function autoConnect(snapshot: ProcessSnapshot, excludeStepId?: string): ProcessFlowData[] {
  // Preserve ALL explicitly created flows (non-auto-generated).
  // Only regenerate auto-generated flows (id starts with 'auto-').
  // This ensures user-created flows from port clicks / drag-connects
  // survive even when they're same-lane sequential without decision markers.
  const preservedFlows = snapshot.flows.filter((f) => !f.id.startsWith('auto-'))

  // Repair decision flows missing condition_color — assign from option order
  const repairedFlows = repairDecisionFlowColors(preservedFlows, snapshot.steps)

  // Build sets to prevent auto-flow through decision branches
  const noAutoFlowFrom = new Set<string>()  // steps that shouldn't get auto-outgoing flows
  const noAutoFlowTo = new Set<string>()    // steps that shouldn't get auto-incoming flows
  const preservedPairs = new Set<string>()  // dedup: skip if a preserved flow already connects these

  // Exclude a step from auto-connect entirely (used for port-added steps
  // where the explicit flow hasn't been dispatched yet)
  if (excludeStepId) {
    noAutoFlowFrom.add(excludeStepId)
    noAutoFlowTo.add(excludeStepId)
  }

  for (const flow of repairedFlows) {
    preservedPairs.add(`${flow.from_step_id}→${flow.to_step_id}`)

    // Decision flow blocking: don't auto-flow from decision steps or to/from their targets.
    // Decision targets must not auto-connect to adjacent-by-order-num steps because
    // those adjacent steps may be on a different branch of the decision.
    if (flow.flow_type === 'decision' || flow.condition_color || flow.condition_label) {
      const from = snapshot.steps.find((s) => s.id === flow.from_step_id)
      const to = snapshot.steps.find((s) => s.id === flow.to_step_id)
      if (from && to) {
        noAutoFlowFrom.add(from.id)
        if (from.swimlane_id === to.swimlane_id) {
          noAutoFlowTo.add(to.id)
          noAutoFlowFrom.add(to.id)  // also block auto-flow FROM the target
        }
      }
    }

    // Block auto-flow FROM any step that already has an explicit same-lane outgoing flow.
    // This prevents autoConnect from creating unwanted connections between
    // decision branches that interleave by order_num.
    const from = snapshot.steps.find((s) => s.id === flow.from_step_id)
    const to = snapshot.steps.find((s) => s.id === flow.to_step_id)
    if (from && to && from.swimlane_id === to.swimlane_id) {
      noAutoFlowFrom.add(from.id)
    }
  }

  // Propagate noAutoFlowFrom transitively through explicit same-lane flow chains.
  // If a step is blocked from auto-outgoing, its explicit flow targets should also
  // be blocked — they're part of an explicitly-routed branch (e.g. decision No path).
  // Guard: max iterations = number of steps to prevent infinite loops from cyclic flows.
  const maxIter = snapshot.steps.length
  let iterCount = 0
  let propagated = true
  while (propagated && iterCount < maxIter) {
    propagated = false
    iterCount++
    for (const flow of repairedFlows) {
      if (!noAutoFlowFrom.has(flow.from_step_id)) continue
      const from = snapshot.steps.find((s) => s.id === flow.from_step_id)
      const to = snapshot.steps.find((s) => s.id === flow.to_step_id)
      if (from && to && from.swimlane_id === to.swimlane_id && !noAutoFlowFrom.has(to.id)) {
        noAutoFlowFrom.add(to.id)
        propagated = true
      }
    }
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
      // Don't auto-connect steps at the same column (parallel branches)
      if (laneSteps[i].order_num === laneSteps[i + 1].order_num) continue
      // Don't auto-flow FROM a decision step or step with explicit outgoing flow
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

// ─── Phase migration: auto-create PhaseDefinition[] from phase_name ──

function migratePhaseNames(snapshot: ProcessSnapshot): { snapshot: ProcessSnapshot; migrated: boolean } {
  // Already has phases — nothing to do
  if (snapshot.phases && snapshot.phases.length > 0) {
    // Ensure phases array exists on snapshot (old JSON may omit it)
    return { snapshot, migrated: false }
  }

  // Collect unique phase_name values in order of first appearance
  const seen = new Map<string, number>() // name → first order_num
  for (const step of [...snapshot.steps].sort((a, b) => a.order_num - b.order_num)) {
    if (step.phase_name && !seen.has(step.phase_name)) {
      seen.set(step.phase_name, step.order_num)
    }
  }

  if (seen.size === 0) {
    return { snapshot: { ...snapshot, phases: [] }, migrated: false }
  }

  // Create PhaseDefinition for each unique name
  const phases: PhaseDefinition[] = []
  let order = 0
  for (const [name] of seen) {
    phases.push({
      id: crypto.randomUUID(),
      name,
      color: PHASE_COLOR_PALETTE[order % PHASE_COLOR_PALETTE.length],
      order: order++,
    })
  }

  // Build name → id lookup
  const nameToId = new Map(phases.map((p) => [p.name, p.id]))

  // Set phase_id on each step
  const steps = snapshot.steps.map((s) => {
    if (s.phase_name && nameToId.has(s.phase_name)) {
      return { ...s, phase_id: nameToId.get(s.phase_name) }
    }
    return s
  })

  return {
    snapshot: { ...snapshot, phases, steps },
    migrated: true,
  }
}

// ─── Initial state factory ───────────────────────────────────────────

export function createInitialState(
  processId: string,
  name?: string,
  description?: string,
  snapshot?: ProcessSnapshot
): BuilderState {
  const snap = snapshot || DEFAULT_SNAPSHOT
  // Ensure phases array exists (old JSON may omit it)
  const snapWithPhases = snap.phases ? snap : { ...snap, phases: [] }
  // Repair decision flows missing condition_color on initial load
  const repairedFlows = repairDecisionFlowColors(snapWithPhases.flows, snapWithPhases.steps)
  const repairedSnap = repairedFlows !== snapWithPhases.flows
    ? { ...snapWithPhases, flows: repairedFlows }
    : snapWithPhases
  // Migrate phase_name → first-class phases
  const { snapshot: migratedSnap, migrated: phasesMigrated } = migratePhaseNames(repairedSnap)
  // If flows were repaired or phases migrated, mark as dirty so they get saved
  const needsSave = repairedFlows !== snapWithPhases.flows || phasesMigrated
  return {
    processId,
    processName: name || '',
    description: description || '',
    snapshot: migratedSnap,
    selectedStepId: null,
    detailPanelOpen: false,
    zoom: 1,
    isDirty: needsSave,
    history: [migratedSnap],
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

    // ── Phases ───────────────────────────────────────────────────────
    case 'ADD_PHASE': {
      const newSnap: ProcessSnapshot = {
        ...state.snapshot,
        phases: [...state.snapshot.phases, action.payload],
      }
      return pushHistory(state, newSnap)
    }

    case 'UPDATE_PHASE': {
      const newSnap: ProcessSnapshot = {
        ...state.snapshot,
        phases: state.snapshot.phases.map((p) =>
          p.id === action.payload.id ? { ...p, ...action.payload.updates } : p
        ),
      }
      return pushHistory(state, newSnap)
    }

    case 'DELETE_PHASE': {
      const newSnap: ProcessSnapshot = {
        ...state.snapshot,
        phases: state.snapshot.phases.filter((p) => p.id !== action.payload),
        steps: state.snapshot.steps.map((s) =>
          s.phase_id === action.payload
            ? { ...s, phase_id: undefined, phase_name: undefined }
            : s
        ),
      }
      return pushHistory(state, newSnap)
    }

    case 'REORDER_PHASE': {
      const { id, newOrder } = action.payload
      const sorted = [...state.snapshot.phases].sort((a, b) => a.order - b.order)
      const fromIdx = sorted.findIndex((p) => p.id === id)
      if (fromIdx === -1) return state
      const [moved] = sorted.splice(fromIdx, 1)
      sorted.splice(newOrder, 0, moved)
      const reordered = sorted.map((p, i) => ({ ...p, order: i }))
      const newSnap: ProcessSnapshot = { ...state.snapshot, phases: reordered }
      return pushHistory(state, newSnap)
    }

    // ── Steps ───────────────────────────────────────────────────────
    case 'ADD_STEP': {
      const { allowSameColumn, ...stepData } = action.payload
      // If order_num > 0 is explicitly provided and no conflict, respect it
      let col: number
      if (stepData.order_num > 0) {
        if (allowSameColumn) {
          col = stepData.order_num
        } else {
          const conflict = state.snapshot.steps.find(
            (s) => s.swimlane_id === stepData.swimlane_id && s.order_num === stepData.order_num
          )
          col = conflict ? nextColumnInLane(state.snapshot.steps, stepData.swimlane_id) : stepData.order_num
        }
      } else {
        col = nextColumnInLane(state.snapshot.steps, stepData.swimlane_id)
      }
      const step = { ...stepData, order_num: col }
      // Auto-assign phase_id if step has phase_name but no phase_id
      if (step.phase_name && !step.phase_id && state.snapshot.phases.length > 0) {
        const matchingPhase = state.snapshot.phases.find((p) => p.name === step.phase_name)
        if (matchingPhase) step.phase_id = matchingPhase.id
      }
      const newSnap: ProcessSnapshot = {
        ...state.snapshot,
        steps: [...state.snapshot.steps, step],
      }
      // When adding from a port (allowSameColumn), exclude the new step from
      // auto-connect — the explicit flow will be created in a subsequent ADD_FLOW
      newSnap.flows = autoConnect(newSnap, allowSameColumn ? step.id : undefined)
      return pushHistory(state, newSnap)
    }

    case 'UPDATE_STEP': {
      const newSnap: ProcessSnapshot = {
        ...state.snapshot,
        steps: state.snapshot.steps.map((s) =>
          s.id === action.payload.id ? { ...s, ...action.payload.updates } : s
        ),
      }
      // When step_type changes, clean up and re-run autoConnect
      if (action.payload.updates.step_type) {
        const oldStep = state.snapshot.steps.find((s) => s.id === action.payload.id)
        // Converting FROM decision: strip decision attributes from outgoing flows
        if (oldStep?.step_type === 'decision' && action.payload.updates.step_type !== 'decision') {
          newSnap.flows = newSnap.flows.map((f) => {
            if (f.from_step_id !== action.payload.id) return f
            if (!f.condition_color && !f.condition_label && f.flow_type !== 'decision') return f
            return {
              ...f,
              flow_type: 'sequential' as const,
              condition_label: undefined,
              condition_color: undefined,
            }
          })
        }
        newSnap.flows = autoConnect(newSnap)
      }
      return pushHistory(state, newSnap)
    }

    case 'DELETE_STEP': {
      const idsToDelete = new Set(Array.isArray(action.payload) ? action.payload : [action.payload])
      const newSnap: ProcessSnapshot = {
        ...state.snapshot,
        steps: state.snapshot.steps.filter((s) => !idsToDelete.has(s.id)),
        flows: state.snapshot.flows.filter(
          (f) => !idsToDelete.has(f.from_step_id) && !idsToDelete.has(f.to_step_id)
        ),
      }
      newSnap.flows = autoConnect(newSnap)

      const selectedCleared = state.selectedStepId && idsToDelete.has(state.selectedStepId)
      return {
        ...pushHistory(state, newSnap),
        selectedStepId: selectedCleared ? null : state.selectedStepId,
        detailPanelOpen: selectedCleared ? false : state.detailPanelOpen,
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

    case 'INSERT_STEP_BETWEEN': {
      const { newStep, fromStepId, toStepId, oldFlowId } = action.payload
      const fromStep = state.snapshot.steps.find((s) => s.id === fromStepId)
      const toStep = state.snapshot.steps.find((s) => s.id === toStepId)
      if (!fromStep || !toStep) return state

      // Position new step at midpoint order_num
      const midOrder = Math.floor((fromStep.order_num + toStep.order_num) / 2)
      let insertOrder = midOrder
      // If conflict, shift subsequent steps
      let updatedSteps = [...state.snapshot.steps]
      const conflict = updatedSteps.find(
        (s) => s.swimlane_id === newStep.swimlane_id && s.order_num === insertOrder
      )
      if (conflict || insertOrder === fromStep.order_num || insertOrder === toStep.order_num) {
        // Insert right after fromStep and shift toStep + subsequent forward
        insertOrder = fromStep.order_num + 1
        const stepsToShift = updatedSteps.filter(
          (s) => s.swimlane_id === newStep.swimlane_id && s.order_num >= insertOrder
        )
        const shiftIds = new Set(stepsToShift.map((s) => s.id))
        updatedSteps = updatedSteps.map((s) =>
          shiftIds.has(s.id) ? { ...s, order_num: s.order_num + 1 } : s
        )
      }

      const positioned = { ...newStep, order_num: insertOrder }
      updatedSteps.push(positioned)

      // Remove old flow, add from→new and new→to flows
      let updatedFlows = state.snapshot.flows.filter((f) => f.id !== oldFlowId)
      const oldFlow = state.snapshot.flows.find((f) => f.id === oldFlowId)
      const isDecisionFlow = oldFlow?.flow_type === 'decision' || !!oldFlow?.condition_color
      // Use non-auto ID for decision flows so autoConnect preserves the attributes
      const firstFlowId = isDecisionFlow
        ? `flow-${fromStepId}-${positioned.id}`
        : `auto-${fromStepId}-${positioned.id}`
      updatedFlows.push({
        id: firstFlowId,
        from_step_id: fromStepId,
        to_step_id: positioned.id,
        flow_type: oldFlow?.flow_type || 'sequential',
        condition_label: oldFlow?.condition_label,
        condition_color: oldFlow?.condition_color,
      })
      updatedFlows.push({
        id: `auto-${positioned.id}-${toStepId}`,
        from_step_id: positioned.id,
        to_step_id: toStepId,
        flow_type: 'sequential',
      })

      const newSnap: ProcessSnapshot = {
        ...state.snapshot,
        steps: updatedSteps,
        flows: updatedFlows,
      }
      newSnap.flows = autoConnect(newSnap)
      return pushHistory(state, newSnap)
    }

    case 'DUPLICATE_STEP': {
      const original = state.snapshot.steps.find((s) => s.id === action.payload)
      if (!original) return state
      const col = nextColumnInLane(state.snapshot.steps, original.swimlane_id)
      const dup: ProcessStepData = {
        ...original,
        id: crypto.randomUUID(),
        action_name: `${original.action_name} (copy)`,
        order_num: col,
      }
      const newSnap: ProcessSnapshot = {
        ...state.snapshot,
        steps: [...state.snapshot.steps, dup],
      }
      newSnap.flows = autoConnect(newSnap)
      return pushHistory(state, newSnap)
    }

    case 'MOVE_STEPS': {
      const { stepIds, targetSwimlaneId } = action.payload
      const idsSet = new Set(stepIds)
      let updatedSteps = state.snapshot.steps.map((s) => {
        if (!idsSet.has(s.id)) return s
        const col = nextColumnInLane(
          state.snapshot.steps.filter((ss) => !idsSet.has(ss.id) || ss.id === s.id),
          targetSwimlaneId
        )
        return { ...s, swimlane_id: targetSwimlaneId, order_num: col }
      })
      const newSnap: ProcessSnapshot = {
        ...state.snapshot,
        steps: updatedSteps,
      }
      newSnap.flows = autoConnect(newSnap)
      return pushHistory(state, newSnap)
    }

    case 'UPDATE_STEPS_TYPE': {
      const { stepIds, stepType } = action.payload
      const idsSet = new Set(stepIds)
      const newSnap: ProcessSnapshot = {
        ...state.snapshot,
        steps: state.snapshot.steps.map((s) =>
          idsSet.has(s.id) ? { ...s, step_type: stepType } : s
        ),
      }
      return pushHistory(state, newSnap)
    }

    case 'SWAP_STEP_ORDER': {
      const { stepIdA, stepIdB } = action.payload
      const stepA = state.snapshot.steps.find((s) => s.id === stepIdA)
      const stepB = state.snapshot.steps.find((s) => s.id === stepIdB)
      if (!stepA || !stepB) return state
      const newSnap: ProcessSnapshot = {
        ...state.snapshot,
        steps: state.snapshot.steps.map((s) => {
          if (s.id === stepIdA) return { ...s, order_num: stepB.order_num }
          if (s.id === stepIdB) return { ...s, order_num: stepA.order_num }
          return s
        }),
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
      newSnap.flows = autoConnect(newSnap)
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
