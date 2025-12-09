'use client'

import { useEffect } from 'react'

interface KeyboardShortcut {
  key: string
  ctrl?: boolean
  meta?: boolean
  shift?: boolean
  alt?: boolean
  callback: (event: KeyboardEvent) => void
  description: string
}

export function useKeyboardShortcut(shortcut: KeyboardShortcut) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const { key, ctrl = false, meta = false, shift = false, alt = false } = shortcut

      const ctrlOrMeta = ctrl || meta
      const matchesModifiers =
        (ctrlOrMeta ? (event.ctrlKey || event.metaKey) : !event.ctrlKey && !event.metaKey) &&
        (shift ? event.shiftKey : !event.shiftKey) &&
        (alt ? event.altKey : !event.altKey)

      if (event.key.toLowerCase() === key.toLowerCase() && matchesModifiers) {
        event.preventDefault()
        shortcut.callback(event)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [shortcut])
}

export function useKeyboardShortcuts(shortcuts: KeyboardShortcut[]) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      for (const shortcut of shortcuts) {
        const { key, ctrl = false, meta = false, shift = false, alt = false } = shortcut

        const ctrlOrMeta = ctrl || meta
        const matchesModifiers =
          (ctrlOrMeta ? (event.ctrlKey || event.metaKey) : !event.ctrlKey && !event.metaKey) &&
          (shift ? event.shiftKey : !event.shiftKey) &&
          (alt ? event.altKey : !event.altKey)

        if (event.key.toLowerCase() === key.toLowerCase() && matchesModifiers) {
          event.preventDefault()
          shortcut.callback(event)
          break
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [shortcuts])
}

// Keyboard shortcuts help modal component
export interface ShortcutHelpItem {
  keys: string[]
  description: string
  category: 'Navigation' | 'Editing' | 'Actions'
}

export const FORECAST_SHORTCUTS: ShortcutHelpItem[] = [
  {
    keys: ['Ctrl', 'S'],
    description: 'Save current changes',
    category: 'Actions'
  },
  {
    keys: ['Ctrl', 'Z'],
    description: 'Undo last change',
    category: 'Editing'
  },
  {
    keys: ['Ctrl', 'Y'],
    description: 'Redo last undone change',
    category: 'Editing'
  },
  {
    keys: ['Ctrl', 'Shift', 'Z'],
    description: 'Redo (alternative)',
    category: 'Editing'
  },
  {
    keys: ['Tab'],
    description: 'Move to next cell in table',
    category: 'Navigation'
  },
  {
    keys: ['Shift', 'Tab'],
    description: 'Move to previous cell in table',
    category: 'Navigation'
  },
  {
    keys: ['Enter'],
    description: 'Confirm cell edit and move down',
    category: 'Editing'
  },
  {
    keys: ['Esc'],
    description: 'Cancel cell edit',
    category: 'Editing'
  },
  {
    keys: ['?'],
    description: 'Show keyboard shortcuts help',
    category: 'Navigation'
  }
]
