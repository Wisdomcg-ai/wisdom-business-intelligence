// Connector routing — clean orthogonal paths between step cards
//
// Routing cases based on relative position:
// 1. Forward + same row     → straight horizontal line
// 2. Forward + different row → L-shaped elbow through column gap
// 3. Same column             → straight vertical line
// 4. Backward                → exit right, loop through lane gap, re-enter from left
//
// Decision steps get exit-point assignment: same-row targets exit RIGHT,
// lower targets exit BOTTOM, higher targets exit TOP.

import { SVG, type LanePosition, type StepPosition } from './svg-layout'
import type { ProcessFlowData, ProcessStepData } from '@/types/process-builder'

export interface Point {
  x: number
  y: number
}

export interface ConnectorPath {
  points: Point[]
  label?: string
  labelPosition?: Point
  color: string
}

const CLEARANCE = 20
const STAGGER_PX = 8
const STAGGER_TOLERANCE = 6

type ExitPoint = 'right' | 'bottom' | 'top'

/**
 * Route an orthogonal connector between two step rectangles.
 * exitPoint overrides the starting position for decision branches.
 */
function routeConnector(
  from: { x: number; y: number; w: number; h: number },
  to: { x: number; y: number; w: number; h: number },
  laneBounds?: { y: number; h: number },
  exitPoint?: ExitPoint
): Point[] {
  const fromRight = from.x + from.w
  const fromCX = from.x + from.w / 2
  const fromCY = from.y + from.h / 2
  const fromBottom = from.y + from.h
  const fromTop = from.y

  const toLeft = to.x
  const toCX = to.x + to.w / 2
  const toCY = to.y + to.h / 2

  // ─── Bottom exit (decision "No" branch) ─────────────────────
  if (exitPoint === 'bottom') {
    const goingRight = toCX > fromCX

    if (Math.abs(fromCX - toCX) < 20) {
      // Same column: straight down
      return [{ x: fromCX, y: fromBottom }, { x: toCX, y: to.y }]
    }
    if (goingRight) {
      // Forward: L-shape — down to target Y, then right
      return [
        { x: fromCX, y: fromBottom },
        { x: fromCX, y: toCY },
        { x: toLeft, y: toCY },
      ]
    }
    // Backward: dip below then back left
    const swingY = Math.max(fromBottom, to.y + to.h) + CLEARANCE
    return [
      { x: fromCX, y: fromBottom },
      { x: fromCX, y: swingY },
      { x: toLeft - CLEARANCE, y: swingY },
      { x: toLeft - CLEARANCE, y: toCY },
      { x: toLeft, y: toCY },
    ]
  }

  // ─── Top exit (decision branch to higher target) ─────────────
  if (exitPoint === 'top') {
    const goingRight = toCX > fromCX

    if (Math.abs(fromCX - toCX) < 20) {
      return [{ x: fromCX, y: fromTop }, { x: toCX, y: to.y + to.h }]
    }
    if (goingRight) {
      // Forward: L-shape — up to target Y, then right
      return [
        { x: fromCX, y: fromTop },
        { x: fromCX, y: toCY },
        { x: toLeft, y: toCY },
      ]
    }
    // Backward: rise above then back left
    const swingY = Math.min(fromTop, to.y) - CLEARANCE
    return [
      { x: fromCX, y: fromTop },
      { x: fromCX, y: swingY },
      { x: toLeft - CLEARANCE, y: swingY },
      { x: toLeft - CLEARANCE, y: toCY },
      { x: toLeft, y: toCY },
    ]
  }

  // ─── Default: right exit ─────────────────────────────────────

  const goingRight = toCX > fromCX
  const sameRow = Math.abs(fromCY - toCY) < 20
  const sameCol = Math.abs(fromCX - toCX) < 20

  // Case 1: forward, same row → straight horizontal
  if (goingRight && sameRow) {
    return [
      { x: fromRight, y: fromCY },
      { x: toLeft, y: toCY },
    ]
  }

  // Case 2: forward, different row → L-elbow through column gap
  if (goingRight) {
    const midX = fromRight + (toLeft - fromRight) / 2
    return [
      { x: fromRight, y: fromCY },
      { x: midX, y: fromCY },
      { x: midX, y: toCY },
      { x: toLeft, y: toCY },
    ]
  }

  // Case 3: same column → straight vertical
  if (sameCol) {
    const goingDown = toCY > fromCY
    return goingDown
      ? [{ x: fromCX, y: fromBottom }, { x: toCX, y: to.y }]
      : [{ x: fromCX, y: fromTop }, { x: toCX, y: to.y + to.h }]
  }

  // Case 4: backward → loop through lane gap
  const targetAbove = toCY < fromCY - 10
  const loopY = laneBounds
    ? targetAbove
      ? laneBounds.y - SVG.LANE_GAP / 2
      : laneBounds.y + laneBounds.h + SVG.LANE_GAP / 2
    : Math.max(fromBottom, to.y + to.h) + CLEARANCE + 16

  return [
    { x: fromRight, y: fromCY },
    { x: fromRight + CLEARANCE, y: fromCY },
    { x: fromRight + CLEARANCE, y: loopY },
    { x: toLeft - CLEARANCE, y: loopY },
    { x: toLeft - CLEARANCE, y: toCY },
    { x: toLeft, y: toCY },
  ]
}

// ─── Stagger: offset overlapping parallel segments ──────────────────

interface Segment {
  flowId: string
  segIdx: number
  orientation: 'h' | 'v'
  fixedCoord: number
  rangeMin: number
  rangeMax: number
}

function extractSegments(flowId: string, points: Point[]): Segment[] {
  const segs: Segment[] = []
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1]
    const dx = Math.abs(b.x - a.x), dy = Math.abs(b.y - a.y)
    if (dx < 1 && dy < 1) continue
    if (dy < 1) {
      segs.push({ flowId, segIdx: i, orientation: 'h',
        fixedCoord: (a.y + b.y) / 2,
        rangeMin: Math.min(a.x, b.x), rangeMax: Math.max(a.x, b.x) })
    } else if (dx < 1) {
      segs.push({ flowId, segIdx: i, orientation: 'v',
        fixedCoord: (a.x + b.x) / 2,
        rangeMin: Math.min(a.y, b.y), rangeMax: Math.max(a.y, b.y) })
    }
  }
  return segs
}

function computeStagger(allSegs: Segment[]): Map<string, number> {
  const offsets = new Map<string, number>()
  for (const orient of ['h', 'v'] as const) {
    const segs = allSegs.filter((s) => s.orientation === orient)
    if (segs.length < 2) continue
    segs.sort((a, b) => a.fixedCoord - b.fixedCoord)
    const used = new Set<number>()
    for (let i = 0; i < segs.length; i++) {
      if (used.has(i)) continue
      const group = [i]
      used.add(i)
      for (let j = i + 1; j < segs.length; j++) {
        if (used.has(j)) continue
        if (Math.abs(segs[j].fixedCoord - segs[i].fixedCoord) > STAGGER_TOLERANCE) break
        for (const gi of group) {
          if (segs[gi].rangeMin < segs[j].rangeMax && segs[j].rangeMin < segs[gi].rangeMax) {
            group.push(j); used.add(j); break
          }
        }
      }
      if (group.length <= 1) continue
      const n = group.length
      for (let k = 0; k < n; k++) {
        const seg = segs[group[k]]
        offsets.set(`${seg.flowId}:${seg.segIdx}`, (k - (n - 1) / 2) * STAGGER_PX)
      }
    }
  }
  return offsets
}

function applyStagger(points: Point[], flowId: string, offsets: Map<string, number>): Point[] {
  const out = points.map((p) => ({ ...p }))
  for (let i = 0; i < out.length - 1; i++) {
    const off = offsets.get(`${flowId}:${i}`)
    if (!off) continue
    const dx = Math.abs(out[i + 1].x - out[i].x)
    const dy = Math.abs(out[i + 1].y - out[i].y)
    if (dy < 1) { out[i].y += off; out[i + 1].y += off }
    else if (dx < 1) { out[i].x += off; out[i + 1].x += off }
  }
  return out
}

/** Position label on the longest segment, biased toward the source to avoid arrow overlap */
function getLabelPosition(points: Point[]): Point | undefined {
  if (points.length < 2) return undefined
  let bestLen = 0
  let bestIdx = 0
  for (let i = 0; i < points.length - 1; i++) {
    const dx = points[i + 1].x - points[i].x
    const dy = points[i + 1].y - points[i].y
    const len = Math.sqrt(dx * dx + dy * dy)
    if (len > bestLen) { bestLen = len; bestIdx = i }
  }
  // Bias toward source end (40% along the segment) to keep clear of arrowhead
  const t = 0.35
  return {
    x: points[bestIdx].x + (points[bestIdx + 1].x - points[bestIdx].x) * t,
    y: points[bestIdx].y + (points[bestIdx + 1].y - points[bestIdx].y) * t,
  }
}

/**
 * After stagger, some joints may become non-orthogonal (diagonal).
 * Insert knee points to restore right angles at every joint.
 */
function ensureOrthogonal(points: Point[]): Point[] {
  if (points.length < 2) return points
  const out: Point[] = [points[0]]
  for (let i = 1; i < points.length; i++) {
    const prev = out[out.length - 1]
    const curr = points[i]
    const dx = Math.abs(curr.x - prev.x)
    const dy = Math.abs(curr.y - prev.y)
    // If neither horizontal nor vertical (both dx and dy are significant), add a knee
    if (dx > 1 && dy > 1) {
      // Prefer horizontal-first elbow (match the dominant direction of movement)
      out.push({ x: curr.x, y: prev.y })
    }
    out.push(curr)
  }
  return out
}

// ─── Public API ─────────────────────────────────────────────────────

/**
 * Compute connector paths for every flow in the diagram.
 * Decision steps get exit-point assignment based on target position.
 */
export function calculateAllConnectorPaths(
  flows: ProcessFlowData[],
  steps: ProcessStepData[],
  stepPositions: Map<string, StepPosition>,
  lanePositions: LanePosition[],
  stepLaneMap: Map<string, string>
): Map<string, ConnectorPath> {
  const result = new Map<string, ConnectorPath>()

  const laneBoundsMap = new Map<string, { y: number; h: number }>()
  for (const lp of lanePositions) {
    laneBoundsMap.set(lp.id, { y: lp.y, h: lp.h })
  }

  // ─── Assign exit points for decision branches ──────────────────
  // Group decision flows by source step
  const decisionExitPoints = new Map<string, ExitPoint>()
  const decisionFlowGroups = new Map<string, ProcessFlowData[]>()

  for (const flow of flows) {
    const fromStep = steps.find((s) => s.id === flow.from_step_id)
    if (!fromStep || fromStep.step_type !== 'decision') continue
    // Skip auto-flows that don't have decision markers
    if (!flow.condition_color && !flow.condition_label && flow.id.startsWith('auto-')) continue

    if (!decisionFlowGroups.has(flow.from_step_id)) {
      decisionFlowGroups.set(flow.from_step_id, [])
    }
    decisionFlowGroups.get(flow.from_step_id)!.push(flow)
  }

  for (const [stepId, decFlows] of decisionFlowGroups) {
    const fromPos = stepPositions.get(stepId)
    if (!fromPos) continue
    const fromCY = fromPos.y + fromPos.h / 2

    // Single-branch decisions: assign exit based on color
    // (red/No exits bottom, green/Yes exits right)
    if (decFlows.length === 1) {
      const flow = decFlows[0]
      if (flow.condition_color === 'red') {
        decisionExitPoints.set(flow.id, 'bottom')
      } else {
        decisionExitPoints.set(flow.id, 'right')
      }
      continue
    }

    for (const flow of decFlows) {
      // Assign exit point based on color: green/Yes → right, red/No → bottom
      // This follows the standard convention: Yes goes right, No goes down
      if (flow.condition_color === 'red') {
        decisionExitPoints.set(flow.id, 'bottom')
      } else if (flow.condition_color === 'green') {
        decisionExitPoints.set(flow.id, 'right')
      } else {
        // Fallback: use target position
        const toPos = stepPositions.get(flow.to_step_id)
        if (!toPos) continue
        const toCY = toPos.y + toPos.h / 2
        if (toCY > fromCY + 20) {
          decisionExitPoints.set(flow.id, 'bottom')
        } else if (toCY < fromCY - 20) {
          decisionExitPoints.set(flow.id, 'top')
        } else {
          decisionExitPoints.set(flow.id, 'right')
        }
      }
    }
  }

  // ─── Phase 1: compute raw paths ───────────────────────────────
  const rawPaths = new Map<string, ConnectorPath>()

  for (const flow of flows) {
    const fromPos = stepPositions.get(flow.from_step_id)
    const toPos = stepPositions.get(flow.to_step_id)
    if (!fromPos || !toPos) continue

    const fromRect = { x: fromPos.x, y: fromPos.y, w: fromPos.w, h: fromPos.h }
    const toRect = { x: toPos.x, y: toPos.y, w: toPos.w, h: toPos.h }
    const sourceLaneId = stepLaneMap.get(flow.from_step_id)
    const laneBounds = sourceLaneId ? laneBoundsMap.get(sourceLaneId) : undefined

    const exitPoint = decisionExitPoints.get(flow.id)
    const points = routeConnector(fromRect, toRect, laneBounds, exitPoint)

    rawPaths.set(flow.id, {
      points,
      label: flow.condition_label,
      labelPosition: getLabelPosition(points),
      color: flow.condition_color || '#0D9488',
    })
  }

  // ─── Phase 2: stagger overlapping segments ────────────────────
  const allSegs: Segment[] = []
  for (const [fid, path] of rawPaths) {
    allSegs.push(...extractSegments(fid, path.points))
  }
  const offsets = computeStagger(allSegs)

  // ─── Phase 3: apply stagger, fix orthogonality, and output ──
  for (const [fid, path] of rawPaths) {
    if (offsets.size > 0) {
      const pts = ensureOrthogonal(applyStagger(path.points, fid, offsets))
      result.set(fid, { ...path, points: pts, labelPosition: getLabelPosition(pts) })
    } else {
      result.set(fid, path)
    }
  }

  return result
}

export function pointsToSVGPath(points: Point[]): string {
  if (points.length < 2) return ''
  let d = `M${points[0].x},${points[0].y}`
  for (let i = 1; i < points.length; i++) {
    d += ` L${points[i].x},${points[i].y}`
  }
  return d
}

export function getArrowhead(points: Point[]): string {
  if (points.length < 2) return ''
  const last = points[points.length - 1]
  const prev = points[points.length - 2]
  const size = 6
  const angle = Math.atan2(last.y - prev.y, last.x - prev.x)
  const p1x = last.x - size * Math.cos(angle - Math.PI / 6)
  const p1y = last.y - size * Math.sin(angle - Math.PI / 6)
  const p2x = last.x - size * Math.cos(angle + Math.PI / 6)
  const p2y = last.y - size * Math.sin(angle + Math.PI / 6)
  return `M${last.x},${last.y} L${p1x},${p1y} M${last.x},${last.y} L${p2x},${p2y}`
}
