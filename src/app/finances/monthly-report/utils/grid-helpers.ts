import type { LayoutPage, LayoutWidget, WidgetBoundingBox, GridConfig, WidgetType } from '../types/pdf-layout'
import { GRID_CONFIG } from '../types/pdf-layout'
import { WIDGET_DEFINITIONS } from '../constants/widget-registry'

/**
 * WC.2 — is this widget pinned to a full row? Tables and charts honour box.x
 * only as a symmetric MARGIN (box.w reaches nothing but the KPI cards), so any
 * off-column placement renders broken. See WidgetDefinition.fullRow.
 */
export function isFullRowWidget(type: WidgetType): boolean {
  return WIDGET_DEFINITIONS[type]?.fullRow === true
}

/**
 * Clamp a proposed placement for its widget type: full-row widgets snap to
 * col 0 × full grid width; free widgets pass through. Row/rowSpan untouched.
 */
export function clampPlacement(
  type: WidgetType,
  orientation: 'portrait' | 'landscape',
  col: number,
  colSpan: number,
): { col: number; colSpan: number } {
  if (!isFullRowWidget(type)) return { col, colSpan }
  return { col: 0, colSpan: GRID_CONFIG[orientation].cols }
}

/**
 * Defensive render-time normalisation for a whole layout. Layouts saved before
 * the full-row rule (or edited by hand) may hold a table in column 2 — rather
 * than render it with a page-wide margin, snap it in place. Pure; returns a new
 * object only when something changed.
 */
export function normalizeLayoutPlacements<T extends { pages: LayoutPage[] }>(layout: T): T {
  let changed = false
  const pages = layout.pages.map((page) => {
    const widgets = page.widgets.map((w) => {
      const clamped = clampPlacement(w.type, page.orientation, w.col, w.colSpan)
      if (clamped.col === w.col && clamped.colSpan === w.colSpan) return w
      changed = true
      return { ...w, ...clamped }
    })
    return widgets.some((w, i) => w !== page.widgets[i]) ? { ...page, widgets } : page
  })
  return changed ? { ...layout, pages } : layout
}

/**
 * Get the set of occupied cells for a page (excluding a specific widget for drag validation)
 */
export function getOccupiedCells(
  page: LayoutPage,
  excludeWidgetId?: string
): Set<string> {
  const occupied = new Set<string>()
  for (const widget of page.widgets) {
    if (widget.id === excludeWidgetId) continue
    for (let r = widget.row; r < widget.row + widget.rowSpan; r++) {
      for (let c = widget.col; c < widget.col + widget.colSpan; c++) {
        occupied.add(`${r}-${c}`)
      }
    }
  }
  return occupied
}

/**
 * Check if a specific cell is occupied
 */
export function isOccupied(
  page: LayoutPage,
  row: number,
  col: number,
  excludeWidgetId?: string
): boolean {
  const cells = getOccupiedCells(page, excludeWidgetId)
  return cells.has(`${row}-${col}`)
}

/**
 * Check if a widget can be placed at the given position
 */
export function canPlace(
  page: LayoutPage,
  col: number,
  row: number,
  colSpan: number,
  rowSpan: number,
  excludeWidgetId?: string
): boolean {
  const config = GRID_CONFIG[page.orientation]

  // Check bounds
  if (col < 0 || row < 0) return false
  if (col + colSpan > config.cols) return false
  if (row + rowSpan > config.rows) return false

  // Check overlaps
  const occupied = getOccupiedCells(page, excludeWidgetId)
  for (let r = row; r < row + rowSpan; r++) {
    for (let c = col; c < col + colSpan; c++) {
      if (occupied.has(`${r}-${c}`)) return false
    }
  }

  return true
}

/**
 * Find the first available position for a widget on a page
 */
export function findFirstAvailablePosition(
  page: LayoutPage,
  colSpan: number,
  rowSpan: number
): { col: number; row: number } | null {
  const config = GRID_CONFIG[page.orientation]

  for (let r = 0; r <= config.rows - rowSpan; r++) {
    for (let c = 0; c <= config.cols - colSpan; c++) {
      if (canPlace(page, c, r, colSpan, rowSpan)) {
        return { col: c, row: r }
      }
    }
  }
  return null
}

/**
 * Calculate the bounding box in mm for a widget's grid position
 */
export function calculateBoundingBox(
  widget: LayoutWidget,
  orientation: 'portrait' | 'landscape'
): WidgetBoundingBox {
  const config = GRID_CONFIG[orientation]

  const x = config.marginX + widget.col * (config.cellWidth + config.gap)
  const y = config.marginY + widget.row * (config.cellHeight + config.gap)
  const w = widget.colSpan * config.cellWidth + (widget.colSpan - 1) * config.gap
  const h = widget.rowSpan * config.cellHeight + (widget.rowSpan - 1) * config.gap

  return { x, y, w, h }
}

/**
 * Validate a widget can be resized to the new span
 */
export function canResize(
  page: LayoutPage,
  widgetId: string,
  newColSpan: number,
  newRowSpan: number
): boolean {
  const widget = page.widgets.find(w => w.id === widgetId)
  if (!widget) return false

  const def = WIDGET_DEFINITIONS[widget.type]
  if (newColSpan < def.minColSpan || newColSpan > def.maxColSpan) return false
  if (newRowSpan < def.minRowSpan || newRowSpan > def.maxRowSpan) return false

  return canPlace(page, widget.col, widget.row, newColSpan, newRowSpan, widgetId)
}

/**
 * Get all cells that a potential drop would cover (for highlighting)
 */
export function getDropTargetCells(
  col: number,
  row: number,
  colSpan: number,
  rowSpan: number
): string[] {
  const cells: string[] = []
  for (let r = row; r < row + rowSpan; r++) {
    for (let c = col; c < col + colSpan; c++) {
      cells.push(`${r}-${c}`)
    }
  }
  return cells
}

/**
 * Generate a unique ID for new items
 */
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}
