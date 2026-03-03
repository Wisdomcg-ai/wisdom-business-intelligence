'use client'

import type { ProcessStepData } from '@/types/process-builder'
import type { StepPosition } from '../../utils/svg-layout'

interface SVGAnnotationsProps {
  step: ProcessStepData
  pos: StepPosition
}

/**
 * Rich annotations around the card:
 * - Duration → pill ABOVE the card
 * - Description (multi-line), systems, documents → below the card
 *
 * Systems show as blue badges, documents as amber badges.
 * All items are left-aligned below the card.
 */
export default function SVGAnnotations({ step, pos }: SVGAnnotationsProps) {
  const elements: React.ReactNode[] = []
  let belowY = pos.y + pos.h + 6

  // ─── Duration pill above card ──────────────────────────────────
  if (step.estimated_duration) {
    const text = step.estimated_duration
    const pillW = text.length * 5.5 + 14
    elements.push(
      <g key="duration">
        <rect
          x={pos.x + pos.w / 2 - pillW / 2}
          y={pos.y - 20}
          width={pillW}
          height={16}
          rx={8}
          fill="white"
          stroke="#D1D5DB"
          strokeWidth={0.8}
        />
        <text
          x={pos.x + pos.w / 2}
          y={pos.y - 11.5}
          textAnchor="middle"
          dominantBaseline="central"
          fill="#4B5563"
          fontSize={9}
          fontWeight={500}
          className="pointer-events-none select-none"
        >
          ⏱ {text}
        </text>
      </g>
    )
  }

  // ─── Description (multi-line, left-aligned) ────────────────────
  if (step.description) {
    const descLines = step.description.split('\n').slice(0, 3)
    descLines.forEach((line, i) => {
      const truncated = line.length > 28 ? line.slice(0, 26) + '…' : line
      elements.push(
        <text
          key={`desc-${i}`}
          x={pos.x + 2}
          y={belowY + 9}
          textAnchor="start"
          dominantBaseline="central"
          fill="#6B7280"
          fontSize={8.5}
          fontStyle="italic"
          className="pointer-events-none select-none"
        >
          {truncated}
        </text>
      )
      belowY += 12
    })
    belowY += 2
  }

  // ─── Systems badges (blue) ─────────────────────────────────────
  if (step.systems_used.length > 0) {
    step.systems_used.slice(0, 3).forEach((sys, i) => {
      const text = sys.length > 20 ? sys.slice(0, 18) + '…' : sys
      const pillW = text.length * 5.2 + 18
      elements.push(
        <g key={`sys-${i}`}>
          <rect
            x={pos.x}
            y={belowY}
            width={pillW}
            height={14}
            rx={7}
            fill="#EFF6FF"
            stroke="#BFDBFE"
            strokeWidth={0.6}
          />
          {/* Blue dot indicator */}
          <circle
            cx={pos.x + 7}
            cy={belowY + 7}
            r={2.5}
            fill="#3B82F6"
          />
          <text
            x={pos.x + 13}
            y={belowY + 7.5}
            textAnchor="start"
            dominantBaseline="central"
            fill="#1D4ED8"
            fontSize={8.5}
            fontWeight={500}
            className="pointer-events-none select-none"
          >
            {text}
          </text>
        </g>
      )
      belowY += 16
    })
  }

  // ─── Document badges (amber) ───────────────────────────────────
  if (step.documents_needed.length > 0) {
    step.documents_needed.slice(0, 3).forEach((doc, i) => {
      const text = doc.length > 20 ? doc.slice(0, 18) + '…' : doc
      const pillW = text.length * 5.2 + 18
      elements.push(
        <g key={`doc-${i}`}>
          <rect
            x={pos.x}
            y={belowY}
            width={pillW}
            height={14}
            rx={7}
            fill="#FFFBEB"
            stroke="#FDE68A"
            strokeWidth={0.6}
          />
          {/* Amber dot indicator */}
          <circle
            cx={pos.x + 7}
            cy={belowY + 7}
            r={2.5}
            fill="#D97706"
          />
          <text
            x={pos.x + 13}
            y={belowY + 7.5}
            textAnchor="start"
            dominantBaseline="central"
            fill="#92400E"
            fontSize={8.5}
            fontWeight={500}
            className="pointer-events-none select-none"
          >
            {text}
          </text>
        </g>
      )
      belowY += 16
    })
  }

  if (elements.length === 0) return null

  return <g>{elements}</g>
}
