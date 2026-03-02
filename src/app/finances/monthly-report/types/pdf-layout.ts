// PDF Layout Editor Types

// Widget types — every placeable item
export type WidgetType =
  // Tables
  | 'executive_summary'
  | 'budget_vs_actual'
  | 'ytd_summary'
  | 'full_year_projection'
  | 'subscription_detail'
  | 'wages_detail'
  | 'cashflow_forecast_table'
  // P&L Charts
  | 'chart_revenue_breakdown'
  | 'chart_break_even'
  | 'chart_revenue_vs_expenses'
  | 'chart_variance_heatmap'
  | 'chart_budget_burn_rate'
  // Cashflow Charts
  | 'chart_cash_runway'
  | 'chart_cumulative_net_cash'
  | 'chart_working_capital_gap'
  | 'chart_cashflow_forecast'
  // People/Subscriptions Charts
  | 'chart_team_cost_pct'
  | 'chart_cost_per_employee'
  | 'chart_subscription_creep'
  // KPI Cards
  | 'kpi_revenue'
  | 'kpi_gross_profit'
  | 'kpi_net_profit'

// What gets stored in the database
export interface PDFLayout {
  version: 1
  pages: LayoutPage[]
}

export interface LayoutPage {
  id: string
  orientation: 'portrait' | 'landscape'
  widgets: LayoutWidget[]
}

export interface LayoutWidget {
  id: string
  type: WidgetType
  col: number      // 0-based column
  row: number      // 0-based row
  colSpan: number  // 1-3
  rowSpan: number  // 1-3
}

// Widget definition metadata for the registry
export type WidgetCategory = 'tables' | 'pl_charts' | 'cashflow_charts' | 'people_charts' | 'kpi_cards'

export interface WidgetDefinition {
  type: WidgetType
  label: string
  category: WidgetCategory
  icon: string           // Lucide icon name
  defaultColSpan: number
  defaultRowSpan: number
  minColSpan: number
  maxColSpan: number
  minRowSpan: number
  maxRowSpan: number
  dataDependency?: 'fullYear' | 'cashflow' | 'subscriptions' | 'wages' | 'report'
}

// Bounding box for PDF rendering (mm)
export interface WidgetBoundingBox {
  x: number
  y: number
  w: number
  h: number
}

// Grid configuration
export interface GridConfig {
  cols: number
  rows: number
  cellWidth: number   // mm
  cellHeight: number  // mm
  gap: number         // mm gap between cells
  marginX: number     // mm left margin
  marginY: number     // mm top margin
}

// Grid configs for each orientation
export const GRID_CONFIG: Record<'portrait' | 'landscape', GridConfig> = {
  portrait: {
    cols: 2,
    rows: 3,
    cellWidth: 88,
    cellHeight: 85,
    gap: 4,
    marginX: 15,
    marginY: 15,
  },
  landscape: {
    cols: 3,
    rows: 3,
    cellWidth: 86,
    cellHeight: 56,
    gap: 4,
    marginX: 15,
    marginY: 15,
  },
}

// Editor state for useReducer
export interface EditorState {
  layout: PDFLayout
  selectedPageId: string | null
  selectedWidgetId: string | null
  isDirty: boolean
  history: PDFLayout[]
  historyIndex: number
}

export type EditorAction =
  | { type: 'SET_LAYOUT'; layout: PDFLayout }
  | { type: 'SELECT_PAGE'; pageId: string }
  | { type: 'SELECT_WIDGET'; widgetId: string | null }
  | { type: 'ADD_PAGE'; orientation: 'portrait' | 'landscape' }
  | { type: 'DELETE_PAGE'; pageId: string }
  | { type: 'REORDER_PAGES'; pageIds: string[] }
  | { type: 'SET_PAGE_ORIENTATION'; pageId: string; orientation: 'portrait' | 'landscape' }
  | { type: 'ADD_WIDGET'; pageId: string; widget: LayoutWidget }
  | { type: 'MOVE_WIDGET'; pageId: string; widgetId: string; col: number; row: number }
  | { type: 'RESIZE_WIDGET'; pageId: string; widgetId: string; colSpan: number; rowSpan: number }
  | { type: 'DELETE_WIDGET'; pageId: string; widgetId: string }
  | { type: 'MOVE_WIDGET_TO_PAGE'; fromPageId: string; toPageId: string; widgetId: string }
  | { type: 'UNDO' }
  | { type: 'REDO' }
  | { type: 'MARK_SAVED' }
