'use client'

import { useDroppable } from '@dnd-kit/core'

interface GridCellProps {
  pageId: string
  row: number
  col: number
  isHighlighted: boolean
  isInvalid: boolean
}

export default function GridCell({ pageId, row, col, isHighlighted, isInvalid }: GridCellProps) {
  const { isOver, setNodeRef } = useDroppable({
    id: `cell-${pageId}-${row}-${col}`,
    data: {
      type: 'grid-cell',
      pageId,
      row,
      col,
    },
  })

  return (
    <div
      ref={setNodeRef}
      className={`
        border border-dashed rounded-md transition-colors
        ${isHighlighted && !isInvalid ? 'border-brand-orange bg-brand-orange/10' : ''}
        ${isHighlighted && isInvalid ? 'border-red-400 bg-red-50' : ''}
        ${isOver && !isHighlighted ? 'border-blue-300 bg-blue-50/50' : ''}
        ${!isHighlighted && !isOver ? 'border-gray-200' : ''}
      `}
      style={{
        gridColumn: col + 1,
        gridRow: row + 1,
      }}
    />
  )
}
