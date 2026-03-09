'use client'

import type { PhaseHeader, LanePosition } from '../../utils/svg-layout'
import { SVG } from '../../utils/svg-layout'

interface SVGPhaseHeadersProps {
  phaseHeaders: PhaseHeader[]
  lanePositions: LanePosition[]
  totalW: number
  titleOffsetY?: number
}

export default function SVGPhaseHeaders({ phaseHeaders, lanePositions, totalW, titleOffsetY = 0 }: SVGPhaseHeadersProps) {
  if (phaseHeaders.length === 0) return null

  const headerY = SVG.PAD + titleOffsetY
  const headerH = SVG.PHASE_HEADER_H - 4

  // Full-height zone: from top of header bar to bottom of last lane
  const lastLane = lanePositions[lanePositions.length - 1]
  const bodyBottom = lastLane ? lastLane.y + lastLane.h : headerY + headerH
  const bodyY = headerY + headerH
  const bodyH = bodyBottom - bodyY

  // Sort by x for left/right border logic
  const sorted = [...phaseHeaders].sort((a, b) => a.x - b.x)

  return (
    <g>
      {sorted.map((phase, idx) => {
        const isFirst = idx === 0
        const isLast = idx === sorted.length - 1

        return (
          <g key={`${phase.id}-${idx}`}>
            {/* Full-height body zone — subtle tint background */}
            <rect
              x={phase.x}
              y={bodyY}
              width={phase.w}
              height={bodyH}
              fill={phase.color.bg}
              opacity={0.04}
            />

            {/* Header bar — filled with phase color */}
            <rect
              x={phase.x}
              y={headerY}
              width={phase.w}
              height={headerH}
              fill={phase.color.bg}
              rx={isFirst || isLast ? 4 : 0}
            />
            {/* Square off bottom corners of header */}
            <rect
              x={phase.x}
              y={headerY + headerH - 4}
              width={phase.w}
              height={4}
              fill={phase.color.bg}
            />
            {/* Square off inner top corners when rounded */}
            {isFirst && !isLast && (
              <rect x={phase.x + phase.w - 4} y={headerY} width={4} height={4} fill={phase.color.bg} />
            )}
            {isLast && !isFirst && (
              <rect x={phase.x} y={headerY} width={4} height={4} fill={phase.color.bg} />
            )}

            {/* Phase label */}
            <text
              x={phase.x + phase.w / 2}
              y={headerY + headerH / 2}
              textAnchor="middle"
              dominantBaseline="central"
              fill={phase.color.text}
              fontSize={14}
              fontWeight={700}
              className="pointer-events-none select-none"
            >
              {phase.name}
            </text>
          </g>
        )
      })}
    </g>
  )
}
