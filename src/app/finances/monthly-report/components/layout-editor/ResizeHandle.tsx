'use client'

import { useCallback, useRef } from 'react'

interface ResizeHandleProps {
  onResize: (deltaCol: number, deltaRow: number) => void
  cellWidth: number
  cellHeight: number
}

export default function ResizeHandle({ onResize, cellWidth, cellHeight }: ResizeHandleProps) {
  const startPos = useRef<{ x: number; y: number } | null>(null)
  const lastDelta = useRef({ col: 0, row: 0 })

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation()
    e.preventDefault()
    startPos.current = { x: e.clientX, y: e.clientY }
    lastDelta.current = { col: 0, row: 0 }

    const handlePointerMove = (ev: PointerEvent) => {
      if (!startPos.current) return
      const dx = ev.clientX - startPos.current.x
      const dy = ev.clientY - startPos.current.y

      // Convert pixel delta to grid cell delta
      const colDelta = Math.round(dx / cellWidth)
      const rowDelta = Math.round(dy / cellHeight)

      if (colDelta !== lastDelta.current.col || rowDelta !== lastDelta.current.row) {
        lastDelta.current = { col: colDelta, row: rowDelta }
        onResize(colDelta, rowDelta)
      }
    }

    const handlePointerUp = () => {
      startPos.current = null
      document.removeEventListener('pointermove', handlePointerMove)
      document.removeEventListener('pointerup', handlePointerUp)
    }

    document.addEventListener('pointermove', handlePointerMove)
    document.addEventListener('pointerup', handlePointerUp)
  }, [onResize, cellWidth, cellHeight])

  return (
    <div
      onPointerDown={handlePointerDown}
      className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize group z-10"
      title="Drag to resize"
    >
      <svg
        viewBox="0 0 16 16"
        className="w-full h-full text-gray-400 group-hover:text-gray-600 transition-colors"
      >
        <path d="M14 14L8 14L14 8Z" fill="currentColor" opacity="0.3" />
        <path d="M14 14L11 14L14 11Z" fill="currentColor" opacity="0.6" />
      </svg>
    </div>
  )
}
