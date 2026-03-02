'use client'

import { memo, useState } from 'react'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import {
  Plus,
  ChevronDown,
  ChevronRight,
  GripVertical,
  User,
} from 'lucide-react'
import { getInitials, getColorForName } from '@/app/goals/utils/team'
import {
  OrgChartPerson,
  ViewMode,
  DEPARTMENT_BORDER_PALETTE,
  DEPARTMENT_BG_PALETTE,
  DEPARTMENT_TEXT_PALETTE,
  getDepartmentColorIndex,
} from '../types'
import { getDirectReportCount } from '../utils/tree-helpers'
import VersionDiffBadge from './VersionDiffBadge'

interface OrgChartNodeProps {
  person: OrgChartPerson
  viewMode: ViewMode
  isSelected: boolean
  isCollapsed: boolean
  hasChildren: boolean
  childCount: number
  departmentColors: Record<string, string>
  diffStatus: 'new' | 'modified' | 'removed' | null
  opacity: number
  onSelect: () => void
  onToggleCollapse: () => void
  onAddReport: (position: { x: number; y: number }) => void
  onContextMenu: (position: { x: number; y: number }) => void
  style?: React.CSSProperties
}

const EMPLOYMENT_LABELS: Record<string, string> = {
  'full-time': 'Full-time',
  'part-time': 'Part-time',
  contractor: 'Contractor',
  casual: 'Casual',
}

function OrgChartNodeInner({
  person,
  viewMode,
  isSelected,
  isCollapsed,
  hasChildren,
  childCount,
  departmentColors,
  diffStatus,
  opacity,
  onSelect,
  onToggleCollapse,
  onAddReport,
  onContextMenu,
  style,
}: OrgChartNodeProps) {
  const [hovered, setHovered] = useState(false)
  const deptIdx = getDepartmentColorIndex(person.department, departmentColors)
  const avatarColor = getColorForName(person.name)
  const initials = getInitials(person.name)

  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    id: `drag-${person.id}`,
    data: { personId: person.id },
  })

  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `drop-${person.id}`,
    data: { personId: person.id },
  })

  const diffBorderClass =
    diffStatus === 'new'
      ? 'border-l-4 border-l-green-500'
      : diffStatus === 'modified'
        ? 'border-l-4 border-l-amber-500'
        : diffStatus === 'removed'
          ? 'border-l-4 border-l-red-400'
          : `border-l-4 ${DEPARTMENT_BORDER_PALETTE[deptIdx]}`

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    onContextMenu({ x: e.clientX, y: e.clientY })
  }

  const handleAddClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    const rect = (e.currentTarget as HTMLElement).closest('[data-node]')?.getBoundingClientRect()
    if (rect) {
      onAddReport({ x: rect.left + rect.width / 2, y: rect.bottom })
    }
  }

  // Compact view
  if (viewMode === 'compact') {
    return (
      <div
        ref={(el) => {
          setDragRef(el)
          setDropRef(el)
        }}
        data-node
        className={`
          absolute w-[220px] bg-white rounded-lg shadow-sm border transition-all duration-300 cursor-pointer select-none
          ${diffBorderClass}
          ${person.isVacant ? 'border-dashed border-gray-300' : 'border-gray-200'}
          ${isSelected ? 'ring-2 ring-brand-orange shadow-md' : ''}
          ${isOver ? 'ring-2 ring-brand-teal shadow-lg' : ''}
          ${isDragging ? 'opacity-50 scale-105 shadow-xl z-50' : ''}
          ${diffStatus === 'removed' ? 'opacity-50 line-through' : ''}
        `}
        style={{ ...style, opacity: diffStatus === 'removed' ? 0.4 : opacity }}
        onClick={onSelect}
        onContextMenu={handleContextMenu}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        {...attributes}
        {...listeners}
      >
        <div className="flex items-center gap-2.5 px-3 py-2">
          <div
            className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0 ${avatarColor}`}
          >
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-gray-900 truncate">{person.name}</p>
            <p className="text-xs text-gray-500 truncate">{person.title}</p>
          </div>
          {hasChildren && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onToggleCollapse()
              }}
              className="p-0.5 text-gray-400 hover:text-gray-600"
            >
              {isCollapsed ? (
                <ChevronRight className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>
          )}
        </div>

        {/* Hover "+" button */}
        {hovered && !isDragging && (
          <button
            onClick={handleAddClick}
            className="absolute -bottom-3 left-1/2 -translate-x-1/2 w-6 h-6 bg-brand-orange text-white rounded-full flex items-center justify-center shadow-md hover:bg-brand-orange-600 transition-colors z-10"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        )}

        {diffStatus && diffStatus !== 'removed' && (
          <div className="absolute -top-2 right-2">
            <VersionDiffBadge status={diffStatus} />
          </div>
        )}
      </div>
    )
  }

  // Photo view
  if (viewMode === 'photo') {
    return (
      <div
        ref={(el) => {
          setDragRef(el)
          setDropRef(el)
        }}
        data-node
        className={`
          absolute w-[220px] bg-white rounded-lg shadow-sm border transition-all duration-300 cursor-pointer select-none
          ${diffBorderClass}
          ${person.isVacant ? 'border-dashed border-gray-300' : 'border-gray-200'}
          ${isSelected ? 'ring-2 ring-brand-orange shadow-md' : ''}
          ${isOver ? 'ring-2 ring-brand-teal shadow-lg' : ''}
          ${isDragging ? 'opacity-50 scale-105 shadow-xl z-50' : ''}
        `}
        style={{ ...style, opacity: diffStatus === 'removed' ? 0.4 : opacity }}
        onClick={onSelect}
        onContextMenu={handleContextMenu}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        {...attributes}
        {...listeners}
      >
        <div className="flex flex-col items-center py-3 px-3">
          <div
            className={`w-12 h-12 rounded-full flex items-center justify-center text-white text-lg font-bold mb-2 ${avatarColor}`}
          >
            {person.photoUrl ? (
              <img
                src={person.photoUrl}
                alt={person.name}
                className="w-full h-full rounded-full object-cover"
              />
            ) : (
              initials
            )}
          </div>
          <p className="text-sm font-medium text-gray-900 text-center truncate w-full">
            {person.name}
          </p>
          <p className="text-xs text-gray-500 text-center truncate w-full">{person.title}</p>
          {person.isVacant && (
            <span className="mt-1 text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium">
              Planned
            </span>
          )}
          {person.isAssistant && (
            <span className="mt-1 text-[10px] bg-sky-100 text-sky-700 px-1.5 py-0.5 rounded font-medium">
              Assistant
            </span>
          )}
        </div>

        {hovered && !isDragging && (
          <button
            onClick={handleAddClick}
            className="absolute -bottom-3 left-1/2 -translate-x-1/2 w-6 h-6 bg-brand-orange text-white rounded-full flex items-center justify-center shadow-md hover:bg-brand-orange-600 transition-colors z-10"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        )}

        {diffStatus && diffStatus !== 'removed' && (
          <div className="absolute -top-2 right-2">
            <VersionDiffBadge status={diffStatus} />
          </div>
        )}
      </div>
    )
  }

  // Detailed view (default)
  return (
    <div
      ref={(el) => {
        setDragRef(el)
        setDropRef(el)
      }}
      data-node
      className={`
        absolute w-[220px] bg-white rounded-lg shadow-sm border transition-all duration-300 cursor-pointer select-none
        ${diffBorderClass}
        ${person.isVacant ? 'border-dashed border-gray-300' : 'border-gray-200'}
        ${isSelected ? 'ring-2 ring-brand-orange shadow-md' : ''}
        ${isOver ? 'ring-2 ring-brand-teal shadow-lg' : ''}
        ${isDragging ? 'opacity-50 scale-105 shadow-xl z-50' : ''}
      `}
      style={{ ...style, opacity: diffStatus === 'removed' ? 0.4 : opacity }}
      onClick={onSelect}
      onContextMenu={handleContextMenu}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      {...attributes}
      {...listeners}
    >
      <div className="px-3 pt-2.5 pb-2">
        {/* Top row: avatar + name */}
        <div className="flex items-start gap-2.5 mb-1.5">
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 ${avatarColor}`}
          >
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-gray-900 truncate leading-tight">
              {person.name}
            </p>
            <p className="text-xs text-gray-500 truncate leading-tight">
              {person.title}
            </p>
          </div>
        </div>

        {/* Pills row */}
        <div className="flex items-center gap-1 flex-wrap mb-1.5">
          {person.department && (
            <span
              className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${DEPARTMENT_BG_PALETTE[deptIdx]} ${DEPARTMENT_TEXT_PALETTE[deptIdx]}`}
            >
              {person.department}
            </span>
          )}
          <span className="text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
            {EMPLOYMENT_LABELS[person.employmentType] || person.employmentType}
          </span>
          {person.isVacant && (
            <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium">
              Planned
            </span>
          )}
          {person.isAssistant && (
            <span className="text-[10px] bg-sky-100 text-sky-700 px-1.5 py-0.5 rounded font-medium">
              Assistant
            </span>
          )}
        </div>

        {/* Reports count + collapse */}
        {hasChildren && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onToggleCollapse()
            }}
            className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-gray-600 transition-colors"
          >
            {isCollapsed ? (
              <ChevronRight className="w-3 h-3" />
            ) : (
              <ChevronDown className="w-3 h-3" />
            )}
            <span>
              {childCount} direct report{childCount !== 1 ? 's' : ''}
            </span>
          </button>
        )}
      </div>

      {/* Hover "+" button */}
      {hovered && !isDragging && (
        <button
          onClick={handleAddClick}
          className="absolute -bottom-3 left-1/2 -translate-x-1/2 w-6 h-6 bg-brand-orange text-white rounded-full flex items-center justify-center shadow-md hover:bg-brand-orange-600 transition-colors z-10"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      )}

      {diffStatus && diffStatus !== 'removed' && (
        <div className="absolute -top-2 right-2">
          <VersionDiffBadge status={diffStatus} />
        </div>
      )}
    </div>
  )
}

const OrgChartNode = memo(OrgChartNodeInner)
export default OrgChartNode
