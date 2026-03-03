import type { SwimlaneDefinition, ProcessStepData, ProcessFlowData, SwimlaneColor } from '@/types/process-builder'

// ─── SVG Layout Constants ────────────────────────────────────────────
export const SVG = {
  PHASE_HEADER_H: 32,
  SIDEBAR_W: 64,           // wide sidebar for rotated lane names
  CARD_W: 160,             // wider cards for multi-word step names
  CARD_H: 56,              // taller cards for 3-line names
  DECISION_H: 74,          // diamond height
  ANNOTATION_H: 60,        // rich annotation space below card
  GAP_X: 50,               // wide gap between columns for connector routing
  LANE_H: 190,             // taller lanes: card(56) + annotation(60) + padding(74)
  LANE_GAP: 6,             // small gap between lanes
  PAD: 24,                 // outer padding
  CONNECTOR_STROKE: 2,
  ARROW_SIZE: 8,
  BRANCH_OFFSET_Y: 80,    // vertical offset for alt branch steps within a lane
  TITLE_H: 40,            // space for process title bar at top
} as const

// ─── Layout Result Types ─────────────────────────────────────────────

export interface StepPosition {
  x: number
  y: number
  w: number
  h: number
  compactColumn: number
  laneIndex: number
}

export interface LanePosition {
  id: string
  y: number
  h: number
  name: string
  color: SwimlaneColor
  order: number
}

export interface PhaseHeader {
  name: string
  x: number
  w: number
  color: { bg: string; text: string }
}

export interface SVGLayout {
  stepPositions: Map<string, StepPosition>
  lanePositions: LanePosition[]
  phaseHeaders: PhaseHeader[]
  columnMap: Map<number, number>
  columnCount: number
  totalW: number
  totalH: number
}

// Phase header: single dark charcoal style
const PHASE_COLORS = [
  { bg: '#1F2937', text: '#FFFFFF' },
  { bg: '#1F2937', text: '#FFFFFF' },
  { bg: '#1F2937', text: '#FFFFFF' },
  { bg: '#1F2937', text: '#FFFFFF' },
  { bg: '#1F2937', text: '#FFFFFF' },
]

/**
 * Identify "alt branch" steps: steps in a decision zone that get positioned
 * at a lower Y within the lane for clear visual separation.
 *
 * Algorithm:
 * - If there are intermediate (non-target) steps between decision targets,
 *   ALL zone steps go to lower Y (complex branching needs clean separation).
 * - If targets are adjacent with no intermediates, only the non-main target
 *   drops down (simple Yes=right, No=down pattern).
 */
export function getAltBranchStepIds(
  steps: ProcessStepData[],
  flows: ProcessFlowData[],
  swimlanes: SwimlaneDefinition[]
): Set<string> {
  const altBranchIds = new Set<string>()

  for (const lane of swimlanes) {
    const laneSteps = steps
      .filter((s) => s.swimlane_id === lane.id)
      .sort((a, b) => a.order_num - b.order_num)

    // Find all decision steps in this lane
    const decisions = laneSteps.filter((s) => s.step_type === 'decision')

    for (const decision of decisions) {
      // Find same-lane decision flow targets
      const decisionFlows = flows.filter(
        (f) =>
          f.from_step_id === decision.id &&
          (f.flow_type === 'decision' || f.condition_color)
      )

      const sameLaneTargets: { stepId: string; col: number; color?: string }[] = []
      for (const df of decisionFlows) {
        const target = laneSteps.find((s) => s.id === df.to_step_id)
        if (target) {
          sameLaneTargets.push({ stepId: target.id, col: target.order_num, color: df.condition_color })
        }
      }

      if (sameLaneTargets.length < 2) continue

      sameLaneTargets.sort((a, b) => a.col - b.col)
      const maxTargetCol = sameLaneTargets[sameLaneTargets.length - 1].col
      const targetIds = new Set(sameLaneTargets.map((t) => t.stepId))

      // Count intermediate steps in the zone that are NOT decision targets
      let intermediateCount = 0
      for (const step of laneSteps) {
        if (step.id === decision.id) continue
        if (targetIds.has(step.id)) continue
        if (step.order_num > decision.order_num && step.order_num <= maxTargetCol) {
          intermediateCount++
        }
      }

      // Find the target whose chain has the most steps (longest branch)
      let longestIdx = 0
      let longestLen = 0
      for (let i = 0; i < sameLaneTargets.length; i++) {
        const startCol = sameLaneTargets[i].col
        const endCol = i < sameLaneTargets.length - 1
          ? sameLaneTargets[i + 1].col
          : Infinity
        const chainLen = laneSteps.filter(
          (s) => s.order_num >= startCol && (endCol === Infinity || s.order_num < endCol) && s.id !== decision.id
        ).length
        if (chainLen > longestLen) {
          longestLen = chainLen
          longestIdx = i
        }
      }

      if (longestLen <= 1) {
        // All chains are single steps — simple branching: non-main targets drop down
        for (const t of sameLaneTargets) {
          if (t.col < maxTargetCol) {
            altBranchIds.add(t.stepId)
          }
        }
      } else {
        // Push the longest chain to lower Y
        const startCol = sameLaneTargets[longestIdx].col
        const endCol = longestIdx < sameLaneTargets.length - 1
          ? sameLaneTargets[longestIdx + 1].col
          : Infinity
        for (const step of laneSteps) {
          if (step.id === decision.id) continue
          if (step.order_num >= startCol && (endCol === Infinity || step.order_num < endCol)) {
            altBranchIds.add(step.id)
          }
        }
      }
    }
  }

  return altBranchIds
}

/**
 * Align steps for linear flow: when a flow crosses lanes, the target step
 * should be in the same column (or later) as the source step.
 * This ensures the diagram reads left-to-right even across lane handoffs.
 */
function linearizeSteps(
  steps: ProcessStepData[],
  flows: ProcessFlowData[]
): ProcessStepData[] {
  let aligned = [...steps]

  for (const flow of flows) {
    // Skip decision flows — they represent branches (possibly backward),
    // not linear progression that needs column alignment
    if (flow.flow_type === 'decision') continue

    const from = aligned.find((s) => s.id === flow.from_step_id)
    const to = aligned.find((s) => s.id === flow.to_step_id)
    if (!from || !to) continue
    if (from.swimlane_id === to.swimlane_id) continue

    // Target should be at or after source column
    if (to.order_num >= from.order_num) continue

    const delta = from.order_num - to.order_num

    // Shift target and all subsequent steps in the target's lane
    const targetLaneSteps = aligned
      .filter((s) => s.swimlane_id === to.swimlane_id)
      .sort((a, b) => a.order_num - b.order_num)

    const targetIdx = targetLaneSteps.findIndex((s) => s.id === to.id)
    if (targetIdx === -1) continue

    const stepsToShift = new Set(
      targetLaneSteps.slice(targetIdx).map((s) => s.id)
    )

    aligned = aligned.map((s) =>
      stepsToShift.has(s.id) ? { ...s, order_num: s.order_num + delta } : s
    )
  }

  return aligned
}

/**
 * Calculate SVG layout from swimlanes and steps.
 * Unified engine used by both the live SVG preview and PDF export.
 *
 * Key invariant: steps with the same order_num are in the same vertical column,
 * regardless of which lane they're in. This preserves linear flow alignment.
 *
 * When flows are provided, cross-lane alignment is applied automatically
 * to ensure vertical handoffs display correctly.
 */
export interface LayoutOverrides {
  cardW?: number
  cardH?: number
  gapX?: number
  laneH?: number
  sidebarW?: number
  pad?: number
  branchOffsetY?: number
}

export function calculateSVGLayout(
  swimlanes: SwimlaneDefinition[],
  steps: ProcessStepData[],
  flows?: ProcessFlowData[],
  processName?: string,
  overrides?: LayoutOverrides
): SVGLayout {
  // Allow PDF to use compact spacing while on-screen SVG uses standard constants
  const CARD_W = overrides?.cardW ?? SVG.CARD_W
  const CARD_H = overrides?.cardH ?? SVG.CARD_H
  const GAP_X = overrides?.gapX ?? SVG.GAP_X
  const LANE_H = overrides?.laneH ?? SVG.LANE_H
  const SIDEBAR_W = overrides?.sidebarW ?? SVG.SIDEBAR_W
  const PAD = overrides?.pad ?? SVG.PAD
  const BRANCH_OFFSET_Y = overrides?.branchOffsetY ?? SVG.BRANCH_OFFSET_Y

  const sorted = [...swimlanes].sort((a, b) => a.order - b.order)

  // Apply cross-lane alignment if flows provided
  const layoutSteps = flows && flows.length > 0
    ? linearizeSteps(steps, flows)
    : steps

  // Column compaction: sparse order_num → contiguous 0-based indices
  const usedColumns = [...new Set(layoutSteps.map((s) => s.order_num))].sort((a, b) => a - b)
  const columnMap = new Map<number, number>()
  usedColumns.forEach((col, idx) => columnMap.set(col, idx))
  const columnCount = usedColumns.length

  // Determine if we have phase headers or title
  const hasPhases = layoutSteps.some((s) => s.phase_name)
  const hasTitle = !!processName
  const phaseOffsetY = hasPhases ? SVG.PHASE_HEADER_H : 0
  const titleOffsetY = hasTitle ? SVG.TITLE_H : 0

  // Detect alt-branch steps for vertical separation
  const altBranchIds = flows && flows.length > 0
    ? getAltBranchStepIds(layoutSteps, flows, sorted)
    : new Set<string>()

  // Determine which lanes have alt branches (need extra height)
  const lanesWithBranch = new Set<string>()
  for (const stepId of altBranchIds) {
    const step = layoutSteps.find((s) => s.id === stepId)
    if (step) lanesWithBranch.add(step.swimlane_id)
  }

  // Calculate step positions with dynamic lane heights
  const stepPositions = new Map<string, StepPosition>()
  const lanePositions: LanePosition[] = []

  let cumulativeY = PAD + titleOffsetY + phaseOffsetY

  sorted.forEach((lane, laneIndex) => {
    const laneY = cumulativeY
    const hasAltBranch = lanesWithBranch.has(lane.id)
    const laneH = LANE_H + (hasAltBranch ? BRANCH_OFFSET_Y : 0)

    lanePositions.push({
      id: lane.id,
      y: laneY,
      h: laneH,
      name: lane.name,
      color: lane.color,
      order: lane.order,
    })

    cumulativeY += laneH + SVG.LANE_GAP

    const laneSteps = layoutSteps
      .filter((s) => s.swimlane_id === lane.id)
      .sort((a, b) => a.order_num - b.order_num)

    laneSteps.forEach((step) => {
      const compactCol = columnMap.get(step.order_num) ?? 0
      const isDecision = step.step_type === 'decision'
      const cardH = isDecision ? SVG.DECISION_H : CARD_H
      const x = SIDEBAR_W + PAD + compactCol * (CARD_W + GAP_X)
      const topPad = 16
      const isAltBranch = altBranchIds.has(step.id)
      const y = laneY + topPad + (isAltBranch ? BRANCH_OFFSET_Y : 0) + (isDecision ? -4 : 0)

      stepPositions.set(step.id, {
        x,
        y,
        w: CARD_W,
        h: cardH,
        compactColumn: compactCol,
        laneIndex,
      })
    })
  })

  // Build phase headers
  const phaseHeaders: PhaseHeader[] = []
  if (hasPhases) {
    const colPhase = new Map<number, string>()
    for (const s of layoutSteps) {
      if (s.phase_name && !colPhase.has(s.order_num)) {
        colPhase.set(s.order_num, s.phase_name)
      }
    }

    const bands: { name: string; startCol: number; endCol: number }[] = []
    for (let i = 0; i < usedColumns.length; i++) {
      const phase = colPhase.get(usedColumns[i])
      if (!phase) continue
      const compactCol = columnMap.get(usedColumns[i]) ?? i
      const last = bands[bands.length - 1]
      if (last && last.name === phase && last.endCol === compactCol - 1) {
        last.endCol = compactCol
      } else {
        bands.push({ name: phase, startCol: compactCol, endCol: compactCol })
      }
    }

    bands.forEach((band, idx) => {
      const x = SIDEBAR_W + PAD + band.startCol * (CARD_W + GAP_X)
      const span = band.endCol - band.startCol + 1
      const w = span * (CARD_W + GAP_X) - GAP_X
      phaseHeaders.push({
        name: band.name,
        x,
        w,
        color: PHASE_COLORS[idx % PHASE_COLORS.length],
      })
    })
  }

  const totalW = SIDEBAR_W + PAD * 2
    + Math.max(columnCount, 1) * (CARD_W + GAP_X)
  const totalH = cumulativeY + PAD

  return {
    stepPositions,
    lanePositions,
    phaseHeaders,
    columnMap,
    columnCount,
    totalW: Math.max(totalW, 400),
    totalH: Math.max(totalH, 200),
  }
}
