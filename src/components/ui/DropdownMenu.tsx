'use client'

import {
  useState,
  useRef,
  useEffect,
  useCallback,
  createContext,
  useContext,
  ReactNode,
  KeyboardEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { MoreVertical, LucideIcon } from 'lucide-react'

// ============================================================================
// Types
// ============================================================================

interface Position {
  top: number
  left: number
}

interface DropdownContextValue {
  isOpen: boolean
  close: () => void
  activeIndex: number
  setActiveIndex: (index: number) => void
}

interface DropdownMenuProps {
  children: ReactNode
  align?: 'left' | 'right'
}

interface DropdownTriggerProps {
  children?: ReactNode
  className?: string
  'aria-label'?: string
}

interface DropdownContentProps {
  children: ReactNode
  className?: string
}

interface DropdownItemProps {
  children: ReactNode
  onClick?: () => void
  disabled?: boolean
  variant?: 'default' | 'danger'
  icon?: LucideIcon
  className?: string
}

interface DropdownSeparatorProps {
  className?: string
}

// ============================================================================
// Context
// ============================================================================

const DropdownContext = createContext<DropdownContextValue | null>(null)

function useDropdown() {
  const context = useContext(DropdownContext)
  if (!context) {
    throw new Error('Dropdown components must be used within a DropdownMenu')
  }
  return context
}

// ============================================================================
// Main Component
// ============================================================================

export function DropdownMenu({ children, align = 'right' }: DropdownMenuProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [position, setPosition] = useState<Position | null>(null)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [mounted, setMounted] = useState(false)

  const triggerRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const itemsRef = useRef<(HTMLButtonElement | null)[]>([])

  // Client-side mount check for portal
  useEffect(() => {
    setMounted(true)
  }, [])

  const calculatePosition = useCallback(() => {
    if (!triggerRef.current) return null

    const rect = triggerRef.current.getBoundingClientRect()
    const viewportHeight = window.innerHeight
    const viewportWidth = window.innerWidth
    const menuWidth = 224 // w-56 = 14rem = 224px
    const menuHeight = 200 // Approximate max height

    // Calculate vertical position
    const spaceBelow = viewportHeight - rect.bottom
    const spaceAbove = rect.top
    const showAbove = spaceBelow < menuHeight && spaceAbove > spaceBelow

    // Calculate horizontal position
    let left: number
    if (align === 'right') {
      left = rect.right - menuWidth
      // Ensure menu doesn't go off left edge
      if (left < 8) left = 8
    } else {
      left = rect.left
      // Ensure menu doesn't go off right edge
      if (left + menuWidth > viewportWidth - 8) {
        left = viewportWidth - menuWidth - 8
      }
    }

    return {
      top: showAbove ? rect.top - 8 : rect.bottom + 4,
      left,
    }
  }, [align])

  const open = useCallback(() => {
    const pos = calculatePosition()
    if (pos) {
      setPosition(pos)
      setIsOpen(true)
      setActiveIndex(-1)
    }
  }, [calculatePosition])

  const close = useCallback(() => {
    setIsOpen(false)
    setPosition(null)
    setActiveIndex(-1)
  }, [])

  const toggle = useCallback(() => {
    if (isOpen) {
      close()
    } else {
      open()
    }
  }, [isOpen, open, close])

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node
      if (
        triggerRef.current &&
        !triggerRef.current.contains(target) &&
        contentRef.current &&
        !contentRef.current.contains(target)
      ) {
        close()
      }
    }

    // Use mousedown for better UX (closes before button click)
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen, close])

  // Close on escape
  useEffect(() => {
    if (!isOpen) return

    const handleEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        close()
        triggerRef.current?.querySelector('button')?.focus()
      }
    }

    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isOpen, close])

  // Close on scroll (optional but good UX)
  useEffect(() => {
    if (!isOpen) return

    const handleScroll = () => {
      close()
    }

    // Listen for scroll on any scrollable parent
    window.addEventListener('scroll', handleScroll, true)
    return () => window.removeEventListener('scroll', handleScroll, true)
  }, [isOpen, close])

  // Handle keyboard navigation
  const handleKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    if (!isOpen) return

    const items = itemsRef.current.filter(Boolean) as HTMLButtonElement[]
    const itemCount = items.length

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        setActiveIndex((prev) => (prev + 1) % itemCount)
        break
      case 'ArrowUp':
        event.preventDefault()
        setActiveIndex((prev) => (prev - 1 + itemCount) % itemCount)
        break
      case 'Home':
        event.preventDefault()
        setActiveIndex(0)
        break
      case 'End':
        event.preventDefault()
        setActiveIndex(itemCount - 1)
        break
      case 'Enter':
      case ' ':
        event.preventDefault()
        if (activeIndex >= 0 && items[activeIndex]) {
          items[activeIndex].click()
        }
        break
      case 'Tab':
        close()
        break
    }
  }, [isOpen, activeIndex, close])

  // Focus active item when it changes
  useEffect(() => {
    if (activeIndex >= 0 && itemsRef.current[activeIndex]) {
      itemsRef.current[activeIndex]?.focus()
    }
  }, [activeIndex])

  const contextValue: DropdownContextValue = {
    isOpen,
    close,
    activeIndex,
    setActiveIndex,
  }

  // Clone children to pass refs and handlers
  const childArray = Array.isArray(children) ? children : [children]
  let itemIndex = 0

  const processChildren = (children: ReactNode): ReactNode => {
    return Array.isArray(children) ? children.map((child, i) => {
      if (!child || typeof child !== 'object' || !('type' in child)) return child

      // Handle Trigger
      if (child.type === DropdownTrigger) {
        return (
          <div key={i} ref={triggerRef}>
            {React.cloneElement(child as React.ReactElement, {
              onClick: toggle,
              'aria-expanded': isOpen,
              'aria-haspopup': 'menu',
            })}
          </div>
        )
      }

      // Handle Content - render in portal
      if (child.type === DropdownContent && isOpen && position && mounted) {
        return createPortal(
          <div
            key={i}
            ref={contentRef}
            role="menu"
            aria-orientation="vertical"
            onKeyDown={handleKeyDown}
            className="fixed z-50 outline-none"
            style={{ top: position.top, left: position.left }}
          >
            <div className="w-56 bg-white rounded-xl shadow-xl border border-gray-200 py-1.5 animate-dropdown-enter origin-top-right">
              {processContentChildren((child as React.ReactElement).props.children)}
            </div>
          </div>,
          document.body
        )
      }

      return child
    }) : children
  }

  const processContentChildren = (children: ReactNode): ReactNode => {
    return Array.isArray(children) ? children.map((child, i) => {
      if (!child || typeof child !== 'object' || !('type' in child)) return child

      if (child.type === DropdownItem) {
        const currentIndex = itemIndex++
        return React.cloneElement(child as React.ReactElement, {
          key: i,
          ref: (el: HTMLButtonElement) => { itemsRef.current[currentIndex] = el },
          tabIndex: activeIndex === currentIndex ? 0 : -1,
          'data-active': activeIndex === currentIndex,
        })
      }

      return child
    }) : children
  }

  return (
    <DropdownContext.Provider value={contextValue}>
      <div className="relative inline-block">
        {processChildren(childArray)}
      </div>
    </DropdownContext.Provider>
  )
}

// ============================================================================
// Sub-components
// ============================================================================

import React from 'react'

export function DropdownTrigger({
  children,
  className = '',
  'aria-label': ariaLabel = 'Open menu',
  onClick,
  'aria-expanded': ariaExpanded,
}: DropdownTriggerProps & { onClick?: () => void; 'aria-expanded'?: boolean; 'aria-haspopup'?: 'menu' }) {
  if (children) {
    return (
      <div
        className={className}
        onClick={onClick}
        role="button"
        aria-expanded={ariaExpanded}
        aria-haspopup="menu"
      >
        {children}
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={ariaExpanded}
      aria-haspopup="menu"
      className={`
        p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100
        rounded-lg transition-colors focus:outline-none focus:ring-2
        focus:ring-brand-orange focus:ring-offset-2
        ${className}
      `}
      aria-label={ariaLabel}
    >
      <MoreVertical className="w-5 h-5" />
    </button>
  )
}

export function DropdownContent({ children, className = '' }: DropdownContentProps) {
  // This is a marker component - actual rendering happens in DropdownMenu
  return <>{children}</>
}

export const DropdownItem = React.forwardRef<
  HTMLButtonElement,
  DropdownItemProps & { tabIndex?: number; 'data-active'?: boolean }
>(function DropdownItem(
  {
    children,
    onClick,
    disabled = false,
    variant = 'default',
    icon: Icon,
    className = '',
    tabIndex,
    'data-active': dataActive,
    ...props
  },
  ref
) {
  const { close } = useDropdown()

  const handleClick = () => {
    if (disabled) return
    onClick?.()
    close()
  }

  const variantStyles = {
    default: 'text-gray-700 hover:bg-gray-50 focus:bg-gray-50',
    danger: 'text-red-600 hover:bg-red-50 focus:bg-red-50',
  }

  const iconStyles = {
    default: 'text-gray-400 group-hover:text-gray-500',
    danger: 'text-red-500',
  }

  return (
    <button
      ref={ref}
      type="button"
      role="menuitem"
      tabIndex={tabIndex}
      disabled={disabled}
      onClick={handleClick}
      data-active={dataActive}
      className={`
        group w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left
        transition-colors outline-none
        ${disabled ? 'text-gray-300 cursor-not-allowed' : variantStyles[variant]}
        data-[active=true]:bg-gray-50
        ${className}
      `}
      {...props}
    >
      {Icon && (
        <Icon
          className={`w-4 h-4 flex-shrink-0 ${
            disabled ? 'text-gray-300' : iconStyles[variant]
          }`}
        />
      )}
      <span className="flex-1">{children}</span>
    </button>
  )
})

export function DropdownSeparator({ className = '' }: DropdownSeparatorProps) {
  return (
    <div
      role="separator"
      className={`my-1.5 border-t border-gray-100 ${className}`}
    />
  )
}

// ============================================================================
// Convenience exports for compound component pattern
// ============================================================================

DropdownMenu.Trigger = DropdownTrigger
DropdownMenu.Content = DropdownContent
DropdownMenu.Item = DropdownItem
DropdownMenu.Separator = DropdownSeparator
