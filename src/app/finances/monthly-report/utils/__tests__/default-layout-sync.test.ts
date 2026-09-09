/**
 * WE.1b — syncLayoutWithSettings must only manage section-gated widget types.
 *
 * The trap: sync used to remove ANY placed type not in the enabled set. A
 * manually-placed widget with no section toggle (external_metric) was
 * therefore silently deleted from the saved layout on the next settings save.
 * Now sync removes only types SECTION_WIDGET_MAP manages.
 */
import { describe, it, expect } from 'vitest'
import { generateDefaultLayout, syncLayoutWithSettings } from '../default-layout'
import { WIDGET_DEFINITIONS } from '../../constants/widget-registry'
import { WIDGET_METHOD_MAP } from '../../services/widget-renderer'
import { DEFAULT_SECTIONS, type ReportSections } from '../../types'
import type { PDFLayout } from '../../types/pdf-layout'

const allOff: ReportSections = Object.fromEntries(
  Object.keys(DEFAULT_SECTIONS).map((k) => [k, false]),
) as unknown as ReportSections

function layoutWith(types: string[]): PDFLayout {
  return {
    version: 1,
    pages: [
      {
        id: 'p1',
        orientation: 'portrait',
        widgets: types.map((type, i) => ({
          id: `w${i}`,
          type: type as any,
          col: 0,
          row: i,
          colSpan: 2,
          rowSpan: 1,
        })),
      },
    ],
  }
}

describe('WE.1b — manually-placed widgets survive settings sync', () => {
  it('external_metric is NOT removed when every section is off', () => {
    const layout = layoutWith(['executive_summary', 'external_metric'])
    const { layout: synced, removed } = syncLayoutWithSettings(layout, allOff)
    expect(removed).not.toContain('external_metric')
    const placed = synced.pages.flatMap((p) => p.widgets.map((w) => w.type))
    expect(placed).toContain('external_metric')
  })

  it('section-managed widgets are still removed when their toggle is off', () => {
    const layout = layoutWith(['executive_summary', 'wages_detail', 'external_metric'])
    const { layout: synced, removed } = syncLayoutWithSettings(layout, {
      ...DEFAULT_SECTIONS,
      payroll_detail: false,
    })
    expect(removed).toContain('wages_detail')
    const placed = synced.pages.flatMap((p) => p.widgets.map((w) => w.type))
    expect(placed).not.toContain('wages_detail')
    expect(placed).toContain('external_metric')
  })

  it('enabling a section still adds its widget without touching external_metric', () => {
    const layout = layoutWith(['executive_summary', 'external_metric'])
    const { layout: synced, added } = syncLayoutWithSettings(layout, {
      ...DEFAULT_SECTIONS,
      payroll_detail: true,
    })
    expect(added).toContain('wages_detail')
    const placed = synced.pages.flatMap((p) => p.widgets.map((w) => w.type))
    expect(placed).toContain('external_metric')
  })
})

describe('WG.1 — the balance sheet is placed twice and stays that way', () => {
  const withBs: ReportSections = { ...DEFAULT_SECTIONS, balance_sheet: true }

  it('the default layout carries both comparison pages, prior month first', () => {
    const widgets = generateDefaultLayout(withBs).pages
      .flatMap((p) => p.widgets)
      .filter((w) => w.type === 'balance_sheet')
    expect(widgets.map((w) => w.config?.compare)).toEqual(['mom', 'yoy'])
  })

  it('neither page is generated when the balance-sheet section is off', () => {
    const placed = generateDefaultLayout(DEFAULT_SECTIONS).pages
      .flatMap((p) => p.widgets)
      .map((w) => w.type)
    expect(placed).not.toContain('balance_sheet')
  })

  it('sync does not duplicate or drop the second copy while the section is on', () => {
    // The trap: sync reasons about TYPES. A naive "this type is enabled but I
    // only see it once" would add a third page; a naive per-widget filter
    // would delete the hand-placed yoy copy on the next settings save.
    const layout = generateDefaultLayout(withBs)
    const { layout: synced, added, removed } = syncLayoutWithSettings(layout, withBs)
    expect(added).not.toContain('balance_sheet')
    expect(removed).not.toContain('balance_sheet')
    const compares = synced.pages
      .flatMap((p) => p.widgets)
      .filter((w) => w.type === 'balance_sheet')
      .map((w) => w.config?.compare)
    expect(compares).toEqual(['mom', 'yoy'])
  })

  it('turning the section off removes both copies', () => {
    const layout = generateDefaultLayout(withBs)
    const { layout: synced, removed } = syncLayoutWithSettings(layout, {
      ...DEFAULT_SECTIONS,
      balance_sheet: false,
    })
    expect(removed).toContain('balance_sheet')
    const placed = synced.pages.flatMap((p) => p.widgets.map((w) => w.type))
    expect(placed).not.toContain('balance_sheet')
  })

  it('turning the section on adds a page to a layout that had none', () => {
    const layout = layoutWith(['executive_summary'])
    const { layout: synced, added } = syncLayoutWithSettings(layout, withBs)
    expect(added).toContain('balance_sheet')
    const placed = synced.pages.flatMap((p) => p.widgets.map((w) => w.type))
    expect(placed).toContain('balance_sheet')
  })
})

describe('WE.1b — widget registration coherence', () => {
  it('external_metric is registered as a full-row table with a renderer', () => {
    const def = WIDGET_DEFINITIONS.external_metric
    expect(def).toBeTruthy()
    expect(def.category).toBe('tables')
    expect(def.fullRow).toBe(true)
    // No dataDependency: palette availability can't know per-business series.
    expect(def.dataDependency).toBeUndefined()
    expect(WIDGET_METHOD_MAP.external_metric).toBe('renderExternalMetric')
  })

  it('balance_sheet is registered as a full-row portrait table with a renderer', () => {
    const def = WIDGET_DEFINITIONS.balance_sheet
    expect(def).toBeTruthy()
    expect(def.category).toBe('tables')
    expect(def.fullRow).toBe(true)
    // No dataDependency: unavailability is stated on the page, not swapped for
    // the grey "Data not available" placeholder.
    expect(def.dataDependency).toBeUndefined()
    expect(WIDGET_METHOD_MAP.balance_sheet).toBe('renderBalanceSheet')
  })
})
