'use client'

import { useCallback, useRef } from 'react'
import type { ProcessSnapshot } from '@/types/process-builder'
import { calculateSVGLayout } from '../../utils/svg-layout'

interface SVGMinimapProps {
  snapshot: ProcessSnapshot
  viewportRect: { x: number; y: number; w: number; h: number }
  diagramSize: { w: number; h: number }
  onNavigate: (x: number, y: number) => void
  visible: boolean
}

const MINIMAP_W = 180
const MINIMAP_H = 100

export default function SVGMinimap({
  snapshot,
  viewportRect,
  diagramSize,
  onNavigate,
  visible,
}: SVGMinimapProps) {
  const minimapRef = useRef<SVGSVGElement>(null)

  const scaleX = MINIMAP_W / diagramSize.w
  const scaleY = MINIMAP_H / diagramSize.h
  const scale = Math.min(scaleX, scaleY)

  const handleClick = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const svg = minimapRef.current
      if (!svg) return
      const rect = svg.getBoundingClientRect()
      const mx = (e.clientX - rect.left) / scale
      const my = (e.clientY - rect.top) / scale
      onNavigate(mx - viewportRect.w / 2, my - viewportRect.h / 2)
    },
    [scale, onNavigate, viewportRect.w, viewportRect.h]
  )

  if (!visible) return null

  const layout = calculateSVGLayout(snapshot.swimlanes, snapshot.steps, snapshot.flows)

  return (
    <div className="absolute bottom-3 right-3 bg-white rounded-lg shadow-lg border border-gray-200 p-1.5 z-10">
      <svg
        ref={minimapRef}
        width={MINIMAP_W}
        height={MINIMAP_H}
        viewBox={`0 0 ${diagramSize.w} ${diagramSize.h}`}
        className="cursor-pointer"
        onClick={handleClick}
      >
        {/* Lane backgrounds */}
        {layout.lanePositions.map((lane) => (
          <rect
            key={lane.id}
            x={0}
            y={lane.y}
            width={diagramSize.w}
            height={lane.h}
            fill={lane.color.tint}
            opacity={0.6}
          />
        ))}
        {/* Step dots */}
        {snapshot.steps.map((step) => {
          const pos = layout.stepPositions.get(step.id)
          if (!pos) return null
          const lane = snapshot.swimlanes.find((l) => l.id === step.swimlane_id)
          return (
            <rect
              key={step.id}
              x={pos.x}
              y={pos.y}
              width={pos.w}
              height={pos.h}
              rx={3}
              fill={lane?.color.border ?? '#6B7280'}
              opacity={0.8}
            />
          )
        })}
        {/* Viewport indicator */}
        <rect
          x={viewportRect.x}
          y={viewportRect.y}
          width={viewportRect.w}
          height={viewportRect.h}
          fill="none"
          stroke="#F97316"
          strokeWidth={Math.max(2, diagramSize.w / MINIMAP_W)}
          rx={2}
        />
      </svg>
    </div>
  )
}
