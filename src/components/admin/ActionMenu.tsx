'use client'

import { useState, useRef, useEffect, ReactNode } from 'react'
import { MoreHorizontal, LucideIcon } from 'lucide-react'

interface ActionMenuItem {
  label: string
  icon?: LucideIcon
  onClick: () => void
  variant?: 'default' | 'danger'
  disabled?: boolean
}

interface ActionMenuProps {
  items: ActionMenuItem[]
  trigger?: ReactNode
  align?: 'left' | 'right'
}

export function ActionMenu({ items, trigger, align = 'right' }: ActionMenuProps) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Close on escape
  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [])

  return (
    <div className="relative" ref={menuRef}>
      {/* Trigger */}
      {trigger ? (
        <div onClick={() => setOpen(!open)}>{trigger}</div>
      ) : (
        <button
          onClick={() => setOpen(!open)}
          className="p-2 text-slate-400 hover:text-gray-600 hover:bg-slate-100 rounded-lg transition-colors"
        >
          <MoreHorizontal className="w-5 h-5" />
        </button>
      )}

      {/* Dropdown */}
      {open && (
        <div
          className={`
            absolute z-50 mt-1 w-56 bg-white rounded-xl shadow-xl border border-slate-200
            py-1 animate-in fade-in slide-in-from-top-1 duration-150
            ${align === 'right' ? 'right-0' : 'left-0'}
          `}
        >
          {items.map((item, index) => {
            const Icon = item.icon
            return (
              <button
                key={index}
                onClick={() => {
                  if (!item.disabled) {
                    item.onClick()
                    setOpen(false)
                  }
                }}
                disabled={item.disabled}
                className={`
                  w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left transition-colors
                  ${item.disabled
                    ? 'text-slate-300 cursor-not-allowed'
                    : item.variant === 'danger'
                      ? 'text-red-600 hover:bg-red-50'
                      : 'text-gray-700 hover:bg-gray-50'
                  }
                `}
              >
                {Icon && (
                  <Icon className={`w-4 h-4 ${
                    item.disabled
                      ? 'text-slate-300'
                      : item.variant === 'danger'
                        ? 'text-red-500'
                        : 'text-slate-400'
                  }`} />
                )}
                {item.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// Divider for grouping menu items
export function ActionMenuDivider() {
  return <div className="my-1 border-t border-slate-100" />
}
