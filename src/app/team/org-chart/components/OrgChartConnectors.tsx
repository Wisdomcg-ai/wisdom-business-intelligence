'use client'

import { memo } from 'react'
import { OrgChartPerson, NodePosition, ViewMode } from '../types'
import { getNodeWidth, getNodeHeight } from '../utils/tree-layout'

interface OrgChartConnectorsProps {
  people: OrgChartPerson[]
  positions: Map<string, NodePosition>
  viewMode: ViewMode
  collapsedIds: Set<string>
  totalWidth: number
  totalHeight: number
}

function OrgChartConnectorsInner({
  people,
  positions,
  viewMode,
  collapsedIds,
  totalWidth,
  totalHeight,
}: OrgChartConnectorsProps) {
  const nodeW = getNodeWidth()
  const nodeH = getNodeHeight(viewMode)

  const connectors: { parentId: string; childId: string }[] = []
  for (const person of people) {
    if (
      person.parentId &&
      positions.has(person.id) &&
      positions.has(person.parentId) &&
      !collapsedIds.has(person.parentId)
    ) {
      connectors.push({ parentId: person.parentId, childId: person.id })
    }
  }

  if (connectors.length === 0) return null

  return (
    <svg
      className="absolute top-0 left-0 pointer-events-none"
      width={totalWidth + 100}
      height={totalHeight + 100}
      style={{ overflow: 'visible' }}
    >
      {connectors.map(({ parentId, childId }) => {
        const pPos = positions.get(parentId)!
        const cPos = positions.get(childId)!
        const child = people.find((p) => p.id === childId)

        if (child?.isAssistant) {
          // Horizontal dashed line from parent's right-center to assistant's left-center
          const x1 = pPos.x + nodeW
          const y1 = pPos.y + nodeH / 2
          const x2 = cPos.x
          const y2 = cPos.y + nodeH / 2
          const d = `M ${x1} ${y1} L ${x2} ${y2}`

          return (
            <path
              key={`${parentId}-${childId}`}
              d={d}
              fill="none"
              stroke="#94a3b8"
              strokeWidth={1.5}
              strokeDasharray="6 3"
              className="transition-all duration-300"
            />
          )
        }

        const x1 = pPos.x + nodeW / 2
        const y1 = pPos.y + nodeH
        const x2 = cPos.x + nodeW / 2
        const y2 = cPos.y

        // Bezier curve from bottom of parent to top of child
        const midY = y1 + (y2 - y1) * 0.5
        const d = `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`

        return (
          <path
            key={`${parentId}-${childId}`}
            d={d}
            fill="none"
            stroke="#cbd5e1"
            strokeWidth={1.5}
            className="transition-all duration-300"
          />
        )
      })}
    </svg>
  )
}

const OrgChartConnectors = memo(OrgChartConnectorsInner)
export default OrgChartConnectors
