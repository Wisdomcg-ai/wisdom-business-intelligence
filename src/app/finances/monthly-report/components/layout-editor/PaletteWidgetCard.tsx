'use client'

import { useDraggable } from '@dnd-kit/core'
import type { WidgetDefinition } from '../../types/pdf-layout'
import WidgetPreview from './WidgetPreview'

interface PaletteWidgetCardProps {
  definition: WidgetDefinition
  isPlaced: boolean
  isAvailable: boolean
}

export default function PaletteWidgetCard({
  definition,
  isPlaced,
  isAvailable,
}: PaletteWidgetCardProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `palette-${definition.type}`,
    data: {
      type: 'palette-widget',
      widgetType: definition.type,
    },
    disabled: isPlaced,
  })

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`
        flex items-center gap-2 px-2.5 py-2 rounded-md border transition-all
        ${isPlaced
          ? 'bg-gray-50 border-gray-100 opacity-40 cursor-not-allowed'
          : isDragging
            ? 'bg-white border-brand-orange shadow-lg cursor-grabbing scale-105'
            : 'bg-white border-gray-200 hover:border-gray-300 hover:shadow-sm cursor-grab'
        }
      `}
    >
      <WidgetPreview type={definition.type} compact />
      {!isAvailable && !isPlaced && (
        <span className="ml-auto text-[9px] text-amber-500 font-medium shrink-0">
          No data
        </span>
      )}
      {isPlaced && (
        <span className="ml-auto text-[9px] text-gray-400 font-medium shrink-0">
          Placed
        </span>
      )}
      <span className="ml-auto text-[9px] text-gray-400 shrink-0">
        {definition.defaultColSpan}x{definition.defaultRowSpan}
      </span>
    </div>
  )
}
