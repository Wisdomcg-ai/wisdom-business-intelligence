/**
 * A ratio page's settings, from the panel's Apply to the POST body — through
 * every function the real save path runs, not a stand-in for them:
 *
 *   Apply        → editorReducer UPDATE_WIDGET (history is a JSON clone)
 *   undo / redo  → the JSON-cloned history entries
 *   editor open  → syncLayoutWithSettings
 *   export       → normalizeLayoutPlacements
 *   Save Layout  → usePDFLayout.saveLayout's POST body
 *
 * and back into the panel: the saved config re-opens and re-applies
 * byte-identical. Urban Road's reference config is the payload.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { editorReducer } from '../../components/layout-editor/PDFLayoutEditorModal'
import { syncLayoutWithSettings, generateDefaultLayout } from '../default-layout'
import { normalizeLayoutPlacements } from '../grid-helpers'
import { usePDFLayout } from '../../hooks/usePDFLayout'
import { DEFAULT_SECTIONS, type MonthlyReportSettings } from '../../types'
import type { EditorState, LayoutWidget, PDFLayout } from '../../types/pdf-layout'
import { parseRatioAnalysisConfig } from '@/lib/monthly-report/ratio-table'
import { formFromWidget, validateRatioForm } from '@/lib/monthly-report/ratio-config-form'
import { URBAN_ROAD_CONFIG, URBAN_ROAD_TITLE } from '@/lib/monthly-report/__tests__/ratio-config-fixture'

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  global.fetch = fetchMock as unknown as typeof fetch
})

function startState(): EditorState {
  const base = generateDefaultLayout(DEFAULT_SECTIONS)
  const layout: PDFLayout = {
    ...base,
    pages: [
      ...base.pages,
      {
        id: 'ratio-page',
        orientation: 'portrait',
        // Freshly dropped: no config, no title.
        widgets: [{ id: 'ratio-1', type: 'ratio_analysis', col: 0, row: 0, colSpan: 2, rowSpan: 2 }],
      },
    ],
  }
  return editorReducer(
    { layout, selectedPageId: null, selectedWidgetId: null, isDirty: false, history: [], historyIndex: 0 },
    { type: 'SET_LAYOUT', layout },
  )
}

const ratioWidget = (layout: PDFLayout): LayoutWidget =>
  layout.pages.flatMap((p) => p.widgets).find((w) => w.type === 'ratio_analysis')!

function applyUrbanRoad(state: EditorState): EditorState {
  const verdict = validateRatioForm(formFromWidget(URBAN_ROAD_CONFIG, URBAN_ROAD_TITLE).form)
  if (!verdict.ok) throw new Error(verdict.reason)
  return editorReducer(state, {
    type: 'UPDATE_WIDGET',
    pageId: 'ratio-page',
    widgetId: 'ratio-1',
    config: verdict.config,
    titleOverride: verdict.titleOverride,
  })
}

describe('UPDATE_WIDGET', () => {
  it('writes config and title as one undoable step, and leaves the placement alone', () => {
    const before = startState()
    const after = applyUrbanRoad(before)
    expect(after.isDirty).toBe(true)
    expect(after.historyIndex).toBe(before.historyIndex + 1)
    expect(ratioWidget(after.layout)).toEqual({
      id: 'ratio-1', type: 'ratio_analysis', col: 0, row: 0, colSpan: 2, rowSpan: 2,
      config: URBAN_ROAD_CONFIG, titleOverride: URBAN_ROAD_TITLE,
    })

    const undone = editorReducer(after, { type: 'UNDO' })
    expect(ratioWidget(undone.layout).config).toBeUndefined()
    const redone = editorReducer(undone, { type: 'REDO' })
    expect(ratioWidget(redone.layout).config).toEqual(URBAN_ROAD_CONFIG)
    expect(ratioWidget(redone.layout).titleOverride).toBe(URBAN_ROAD_TITLE)
  })

  // The panel's own flow is two edits in a row — drop the page, then Apply its
  // settings. History used to record the layout from BEFORE each edit, so one
  // Undo stepped back two: it removed the whole page, and Redo brought it back
  // with the config the coach had just built nowhere in history.
  it('drop, Apply, Undo takes back only the Apply — and Redo restores the config', () => {
    const empty: PDFLayout = { version: 1, pages: [{ id: 'ratio-page', orientation: 'portrait', widgets: [] }] }
    let s = editorReducer(
      { layout: empty, selectedPageId: null, selectedWidgetId: null, isDirty: false, history: [], historyIndex: 0 },
      { type: 'SET_LAYOUT', layout: empty },
    )
    s = editorReducer(s, {
      type: 'ADD_WIDGET', pageId: 'ratio-page',
      widget: { id: 'ratio-1', type: 'ratio_analysis', col: 0, row: 0, colSpan: 2, rowSpan: 2 },
    })
    s = applyUrbanRoad(s)

    const undone = editorReducer(s, { type: 'UNDO' })
    expect(undone.layout.pages[0].widgets).toHaveLength(1)
    expect(ratioWidget(undone.layout).config).toBeUndefined()

    const redone = editorReducer(undone, { type: 'REDO' })
    expect(ratioWidget(redone.layout).config).toEqual(URBAN_ROAD_CONFIG)
    expect(editorReducer(redone, { type: 'REDO' })).toBe(redone)

    const twice = editorReducer(undone, { type: 'UNDO' })
    expect(twice.layout.pages[0].widgets).toEqual([])
    expect(editorReducer(twice, { type: 'UNDO' })).toBe(twice)
  })

  it('Apply, then a stray Delete, then Undo brings the widget back WITH its config', () => {
    let s = applyUrbanRoad(startState())
    s = editorReducer(s, { type: 'DELETE_WIDGET', pageId: 'ratio-page', widgetId: 'ratio-1' })
    expect(s.layout.pages.flatMap((p) => p.widgets).some((w) => w.id === 'ratio-1')).toBe(false)
    const undone = editorReducer(s, { type: 'UNDO' })
    expect(ratioWidget(undone.layout).config).toEqual(URBAN_ROAD_CONFIG)
    expect(ratioWidget(undone.layout).titleOverride).toBe(URBAN_ROAD_TITLE)
  })

  it('Apply, Apply again, Undo returns to the FIRST Apply, not the unconfigured page', () => {
    const first = applyUrbanRoad(startState())
    const second = editorReducer(first, {
      type: 'UPDATE_WIDGET', pageId: 'ratio-page', widgetId: 'ratio-1', config: URBAN_ROAD_CONFIG, titleOverride: 'Margins',
    })
    const undone = editorReducer(second, { type: 'UNDO' })
    expect(ratioWidget(undone.layout).titleOverride).toBe(URBAN_ROAD_TITLE)
    expect(ratioWidget(undone.layout).config).toEqual(URBAN_ROAD_CONFIG)
  })

  it('history stays capped, and the cap drops the oldest entry, not the newest', () => {
    let s = startState()
    for (let i = 0; i < 60; i++) {
      s = editorReducer(s, {
        type: 'UPDATE_WIDGET', pageId: 'ratio-page', widgetId: 'ratio-1', config: URBAN_ROAD_CONFIG, titleOverride: `T${i}`,
      })
    }
    expect(s.history.length).toBeLessThanOrEqual(50)
    expect(s.historyIndex).toBe(s.history.length - 1)
    expect(ratioWidget(editorReducer(s, { type: 'UNDO' }).layout).titleOverride).toBe('T58')
  })

  it('a blank title removes the key rather than storing an empty string', () => {
    const withTitle = applyUrbanRoad(startState())
    const cleared = editorReducer(withTitle, {
      type: 'UPDATE_WIDGET', pageId: 'ratio-page', widgetId: 'ratio-1', config: URBAN_ROAD_CONFIG, titleOverride: undefined,
    })
    expect('titleOverride' in ratioWidget(cleared.layout)).toBe(false)
  })

  it('a widget that is no longer there is a no-op, not a history entry', () => {
    const state = startState()
    const next = editorReducer(state, {
      type: 'UPDATE_WIDGET', pageId: 'ratio-page', widgetId: 'gone', config: URBAN_ROAD_CONFIG, titleOverride: undefined,
    })
    expect(next).toBe(state)
  })
})

describe('the save path', () => {
  it('Urban Road’s config survives sync, normalisation and the POST — and re-opens and re-saves byte-identical', async () => {
    const applied = applyUrbanRoad(startState())

    // Re-opening the editor syncs against the section toggles; export normalises placements.
    const synced = syncLayoutWithSettings(applied.layout, DEFAULT_SECTIONS).layout
    const normalised = normalizeLayoutPlacements(synced)
    expect(JSON.stringify(ratioWidget(normalised).config)).toBe(JSON.stringify(URBAN_ROAD_CONFIG))

    const settings = { business_id: '28d41193-38ae-4071-a2b1-0dbea90a38fd', sections: DEFAULT_SECTIONS, pdf_layout: null } as unknown as MonthlyReportSettings
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, settings }) } as unknown as Response)
    const { result } = renderHook(() => usePDFLayout(settings.business_id, settings, vi.fn(), '2026-08'))
    await act(async () => {
      await result.current.saveLayout(normalised)
    })

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string)
    const saved = ratioWidget(body.pdf_layout as PDFLayout)
    expect(JSON.stringify(saved.config)).toBe(JSON.stringify(URBAN_ROAD_CONFIG))
    expect(saved.titleOverride).toBe(URBAN_ROAD_TITLE)
    expect(parseRatioAnalysisConfig(saved.config).ok).toBe(true)

    // Load what was saved back into the panel and Apply again.
    const again = validateRatioForm(formFromWidget(saved.config, saved.titleOverride).form)
    expect(again.ok).toBe(true)
    expect(again.ok && JSON.stringify(again.config)).toBe(JSON.stringify(saved.config))
    expect(again.ok && again.titleOverride).toBe(saved.titleOverride)
  })
})
