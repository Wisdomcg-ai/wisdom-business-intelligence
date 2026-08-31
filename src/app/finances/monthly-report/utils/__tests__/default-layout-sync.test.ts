/**
 * WE.1b — syncLayoutWithSettings must only manage section-gated widget types.
 *
 * The trap: sync used to remove ANY placed type not in the enabled set. A
 * manually-placed widget with no section toggle (external_metric) was
 * therefore silently deleted from the saved layout on the next settings save.
 * Now sync removes only types SECTION_WIDGET_MAP manages.
 */
import { describe, it, expect } from 'vitest'
import { syncLayoutWithSettings } from '../default-layout'
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
})
