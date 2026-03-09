import type { SwimlaneDefinition, ProcessStepData, ProcessFlowData, SwimlaneColor, PhaseDefinition } from '@/types/process-builder'

// ─── SVG Layout Constants ────────────────────────────────────────────
export const SVG = {
  PHASE_HEADER_H: 44,
  SIDEBAR_W: 64,           // wide sidebar for rotated lane names
  CARD_W: 160,             // wider cards for multi-word step names
  CARD_H: 56,              // taller cards for 3-line names
  DECISION_H: 74,          // diamond height
  ANNOTATION_H: 60,        // rich annotation space below card
  GAP_X: 60,               // gap between columns for connector routing
  LANE_H: 190,             // taller lanes: card(56) + annotation(60) + padding(74)
  LANE_GAP: 16,            // routing corridor between lanes
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
  id: string
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
  stepLaneMap: Map<string, string>
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

  // Helper: walk forward through flows from a starting step,
  // collecting all same-lane downstream steps (BFS on the flow graph).
  function getDownstreamChain(startId: string, laneStepIds: Set<string>, excludeId: string): Set<string> {
    const visited = new Set<string>()
    const queue = [startId]
    while (queue.length > 0) {
      const current = queue.shift()!
      if (visited.has(current)) continue
      visited.add(current)
      for (const f of flows) {
        if (
          f.from_step_id === current &&
          laneStepIds.has(f.to_step_id) &&
          f.to_step_id !== excludeId &&
          !visited.has(f.to_step_id)
        ) {
          queue.push(f.to_step_id)
        }
      }
    }
    return visited
  }

  for (const lane of swimlanes) {
    const laneSteps = steps
      .filter((s) => s.swimlane_id === lane.id)
      .sort((a, b) => a.order_num - b.order_num)
    const laneStepIds = new Set(laneSteps.map((s) => s.id))

    // Find all decision steps in this lane
    const decisions = laneSteps.filter((s) => s.step_type === 'decision')

    for (const decision of decisions) {
      // Find same-lane decision flow targets
      const decisionFlows = flows.filter(
        (f) =>
          f.from_step_id === decision.id &&
          (f.flow_type === 'decision' || f.condition_color)
      )

      const sameLaneTargets: { stepId: string; color?: string }[] = []
      for (const df of decisionFlows) {
        const target = laneSteps.find((s) => s.id === df.to_step_id)
        if (target) {
          sameLaneTargets.push({ stepId: target.id, color: df.condition_color })
        }
      }

      // Single target: if it's the red/No branch, still push it down
      // so the No path looks correct even before the Yes path exists
      if (sameLaneTargets.length === 1) {
        if (sameLaneTargets[0].color === 'red') {
          const redChain = getDownstreamChain(sameLaneTargets[0].stepId, laneStepIds, decision.id)
          for (const stepId of redChain) {
            altBranchIds.add(stepId)
          }
        }
        continue
      }

      // Determine which branch to push down (alt-branch position).
      // PRIORITY 1: Color-based — push the "red" (No) branch down.
      // PRIORITY 2: Chain-length — push the shorter chain down.
      //
      // Uses flow-graph traversal (not column ranges) to correctly identify
      // the complete downstream chain for each branch.

      const redTarget = sameLaneTargets.find((t) => t.color === 'red')

      if (redTarget) {
        // Walk the flow graph from the red (No) target
        const redChain = getDownstreamChain(redTarget.stepId, laneStepIds, decision.id)
        // Exclude steps also reachable from the green (Yes) branch (merge points)
        const greenTarget = sameLaneTargets.find((t) => t.color === 'green')
        const greenChain = greenTarget
          ? getDownstreamChain(greenTarget.stepId, laneStepIds, decision.id)
          : new Set<string>()
        for (const stepId of redChain) {
          if (!greenChain.has(stepId)) {
            altBranchIds.add(stepId)
          }
        }
      } else {
        // No color info: push the SHORTER chain down
        let shortestChain: Set<string> | null = null
        let longestChain: Set<string> | null = null
        let shortestLen = Infinity
        for (const target of sameLaneTargets) {
          const chain = getDownstreamChain(target.stepId, laneStepIds, decision.id)
          if (chain.size < shortestLen) {
            shortestLen = chain.size
            if (shortestChain) longestChain = shortestChain
            shortestChain = chain
          } else {
            longestChain = chain
          }
        }
        if (shortestChain) {
          // Exclude merge points (steps also on the longer chain)
          for (const stepId of shortestChain) {
            if (!longestChain || !longestChain.has(stepId)) {
              altBranchIds.add(stepId)
            }
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
  overrides?: LayoutOverrides,
  phases?: PhaseDefinition[]
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
  const hasPhases = (phases && phases.length > 0) || layoutSteps.some((s) => s.phase_name)
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
  const stepLaneMap = new Map<string, string>()

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
      stepLaneMap.set(step.id, lane.id)
      const compactCol = columnMap.get(step.order_num) ?? 0
      const isDecision = step.step_type === 'decision'
      const cardH = isDecision ? SVG.DECISION_H : CARD_H
      const x = SIDEBAR_W + PAD + compactCol * (CARD_W + GAP_X)
      const topPad = 16
      const isAltBranch = altBranchIds.has(step.id)
      // Center-align decision diamonds with action cards so connectors are horizontal
      const decisionOffset = isDecision ? -(SVG.DECISION_H - CARD_H) / 2 : 0
      const y = laneY + topPad + (isAltBranch ? BRANCH_OFFSET_Y : 0) + decisionOffset

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
    if (phases && phases.length > 0) {
      // First-class phases: one wide overarching header per phase
      // spanning from its first column to its last column
      const sortedPhases = [...phases].sort((a, b) => a.order - b.order)
      for (const phase of sortedPhases) {
        // Find all compact columns that contain steps with this phase_id
        let minCol = Infinity
        let maxCol = -1
        for (const s of layoutSteps) {
          if (s.phase_id === phase.id) {
            const cc = columnMap.get(s.order_num)
            if (cc !== undefined) {
              if (cc < minCol) minCol = cc
              if (cc > maxCol) maxCol = cc
            }
          }
        }
        if (maxCol < 0) continue // no steps in this phase

        // Single wide header from first to last column
        const x = SIDEBAR_W + PAD + minCol * (CARD_W + GAP_X)
        const span = maxCol - minCol + 1
        const w = span * (CARD_W + GAP_X) - GAP_X
        phaseHeaders.push({
          id: phase.id,
          name: phase.name,
          x,
          w,
          color: { bg: phase.color.primary, text: phase.color.text },
        })
      }
    } else {
      // Fallback: legacy phase_name scan (backward compat)
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
          id: `legacy-${idx}`,
          name: band.name,
          x,
          w,
          color: PHASE_COLORS[idx % PHASE_COLORS.length],
        })
      })
    }
    // Clip overlaps then close gaps between adjacent phase headers
    if (phaseHeaders.length > 1) {
      const sorted = [...phaseHeaders].sort((a, b) => a.x - b.x)
      for (let i = 0; i < sorted.length - 1; i++) {
        const current = phaseHeaders.find((p) => p.id === sorted[i].id)!
        const next = phaseHeaders.find((p) => p.id === sorted[i + 1].id)!
        const currentRight = current.x + current.w
        // Clip: if current overlaps next, trim current to end where next starts
        if (currentRight > next.x) {
          current.w = next.x - current.x
        }
        // Close gap: if there's space between them, extend current to meet next
        const gap = next.x - (current.x + current.w)
        if (gap > 0) current.w += gap
      }
    }
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
    stepLaneMap,
  }
}
