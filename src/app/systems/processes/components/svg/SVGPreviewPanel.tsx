'use client'

import { useRef, useState, useCallback, useMemo, useEffect } from 'react'
import { ZoomIn, ZoomOut, Maximize2 } from 'lucide-react'
import type { ProcessSnapshot, ProcessStepData } from '@/types/process-builder'
import { calculateSVGLayout, SVG } from '../../utils/svg-layout'
import type { SVGLayout } from '../../utils/svg-layout'
import SwimlanesDiagramSVG from './SwimlanesDiagramSVG'
import SVGMinimap from './SVGMinimap'

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
}: SVGPreviewPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [hoveredStepId, setHoveredStepId] = useState<string | null>(null)
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null)
  const [viewportRect, setViewportRect] = useState({ x: 0, y: 0, w: 800, h: 600 })

  // Interaction state
  const [cardDrag, setCardDrag] = useState<CardDragState | null>(null)
  const [connectDrag, setConnectDrag] = useState<ConnectDragState | null>(null)
  const [selectedFlowId, setSelectedFlowId] = useState<string | null>(null)

  // Refs for event handlers (avoids stale closures)
  const cardDragRef = useRef<CardDragState | null>(null)
  const connectDragRef = useRef<ConnectDragState | null>(null)

  const layout = useMemo(
    () => calculateSVGLayout(snapshot.swimlanes, snapshot.steps, snapshot.flows, processName),
    [snapshot.swimlanes, snapshot.steps, snapshot.flows, processName]
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
      const hasPhases = snapshot.steps.some((s) => s.phase_name)
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
      // Don't show tooltip during drag
      if (cardDragRef.current?.isDragging || connectDragRef.current) {
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
    []
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
      if (!onFlowCreate) return
      e.preventDefault()
      e.stopPropagation()

      const pos = layout.stepPositions.get(stepId)
      if (!pos) return

      const portCoords: Record<string, { x: number; y: number }> = {
        right:  { x: pos.x + pos.w,     y: pos.y + pos.h / 2 },
        bottom: { x: pos.x + pos.w / 2, y: pos.y + pos.h },
        left:   { x: pos.x,             y: pos.y + pos.h / 2 },
        top:    { x: pos.x + pos.w / 2, y: pos.y },
      }
      const { x: fromX, y: fromY } = portCoords[port]

      // Convert starting position to client coords for tracking
      const svgCoords = clientToSVG(e.clientX, e.clientY)
      const state: ConnectDragState = {
        fromStepId: stepId,
        fromPort: port,
        fromX,
        fromY,
        currentX: svgCoords.x,
        currentY: svgCoords.y,
      }
      setConnectDrag(state)
      connectDragRef.current = state
    },
    [onFlowCreate, layout.stepPositions, clientToSVG]
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
              snapshot.flows
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

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [zoom, onStepMove, onFlowCreate, snapshot, svgToLaneColumn, findStepAtPosition])

  // ─── Click on background to deselect flow ─────────────────────────

  const handleBackgroundClick = useCallback(() => {
    setSelectedFlowId(null)
  }, [])

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

  // ─── Empty state ──────────────────────────────────────────────────

  if (snapshot.steps.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50 border-l border-gray-200">
        <div className="text-center space-y-3">
          <div className="w-16 h-16 mx-auto bg-gray-100 rounded-2xl flex items-center justify-center">
            <svg className="w-8 h-8 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500">No steps yet</p>
            <p className="text-xs text-gray-400 mt-1">Add lanes and steps in the capture panel to see your process diagram</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 relative bg-gray-50 border-l border-gray-200">
      {/* Scrollable SVG container */}
      <div
        ref={containerRef}
        className="absolute inset-0 overflow-auto"
        style={{ cursor: cardDrag?.isDragging ? 'grabbing' : connectDrag ? 'crosshair' : 'default' }}
        onClick={handleBackgroundClick}
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
            onStepClick={onStepClick}
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
          />
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

      {/* Tooltip */}
      {hoveredStep && tooltipPos && !cardDrag?.isDragging && !connectDrag && (
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
