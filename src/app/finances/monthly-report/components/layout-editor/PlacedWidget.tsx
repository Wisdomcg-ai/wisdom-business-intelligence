'use client'

import { useState, useRef, useEffect } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, X, ArrowRightFromLine } from 'lucide-react'
import type { LayoutWidget, LayoutPage } from '../../types/pdf-layout'
import WidgetPreview, { getWidgetBgClass } from './WidgetPreview'
import ResizeHandle from './ResizeHandle'

interface PlacedWidgetProps {
  widget: LayoutWidget
  isSelected: boolean
  cellWidth: number
  cellHeight: number
  gap: number
  allPages: LayoutPage[]
  currentPageId: string
  onSelect: () => void
  onDelete: () => void
  onResize: (deltaCol: number, deltaRow: number) => void
  onMoveToPage: (toPageId: string) => void
}

export default function PlacedWidget({
  widget,
  isSelected,
  cellWidth,
  cellHeight,
  gap,
  allPages,
  currentPageId,
  onSelect,
  onDelete,
  onResize,
  onMoveToPage,
}: PlacedWidgetProps) {
  const [showMoveMenu, setShowMoveMenu] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: widget.id,
    data: {
      type: 'placed-widget',
      widget,
    },
  })

  // Close menu on outside click
  useEffect(() => {
    if (!showMoveMenu) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMoveMenu(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showMoveMenu])

  const bgClass = getWidgetBgClass(widget.type)

  const style: React.CSSProperties = {
    gridColumn: `${widget.col + 1} / span ${widget.colSpan}`,
    gridRow: `${widget.row + 1} / span ${widget.rowSpan}`,
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`
        relative rounded-lg border ${bgClass}
        ${isSelected ? 'ring-2 ring-brand-orange ring-offset-1' : ''}
        ${isDragging ? 'z-50' : 'z-10'}
        cursor-pointer select-none
        transition-shadow hover:shadow-md
      `}
      onClick={(e) => {
        e.stopPropagation()
        onSelect()
      }}
    >
      {/* Drag handle */}
      <div
        {...attributes}
        {...listeners}
        className="absolute top-1 left-1 p-0.5 cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 rounded hover:bg-white/50 z-20"
        onClick={(e) => e.stopPropagation()}
      >
        <GripVertical className="w-3.5 h-3.5" />
      </div>

      {/* Action buttons (top-right) */}
      <div className="absolute top-1 right-1 flex items-center gap-0.5 z-20">
        {/* Move to page button */}
        {allPages.length > 1 && (
          <div ref={menuRef} className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation()
                setShowMoveMenu(!showMoveMenu)
              }}
              className="p-0.5 text-gray-400 hover:text-blue-500 rounded hover:bg-white/50 transition-colors"
              title="Move to another page"
            >
              <ArrowRightFromLine className="w-3.5 h-3.5" />
            </button>

            {/* Dropdown menu */}
            {showMoveMenu && (
              <div className="absolute top-6 right-0 bg-white rounded-lg shadow-lg border border-gray-200 py-1 min-w-[140px] z-50">
                <div className="px-2 py-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                  Move to page
                </div>
                {allPages.map((p, idx) => {
                  if (p.id === currentPageId) return null
                  return (
                    <button
                      key={p.id}
                      onClick={(e) => {
                        e.stopPropagation()
                        setShowMoveMenu(false)
                        onMoveToPage(p.id)
                      }}
                      className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 flex items-center justify-between gap-2"
                    >
                      <span>Page {idx + 1}</span>
                      <span className="text-[10px] text-gray-400">
                        {p.orientation.slice(0, 4)} · {p.widgets.length}w
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Delete button */}
        <button
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
          className="p-0.5 text-gray-400 hover:text-red-500 rounded hover:bg-white/50 transition-colors"
          title="Remove widget"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Widget preview content */}
      <div className="w-full h-full flex items-center justify-center overflow-hidden">
        <WidgetPreview type={widget.type} />
      </div>

      {/* Resize handle */}
      <ResizeHandle
        onResize={onResize}
        cellWidth={cellWidth}
        cellHeight={cellHeight}
      />
    </div>
  )
}
