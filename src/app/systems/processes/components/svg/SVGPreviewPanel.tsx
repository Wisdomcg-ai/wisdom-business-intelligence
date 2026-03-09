'use client'

import { useRef, useState, useCallback, useMemo, useEffect } from 'react'
import { ZoomIn, ZoomOut, Maximize2 } from 'lucide-react'
import type { ProcessSnapshot, ProcessStepData, StepType } from '@/types/process-builder'
import type { BuilderAction } from '../../types'
import { calculateSVGLayout, SVG } from '../../utils/svg-layout'
import type { SVGLayout } from '../../utils/svg-layout'
import SwimlanesDiagramSVG from './SwimlanesDiagramSVG'
import SVGMinimap from './SVGMinimap'
import SVGContextMenu from './SVGContextMenu'
import SVGPortPopover from './SVGPortPopover'
import type { PortPopoverState } from './SVGPortPopover'
import SVGStepToolbar from './SVGStepToolbar'
import SVGEmptyState from './SVGEmptyState'

// ─── Drag state types ────────────────────────────────────────────────

interface CardDragState {
  stepId: string
  startX: number
  startY: number
  currentX: number
  currentY: number
  isDragging: boolean
}

interface ConnectDragState {
  fromStepId: string
  fromPort: 'right' | 'bottom' | 'left' | 'top'
  fromX: number
  fromY: number
  currentX: number
  currentY: number
}

interface ContextMenuState {
  type: 'step' | 'empty'
  x: number
  y: number
  stepId?: string
  laneId?: string
  orderNum?: number
}

interface PortClickPending {
  stepId: string
  port: 'right' | 'bottom' | 'left' | 'top'
  startClientX: number
  startClientY: number
}

// ─── Props ───────────────────────────────────────────────────────────

interface SVGPreviewPanelProps {
  snapshot: ProcessSnapshot
  selectedStepId: string | null
  zoom: number
  onStepClick: (stepId: string) => void
  onZoomIn: () => void
  onZoomOut: () => void
  onFitToScreen: () => void
  onSetZoom: (zoom: number) => void
  // Drag-and-drop handlers
  onStepMove?: (stepId: string, targetLaneId: string, targetOrderNum: number) => void
  onFlowCreate?: (fromStepId: string, toStepId: string, fromPort?: 'right' | 'bottom' | 'left' | 'top') => void
  onFlowDelete?: (flowId: string) => void
  // Title
  processName?: string
  // Inline editing
  editingStepId?: string | null
  onSetEditingStepId?: (stepId: string | null) => void
  onStepDoubleClick?: (stepId: string) => void
  onStepNameCommit?: (stepId: string, newName: string) => void
  // Adding steps on diagram
  onStepAdd?: (laneId: string, orderNum: number) => string
  // Insert between
  onInsertStepBetween?: (fromStepId: string, toStepId: string, flowId: string) => string | void
  // Animated delete
  onAnimatedDelete?: (stepIds: string | string[]) => void
  // Animations
  newlyAddedStepId?: string | null
  deletingStepIds?: string[] | null
  // Port popover handlers
  onPortAddStep?: (sourceStepId: string, port: 'right' | 'bottom' | 'left' | 'top', stepType: StepType, targetLaneId?: string) => void
  onPortReplaceConnection?: (sourceStepId: string, port: 'right' | 'bottom' | 'left' | 'top', stepType: StepType, targetLaneId?: string) => void
  onConvertToDecision?: (stepId: string) => void
  // Dispatch for context menu actions
  dispatch?: React.Dispatch<BuilderAction>
}

// ─── Drag threshold (px) ─────────────────────────────────────────────
const DRAG_THRESHOLD = 5

export default function SVGPreviewPanel({
  snapshot,
  selectedStepId,
  zoom,
  onStepClick,
  onZoomIn,
  onZoomOut,
  onFitToScreen,
  onSetZoom,
  onStepMove,
  onFlowCreate,
  onFlowDelete,
  processName,
  editingStepId,
  onSetEditingStepId,
  onStepDoubleClick,
  onStepNameCommit,
  onStepAdd,
  onInsertStepBetween,
  onAnimatedDelete,
  newlyAddedStepId,
  deletingStepIds,
  onPortAddStep,
  onPortReplaceConnection,
  onConvertToDecision,
  dispatch,
}: SVGPreviewPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [hoveredStepId, setHoveredStepId] = useState<string | null>(null)
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null)
  const [viewportRect, setViewportRect] = useState({ x: 0, y: 0, w: 800, h: 600 })

  // Interaction state
  const [cardDrag, setCardDrag] = useState<CardDragState | null>(null)
  const [connectDrag, setConnectDrag] = useState<ConnectDragState | null>(null)
  const [selectedFlowId, setSelectedFlowId] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [selectedStepIds, setSelectedStepIds] = useState<Set<string>>(new Set())
  const [dragSelectRect, setDragSelectRect] = useState<{ startX: number; startY: number; currentX: number; currentY: number } | null>(null)
  const [portPopover, setPortPopover] = useState<PortPopoverState | null>(null)

  // Refs for event handlers (avoids stale closures)
  const cardDragRef = useRef<CardDragState | null>(null)
  const connectDragRef = useRef<ConnectDragState | null>(null)
  const portClickPendingRef = useRef<PortClickPending | null>(null)
  const justOpenedPopoverRef = useRef(false)

  const layout = useMemo(
    () => calculateSVGLayout(snapshot.swimlanes, snapshot.steps, snapshot.flows, processName, undefined, snapshot.phases),
    [snapshot.swimlanes, snapshot.steps, snapshot.flows, processName, snapshot.phases]
  )

  // Show minimap for large diagrams
  const showMinimap = layout.columnCount >= 12 || snapshot.swimlanes.length >= 5

  // ─── Coordinate transform: DOM → SVG ─────────────────────────────

  const clientToSVG = useCallback(
    (clientX: number, clientY: number) => {
      const el = containerRef.current
      if (!el) return { x: 0, y: 0 }
      const rect = el.getBoundingClientRect()
      return {
        x: (clientX - rect.left + el.scrollLeft) / zoom,
        y: (clientY - rect.top + el.scrollTop) / zoom,
      }
    },
    [zoom]
  )

  // ─── Reverse mapping: SVG coords → lane/column ───────────────────

  const svgToLaneColumn = useCallback(
    (svgX: number, svgY: number, currentLayout: SVGLayout) => {
      // Determine if phases exist for offset
      const hasPhases = (snapshot.phases && snapshot.phases.length > 0) || snapshot.steps.some((s) => s.phase_name)
      const phaseOffsetY = hasPhases ? SVG.PHASE_HEADER_H : 0

      // Find target lane
      let targetLaneId: string | null = null
      for (const lp of currentLayout.lanePositions) {
        if (svgY >= lp.y && svgY <= lp.y + lp.h) {
          targetLaneId = lp.id
          break
        }
      }

      // Find target compact column
      const compactCol = Math.round((svgX - SVG.SIDEBAR_W - SVG.PAD) / (SVG.CARD_W + SVG.GAP_X))

      // Map compactCol back to an order_num via the layout's columnMap
      // Reverse lookup: find which order_num maps to this compactCol
      let targetOrderNum = compactCol
      for (const [orderNum, col] of currentLayout.columnMap) {
        if (col === compactCol) {
          targetOrderNum = orderNum
          break
        }
      }

      return { targetLaneId, targetOrderNum: Math.max(0, targetOrderNum) }
    },
    [snapshot.steps]
  )

  // ─── Find step at SVG coordinates ─────────────────────────────────

  const findStepAtPosition = useCallback(
    (svgX: number, svgY: number): string | null => {
      for (const [stepId, pos] of layout.stepPositions) {
        if (
          svgX >= pos.x &&
          svgX <= pos.x + pos.w &&
          svgY >= pos.y &&
          svgY <= pos.y + pos.h
        ) {
          return stepId
        }
      }
      return null
    },
    [layout.stepPositions]
  )

  // ─── Highlight lane during drag ───────────────────────────────────

  const highlightLaneId = useMemo(() => {
    if (!cardDrag?.isDragging) return null
    const svg = clientToSVG(cardDrag.currentX, cardDrag.currentY)
    const { targetLaneId } = svgToLaneColumn(svg.x, svg.y, layout)
    return targetLaneId
  }, [cardDrag, clientToSVG, svgToLaneColumn, layout])

  // ─── Track scroll position for minimap viewport ───────────────────

  const updateViewport = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    setViewportRect({
      x: el.scrollLeft / zoom,
      y: el.scrollTop / zoom,
      w: el.clientWidth / zoom,
      h: el.clientHeight / zoom,
    })
  }, [zoom])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    updateViewport()
    el.addEventListener('scroll', updateViewport)
    return () => el.removeEventListener('scroll', updateViewport)
  }, [updateViewport])

  // ─── Minimap navigation ───────────────────────────────────────────

  const handleMinimapNavigate = useCallback(
    (x: number, y: number) => {
      const el = containerRef.current
      if (!el) return
      el.scrollTo({
        left: x * zoom,
        top: y * zoom,
        behavior: 'smooth',
      })
    },
    [zoom]
  )

  // ─── Hover tooltip ────────────────────────────────────────────────

  const handleStepHover = useCallback(
    (stepId: string | null, e?: React.MouseEvent) => {
      // Don't show tooltip during drag or editing
      if (cardDragRef.current?.isDragging || connectDragRef.current || editingStepId) {
        setHoveredStepId(null)
        setTooltipPos(null)
        return
      }
      setHoveredStepId(stepId)
      if (stepId && e && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect()
        setTooltipPos({
          x: e.clientX - rect.left + 12,
          y: e.clientY - rect.top - 8,
        })
      } else {
        setTooltipPos(null)
      }
    },
    [editingStepId]
  )

  // ─── Card drag handlers ───────────────────────────────────────────

  const handleStepMouseDown = useCallback(
    (stepId: string, e: React.MouseEvent) => {
      if (!onStepMove) return
      e.preventDefault()
      const state: CardDragState = {
        stepId,
        startX: e.clientX,
        startY: e.clientY,
        currentX: e.clientX,
        currentY: e.clientY,
        isDragging: false,
      }
      setCardDrag(state)
      cardDragRef.current = state
    },
    [onStepMove]
  )

  // ─── Connection draw handlers ─────────────────────────────────────

  const handlePortMouseDown = useCallback(
    (stepId: string, port: 'right' | 'bottom' | 'left' | 'top', e: React.MouseEvent) => {
      if (!onFlowCreate && !onPortAddStep) return
      e.preventDefault()
      e.stopPropagation()

      // Store as pending click — promote to drag on mousemove, or open popover on mouseup
      portClickPendingRef.current = {
        stepId,
        port,
        startClientX: e.clientX,
        startClientY: e.clientY,
      }
    },
    [onFlowCreate, onPortAddStep]
  )

  // ─── Flow click handler ───────────────────────────────────────────

  const handleFlowClick = useCallback((flowId: string) => {
    setSelectedFlowId((prev) => (prev === flowId ? null : flowId))
  }, [])

  const handleFlowDelete = useCallback(
    (flowId: string) => {
      onFlowDelete?.(flowId)
      setSelectedFlowId(null)
    },
    [onFlowDelete]
  )

  // ─── Document-level mousemove / mouseup ───────────────────────────

  useEffect(() => {
    function handleMouseMove(e: MouseEvent) {
      // Port click pending → promote to drag if past threshold
      if (portClickPendingRef.current && !connectDragRef.current) {
        const pending = portClickPendingRef.current
        const dx = e.clientX - pending.startClientX
        const dy = e.clientY - pending.startClientY
        if (Math.sqrt(dx * dx + dy * dy) > DRAG_THRESHOLD) {
          // Promote to connect drag
          const pos = layout.stepPositions.get(pending.stepId)
          if (pos) {
            const portCoords: Record<string, { x: number; y: number }> = {
              right:  { x: pos.x + pos.w,     y: pos.y + pos.h / 2 },
              bottom: { x: pos.x + pos.w / 2, y: pos.y + pos.h },
              left:   { x: pos.x,             y: pos.y + pos.h / 2 },
              top:    { x: pos.x + pos.w / 2, y: pos.y },
            }
            const { x: fromX, y: fromY } = portCoords[pending.port]
            const el = containerRef.current
            if (el) {
              const rect = el.getBoundingClientRect()
              const svgX = (e.clientX - rect.left + el.scrollLeft) / zoom
              const svgY = (e.clientY - rect.top + el.scrollTop) / zoom
              const state: ConnectDragState = {
                fromStepId: pending.stepId,
                fromPort: pending.port,
                fromX,
                fromY,
                currentX: svgX,
                currentY: svgY,
              }
              setConnectDrag(state)
              connectDragRef.current = state
            }
          }
          portClickPendingRef.current = null
        }
        return
      }

      // Card drag
      if (cardDragRef.current) {
        const drag = cardDragRef.current
        const dx = e.clientX - drag.startX
        const dy = e.clientY - drag.startY

        if (!drag.isDragging && Math.sqrt(dx * dx + dy * dy) > DRAG_THRESHOLD) {
          drag.isDragging = true
        }

        drag.currentX = e.clientX
        drag.currentY = e.clientY
        setCardDrag({ ...drag })
        return
      }

      // Connection draw
      if (connectDragRef.current) {
        const el = containerRef.current
        if (!el) return
        const rect = el.getBoundingClientRect()
        const svgX = (e.clientX - rect.left + el.scrollLeft) / zoom
        const svgY = (e.clientY - rect.top + el.scrollTop) / zoom
        connectDragRef.current.currentX = svgX
        connectDragRef.current.currentY = svgY
        setConnectDrag({ ...connectDragRef.current })
      }
    }

    function handleMouseUp(e: MouseEvent) {
      // Port click pending → mouse never exceeded threshold → this is a click → open popover
      if (portClickPendingRef.current) {
        const pending = portClickPendingRef.current
        portClickPendingRef.current = null

        const el = containerRef.current
        if (el) {
          const containerRect = el.getBoundingClientRect()
          setPortPopover({
            stepId: pending.stepId,
            port: pending.port,
            x: e.clientX - containerRect.left,
            y: e.clientY - containerRect.top,
          })
          // Guard: the subsequent click event will bubble to handleBackgroundClick
          // which would immediately clear the popover. Block it for this frame.
          justOpenedPopoverRef.current = true
          requestAnimationFrame(() => { justOpenedPopoverRef.current = false })
        }
        return
      }

      // Card drag end
      if (cardDragRef.current) {
        const drag = cardDragRef.current
        if (drag.isDragging && onStepMove) {
          const el = containerRef.current
          if (el) {
            const rect = el.getBoundingClientRect()
            const svgX = (e.clientX - rect.left + el.scrollLeft) / zoom
            const svgY = (e.clientY - rect.top + el.scrollTop) / zoom
            const currentLayout = calculateSVGLayout(
              snapshot.swimlanes,
              snapshot.steps,
              snapshot.flows,
              processName,
              undefined,
              snapshot.phases
            )
            const { targetLaneId, targetOrderNum } = svgToLaneColumn(svgX, svgY, currentLayout)
            if (targetLaneId) {
              onStepMove(drag.stepId, targetLaneId, targetOrderNum)
            }
          }
        }
        cardDragRef.current = null
        setCardDrag(null)
        return
      }

      // Connection draw end
      if (connectDragRef.current) {
        const conn = connectDragRef.current
        if (onFlowCreate) {
          const el = containerRef.current
          if (el) {
            const rect = el.getBoundingClientRect()
            const svgX = (e.clientX - rect.left + el.scrollLeft) / zoom
            const svgY = (e.clientY - rect.top + el.scrollTop) / zoom

            // Check if we landed on a step card
            const targetStepId = findStepAtPosition(svgX, svgY)
            if (targetStepId && targetStepId !== conn.fromStepId) {
              onFlowCreate(conn.fromStepId, targetStepId, conn.fromPort)
            }
          }
        }
        connectDragRef.current = null
        setConnectDrag(null)
      }
    }

    // Drag-select rectangle
    function handleDragSelectMove(e: MouseEvent) {
      if (!dragSelectRect) return
      const el = containerRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const svgX = (e.clientX - rect.left + el.scrollLeft) / zoom
      const svgY = (e.clientY - rect.top + el.scrollTop) / zoom
      setDragSelectRect((prev) => prev ? { ...prev, currentX: svgX, currentY: svgY } : null)
    }

    function handleDragSelectEnd() {
      if (!dragSelectRect) return
      // Find all steps whose bounds intersect the selection rect
      const minX = Math.min(dragSelectRect.startX, dragSelectRect.currentX)
      const maxX = Math.max(dragSelectRect.startX, dragSelectRect.currentX)
      const minY = Math.min(dragSelectRect.startY, dragSelectRect.currentY)
      const maxY = Math.max(dragSelectRect.startY, dragSelectRect.currentY)

      // Only select if rect is bigger than threshold
      if (maxX - minX > 10 && maxY - minY > 10) {
        const selected = new Set<string>()
        for (const [stepId, pos] of layout.stepPositions) {
          if (
            pos.x + pos.w > minX &&
            pos.x < maxX &&
            pos.y + pos.h > minY &&
            pos.y < maxY
          ) {
            selected.add(stepId)
          }
        }
        setSelectedStepIds(selected)
        if (selected.size === 1) {
          const [id] = selected
          onStepClick(id)
        }
      }
      setDragSelectRect(null)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    if (dragSelectRect) {
      document.addEventListener('mousemove', handleDragSelectMove)
      document.addEventListener('mouseup', handleDragSelectEnd)
    }
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.removeEventListener('mousemove', handleDragSelectMove)
      document.removeEventListener('mouseup', handleDragSelectEnd)
    }
  }, [zoom, onStepMove, onFlowCreate, snapshot, svgToLaneColumn, findStepAtPosition, dragSelectRect, layout.stepPositions, onStepClick, layout])

  // ─── Click on background to deselect flow ─────────────────────────

  const handleBackgroundClick = useCallback((e: React.MouseEvent) => {
    setSelectedFlowId(null)
    setContextMenu(null)
    // Don't clear popover if it was just opened by a port click in this frame
    if (!justOpenedPopoverRef.current) {
      setPortPopover(null)
    }
    setSelectedStepIds(new Set())
  }, [])

  // ─── Step click with multi-select ──────────────────────────────────

  const handleStepClickWithMultiSelect = useCallback(
    (stepId: string, e?: React.MouseEvent) => {
      setContextMenu(null)
      setSelectedFlowId(null)
      if (e?.shiftKey) {
        setSelectedStepIds((prev) => {
          const next = new Set(prev)
          if (next.has(stepId)) {
            next.delete(stepId)
          } else {
            next.add(stepId)
          }
          return next
        })
      } else {
        setSelectedStepIds(new Set())
        onStepClick(stepId)
      }
    },
    [onStepClick]
  )

  // ─── Context menu ──────────────────────────────────────────────────

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      const svg = clientToSVG(e.clientX, e.clientY)
      const stepId = findStepAtPosition(svg.x, svg.y)
      const containerRect = containerRef.current?.getBoundingClientRect()
      if (!containerRect) return

      if (stepId) {
        setContextMenu({
          type: 'step',
          x: e.clientX - containerRect.left,
          y: e.clientY - containerRect.top,
          stepId,
        })
      } else {
        const { targetLaneId, targetOrderNum } = svgToLaneColumn(svg.x, svg.y, layout)
        if (targetLaneId) {
          setContextMenu({
            type: 'empty',
            x: e.clientX - containerRect.left,
            y: e.clientY - containerRect.top,
            laneId: targetLaneId,
            orderNum: targetOrderNum,
          })
        }
      }
    },
    [clientToSVG, findStepAtPosition, svgToLaneColumn, layout]
  )

  // ─── Double-click to add step ──────────────────────────────────────

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      const svg = clientToSVG(e.clientX, e.clientY)
      const stepId = findStepAtPosition(svg.x, svg.y)

      if (stepId) {
        // Double-click on step → handled by SVGStepCard directly
        return
      }

      // Double-click on empty area → add step
      if (onStepAdd) {
        const { targetLaneId, targetOrderNum } = svgToLaneColumn(svg.x, svg.y, layout)
        if (targetLaneId) {
          onStepAdd(targetLaneId, targetOrderNum)
        }
      }
    },
    [clientToSVG, findStepAtPosition, svgToLaneColumn, layout, onStepAdd]
  )

  // ─── Drag-select rectangle ─────────────────────────────────────────

  const handleDragSelectStart = useCallback(
    (e: React.MouseEvent) => {
      // Only start drag-select on left-click on empty area
      if (e.button !== 0) return
      const svg = clientToSVG(e.clientX, e.clientY)
      const stepId = findStepAtPosition(svg.x, svg.y)
      if (stepId) return // clicked on a step, not empty area

      setDragSelectRect({
        startX: svg.x,
        startY: svg.y,
        currentX: svg.x,
        currentY: svg.y,
      })
    },
    [clientToSVG, findStepAtPosition]
  )

  // ─── Derived data ─────────────────────────────────────────────────

  const hoveredStep = hoveredStepId
    ? snapshot.steps.find((s) => s.id === hoveredStepId)
    : null

  const hoveredLane = hoveredStep
    ? snapshot.swimlanes.find((l) => l.id === hoveredStep.swimlane_id)
    : null

  // Temp connector line for connection drawing
  const tempConnector = connectDrag
    ? {
        fromX: connectDrag.fromX,
        fromY: connectDrag.fromY,
        toX: connectDrag.currentX,
        toY: connectDrag.currentY,
      }
    : null

  // Drag ghost info
  const dragGhost = useMemo(() => {
    if (!cardDrag?.isDragging) return null
    const step = snapshot.steps.find((s) => s.id === cardDrag.stepId)
    const lane = step ? snapshot.swimlanes.find((l) => l.id === step.swimlane_id) : null
    if (!step || !lane) return null
    return {
      name: step.action_name,
      color: lane.color.border,
      clientX: cardDrag.currentX,
      clientY: cardDrag.currentY,
    }
  }, [cardDrag, snapshot.steps, snapshot.swimlanes])

  // ─── Toolbar position calc ───────────────────────────────────────

  const toolbarPosition = useMemo(() => {
    if (!selectedStepId || editingStepId || cardDrag?.isDragging) return null
    const pos = layout.stepPositions.get(selectedStepId)
    if (!pos) return null
    const el = containerRef.current
    if (!el) return null
    return {
      x: pos.x * zoom - el.scrollLeft,
      y: pos.y * zoom - el.scrollTop - 40,
      stepId: selectedStepId,
    }
  }, [selectedStepId, editingStepId, cardDrag?.isDragging, layout.stepPositions, zoom])

  // ─── Empty state ──────────────────────────────────────────────────

  if (snapshot.steps.length === 0 && snapshot.swimlanes.length === 0) {
    return (
      <div className="flex-1 relative bg-gray-50 border-l border-gray-200">
        <SVGEmptyState
          onSelectTemplate={(templateSnapshot) => {
            dispatch?.({ type: 'SET_DATA', payload: { name: processName || '', description: '', snapshot: templateSnapshot } })
          }}
        />
      </div>
    )
  }

  return (
    <div className="flex-1 relative bg-gray-50 border-l border-gray-200">
      {/* Scrollable SVG container */}
      <div
        ref={containerRef}
        className="absolute inset-0 overflow-auto"
        style={{ cursor: cardDrag?.isDragging ? 'grabbing' : connectDrag ? 'crosshair' : dragSelectRect ? 'crosshair' : 'default' }}
        onClick={handleBackgroundClick}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContextMenu}
        onMouseDown={handleDragSelectStart}
      >
        <div
          style={{
            transform: `scale(${zoom})`,
            transformOrigin: 'top left',
            width: layout.totalW,
            height: layout.totalH,
            minWidth: layout.totalW,
            minHeight: layout.totalH,
          }}
        >
          <SwimlanesDiagramSVG
            snapshot={snapshot}
            selectedStepId={selectedStepId}
            onStepClick={(stepId) => handleStepClickWithMultiSelect(stepId)}
            onStepHover={handleStepHover}
            onStepMouseDown={handleStepMouseDown}
            onPortMouseDown={handlePortMouseDown}
            dragStepId={cardDrag?.isDragging ? cardDrag.stepId : null}
            selectedFlowId={selectedFlowId}
            onFlowClick={handleFlowClick}
            onFlowDelete={handleFlowDelete}
            highlightLaneId={highlightLaneId}
            tempConnector={tempConnector}
            processName={processName}
            editingStepId={editingStepId}
            onStepDoubleClick={onStepDoubleClick}
            onStepNameCommit={onStepNameCommit}
            newlyAddedStepId={newlyAddedStepId}
            deletingStepIds={deletingStepIds}
            onInsertStepBetween={onInsertStepBetween}
          />

          {/* Drag-select rectangle */}
          {dragSelectRect && (
            <svg
              className="absolute inset-0 pointer-events-none"
              width={layout.totalW}
              height={layout.totalH}
            >
              <rect
                x={Math.min(dragSelectRect.startX, dragSelectRect.currentX)}
                y={Math.min(dragSelectRect.startY, dragSelectRect.currentY)}
                width={Math.abs(dragSelectRect.currentX - dragSelectRect.startX)}
                height={Math.abs(dragSelectRect.currentY - dragSelectRect.startY)}
                fill="rgba(59,130,246,0.1)"
                stroke="#3B82F6"
                strokeWidth={1}
                strokeDasharray="4"
              />
            </svg>
          )}
        </div>
      </div>

      {/* Drag ghost — HTML overlay positioned at cursor */}
      {dragGhost && containerRef.current && (
        <div
          className="fixed pointer-events-none z-50"
          style={{
            left: dragGhost.clientX - 70,
            top: dragGhost.clientY - 26,
          }}
        >
          <div
            className="rounded-md px-3 py-2 text-white text-xs font-semibold shadow-lg opacity-90 max-w-[140px] truncate text-center"
            style={{ backgroundColor: dragGhost.color }}
          >
            {dragGhost.name}
          </div>
        </div>
      )}

      {/* Floating step toolbar */}
      {toolbarPosition && !editingStepId && selectedStepIds.size <= 1 && (
        <SVGStepToolbar
          position={toolbarPosition}
          step={snapshot.steps.find((s) => s.id === toolbarPosition.stepId)!}
          onChangeType={(type: StepType) => {
            dispatch?.({ type: 'UPDATE_STEP', payload: { id: toolbarPosition.stepId, updates: { step_type: type } } })
          }}
          onDelete={() => onAnimatedDelete?.(toolbarPosition.stepId)}
          onDuplicate={() => dispatch?.({ type: 'DUPLICATE_STEP', payload: toolbarPosition.stepId })}
        />
      )}

      {/* Multi-select toolbar */}
      {selectedStepIds.size > 1 && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-white rounded-lg shadow-lg border border-gray-200 px-3 py-1.5 z-20">
          <span className="text-xs text-gray-500 font-medium">{selectedStepIds.size} selected</span>
          <div className="w-px h-4 bg-gray-200" />
          <button
            onClick={() => onAnimatedDelete?.([...selectedStepIds])}
            className="text-xs text-red-600 hover:text-red-700 font-medium px-2 py-0.5 hover:bg-red-50 rounded"
          >
            Delete All
          </button>
        </div>
      )}

      {/* Context menu */}
      {contextMenu && (
        <SVGContextMenu
          state={contextMenu}
          snapshot={snapshot}
          onClose={() => setContextMenu(null)}
          onEditName={(stepId) => {
            onSetEditingStepId?.(stepId)
            setContextMenu(null)
          }}
          onChangeType={(stepId, type) => {
            dispatch?.({ type: 'UPDATE_STEP', payload: { id: stepId, updates: { step_type: type } } })
            setContextMenu(null)
          }}
          onDuplicate={(stepId) => {
            dispatch?.({ type: 'DUPLICATE_STEP', payload: stepId })
            setContextMenu(null)
          }}
          onDelete={(stepId) => {
            onAnimatedDelete?.(stepId)
            setContextMenu(null)
          }}
          onAddStepHere={(laneId, orderNum) => {
            onStepAdd?.(laneId, orderNum)
            setContextMenu(null)
          }}
        />
      )}

      {/* Port popover */}
      {portPopover && onPortAddStep && (
        <SVGPortPopover
          state={portPopover}
          snapshot={snapshot}
          onClose={() => setPortPopover(null)}
          onAddStep={(stepId, port, type, laneId) => onPortAddStep(stepId, port, type, laneId)}
          onConvertToDecision={(stepId) => onConvertToDecision?.(stepId)}
          onReplaceConnection={(stepId, port, type, laneId) => onPortReplaceConnection?.(stepId, port, type, laneId)}
        />
      )}

      {/* Tooltip */}
      {hoveredStep && tooltipPos && !cardDrag?.isDragging && !connectDrag && !editingStepId && (
        <StepTooltip step={hoveredStep} laneName={hoveredLane?.name} pos={tooltipPos} />
      )}

      {/* Zoom toolbar */}
      <div className="absolute bottom-3 left-3 flex items-center gap-1 bg-white rounded-lg shadow-md border border-gray-200 px-1 py-0.5 z-10">
        <button
          onClick={onZoomOut}
          className="p-1.5 hover:bg-gray-100 rounded text-gray-500"
          title="Zoom out"
        >
          <ZoomOut className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={onFitToScreen}
          className="px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 rounded min-w-[40px] text-center"
          title="Fit to screen"
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          onClick={onZoomIn}
          className="p-1.5 hover:bg-gray-100 rounded text-gray-500"
          title="Zoom in"
        >
          <ZoomIn className="w-3.5 h-3.5" />
        </button>
        <div className="w-px h-5 bg-gray-200 mx-0.5" />
        <button
          onClick={onFitToScreen}
          className="p-1.5 hover:bg-gray-100 rounded text-gray-500"
          title="Fit to screen"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Minimap */}
      {showMinimap && (
        <SVGMinimap
          snapshot={snapshot}
          viewportRect={viewportRect}
          diagramSize={{ w: layout.totalW, h: layout.totalH }}
          onNavigate={handleMinimapNavigate}
          visible={true}
        />
      )}
    </div>
  )
}

function StepTooltip({
  step,
  laneName,
  pos,
}: {
  step: ProcessStepData
  laneName?: string
  pos: { x: number; y: number }
}) {
  return (
    <div
      className="absolute z-50 bg-gray-900 text-white rounded-lg shadow-xl px-3 py-2.5 text-xs max-w-[240px] pointer-events-none"
      style={{ left: pos.x, top: pos.y }}
    >
      <p className="font-semibold text-sm">{step.action_name}</p>
      {laneName && <p className="text-gray-400 mt-0.5">{laneName}</p>}
      {step.description && (
        <p className="text-gray-300 mt-1 whitespace-pre-line">
          {step.description.length > 120 ? step.description.slice(0, 118) + '…' : step.description}
        </p>
      )}
      <div className="flex flex-wrap gap-1.5 mt-1.5">
        {step.estimated_duration && (
          <span className="text-amber-300">⏱ {step.estimated_duration}</span>
        )}
        {step.systems_used.map((s) => (
          <span key={s} className="text-blue-300">⚡ {s}</span>
        ))}
        {step.documents_needed.map((d) => (
          <span key={d} className="text-orange-300">📄 {d}</span>
        ))}
      </div>
    </div>
  )
}
