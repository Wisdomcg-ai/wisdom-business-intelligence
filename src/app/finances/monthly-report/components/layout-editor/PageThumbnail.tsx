'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Trash2, RotateCw } from 'lucide-react'
import type { LayoutPage } from '../../types/pdf-layout'
import { GRID_CONFIG } from '../../types/pdf-layout'
import { WIDGET_DEFINITIONS } from '../../constants/widget-registry'

interface PageThumbnailProps {
  page: LayoutPage
  index: number
  isSelected: boolean
  onSelect: () => void
  onDelete: () => void
  onToggleOrientation: () => void
}

export default function PageThumbnail({
  page,
  index,
  isSelected,
  onSelect,
  onDelete,
  onToggleOrientation,
}: PageThumbnailProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: `page-${page.id}`,
    data: { type: 'page', page },
  })

  const config = GRID_CONFIG[page.orientation]

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`
        relative group cursor-pointer rounded-lg border-2 p-1
        ${isSelected ? 'border-brand-orange bg-orange-50' : 'border-gray-200 bg-white hover:border-gray-300'}
        transition-colors
      `}
      onClick={onSelect}
    >
      {/* Page number + drag handle */}
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1">
          <div
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600"
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical className="w-3 h-3" />
          </div>
          <span className="text-[10px] font-semibold text-gray-500">
            Page {index + 1}
          </span>
        </div>

        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => { e.stopPropagation(); onToggleOrientation() }}
            className="p-0.5 text-gray-400 hover:text-gray-600 rounded"
            title={`Switch to ${page.orientation === 'portrait' ? 'landscape' : 'portrait'}`}
          >
            <RotateCw className="w-3 h-3" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete() }}
            className="p-0.5 text-gray-400 hover:text-red-500 rounded"
            title="Delete page"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Miniature grid preview */}
      <div
        className="bg-gray-50 rounded border border-gray-100 overflow-hidden"
        style={{
          aspectRatio: page.orientation === 'portrait' ? '210/297' : '297/210',
        }}
      >
        <div
          className="w-full h-full grid gap-px p-1"
          style={{
            gridTemplateColumns: `repeat(${config.cols}, 1fr)`,
            gridTemplateRows: `repeat(${config.rows}, 1fr)`,
          }}
        >
          {/* Render miniature widget placeholders */}
          {page.widgets.map(w => {
            const def = WIDGET_DEFINITIONS[w.type]
            return (
              <div
                key={w.id}
                className="bg-blue-200/60 rounded-sm"
                style={{
                  gridColumn: `${w.col + 1} / span ${w.colSpan}`,
                  gridRow: `${w.row + 1} / span ${w.rowSpan}`,
                }}
              />
            )
          })}
        </div>
      </div>

      {/* Orientation badge */}
      <div className="text-[8px] text-gray-400 text-center mt-0.5 uppercase tracking-wider">
        {page.orientation.slice(0, 4)}
      </div>
    </div>
  )
}
