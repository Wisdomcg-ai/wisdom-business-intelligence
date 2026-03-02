'use client'

import { useMemo } from 'react'
import type { LayoutPage } from '../../types/pdf-layout'
import { GRID_CONFIG } from '../../types/pdf-layout'
import GridCell from './GridCell'
import PlacedWidget from './PlacedWidget'

interface PageCanvasProps {
  page: LayoutPage
  allPages: LayoutPage[]
  selectedWidgetId: string | null
  highlightedCells: Set<string>
  invalidCells: Set<string>
  onSelectWidget: (widgetId: string | null) => void
  onDeleteWidget: (widgetId: string) => void
  onResizeWidget: (widgetId: string, deltaCol: number, deltaRow: number) => void
  onMoveWidgetToPage: (widgetId: string, toPageId: string) => void
}

// A4 aspect ratios for visual display
const CANVAS_STYLES = {
  portrait: { aspectRatio: '210 / 297', maxWidth: '600px' },
  landscape: { aspectRatio: '297 / 210', maxWidth: '800px' },
}

export default function PageCanvas({
  page,
  allPages,
  selectedWidgetId,
  highlightedCells,
  invalidCells,
  onSelectWidget,
  onDeleteWidget,
  onResizeWidget,
  onMoveWidgetToPage,
}: PageCanvasProps) {
  const config = GRID_CONFIG[page.orientation]

  // Calculate cell dimensions in the visual display
  // We'll use percentages relative to the canvas
  const cellWidthPct = 100 / config.cols
  const cellHeightPct = 100 / config.rows

  const gridCells = useMemo(() => {
    const cells = []
    for (let r = 0; r < config.rows; r++) {
      for (let c = 0; c < config.cols; c++) {
        const key = `${r}-${c}`
        cells.push(
          <GridCell
            key={key}
            pageId={page.id}
            row={r}
            col={c}
            isHighlighted={highlightedCells.has(key)}
            isInvalid={invalidCells.has(key)}
          />
        )
      }
    }
    return cells
  }, [config.rows, config.cols, page.id, highlightedCells, invalidCells])

  return (
    <div className="flex-1 flex items-start justify-center p-6 overflow-auto">
      <div
        className="bg-white rounded-lg shadow-lg border border-gray-200 relative p-3 w-full"
        style={CANVAS_STYLES[page.orientation]}
        onClick={() => onSelectWidget(null)}
      >
        {/* Page orientation label */}
        <div className="absolute top-2 right-2 text-[10px] font-medium text-gray-400 uppercase tracking-wide">
          {page.orientation}
        </div>

        {/* Grid container */}
        <div
          className="w-full h-full grid gap-1.5"
          style={{
            gridTemplateColumns: `repeat(${config.cols}, 1fr)`,
            gridTemplateRows: `repeat(${config.rows}, 1fr)`,
            minHeight: page.orientation === 'portrait' ? '500px' : '380px',
          }}
        >
          {/* Background grid cells (drop targets) */}
          {gridCells}

          {/* Placed widgets (positioned with grid-column/grid-row) */}
          {page.widgets.map(widget => (
            <PlacedWidget
              key={widget.id}
              widget={widget}
              isSelected={widget.id === selectedWidgetId}
              cellWidth={cellWidthPct}
              cellHeight={cellHeightPct}
              gap={6}
              allPages={allPages}
              currentPageId={page.id}
              onSelect={() => onSelectWidget(widget.id)}
              onDelete={() => onDeleteWidget(widget.id)}
              onResize={(dc, dr) => onResizeWidget(widget.id, dc, dr)}
              onMoveToPage={(toPageId) => onMoveWidgetToPage(widget.id, toPageId)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
