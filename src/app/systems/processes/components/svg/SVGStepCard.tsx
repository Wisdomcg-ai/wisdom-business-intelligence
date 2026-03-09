'use client'

import { useState, useRef, useEffect } from 'react'
import type { ProcessStepData, SwimlaneColor, DecisionOption } from '@/types/process-builder'
import type { StepPosition } from '../../utils/svg-layout'

interface SVGStepCardProps {
  step: ProcessStepData
  pos: StepPosition
  laneColor: SwimlaneColor
  orderInLane: number
  isSelected: boolean
  isDocumented: boolean
  isDragFaded?: boolean
  isEditing?: boolean
  isNew?: boolean
  isDeleting?: boolean
  onClick: (stepId: string) => void
  onDoubleClick?: (stepId: string) => void
  onNameCommit?: (stepId: string, newName: string) => void
  onMouseEnter: (stepId: string, e: React.MouseEvent) => void
  onMouseLeave: () => void
  onMouseDown?: (stepId: string, e: React.MouseEvent) => void
  onPortMouseDown?: (stepId: string, port: 'right' | 'bottom' | 'left' | 'top', e: React.MouseEvent) => void
}

export default function SVGStepCard({
  step,
  pos,
  laneColor,
  orderInLane,
  isSelected,
  isDocumented,
  isDragFaded,
  isEditing,
  isNew,
  isDeleting,
  onClick,
  onDoubleClick,
  onNameCommit,
  onMouseEnter,
  onMouseLeave,
  onMouseDown,
  onPortMouseDown,
}: SVGStepCardProps) {
  const [isHovered, setIsHovered] = useState(false)
  const [hoveredPort, setHoveredPort] = useState<'right' | 'bottom' | 'left' | 'top' | null>(null)
  const [editValue, setEditValue] = useState(step.action_name)
  const inputRef = useRef<HTMLInputElement>(null)
  const isDecision = step.step_type === 'decision'
  const cx = pos.x + pos.w / 2
  const cy = pos.y + pos.h / 2

  // Focus input when editing starts
  useEffect(() => {
    if (isEditing && inputRef.current) {
      setEditValue(step.action_name)
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing, step.action_name])

  const commitEdit = () => {
    const trimmed = editValue.trim()
    if (trimmed && trimmed !== step.action_name) {
      onNameCommit?.(step.id, trimmed)
    } else {
      onNameCommit?.(step.id, step.action_name) // cancel - revert
    }
  }

  const handleMouseEnter = (e: React.MouseEvent) => {
    if (isEditing) return
    setIsHovered(true)
    onMouseEnter(step.id, e)
  }

  const handleMouseLeave = () => {
    setIsHovered(false)
    onMouseLeave()
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0 || isEditing) return
    onMouseDown?.(step.id, e)
  }

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onDoubleClick?.(step.id)
  }

  // Animation styles
  const animStyle: React.CSSProperties = {
    transition: 'transform 300ms ease-out, opacity 250ms ease-out',
    ...(isDeleting ? { opacity: 0, transform: 'scale(0.8)' } : {}),
    ...(isNew ? { animation: 'stepFadeIn 200ms ease-out' } : {}),
  }

  const handlePortMouseDown = (port: 'right' | 'bottom' | 'left' | 'top', e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    onPortMouseDown?.(step.id, port, e)
  }

  // Connection port positions
  const rightPortX = pos.x + pos.w
  const rightPortY = pos.y + pos.h / 2
  const bottomPortX = pos.x + pos.w / 2
  const bottomPortY = pos.y + pos.h
  const leftPortX = pos.x
  const leftPortY = pos.y + pos.h / 2
  const topPortX = pos.x + pos.w / 2
  const topPortY = pos.y

  // Decision diamonds get color-coded ports matching their options
  const options = isDecision ? getDecisionOptionsFromStep(step) : []

  const portElements = isHovered && onPortMouseDown && (
    isDecision ? (
      <>
        {options.length >= 1 && (
          <circle cx={rightPortX} cy={rightPortY} r={5} fill="white"
            stroke={OPTION_COLOR_MAP[options[0].color] || '#10B981'} strokeWidth={2}
            className="cursor-crosshair" onMouseDown={(e) => handlePortMouseDown('right', e)}
            onMouseEnter={() => setHoveredPort('right')} onMouseLeave={() => setHoveredPort(null)} />
        )}
        {options.length >= 2 && (
          <circle cx={bottomPortX} cy={bottomPortY} r={5} fill="white"
            stroke={OPTION_COLOR_MAP[options[1].color] || '#EF4444'} strokeWidth={2}
            className="cursor-crosshair" onMouseDown={(e) => handlePortMouseDown('bottom', e)}
            onMouseEnter={() => setHoveredPort('bottom')} onMouseLeave={() => setHoveredPort(null)} />
        )}
        {options.length >= 3 && (
          <circle cx={leftPortX} cy={leftPortY} r={5} fill="white"
            stroke={OPTION_COLOR_MAP[options[2].color] || '#3B82F6'} strokeWidth={2}
            className="cursor-crosshair" onMouseDown={(e) => handlePortMouseDown('left', e)}
            onMouseEnter={() => setHoveredPort('left')} onMouseLeave={() => setHoveredPort(null)} />
        )}
        {options.length >= 4 && (
          <circle cx={topPortX} cy={topPortY} r={5} fill="white"
            stroke={OPTION_COLOR_MAP[options[3].color] || '#F97316'} strokeWidth={2}
            className="cursor-crosshair" onMouseDown={(e) => handlePortMouseDown('top', e)}
            onMouseEnter={() => setHoveredPort('top')} onMouseLeave={() => setHoveredPort(null)} />
        )}
      </>
    ) : (
      <>
        <circle cx={rightPortX} cy={rightPortY} r={5} fill="white"
          stroke="#3B82F6" strokeWidth={2} className="cursor-crosshair"
          onMouseDown={(e) => handlePortMouseDown('right', e)}
          onMouseEnter={() => setHoveredPort('right')} onMouseLeave={() => setHoveredPort(null)} />
        <circle cx={bottomPortX} cy={bottomPortY} r={5} fill="white"
          stroke="#3B82F6" strokeWidth={2} className="cursor-crosshair"
          onMouseDown={(e) => handlePortMouseDown('bottom', e)}
          onMouseEnter={() => setHoveredPort('bottom')} onMouseLeave={() => setHoveredPort(null)} />
        <circle cx={leftPortX} cy={leftPortY} r={5} fill="white"
          stroke="#3B82F6" strokeWidth={2} className="cursor-crosshair"
          onMouseDown={(e) => handlePortMouseDown('left', e)}
          onMouseEnter={() => setHoveredPort('left')} onMouseLeave={() => setHoveredPort(null)} />
        <circle cx={topPortX} cy={topPortY} r={5} fill="white"
          stroke="#3B82F6" strokeWidth={2} className="cursor-crosshair"
          onMouseDown={(e) => handlePortMouseDown('top', e)}
          onMouseEnter={() => setHoveredPort('top')} onMouseLeave={() => setHoveredPort(null)} />
      </>
    )
  )

  // Instant tooltip when hovering a port circle
  const portTooltipElement = hoveredPort && (() => {
    const portPositions: Record<string, { px: number; py: number; anchor: 'start' | 'middle' | 'end'; dx: number; dy: number }> = {
      right:  { px: rightPortX,  py: rightPortY,  anchor: 'start', dx: 10, dy: -8 },
      bottom: { px: bottomPortX, py: bottomPortY, anchor: 'middle', dx: 0, dy: 14 },
      left:   { px: leftPortX,   py: leftPortY,   anchor: 'end', dx: -10, dy: -8 },
      top:    { px: topPortX,    py: topPortY,     anchor: 'middle', dx: 0, dy: -14 },
    }
    const { px, py, anchor, dx, dy } = portPositions[hoveredPort]
    const tx = px + dx
    const ty = py + dy
    const label = 'Click to add step \u00b7 Drag to connect'
    const textW = label.length * 4.6
    const padX = 6
    const padY = 4
    const rectW = textW + padX * 2
    const rectH = 16 + padY
    const rectX = anchor === 'end' ? tx - rectW : anchor === 'middle' ? tx - rectW / 2 : tx
    const rectY = ty - rectH / 2 - 1

    return (
      <g className="pointer-events-none">
        <rect x={rectX - 1} y={rectY} width={rectW + 2} height={rectH} rx={4} fill="#1F2937" opacity={0.9} />
        <text
          x={anchor === 'end' ? tx - padX : anchor === 'middle' ? tx : tx + padX}
          y={ty}
          textAnchor={anchor}
          dominantBaseline="central"
          fill="white"
          fontSize={9}
          fontWeight={500}
          className="pointer-events-none select-none"
        >
          {label}
        </text>
      </g>
    )
  })()

  if (isDecision) {
    // Diamond — white fill, thick colored border
    const dw = pos.w * 0.52
    const dh = pos.h * 0.52
    const pts = `${cx},${cy - dh} ${cx + dw},${cy} ${cx},${cy + dh} ${cx - dw},${cy}`

    const options = getDecisionOptionsFromStep(step)

    return (
      <g
        className="cursor-pointer"
        onClick={(e) => { e.stopPropagation(); if (!isEditing) onClick(step.id) }}
        onDoubleClick={handleDoubleClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onMouseDown={handleMouseDown}
        opacity={isDragFaded ? 0.3 : 1}
        style={animStyle}
      >
        {/* Shadow */}
        <polygon
          points={`${cx},${cy - dh + 2} ${cx + dw + 2},${cy + 2} ${cx},${cy + dh + 2} ${cx - dw - 2},${cy + 2}`}
          fill="rgba(0,0,0,0.08)"
        />
        {/* White fill diamond with thick colored border */}
        <polygon
          points={pts}
          fill="white"
          stroke={laneColor.border}
          strokeWidth={3}
        />
        {/* Inner colored diamond accent */}
        <polygon
          points={`${cx},${cy - dh + 8} ${cx + dw - 8},${cy} ${cx},${cy + dh - 8} ${cx - dw + 8},${cy}`}
          fill={laneColor.border}
          opacity={0.1}
        />
        {/* Name text or inline editor */}
        {isEditing ? (
          <foreignObject x={cx - 60} y={cy - 14} width={120} height={28}>
            <input
              ref={inputRef}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); commitEdit() }
                if (e.key === 'Escape') { e.preventDefault(); onNameCommit?.(step.id, step.action_name) }
                e.stopPropagation()
              }}
              onBlur={commitEdit}
              className="w-full h-full px-1 text-center text-xs font-semibold text-gray-800 bg-white border border-orange-400 rounded outline-none"
              style={{ fontSize: '10px' }}
            />
          </foreignObject>
        ) : (
          renderDecisionText(step.action_name, cx, cy, dw)
        )}
        {/* Decision option labels around edges */}
        {options.length >= 1 && (
          <text
            x={cx + dw + 8}
            y={cy - 14}
            textAnchor="start"
            dominantBaseline="central"
            fill={OPTION_COLOR_MAP[options[0].color] || '#10B981'}
            fontSize={9}
            fontWeight={700}
            className="pointer-events-none select-none"
          >
            {truncate(options[0].label, 16)}
          </text>
        )}
        {options.length >= 2 && (
          <text
            x={cx + 4}
            y={cy + dh + 12}
            textAnchor="start"
            dominantBaseline="central"
            fill={OPTION_COLOR_MAP[options[1].color] || '#EF4444'}
            fontSize={9}
            fontWeight={700}
            className="pointer-events-none select-none"
          >
            {truncate(options[1].label, 16)}
          </text>
        )}
        {options.length >= 3 && (
          <text
            x={cx - dw - 8}
            y={cy - 4}
            textAnchor="end"
            dominantBaseline="central"
            fill={OPTION_COLOR_MAP[options[2].color] || '#3B82F6'}
            fontSize={9}
            fontWeight={700}
            className="pointer-events-none select-none"
          >
            {truncate(options[2].label, 16)}
          </text>
        )}
        {options.length >= 4 && (
          <text
            x={cx + 4}
            y={cy - dh - 8}
            textAnchor="start"
            dominantBaseline="central"
            fill={OPTION_COLOR_MAP[options[3].color] || '#F97316'}
            fontSize={9}
            fontWeight={700}
            className="pointer-events-none select-none"
          >
            {truncate(options[3].label, 16)}
          </text>
        )}
        {/* Selection ring */}
        {isSelected && (
          <polygon
            points={`${cx},${cy - dh - 4} ${cx + dw + 4},${cy} ${cx},${cy + dh + 4} ${cx - dw - 4},${cy}`}
            fill="none"
            stroke="#F97316"
            strokeWidth={2.5}
            strokeDasharray="5 3"
          />
        )}
        {portElements}
        {portTooltipElement}
      </g>
    )
  }

  // ─── Regular action card ──────────────────────────────────────
  const lines = wrapText(step.action_name, 24)
  const accentW = 4  // colored accent bar width

  return (
    <g
      className="cursor-pointer"
      onClick={(e) => { e.stopPropagation(); if (!isEditing) onClick(step.id) }}
      onDoubleClick={handleDoubleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onMouseDown={handleMouseDown}
      opacity={isDragFaded ? 0.3 : 1}
      style={animStyle}
    >
      {/* Subtle shadow */}
      <rect
        x={pos.x + 1}
        y={pos.y + 1}
        width={pos.w}
        height={pos.h}
        rx={6}
        ry={6}
        fill="rgba(0,0,0,0.06)"
      />

      {/* White card body with thin gray border */}
      <rect
        x={pos.x}
        y={pos.y}
        width={pos.w}
        height={pos.h}
        rx={6}
        ry={6}
        fill="white"
        stroke={isSelected ? '#F97316' : '#E5E7EB'}
        strokeWidth={isSelected ? 3 : 1}
      />

      {/* Colored left accent bar */}
      <rect
        x={pos.x}
        y={pos.y + 3}
        width={accentW}
        height={pos.h - 6}
        rx={2}
        fill={laneColor.border}
      />

      {/* Step name — inline editor or text */}
      {isEditing ? (
        <foreignObject x={pos.x + accentW + 4} y={cy - 14} width={pos.w - accentW - 28} height={28}>
          <input
            ref={inputRef}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); commitEdit() }
              if (e.key === 'Escape') { e.preventDefault(); onNameCommit?.(step.id, step.action_name) }
              e.stopPropagation()
            }}
            onBlur={commitEdit}
            className="w-full h-full px-2 text-xs font-semibold text-gray-800 bg-white border border-orange-400 rounded outline-none"
            style={{ fontSize: '11px' }}
          />
        </foreignObject>
      ) : (
        renderCardText(lines, cx, cy, pos.h)
      )}

      {/* Order badge (top-right) — smaller */}
      <circle
        cx={pos.x + pos.w - 10}
        cy={pos.y + 10}
        r={7}
        fill={laneColor.border}
        opacity={0.85}
      />
      <text
        x={pos.x + pos.w - 10}
        y={pos.y + 10}
        textAnchor="middle"
        dominantBaseline="central"
        fill="white"
        fontSize={8}
        fontWeight={700}
        className="pointer-events-none select-none"
      >
        {orderInLane}
      </text>

      {/* Completion indicator (top-left green checkmark) */}
      {isDocumented && (
        <>
          <circle cx={pos.x + 11} cy={pos.y + 11} r={7} fill="#10B981" />
          <text
            x={pos.x + 11}
            y={pos.y + 11}
            textAnchor="middle"
            dominantBaseline="central"
            fill="white"
            fontSize={8}
            fontWeight={700}
            className="pointer-events-none select-none"
          >
            ✓
          </text>
        </>
      )}

      {/* Step type indicator for automation/wait */}
      {(step.step_type === 'automation' || step.step_type === 'wait') && (
        <>
          <circle
            cx={pos.x + (isDocumented ? 27 : 11)}
            cy={pos.y + 11}
            r={7}
            fill="#F9FAFB"
            stroke={laneColor.border}
            strokeWidth={1}
          />
          <text
            x={pos.x + (isDocumented ? 27 : 11)}
            y={pos.y + 11}
            textAnchor="middle"
            dominantBaseline="central"
            fill={laneColor.border}
            fontSize={9}
            fontWeight={700}
            className="pointer-events-none select-none"
          >
            {step.step_type === 'automation' ? '⚡' : '⏳'}
          </text>
        </>
      )}

      {/* Selection ring */}
      {isSelected && (
        <rect
          x={pos.x - 3}
          y={pos.y - 3}
          width={pos.w + 6}
          height={pos.h + 6}
          rx={9}
          ry={9}
          fill="none"
          stroke="#F97316"
          strokeWidth={2}
          strokeDasharray="5 3"
        />
      )}

      {portElements}
      {portTooltipElement}
    </g>
  )
}

/** Render up to 3 lines of dark text centered in card */
function renderCardText(lines: string[], cx: number, cy: number, cardH: number) {
  const lineH = 14
  const fontSize = 11
  const fontWeight = 600

  if (lines.length === 1) {
    return (
      <text
        x={cx} y={cy + 1}
        textAnchor="middle" dominantBaseline="central"
        fill="#374151" fontSize={fontSize} fontWeight={fontWeight}
        className="pointer-events-none select-none"
      >
        {lines[0]}
      </text>
    )
  }

  const totalH = lines.length * lineH
  const startY = cy - totalH / 2 + lineH / 2 + 1

  return (
    <>
      {lines.map((line, i) => (
        <text
          key={i}
          x={cx} y={startY + i * lineH}
          textAnchor="middle" dominantBaseline="central"
          fill="#374151" fontSize={fontSize} fontWeight={fontWeight}
          className="pointer-events-none select-none"
        >
          {line}
        </text>
      ))}
    </>
  )
}

/** Render decision name text, word-wrapped inside diamond */
function renderDecisionText(name: string, cx: number, cy: number, dw: number) {
  const maxChars = Math.floor(dw / 4.5)
  const lines = wrapText(name, maxChars)
  const lineH = 12
  const totalH = lines.length * lineH
  const startY = cy - totalH / 2 + lineH / 2 - 1

  return (
    <>
      {lines.slice(0, 2).map((line, i) => (
        <text
          key={i}
          x={cx} y={startY + i * lineH}
          textAnchor="middle" dominantBaseline="central"
          fill="#374151" fontSize={10} fontWeight={700}
          className="pointer-events-none select-none"
        >
          {line}
        </text>
      ))}
    </>
  )
}

/** Word-wrap a name into at most 3 lines */
function wrapText(name: string, maxCharsPerLine: number): string[] {
  if (name.length <= maxCharsPerLine) return [name]

  const words = name.split(' ')
  const lines: string[] = []
  let current = ''

  for (const word of words) {
    const test = current ? `${current} ${word}` : word
    if (test.length <= maxCharsPerLine) {
      current = test
    } else {
      if (current) lines.push(current)
      current = word
    }
  }
  if (current) lines.push(current)

  // Cap at 3 lines
  if (lines.length > 3) {
    const last = lines[2]
    lines.length = 3
    lines[2] = last.slice(0, maxCharsPerLine - 1) + '…'
  }

  // Truncate each line if still too long
  return lines.map((line, i) => {
    if (line.length > maxCharsPerLine) {
      return i === lines.length - 1
        ? line.slice(0, maxCharsPerLine - 1) + '…'
        : line.slice(0, maxCharsPerLine)
    }
    return line
  })
}

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max - 1) + '…' : str
}

const OPTION_COLOR_MAP: Record<string, string> = {
  green: '#10B981',
  red: '#EF4444',
  blue: '#3B82F6',
  orange: '#F97316',
}

/** Get decision options from step, migrating legacy yes/no if needed */
function getDecisionOptionsFromStep(step: ProcessStepData): DecisionOption[] {
  if (step.decision_options && step.decision_options.length > 0) {
    return step.decision_options
  }
  // Migrate from legacy yes/no labels, or default to Yes/No
  if (step.decision_yes_label || step.decision_no_label) {
    return [
      { label: step.decision_yes_label || 'Yes', color: 'green' },
      { label: step.decision_no_label || 'No', color: 'red' },
    ]
  }
  return [
    { label: 'Yes', color: 'green' },
    { label: 'No', color: 'red' },
  ]
}
