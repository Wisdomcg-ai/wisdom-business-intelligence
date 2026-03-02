import type { PDFLayout, LayoutPage, LayoutWidget, WidgetType } from '../types/pdf-layout'
import type { ReportSections } from '../types'
import { WIDGET_DEFINITIONS } from '../constants/widget-registry'
import { generateId, findFirstAvailablePosition, canPlace } from './grid-helpers'

// ── Section → Widget mapping ─────────────────────────────────────

/** Which widget types are gated by which section toggle */
const SECTION_WIDGET_MAP: { sectionKey: keyof ReportSections | null; type: WidgetType }[] = [
  // Always-on tables
  { sectionKey: null, type: 'executive_summary' },
  { sectionKey: null, type: 'budget_vs_actual' },
  { sectionKey: null, type: 'ytd_summary' },
  { sectionKey: null, type: 'full_year_projection' },
  // Conditional tables
  { sectionKey: 'subscription_detail', type: 'subscription_detail' },
  { sectionKey: 'payroll_detail', type: 'wages_detail' },
  { sectionKey: 'cashflow', type: 'cashflow_forecast_table' },
  // Charts
  { sectionKey: 'cashflow', type: 'chart_cashflow_forecast' },
  { sectionKey: 'chart_revenue_breakdown', type: 'chart_revenue_breakdown' },
  { sectionKey: 'chart_break_even', type: 'chart_break_even' },
  { sectionKey: 'chart_revenue_vs_expenses', type: 'chart_revenue_vs_expenses' },
  { sectionKey: 'chart_variance_heatmap', type: 'chart_variance_heatmap' },
  { sectionKey: 'chart_budget_burn_rate', type: 'chart_budget_burn_rate' },
  { sectionKey: 'chart_cash_runway', type: 'chart_cash_runway' },
  { sectionKey: 'chart_cumulative_net_cash', type: 'chart_cumulative_net_cash' },
  { sectionKey: 'chart_working_capital_gap', type: 'chart_working_capital_gap' },
  { sectionKey: 'chart_team_cost_pct', type: 'chart_team_cost_pct' },
  { sectionKey: 'chart_cost_per_employee', type: 'chart_cost_per_employee' },
  { sectionKey: 'chart_subscription_creep', type: 'chart_subscription_creep' },
]

/** Get the list of widget types that should be included given the current sections */
function getEnabledWidgets(sections?: ReportSections): WidgetType[] {
  return SECTION_WIDGET_MAP
    .filter(entry => entry.sectionKey === null || !sections || sections[entry.sectionKey])
    .map(entry => entry.type)
}

// ── Default Layout Generator ─────────────────────────────────────

/**
 * Generate a compact default layout based on the user's current report settings.
 * Groups charts together on shared pages instead of one-per-page.
 */
export function generateDefaultLayout(sections?: ReportSections): PDFLayout {
  const pages: LayoutPage[] = []

  function addFullPage(type: WidgetType, orientation: 'portrait' | 'landscape' = 'portrait') {
    const def = WIDGET_DEFINITIONS[type]
    pages.push({
      id: generateId(),
      orientation,
      widgets: [{
        id: generateId(),
        type,
        col: 0, row: 0,
        colSpan: def.defaultColSpan,
        rowSpan: def.defaultRowSpan,
      }],
    })
  }

  function addGroupedPage(
    types: WidgetType[],
    orientation: 'portrait' | 'landscape' = 'landscape'
  ) {
    const page: LayoutPage = { id: generateId(), orientation, widgets: [] }
    for (const type of types) {
      const widget = autoPlaceWidget(page, type)
      if (widget) page.widgets.push(widget)
    }
    if (page.widgets.length > 0) pages.push(page)
  }

  // ── Core tables (always on, full page each) ──
  addFullPage('executive_summary', 'portrait')
  addFullPage('budget_vs_actual', 'landscape')
  addFullPage('ytd_summary', 'portrait')

  // ── Conditional detail tables ──
  if (sections?.subscription_detail) addFullPage('subscription_detail', 'portrait')
  if (sections?.payroll_detail) addFullPage('wages_detail', 'portrait')

  // ── Cashflow (landscape, table is full page, chart grouped) ──
  if (sections?.cashflow) {
    addFullPage('cashflow_forecast_table', 'landscape')
  }

  // ── Full year projection ──
  addFullPage('full_year_projection', 'landscape')

  // ── Charts: group compatible ones onto shared landscape pages ──

  // P&L charts page 1: revenue breakdown (1x1) + revenue vs expenses (2x1) on top row,
  // budget burn rate (2x1) + team cost (1x1) on middle row
  const plGroup1: WidgetType[] = []
  if (sections?.chart_revenue_breakdown) plGroup1.push('chart_revenue_breakdown')
  if (sections?.chart_revenue_vs_expenses) plGroup1.push('chart_revenue_vs_expenses')
  if (sections?.chart_budget_burn_rate) plGroup1.push('chart_budget_burn_rate')
  if (sections?.chart_team_cost_pct) plGroup1.push('chart_team_cost_pct')
  if (plGroup1.length > 0) addGroupedPage(plGroup1, 'landscape')

  // P&L charts page 2: break even (2x1) + variance heatmap (2x2) need more space
  const plGroup2: WidgetType[] = []
  if (sections?.chart_break_even) plGroup2.push('chart_break_even')
  if (plGroup2.length > 0) addGroupedPage(plGroup2, 'landscape')

  if (sections?.chart_variance_heatmap) addFullPage('chart_variance_heatmap', 'landscape')

  // Cashflow charts: group runway + cumulative + working capital
  const cfCharts: WidgetType[] = []
  if (sections?.chart_cash_runway) cfCharts.push('chart_cash_runway')
  if (sections?.chart_cumulative_net_cash) cfCharts.push('chart_cumulative_net_cash')
  if (sections?.chart_working_capital_gap) cfCharts.push('chart_working_capital_gap')
  if (sections?.cashflow) cfCharts.push('chart_cashflow_forecast')
  if (cfCharts.length > 0) addGroupedPage(cfCharts, 'landscape')

  // People charts: cost per employee + subscription creep
  const peopleCharts: WidgetType[] = []
  if (sections?.chart_cost_per_employee) peopleCharts.push('chart_cost_per_employee')
  if (sections?.chart_subscription_creep) peopleCharts.push('chart_subscription_creep')
  if (peopleCharts.length > 0) addGroupedPage(peopleCharts, 'landscape')

  return { version: 1, pages }
}

// ── Sync Layout with Settings ────────────────────────────────────

/**
 * Sync an existing saved layout with the current report settings.
 * - Adds widgets for newly-enabled sections (auto-placed on new pages)
 * - Removes widgets for disabled sections
 * Returns a new layout, or null if no changes were needed.
 */
export function syncLayoutWithSettings(
  layout: PDFLayout,
  sections: ReportSections
): { layout: PDFLayout; added: WidgetType[]; removed: WidgetType[] } {
  const enabledTypes = new Set(getEnabledWidgets(sections))

  // Find all widget types currently in the layout
  const placedTypes = new Set<WidgetType>()
  for (const page of layout.pages) {
    for (const w of page.widgets) {
      placedTypes.add(w.type)
    }
  }

  // Types to add (enabled but not placed)
  const toAdd = [...enabledTypes].filter(t => !placedTypes.has(t))

  // Types to remove (placed but no longer enabled)
  const toRemove = [...placedTypes].filter(t => !enabledTypes.has(t))

  if (toAdd.length === 0 && toRemove.length === 0) {
    return { layout, added: [], removed: [] }
  }

  // Clone the layout
  const newLayout: PDFLayout = JSON.parse(JSON.stringify(layout))

  // Remove disabled widgets
  if (toRemove.length > 0) {
    const removeSet = new Set(toRemove)
    for (const page of newLayout.pages) {
      page.widgets = page.widgets.filter(w => !removeSet.has(w.type))
    }
    // Remove empty pages (but keep at least one)
    const nonEmpty = newLayout.pages.filter(p => p.widgets.length > 0)
    if (nonEmpty.length > 0) {
      newLayout.pages = nonEmpty
    }
  }

  // Add new widgets — try to fit on existing pages first, then create new ones
  for (const type of toAdd) {
    let placed = false

    // Try to fit on an existing page
    for (const page of newLayout.pages) {
      const widget = autoPlaceWidget(page, type)
      if (widget) {
        page.widgets.push(widget)
        placed = true
        break
      }
    }

    // No room — create a new page
    if (!placed) {
      const def = WIDGET_DEFINITIONS[type]
      const needsLandscape = def.minColSpan > 2 || def.defaultColSpan > 2
      const orientation = needsLandscape ? 'landscape' : 'landscape' // charts look better landscape
      const page: LayoutPage = { id: generateId(), orientation, widgets: [] }
      const widget = autoPlaceWidget(page, type)
      if (widget) {
        page.widgets.push(widget)
        newLayout.pages.push(page)
      }
    }
  }

  return { layout: newLayout, added: toAdd, removed: toRemove }
}

// ── Helpers ──────────────────────────────────────────────────────

/**
 * Create an empty page with the given orientation
 */
export function createEmptyPage(orientation: 'portrait' | 'landscape' = 'portrait'): LayoutPage {
  return {
    id: generateId(),
    orientation,
    widgets: [],
  }
}

/**
 * Try to add a widget to a page, auto-placing it in the first available cell
 */
export function autoPlaceWidget(
  page: LayoutPage,
  type: WidgetType
): LayoutWidget | null {
  const def = WIDGET_DEFINITIONS[type]
  const pos = findFirstAvailablePosition(page, def.defaultColSpan, def.defaultRowSpan)
  if (!pos) return null

  return {
    id: generateId(),
    type,
    col: pos.col,
    row: pos.row,
    colSpan: def.defaultColSpan,
    rowSpan: def.defaultRowSpan,
  }
}
