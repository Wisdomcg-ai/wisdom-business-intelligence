'use client'

import { useEffect, useRef } from 'react'
import { Edit3, UserPlus, Copy, Trash2 } from 'lucide-react'

interface NodeContextMenuProps {
  personId: string
  position: { x: number; y: number }
  onEdit: () => void
  onAddReport: () => void
  onDuplicate: () => void
  onDelete: () => void
  onClose: () => void
}

export default function NodeContextMenu({
  personId,
  position,
  onEdit,
  onAddReport,
  onDuplicate,
  onDelete,
  onClose,
}: NodeContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [onClose])

  const items = [
    { label: 'Edit Details', icon: Edit3, onClick: onEdit },
    { label: 'Add Direct Report', icon: UserPlus, onClick: onAddReport },
    { label: 'Duplicate', icon: Copy, onClick: onDuplicate },
    { label: 'Delete', icon: Trash2, onClick: onDelete, danger: true },
  ]

  return (
    <div
      ref={menuRef}
      className="fixed z-[60] bg-white rounded-lg shadow-xl border border-gray-200 py-1 min-w-[180px]"
      style={{ left: position.x, top: position.y }}
    >
      {items.map((item, idx) => {
        const Icon = item.icon
        return (
          <button
            key={item.label}
            onClick={() => {
              item.onClick()
              onClose()
            }}
            className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors ${
              item.danger
                ? 'text-red-600 hover:bg-red-50'
                : 'text-gray-700 hover:bg-gray-50'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {item.label}
          </button>
        )
      })}
    </div>
  )
}
