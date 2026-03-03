// Connector routing math for straight-line + right-angle paths

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

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export type ExitSide = 'right' | 'bottom' | 'left' | 'top'

export function colorToExitSide(color?: string): ExitSide {
  const map: Record<string, ExitSide> = { green: 'right', red: 'bottom', blue: 'left', orange: 'top' }
  return (color && map[color]) || 'right'
}

/**
 * Determine exit side based on where the target actually is relative to the source.
 * Uses angle from source center to target center to pick the best exit side.
 * This produces routing that matches visual reference PDFs where connectors
 * exit toward their target.
 */
export function positionBasedExitSide(from: Rect, to: Rect): ExitSide {
  const fromCX = from.x + from.w / 2
  const fromCY = from.y + from.h / 2
  const toCX = to.x + to.w / 2
  const toCY = to.y + to.h / 2

  const dx = toCX - fromCX
  const dy = toCY - fromCY

  // Use angle to determine best exit side
  // atan2 returns: 0=right, PI/2=down, PI/-PI=left, -PI/2=up
  const angle = Math.atan2(dy, dx)

  // Quadrant boundaries (in radians):
  //   right:  -PI/4  to  PI/4
  //   bottom:  PI/4  to  3*PI/4
  //   left:   3*PI/4 to PI or -PI to -3*PI/4
  //   top:   -3*PI/4 to -PI/4
  if (angle >= -Math.PI / 4 && angle < Math.PI / 4) return 'right'
  if (angle >= Math.PI / 4 && angle < (3 * Math.PI) / 4) return 'bottom'
  if (angle >= -(3 * Math.PI) / 4 && angle < -Math.PI / 4) return 'top'
  return 'left'
}

/**
 * For a decision step with multiple outgoing flows, assign exit sides based on
 * target positions. Each flow gets the exit side that best matches the angle
 * to its target, with deconfliction so no two flows share the same side.
 */
export function assignDecisionExitSides(
  fromRect: Rect,
  targets: { flowId: string; toRect: Rect }[]
): Map<string, ExitSide> {
  const result = new Map<string, ExitSide>()
  if (targets.length === 0) return result

  const fromCX = fromRect.x + fromRect.w / 2
  const fromCY = fromRect.y + fromRect.h / 2

  // Calculate angle for each target
  const flowAngles = targets.map((t) => {
    const toCX = t.toRect.x + t.toRect.w / 2
    const toCY = t.toRect.y + t.toRect.h / 2
    return {
      flowId: t.flowId,
      angle: Math.atan2(toCY - fromCY, toCX - fromCX),
    }
  })

  // Side center angles: right=0, bottom=PI/2, left=PI, top=-PI/2
  const sides: { side: ExitSide; center: number }[] = [
    { side: 'right', center: 0 },
    { side: 'bottom', center: Math.PI / 2 },
    { side: 'left', center: Math.PI },
    { side: 'top', center: -Math.PI / 2 },
  ]

  // Greedy assignment: for each flow, find the closest available side
  // Sort flows by how strongly they prefer their best side (smallest angular distance first)
  const assignments: { flowId: string; side: ExitSide; distance: number }[] = []
  for (const fa of flowAngles) {
    const ranked = sides.map((s) => {
      let diff = Math.abs(fa.angle - s.center)
      if (diff > Math.PI) diff = 2 * Math.PI - diff
      return { side: s.side, distance: diff }
    }).sort((a, b) => a.distance - b.distance)
    assignments.push({ flowId: fa.flowId, side: ranked[0].side, distance: ranked[0].distance })
  }

  // Sort by distance (strongest preference first) for greedy deconfliction
  assignments.sort((a, b) => a.distance - b.distance)

  const usedSides = new Set<ExitSide>()
  const unassigned: typeof assignments = []

  // First pass: assign flows to their best side if available
  for (const a of assignments) {
    if (!usedSides.has(a.side)) {
      result.set(a.flowId, a.side)
      usedSides.add(a.side)
    } else {
      unassigned.push(a)
    }
  }

  // Second pass: assign remaining flows to next best available side
  for (const a of unassigned) {
    const fa = flowAngles.find((f) => f.flowId === a.flowId)!
    const ranked = sides
      .filter((s) => !usedSides.has(s.side))
      .map((s) => {
        let diff = Math.abs(fa.angle - s.center)
        if (diff > Math.PI) diff = 2 * Math.PI - diff
        return { side: s.side, distance: diff }
      })
      .sort((a, b) => a.distance - b.distance)

    if (ranked.length > 0) {
      result.set(a.flowId, ranked[0].side)
      usedSides.add(ranked[0].side)
    } else {
      // All 4 sides used — fallback to position-based (will overlap, but rare)
      result.set(a.flowId, positionBasedExitSide(fromRect, targets.find((t) => t.flowId === a.flowId)!.toRect))
    }
  }

  return result
}

// Clearance values for routing around cards
const CLEARANCE = 16 // gap around cards for connector routing

/**
 * Calculate orthogonal connector path between two step rects.
 * exitBottom=true routes the connector from the bottom of the source (used for decision "No" branches).
 */
export function calculateConnectorPath(
  from: Rect,
  to: Rect,
  conditionLabel?: string,
  conditionColor?: string,
  exitBottom?: boolean,
  exitSide?: ExitSide
): ConnectorPath {
  const color = conditionColor || '#0D9488'
  const points: Point[] = []

  // Resolve effective exit side: exitSide wins → exitBottom fallback → default (null = right exit via existing logic)
  const effectiveSide: ExitSide | null = exitSide ?? (exitBottom ? 'bottom' : null)

  // ─── Right-exit routing ─────────────────────────────────────────
  if (effectiveSide === 'right') {
    const fromRightX = from.x + from.w
    const fromCY = from.y + from.h / 2
    const toLeft = to.x
    const toRight = to.x + to.w
    const toCY = to.y + to.h / 2
    const goingForward = to.x > from.x + from.w / 2
    const sameRow = Math.abs(from.y - to.y) < 20

    if (goingForward) {
      if (sameRow) {
        // Same row, forward — straight horizontal
        points.push({ x: fromRightX, y: fromCY })
        points.push({ x: toLeft, y: toCY })
      } else {
        // Different row, forward — right-angle elbow
        const midX = fromRightX + (toLeft - fromRightX) / 2
        points.push({ x: fromRightX, y: fromCY })
        points.push({ x: midX, y: fromCY })
        points.push({ x: midX, y: toCY })
        points.push({ x: toLeft, y: toCY })
      }
    } else {
      if (sameRow) {
        // Same row, backward — loop below
        const loopY = Math.max(from.y, to.y) + Math.max(from.h, to.h) + CLEARANCE + 10
        points.push({ x: fromRightX, y: fromCY })
        points.push({ x: fromRightX + CLEARANCE, y: fromCY })
        points.push({ x: fromRightX + CLEARANCE, y: loopY })
        points.push({ x: toLeft - CLEARANCE, y: loopY })
        points.push({ x: toLeft - CLEARANCE, y: toCY })
        points.push({ x: toLeft, y: toCY })
      } else {
        // Different row, backward — exit right, loop to target
        const escapeX = Math.max(from.x + from.w, to.x + to.w) + CLEARANCE + 20
        const loopY = Math.max(from.y + from.h, to.y + to.h) + CLEARANCE + 10
        points.push({ x: fromRightX, y: fromCY })
        points.push({ x: escapeX, y: fromCY })
        points.push({ x: escapeX, y: loopY })
        points.push({ x: toLeft - CLEARANCE, y: loopY })
        points.push({ x: toLeft - CLEARANCE, y: toCY })
        points.push({ x: toLeft, y: toCY })
      }
    }

    return {
      points,
      label: conditionLabel,
      labelPosition: getLabelPosition(points),
      color,
    }
  }

  // ─── Left-exit routing ──────────────────────────────────────────
  if (effectiveSide === 'left') {
    const fromLeftX = from.x
    const fromCY = from.y + from.h / 2
    const toRight = to.x + to.w
    const toLeft = to.x
    const toCY = to.y + to.h / 2

    if (to.x + to.w < from.x) {
      // Target is to the left — go left then route to target's right edge
      const midX = fromLeftX - (fromLeftX - toRight) / 2
      points.push({ x: fromLeftX, y: fromCY })
      points.push({ x: midX, y: fromCY })
      points.push({ x: midX, y: toCY })
      points.push({ x: toRight, y: toCY })
    } else {
      // Target is to the right or same column — go left, drop below, route right to target
      const escapeX = Math.min(from.x, to.x) - CLEARANCE - 20
      const dropY = Math.max(from.y + from.h, to.y + to.h) + CLEARANCE + 10
      points.push({ x: fromLeftX, y: fromCY })
      points.push({ x: escapeX, y: fromCY })
      points.push({ x: escapeX, y: dropY })
      points.push({ x: toLeft - CLEARANCE, y: dropY })
      points.push({ x: toLeft - CLEARANCE, y: toCY })
      points.push({ x: toLeft, y: toCY })
    }

    return {
      points,
      label: conditionLabel,
      labelPosition: getLabelPosition(points),
      color,
    }
  }

  // ─── Top-exit routing ───────────────────────────────────────────
  if (effectiveSide === 'top') {
    const fromCX = from.x + from.w / 2
    const fromTopY = from.y
    const toLeft = to.x
    const toRight = to.x + to.w
    const toCY = to.y + to.h / 2
    const toBottom = to.y + to.h

    if (Math.abs(fromCX - (to.x + to.w / 2)) < 15 && to.y + to.h < from.y) {
      // Same column, target is above — straight up
      points.push({ x: fromCX, y: fromTopY })
      points.push({ x: fromCX, y: toBottom })
    } else {
      // Rise above source, route horizontally, approach target
      const riseY = Math.min(from.y, to.y) - CLEARANCE - 20
      points.push({ x: fromCX, y: fromTopY })
      points.push({ x: fromCX, y: riseY })
      const targetApproachX = to.x > from.x + from.w / 2 ? toLeft : toRight
      points.push({ x: targetApproachX, y: riseY })
      points.push({ x: targetApproachX, y: toCY })
    }

    return {
      points,
      label: conditionLabel,
      labelPosition: getLabelPosition(points),
      color,
    }
  }

  // If exitBottom is set (or effectiveSide === 'bottom'), route from bottom of source down then across to target
  if (effectiveSide === 'bottom') {
    const fromCX = from.x + from.w / 2
    const fromBottom = from.y + from.h
    const toLeft = to.x
    const toRight = to.x + to.w
    const toCY = to.y + to.h / 2

    const goingRight = to.x > from.x

    if (Math.abs(fromCX - (to.x + to.w / 2)) < 15) {
      // Same column — straight down
      points.push({ x: fromCX, y: fromBottom })
      points.push({ x: fromCX, y: to.y })
    } else {
      // Drop below the source, then route horizontally to target
      const dropY = Math.max(fromBottom + CLEARANCE, toCY)
      points.push({ x: fromCX, y: fromBottom })
      points.push({ x: fromCX, y: dropY })
      if (goingRight) {
        points.push({ x: toLeft - CLEARANCE, y: dropY })
        points.push({ x: toLeft - CLEARANCE, y: toCY })
        points.push({ x: toLeft, y: toCY })
      } else {
        points.push({ x: toRight + CLEARANCE, y: dropY })
        points.push({ x: toRight + CLEARANCE, y: toCY })
        points.push({ x: toRight, y: toCY })
      }
    }

    return {
      points,
      label: conditionLabel,
      labelPosition: getLabelPosition(points),
      color,
    }
  }

  // Tolerance for "same row" — cards in the same lane may have slightly different Y
  const sameRow = Math.abs(from.y - to.y) < 20
  const sameColumn = Math.abs(from.x - to.x) < 15
  const goingForward = to.x > from.x + from.w / 2

  if (sameRow) {
    // Same lane — horizontal line
    if (goingForward) {
      points.push({ x: from.x + from.w, y: from.y + from.h / 2 })
      points.push({ x: to.x, y: to.y + to.h / 2 })
    } else {
      // Loop back: go down, left, up (use annotation area below cards)
      const loopY = Math.max(from.y, to.y) + Math.max(from.h, to.h) + CLEARANCE + 10
      points.push({ x: from.x + from.w, y: from.y + from.h / 2 })
      points.push({ x: from.x + from.w + CLEARANCE, y: from.y + from.h / 2 })
      points.push({ x: from.x + from.w + CLEARANCE, y: loopY })
      points.push({ x: to.x - CLEARANCE, y: loopY })
      points.push({ x: to.x - CLEARANCE, y: to.y + to.h / 2 })
      points.push({ x: to.x, y: to.y + to.h / 2 })
    }
  } else if (sameColumn) {
    // Same column, different lane — clean vertical line
    const goingDown = to.y > from.y
    const cx = from.x + from.w / 2
    if (goingDown) {
      points.push({ x: cx, y: from.y + from.h })
      points.push({ x: cx, y: to.y })
    } else {
      points.push({ x: cx, y: from.y })
      points.push({ x: cx, y: to.y + to.h })
    }
  } else {
    // Cross-lane, different column — right-angle elbow
    const fromRight = from.x + from.w
    const fromCY = from.y + from.h / 2
    const toLeft = to.x
    const toCY = to.y + to.h / 2

    if (goingForward) {
      // Forward elbow: right → down/up → right
      // Route through the gap between columns
      const midX = fromRight + (toLeft - fromRight) / 2
      points.push({ x: fromRight, y: fromCY })
      points.push({ x: midX, y: fromCY })
      points.push({ x: midX, y: toCY })
      points.push({ x: toLeft, y: toCY })
    } else {
      // Backward cross-lane: go below/above then loop back
      const goingDown = to.y > from.y
      const loopX = Math.min(from.x, to.x) - CLEARANCE - 8
      const exitY = goingDown ? from.y + from.h : from.y
      const clearY = goingDown ? exitY + CLEARANCE : exitY - CLEARANCE

      points.push({ x: from.x + from.w / 2, y: exitY })
      points.push({ x: from.x + from.w / 2, y: clearY })
      points.push({ x: loopX, y: clearY })
      points.push({ x: loopX, y: toCY })
      points.push({ x: toLeft, y: toCY })
    }
  }

  return {
    points,
    label: conditionLabel,
    labelPosition: getLabelPosition(points),
    color,
  }
}

/**
 * Find the best label position along a path — midpoint of the longest segment
 */
function getLabelPosition(points: Point[]): Point | undefined {
  if (points.length < 2) return undefined

  let bestLen = 0
  let bestIdx = 0
  for (let i = 0; i < points.length - 1; i++) {
    const dx = points[i + 1].x - points[i].x
    const dy = points[i + 1].y - points[i].y
    const len = Math.sqrt(dx * dx + dy * dy)
    if (len > bestLen) {
      bestLen = len
      bestIdx = i
    }
  }

  return {
    x: (points[bestIdx].x + points[bestIdx + 1].x) / 2,
    y: (points[bestIdx].y + points[bestIdx + 1].y) / 2,
  }
}

/**
 * Convert points to SVG path data (orthogonal lines)
 */
export function pointsToSVGPath(points: Point[]): string {
  if (points.length < 2) return ''
  return points.map((p, i) => (i === 0 ? `M${p.x},${p.y}` : `L${p.x},${p.y}`)).join(' ')
}

/**
 * Get arrowhead points for the end of a path
 */
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
