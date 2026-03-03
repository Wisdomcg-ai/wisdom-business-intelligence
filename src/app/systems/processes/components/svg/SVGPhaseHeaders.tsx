'use client'

import type { PhaseHeader } from '../../utils/svg-layout'
import { SVG } from '../../utils/svg-layout'

interface SVGPhaseHeadersProps {
  phaseHeaders: PhaseHeader[]
  totalW: number
  titleOffsetY?: number
}

export default function SVGPhaseHeaders({ phaseHeaders, totalW, titleOffsetY = 0 }: SVGPhaseHeadersProps) {
  if (phaseHeaders.length === 0) return null

  const barY = SVG.PAD + titleOffsetY
  const barH = SVG.PHASE_HEADER_H - 4

  return (
    <g>
      {/* Full-width dark charcoal bar */}
      <rect
        x={SVG.SIDEBAR_W}
        y={barY}
        width={totalW - SVG.SIDEBAR_W}
        height={barH}
        fill="#1F2937"
      />

      {/* Phase labels + vertical dividers */}
      {phaseHeaders.map((phase, idx) => (
        <g key={`${phase.name}-${idx}`}>
          <text
            x={phase.x + phase.w / 2}
            y={barY + barH / 2}
            textAnchor="middle"
            dominantBaseline="central"
            fill="white"
            fontSize={11}
            fontWeight={700}
            className="pointer-events-none select-none"
          >
            {phase.name}
          </text>
          {/* Thin vertical divider between phases */}
          {idx < phaseHeaders.length - 1 && (
            <line
              x1={phase.x + phase.w + SVG.GAP_X / 2}
              y1={barY + 4}
              x2={phase.x + phase.w + SVG.GAP_X / 2}
              y2={barY + barH - 4}
              stroke="rgba(255,255,255,0.3)"
              strokeWidth={1}
            />
          )}
        </g>
      ))}
    </g>
  )
}
