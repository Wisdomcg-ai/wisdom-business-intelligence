'use client'

import { useMemo } from 'react'
import type { ProcessSnapshot } from '@/types/process-builder'
import { calculateSVGLayout, SVG } from '../../utils/svg-layout'
import SVGStepCard from './SVGStepCard'
import SVGAnnotations from './SVGAnnotations'
import SVGConnectors from './SVGConnectors'
import SVGLaneSidebar from './SVGLaneSidebar'
import SVGPhaseHeaders from './SVGPhaseHeaders'

interface SwimlanesDiagramSVGProps {
  snapshot: ProcessSnapshot
  selectedStepId: string | null
  onStepClick: (stepId: string) => void
  onStepHover: (stepId: string | null, e?: React.MouseEvent) => void
  // Drag-and-drop
  onStepMouseDown?: (stepId: string, e: React.MouseEvent) => void
  onPortMouseDown?: (stepId: string, port: 'right' | 'bottom' | 'left' | 'top', e: React.MouseEvent) => void
  dragStepId?: string | null
  // Flow interaction
  selectedFlowId?: string | null
  onFlowClick?: (flowId: string) => void
  onFlowDelete?: (flowId: string) => void
  // Visual overlays
  highlightLaneId?: string | null
  tempConnector?: { fromX: number; fromY: number; toX: number; toY: number } | null
  // Title
  processName?: string
}

export default function SwimlanesDiagramSVG({
  snapshot,
  selectedStepId,
  onStepClick,
  onStepHover,
  onStepMouseDown,
  onPortMouseDown,
  dragStepId,
  selectedFlowId,
  onFlowClick,
  onFlowDelete,
  highlightLaneId,
  tempConnector,
  processName,
}: SwimlanesDiagramSVGProps) {
  const layout = useMemo(
    () => calculateSVGLayout(snapshot.swimlanes, snapshot.steps, snapshot.flows, processName),
    [snapshot.swimlanes, snapshot.steps, snapshot.flows, processName]
  )

  const hasTitle = !!processName
  const titleOffsetY = hasTitle ? SVG.TITLE_H : 0

  // Pre-compute per-lane step ordering for order badges
  const laneStepOrders = useMemo(() => {
    const map = new Map<string, number>()
    for (const lane of snapshot.swimlanes) {
      const laneSteps = snapshot.steps
        .filter((s) => s.swimlane_id === lane.id)
        .sort((a, b) => a.order_num - b.order_num)
      laneSteps.forEach((s, i) => map.set(s.id, i + 1))
    }
    return map
  }, [snapshot.swimlanes, snapshot.steps])

  return (
    <svg
      width={layout.totalW}
      height={layout.totalH}
      viewBox={`0 0 ${layout.totalW} ${layout.totalH}`}
      className="select-none"
    >
      {/* Title bar */}
      {hasTitle && processName && (
        <g>
          <rect
            x={0}
            y={SVG.PAD}
            width={layout.totalW}
            height={SVG.TITLE_H - 8}
            fill="#1F2937"
            rx={4}
          />
          <text
            x={layout.totalW / 2}
            y={SVG.PAD + (SVG.TITLE_H - 8) / 2}
            textAnchor="middle"
            dominantBaseline="central"
            fill="white"
            fontSize={14}
            fontWeight={700}
            className="pointer-events-none select-none"
          >
            {processName}
          </text>
        </g>
      )}

      {/* Lane backgrounds + sidebar */}
      <SVGLaneSidebar lanePositions={layout.lanePositions} totalW={layout.totalW} />

      {/* Lane highlight during card drag */}
      {highlightLaneId && layout.lanePositions.map((lp) => {
        if (lp.id !== highlightLaneId) return null
        return (
          <rect
            key={`highlight-${lp.id}`}
            x={0}
            y={lp.y}
            width={layout.totalW}
            height={lp.h}
            fill={lp.color.primary}
            opacity={0.12}
            rx={4}
            className="pointer-events-none"
          />
        )
      })}

      {/* Phase headers */}
      <SVGPhaseHeaders phaseHeaders={layout.phaseHeaders} totalW={layout.totalW} titleOffsetY={titleOffsetY} />

      {/* Connectors (behind cards) */}
      <SVGConnectors
        flows={snapshot.flows}
        steps={snapshot.steps}
        stepPositions={layout.stepPositions}
        selectedFlowId={selectedFlowId}
        onFlowClick={onFlowClick}
        onFlowDelete={onFlowDelete}
      />

      {/* Step cards + annotations */}
      {snapshot.steps.map((step) => {
        const pos = layout.stepPositions.get(step.id)
        if (!pos) return null

        const lane = snapshot.swimlanes.find((l) => l.id === step.swimlane_id)
        if (!lane) return null

        const isDocumented = !!(
          step.description ||
          step.systems_used.length > 0 ||
          step.documents_needed.length > 0 ||
          step.estimated_duration
        )

        return (
          <g key={step.id}>
            <SVGAnnotations step={step} pos={pos} />
            <SVGStepCard
              step={step}
              pos={pos}
              laneColor={lane.color}
              orderInLane={laneStepOrders.get(step.id) ?? 1}
              isSelected={selectedStepId === step.id}
              isDocumented={isDocumented}
              isDragFaded={dragStepId === step.id}
              onClick={onStepClick}
              onMouseEnter={(id, e) => onStepHover(id, e)}
              onMouseLeave={() => onStepHover(null)}
              onMouseDown={onStepMouseDown}
              onPortMouseDown={onPortMouseDown}
            />
          </g>
        )
      })}

      {/* Temporary connector line while drawing a new flow */}
      {tempConnector && (
        <line
          x1={tempConnector.fromX}
          y1={tempConnector.fromY}
          x2={tempConnector.toX}
          y2={tempConnector.toY}
          stroke="#3B82F6"
          strokeWidth={2}
          strokeDasharray="6 4"
          opacity={0.7}
          className="pointer-events-none"
        />
      )}
    </svg>
  )
}
