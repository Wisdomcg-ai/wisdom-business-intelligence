'use client'

import { useMemo } from 'react'
import type { ProcessFlowData, ProcessStepData, DecisionOption } from '@/types/process-builder'
import type { StepPosition, LanePosition } from '../../utils/svg-layout'
import { SVG } from '../../utils/svg-layout'
import { calculateAllConnectorPaths, pointsToSVGPath } from '../../utils/connector-math'

interface SVGConnectorsProps {
  flows: ProcessFlowData[]
  steps: ProcessStepData[]
  stepPositions: Map<string, StepPosition>
  lanePositions: LanePosition[]
  stepLaneMap: Map<string, string>
  selectedFlowId?: string | null
  onFlowClick?: (flowId: string) => void
  onFlowDelete?: (flowId: string) => void
}

const COLOR_MAP: Record<string, string> = {
  green: '#10B981',
  red: '#EF4444',
  blue: '#3B82F6',
  orange: '#F97316',
}

/** Get decision options from step, with legacy/default fallback */
function getStepOptions(step: ProcessStepData): DecisionOption[] {
  if (step.decision_options && step.decision_options.length > 0) return step.decision_options
  if (step.decision_yes_label || step.decision_no_label) {
    return [
      { label: step.decision_yes_label || 'Yes', color: 'green' },
      { label: step.decision_no_label || 'No', color: 'red' },
    ]
  }
  return [{ label: 'Yes', color: 'green' }, { label: 'No', color: 'red' }]
}

export default function SVGConnectors({
  flows,
  steps,
  stepPositions,
  lanePositions,
  stepLaneMap,
  selectedFlowId,
  onFlowClick,
  onFlowDelete,
}: SVGConnectorsProps) {
  // Repair decision flows missing condition_color — handles AI mapper flows (flow_type='sequential')
  const repairedFlows = useMemo(() => {
    return flows.map((flow) => {
      // Skip flows that already have condition_color
      if (flow.condition_color) return flow

      // Only repair flows from decision steps
      const fromStep = steps.find((s) => s.id === flow.from_step_id)
      if (!fromStep || fromStep.step_type !== 'decision') return flow

      // Identify if this is a decision flow (vs auto-connected sequential)
      const isAutoFlow = flow.id.startsWith('auto-')
      const isDecisionFlow = flow.flow_type === 'decision' || !!flow.condition_label
      if (isAutoFlow && !isDecisionFlow) return flow

      // If it's a non-auto flow from a decision with no markers, check if there are multiple non-auto outgoing flows
      if (!isDecisionFlow) {
        const nonAutoFlows = flows.filter(
          (f) => f.from_step_id === flow.from_step_id && !f.id.startsWith('auto-')
        )
        if (nonAutoFlows.length <= 1) return flow
      }

      const options = getStepOptions(fromStep)

      // Try matching by label first
      if (flow.condition_label) {
        const match = options.find(
          (o) => o.label.toLowerCase() === flow.condition_label?.toLowerCase()
        )
        if (match) {
          return { ...flow, condition_color: match.color }
        }
      }

      // Fallback: assign by index among this decision's non-auto outgoing flows
      const decisionFlows = flows.filter(
        (f) => f.from_step_id === flow.from_step_id && !f.id.startsWith('auto-')
      )
      const myIdx = decisionFlows.findIndex((f) => f.id === flow.id)
      if (myIdx >= 0 && myIdx < options.length) {
        return {
          ...flow,
          condition_color: options[myIdx].color,
          condition_label: flow.condition_label || options[myIdx].label,
        }
      }

      return flow
    })
  }, [flows, steps])

  // Batch-compute all connector paths with stagger deconfliction
  const allPaths = useMemo(() => {
    return calculateAllConnectorPaths(
      repairedFlows,
      steps,
      stepPositions,
      lanePositions,
      stepLaneMap
    )
  }, [repairedFlows, steps, stepPositions, lanePositions, stepLaneMap])

  return (
    <g>

      {/* Arrow marker definitions */}
      <defs>
        <marker
          id="arrow-default"
          viewBox="0 0 10 10"
          refX={9}
          refY={5}
          markerWidth={SVG.ARROW_SIZE}
          markerHeight={SVG.ARROW_SIZE}
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#0D9488" />
        </marker>
        <marker
          id="arrow-green"
          viewBox="0 0 10 10"
          refX={9}
          refY={5}
          markerWidth={SVG.ARROW_SIZE}
          markerHeight={SVG.ARROW_SIZE}
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#10B981" />
        </marker>
        <marker
          id="arrow-red"
          viewBox="0 0 10 10"
          refX={9}
          refY={5}
          markerWidth={SVG.ARROW_SIZE}
          markerHeight={SVG.ARROW_SIZE}
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#EF4444" />
        </marker>
        <marker
          id="arrow-blue"
          viewBox="0 0 10 10"
          refX={9}
          refY={5}
          markerWidth={SVG.ARROW_SIZE}
          markerHeight={SVG.ARROW_SIZE}
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#3B82F6" />
        </marker>
        <marker
          id="arrow-orange"
          viewBox="0 0 10 10"
          refX={9}
          refY={5}
          markerWidth={SVG.ARROW_SIZE}
          markerHeight={SVG.ARROW_SIZE}
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#F97316" />
        </marker>
        <marker
          id="arrow-selected"
          viewBox="0 0 10 10"
          refX={9}
          refY={5}
          markerWidth={SVG.ARROW_SIZE}
          markerHeight={SVG.ARROW_SIZE}
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#F97316" />
        </marker>
      </defs>

      {repairedFlows.map((flow) => {
        const connector = allPaths.get(flow.id)
        if (!connector) return null

        const pathData = pointsToSVGPath(connector.points)
        const isFlowSelected = selectedFlowId === flow.id
        const strokeColor = isFlowSelected
          ? '#F97316'
          : connector.color ? (COLOR_MAP[connector.color] || connector.color) : '#0D9488'
        const ARROW_MARKER_MAP: Record<string, string> = {
          green: 'arrow-green',
          red: 'arrow-red',
          blue: 'arrow-blue',
          orange: 'arrow-orange',
        }
        const markerId = isFlowSelected ? 'arrow-selected'
          : (flow.condition_color && ARROW_MARKER_MAP[flow.condition_color]) || 'arrow-default'

        // Calculate midpoint for delete button
        const midpoint = connector.points.length >= 2
          ? {
              x: (connector.points[Math.floor(connector.points.length / 2 - 1)].x +
                  connector.points[Math.floor(connector.points.length / 2)].x) / 2,
              y: (connector.points[Math.floor(connector.points.length / 2 - 1)].y +
                  connector.points[Math.floor(connector.points.length / 2)].y) / 2,
            }
          : null

        return (
          <g key={flow.id}>
            {/* Invisible wider hit area for clicking */}
            {onFlowClick && (
              <path
                d={pathData}
                fill="none"
                stroke="transparent"
                strokeWidth={12}
                className="cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation()
                  onFlowClick(flow.id)
                }}
              />
            )}
            {/* Visible connector path */}
            <path
              d={pathData}
              fill="none"
              stroke={strokeColor}
              strokeWidth={isFlowSelected ? 3 : SVG.CONNECTOR_STROKE}
              markerEnd={`url(#${markerId})`}
              className={onFlowClick ? 'pointer-events-none' : undefined}
            />
            {connector.label && connector.labelPosition && (
              <g>
                {/* Label pill background */}
                <rect
                  x={connector.labelPosition.x - (connector.label.length * 3.5 + 6)}
                  y={connector.labelPosition.y - 9}
                  width={connector.label.length * 7 + 12}
                  height={18}
                  rx={9}
                  fill="white"
                  stroke={strokeColor}
                  strokeWidth={1}
                  filter="drop-shadow(0 1px 2px rgba(0,0,0,0.1))"
                />
                <text
                  x={connector.labelPosition.x}
                  y={connector.labelPosition.y}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill={strokeColor}
                  fontSize={9}
                  fontWeight={700}
                  className="pointer-events-none select-none"
                >
                  {connector.label}
                </text>
              </g>
            )}

            {/* Delete button when selected */}
            {isFlowSelected && midpoint && onFlowDelete && (
              <g
                className="cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation()
                  onFlowDelete(flow.id)
                }}
              >
                <circle
                  cx={midpoint.x}
                  cy={midpoint.y}
                  r={10}
                  fill="#EF4444"
                  stroke="white"
                  strokeWidth={2}
                />
                <text
                  x={midpoint.x}
                  y={midpoint.y + 1}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill="white"
                  fontSize={12}
                  fontWeight={700}
                  className="pointer-events-none select-none"
                >
                  ×
                </text>
              </g>
            )}
          </g>
        )
      })}
    </g>
  )
}
