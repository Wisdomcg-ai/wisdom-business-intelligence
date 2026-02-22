'use client'

import { useRef, useState, useCallback, useEffect } from 'react'
import {
  OrgChartPerson,
  NodePosition,
  ViewMode,
  VersionDiffResult,
} from '../types'
import { getStandardChildren, getDirectReportCount } from '../utils/tree-helpers'
import { getDiffStatus } from '../utils/version-diff'
import OrgChartNode from './OrgChartNode'
import OrgChartConnectors from './OrgChartConnectors'

interface OrgChartCanvasProps {
  people: OrgChartPerson[]
  positions: Map<string, NodePosition>
  totalWidth: number
  totalHeight: number
  viewMode: ViewMode
  zoom: number
  selectedPersonId: string | null
  collapsedIds: Set<string>
  departmentColors: Record<string, string>
  matchingIds: Set<string> | null
  diff: VersionDiffResult | null
  onSelectPerson: (id: string | null) => void
  onToggleCollapse: (id: string) => void
  onAddReport: (parentId: string, position: { x: number; y: number }) => void
  onContextMenu: (
    personId: string,
    position: { x: number; y: number }
  ) => void
  onZoom: (zoom: number) => void
}

const PADDING = 60

export default function OrgChartCanvas({
  people,
  positions,
  totalWidth,
  totalHeight,
  viewMode,
  zoom,
  selectedPersonId,
  collapsedIds,
  departmentColors,
  matchingIds,
  diff,
  onSelectPerson,
  onToggleCollapse,
  onAddReport,
  onContextMenu,
  onZoom,
}: OrgChartCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [isPanning, setIsPanning] = useState(false)
  const [panStart, setPanStart] = useState({ x: 0, y: 0 })
  const [scrollStart, setScrollStart] = useState({ x: 0, y: 0 })

  // ── Reliable container dimensions via ResizeObserver ──
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 })
  const prevContentRef = useRef({ w: 0, h: 0 })

  // Stable ref for onZoom (avoids stale closure in auto-fit effect)
  const onZoomRef = useRef(onZoom)
  onZoomRef.current = onZoom

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect
        setContainerSize((prev) => {
          const w = Math.round(width)
          const h = Math.round(height)
          if (prev.w === w && prev.h === h) return prev
          return { w, h }
        })
      }
    })

    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // ── Auto-fit: zoom to fit whenever content grows beyond the container ──
  useEffect(() => {
    if (containerSize.w < 10 || containerSize.h < 10) return
    if (totalWidth === 0 || totalHeight === 0) return

    const contentW = totalWidth + PADDING * 2
    const contentH = totalHeight + PADDING * 2
    const prevW = prevContentRef.current.w
    const prevH = prevContentRef.current.h
    prevContentRef.current = { w: totalWidth, h: totalHeight }

    // Only auto-fit on first render or when content grew
    const isFirst = prevW === 0 && prevH === 0
    const contentGrew = totalWidth > prevW || totalHeight > prevH
    if (!isFirst && !contentGrew) return

    const overflows = contentW > containerSize.w || contentH > containerSize.h
    if (!overflows) return

    const fitZoom = Math.min(
      containerSize.w / contentW,
      containerSize.h / contentH,
      1
    )
    // Round DOWN (floor) so content always fits — round() can round UP and cause overflow
    const safeZoom = Math.max(0.25, Math.floor(fitZoom * 100) / 100)
    onZoomRef.current(safeZoom)

    // Center after fit
    const el = containerRef.current
    if (el) {
      requestAnimationFrame(() => {
        const scaledW = contentW * safeZoom
        const scaledH = contentH * safeZoom
        el.scrollLeft = Math.max(0, (scaledW - containerSize.w) / 2)
        el.scrollTop = Math.max(0, (scaledH - containerSize.h) / 2)
      })
    }
  }, [containerSize.w, containerSize.h, totalWidth, totalHeight])

  // ── Center tree when zoom changes ──
  useEffect(() => {
    const el = containerRef.current
    if (!el || totalWidth === 0 || containerSize.w === 0) return

    const contentW = totalWidth + PADDING * 2
    const contentH = totalHeight + PADDING * 2
    const scaledW = contentW * zoom
    const scaledH = contentH * zoom

    el.scrollLeft = Math.max(0, (scaledW - containerSize.w) / 2)
    el.scrollTop = Math.max(0, (scaledH - containerSize.h) / 2)
  }, [zoom, totalWidth, totalHeight, containerSize.w, containerSize.h])

  // ── Pan handlers ──
  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('[data-node]')) return
    if (e.button !== 0) return
    setIsPanning(true)
    setPanStart({ x: e.clientX, y: e.clientY })
    setScrollStart({
      x: containerRef.current?.scrollLeft || 0,
      y: containerRef.current?.scrollTop || 0,
    })
  }

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isPanning || !containerRef.current) return
      const dx = e.clientX - panStart.x
      const dy = e.clientY - panStart.y
      containerRef.current.scrollLeft = scrollStart.x - dx
      containerRef.current.scrollTop = scrollStart.y - dy
    },
    [isPanning, panStart, scrollStart]
  )

  const handleMouseUp = () => {
    setIsPanning(false)
  }

  // ── Scroll-wheel zoom (Ctrl/Cmd + scroll) ──
  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault()
      const delta = e.deltaY > 0 ? -0.1 : 0.1
      onZoom(Math.min(2, Math.max(0.25, zoom + delta)))
    }
  }

  // ── Click empty space to deselect ──
  const handleCanvasClick = (e: React.MouseEvent) => {
    if (!(e.target as HTMLElement).closest('[data-node]')) {
      onSelectPerson(null)
    }
  }

  // ── Double-click empty space to fit ──
  const handleDoubleClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('[data-node]')) return
    if (!containerRef.current || totalWidth === 0) return
    const container = containerRef.current
    const contentW = totalWidth + PADDING * 2
    const contentH = totalHeight + PADDING * 2
    const fitZoom = Math.min(
      container.clientWidth / contentW,
      container.clientHeight / contentH,
      1.5
    )
    onZoom(Math.max(0.25, Math.floor(fitZoom * 100) / 100))
  }

  // ── Scroll area dimensions (explicit size for scrollbar range) ──
  const scrollAreaW = (totalWidth + PADDING * 2) * zoom
  const scrollAreaH = (totalHeight + PADDING * 2) * zoom

  return (
    <div
      ref={containerRef}
      className={`flex-1 overflow-auto bg-gray-50 ${isPanning ? 'cursor-grabbing' : 'cursor-grab'}`}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
      onClick={handleCanvasClick}
      onDoubleClick={handleDoubleClick}
    >
      {/* Scroll spacer — explicit dimensions set the scrollable area */}
      <div
        style={{
          width: scrollAreaW,
          height: scrollAreaH,
          minWidth: '100%',
          minHeight: '100%',
          position: 'relative',
        }}
      >
        {/* Transform layer — visually scales content */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            transform: `scale(${zoom})`,
            transformOrigin: 'top left',
          }}
        >
          {/* Content at natural (1x) size */}
          <div
            style={{
              position: 'relative',
              width: totalWidth + PADDING * 2,
              height: totalHeight + PADDING * 2,
            }}
          >
            <div
              style={{
                position: 'absolute',
                left: PADDING,
                top: PADDING,
                width: totalWidth,
                height: totalHeight,
              }}
            >
              {/* Connectors */}
              <OrgChartConnectors
                people={people}
                positions={positions}
                viewMode={viewMode}
                collapsedIds={collapsedIds}
                totalWidth={totalWidth}
                totalHeight={totalHeight}
              />

              {/* Nodes */}
              {people.map((person) => {
                const pos = positions.get(person.id)
                if (!pos) return null

                const hasChildNodes = getStandardChildren(people, person.id).length > 0
                const childCount = getDirectReportCount(people, person.id)
                const personDiffStatus = getDiffStatus(person.id, diff)

                if (
                  diff &&
                  diff.removed.some((r) => r.id === person.id) &&
                  !positions.has(person.id)
                ) {
                  return null
                }

                let opacity = 1
                if (matchingIds && matchingIds.size > 0 && !matchingIds.has(person.id)) {
                  opacity = 0.2
                }

                return (
                  <OrgChartNode
                    key={person.id}
                    person={person}
                    viewMode={viewMode}
                    isSelected={selectedPersonId === person.id}
                    isCollapsed={collapsedIds.has(person.id)}
                    hasChildren={hasChildNodes}
                    childCount={childCount}
                    departmentColors={departmentColors}
                    diffStatus={personDiffStatus}
                    opacity={opacity}
                    onSelect={() => onSelectPerson(person.id)}
                    onToggleCollapse={() => onToggleCollapse(person.id)}
                    onAddReport={(position) => onAddReport(person.id, position)}
                    onContextMenu={(position) => onContextMenu(person.id, position)}
                    style={{
                      left: pos.x,
                      top: pos.y,
                      transition: 'left 0.3s ease, top 0.3s ease, opacity 0.3s ease',
                    }}
                  />
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
