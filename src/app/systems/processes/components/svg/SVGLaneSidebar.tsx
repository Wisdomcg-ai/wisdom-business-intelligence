'use client'

import type { LanePosition } from '../../utils/svg-layout'
import { SVG } from '../../utils/svg-layout'

interface SVGLaneSidebarProps {
  lanePositions: LanePosition[]
  totalW: number
}

export default function SVGLaneSidebar({ lanePositions, totalW }: SVGLaneSidebarProps) {
  return (
    <g>
      {lanePositions.map((lane) => (
        <g key={lane.id}>
          {/* Full-width lane background tint */}
          <rect
            x={SVG.SIDEBAR_W}
            y={lane.y}
            width={totalW - SVG.SIDEBAR_W}
            height={lane.h}
            fill={lane.color.tint}
            opacity={0.5}
          />
          {/* Lane border line at bottom */}
          <line
            x1={SVG.SIDEBAR_W}
            y1={lane.y + lane.h}
            x2={totalW}
            y2={lane.y + lane.h}
            stroke={lane.color.primary}
            strokeWidth={0.5}
            opacity={0.3}
          />
          {/* Colored sidebar bar */}
          <rect
            x={0}
            y={lane.y}
            width={SVG.SIDEBAR_W}
            height={lane.h}
            fill={lane.color.border}
            rx={0}
          />
          {/* Rounded left edge only */}
          <rect
            x={0}
            y={lane.y}
            width={8}
            height={lane.h}
            fill={lane.color.border}
            rx={4}
          />
          {/* Rotated lane name */}
          <text
            x={SVG.SIDEBAR_W / 2}
            y={lane.y + lane.h / 2}
            textAnchor="middle"
            dominantBaseline="central"
            fill="white"
            fontSize={12}
            fontWeight={700}
            letterSpacing={0.5}
            transform={`rotate(-90, ${SVG.SIDEBAR_W / 2}, ${lane.y + lane.h / 2})`}
            className="pointer-events-none select-none"
          >
            {lane.name.length > 22 ? lane.name.slice(0, 20) + '…' : lane.name}
          </text>
        </g>
      ))}
    </g>
  )
}
