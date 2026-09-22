/**
 * WC.2 — the full-row placement rule.
 *
 * Tables and charts render through renderWithSkipPage, which uses box.x as a
 * symmetric MARGIN — all twelve autoTable calls pass
 * margin:{left:box.x,right:box.x} — and box.w reaches nothing but the KPI
 * cards. A table in column 1 of a portrait page (box.x = 107mm) therefore
 * renders with a 107mm margin on BOTH sides of a 210mm page: usable width
 * −4mm. Until renderers honour real bounding boxes, full-row widgets pin to
 * col 0 × full grid width. Deliberately reversible: dropping the fullRow flags
 * restores free placement without a data migration.
 */
import { describe, it, expect } from 'vitest'
import {
  isFullRowWidget,
  clampPlacement,
  normalizeLayoutPlacements,
} from '../grid-helpers'
import { WIDGET_DEFINITIONS } from '../../constants/widget-registry'
import type { LayoutPage, PDFLayout, WidgetType } from '../../types/pdf-layout'

describe('isFullRowWidget', () => {
  it('every table and chart is full-row; every KPI card is free', () => {
    for (const def of Object.values(WIDGET_DEFINITIONS)) {
      if (def.category === 'kpi_cards') {
        expect(isFullRowWidget(def.type), def.type).toBe(false)
      } else {
        expect(isFullRowWidget(def.type), def.type).toBe(true)
      }
    }
  })
})

describe('clampPlacement', () => {
  it('snaps a full-row widget to col 0 × grid width', () => {
    expect(clampPlacement('budget_vs_actual', 'portrait', 1, 1)).toEqual({ col: 0, colSpan: 2 })
    expect(clampPlacement('chart_break_even', 'landscape', 2, 1)).toEqual({ col: 0, colSpan: 3 })
  })

  it('passes a KPI card through untouched', () => {
    expect(clampPlacement('kpi_revenue', 'portrait', 1, 1)).toEqual({ col: 1, colSpan: 1 })
  })
})

describe('normalizeLayoutPlacements', () => {
  const widget = (type: WidgetType, col: number, colSpan: number) => ({
    id: `${type}-${col}`,
    type,
    col,
    row: 0,
    colSpan,
    rowSpan: 1,
  })
  const page = (orientation: LayoutPage['orientation'], widgets: LayoutPage['widgets']): LayoutPage => ({
    id: 'p1',
    orientation,
    widgets,
  })

  it('snaps a mis-placed table (the pre-rule saved-layout case)', () => {
    const layout: PDFLayout = {
      version: 1,
      pages: [page('portrait', [widget('budget_vs_actual', 1, 1)])],
    }
    const out = normalizeLayoutPlacements(layout)
    expect(out.pages[0].widgets[0]).toMatchObject({ col: 0, colSpan: 2 })
  })

  it('returns the SAME object when nothing needs to move (no spurious re-renders)', () => {
    const layout: PDFLayout = {
      version: 1,
      pages: [
        page('portrait', [widget('budget_vs_actual', 0, 2), widget('kpi_revenue', 1, 1)]),
      ],
    }
    expect(normalizeLayoutPlacements(layout)).toBe(layout)
  })

  it('leaves KPI cards where the coach put them', () => {
    const layout: PDFLayout = {
      version: 1,
      pages: [page('portrait', [widget('kpi_net_profit', 1, 1)])],
    }
    expect(normalizeLayoutPlacements(layout)).toBe(layout)
  })

  it('preserves WC.1 config/titleOverride through normalisation', () => {
    const layout: PDFLayout = {
      version: 1,
      pages: [
        page('portrait', [
          { ...widget('budget_vs_actual', 1, 1), config: { section: 'cogs' }, titleOverride: 'COGS Analysis' },
        ]),
      ],
    }
    const out = normalizeLayoutPlacements(layout)
    expect(out.pages[0].widgets[0]).toMatchObject({
      col: 0,
      colSpan: 2,
      config: { section: 'cogs' },
      titleOverride: 'COGS Analysis',
    })
  })
})
