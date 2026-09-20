'use client'

import { useReducer, useCallback, useMemo, useEffect, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from '@dnd-kit/core'
import { arrayMove } from '@dnd-kit/sortable'
import { toast } from 'sonner'
import type {
  PDFLayout,
  LayoutPage,
  LayoutWidget,
  WidgetType,
  EditorState,
  EditorAction,
} from '../../types/pdf-layout'
import { GRID_CONFIG } from '../../types/pdf-layout'
import { WIDGET_DEFINITIONS } from '../../constants/widget-registry'
import {
  canPlace,
  canResize,
  clampPlacement,
  findFirstAvailablePosition,
  generateId,
  getDropTargetCells,
} from '../../utils/grid-helpers'
import { generateDefaultLayout, syncLayoutWithSettings } from '../../utils/default-layout'
import type { ReportSections } from '../../types'

import EditorToolbar from './EditorToolbar'
import PageListSidebar from './PageListSidebar'
import PageCanvas from './PageCanvas'
import WidgetPaletteSidebar from './WidgetPaletteSidebar'
import WidgetPreview from './WidgetPreview'
import RatioSettingsPanel from './RatioSettingsPanel'
import PlacementOptionsPanel from './PlacementOptionsPanel'
import { hasPlacementOptions, type PlacementOptionsType } from '@/lib/monthly-report/placement-options'
import InsertSettingsPanel from './InsertSettingsPanel'
import PayrollGridSettingsPanel from './PayrollGridSettingsPanel'
import ExternalMetricSettingsPanel from './ExternalMetricSettingsPanel'

// ── Reducer ───────────────────────────────────────────────────────

const MAX_HISTORY = 50

/** Every layout edit starts here; editorReducer records the result into history. */
function beginEdit(state: EditorState): EditorState {
  return { ...state, isDirty: true }
}

/**
 * history[historyIndex] is ALWAYS the layout on screen: SET_LAYOUT seeds it,
 * every edit appends the layout AFTER the change, and UNDO/REDO step one entry.
 *
 * It used to append the layout from BEFORE each edit, so the newest layout was
 * never in history. One Undo stepped back two edits and Redo could not return
 * to where it started. The ratio settings panel walked coaches straight into
 * it: drop the page, Apply its settings, Undo — and the whole page went, with
 * the config just built recoverable from nowhere.
 */
function recordHistory(state: EditorState): EditorState {
  const newHistory = state.history.slice(0, state.historyIndex + 1)
  newHistory.push(JSON.parse(JSON.stringify(state.layout)))
  if (newHistory.length > MAX_HISTORY) newHistory.shift()
  return { ...state, history: newHistory, historyIndex: newHistory.length - 1 }
}

const HISTORY_OWNERS = new Set<EditorAction['type']>(['SET_LAYOUT', 'UNDO', 'REDO'])

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  const next = applyAction(state, action)
  // An action that returned the same layout object changed nothing to undo
  // (a selection, a no-op edit); the history owners manage history themselves.
  if (next.layout === state.layout || HISTORY_OWNERS.has(action.type)) return next
  return recordHistory(next)
}

function applyAction(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'SET_LAYOUT': {
      return {
        ...state,
        layout: action.layout,
        selectedPageId: action.layout.pages[0]?.id ?? null,
        selectedWidgetId: null,
        isDirty: false,
        history: [JSON.parse(JSON.stringify(action.layout))],
        historyIndex: 0,
      }
    }

    case 'SELECT_PAGE':
      return { ...state, selectedPageId: action.pageId, selectedWidgetId: null }

    case 'SELECT_WIDGET':
      return { ...state, selectedWidgetId: action.widgetId }

    case 'ADD_PAGE': {
      const s = beginEdit(state)
      const newPage: LayoutPage = {
        id: generateId(),
        orientation: action.orientation,
        widgets: [],
      }
      s.layout = { ...s.layout, pages: [...s.layout.pages, newPage] }
      s.selectedPageId = newPage.id
      return s
    }

    case 'DELETE_PAGE': {
      if (state.layout.pages.length <= 1) return state
      const s = beginEdit(state)
      const idx = s.layout.pages.findIndex(p => p.id === action.pageId)
      s.layout = {
        ...s.layout,
        pages: s.layout.pages.filter(p => p.id !== action.pageId),
      }
      if (s.selectedPageId === action.pageId) {
        s.selectedPageId = s.layout.pages[Math.min(idx, s.layout.pages.length - 1)]?.id ?? null
      }
      return s
    }

    case 'REORDER_PAGES': {
      const s = beginEdit(state)
      const pageMap = new Map(s.layout.pages.map(p => [p.id, p]))
      s.layout = {
        ...s.layout,
        pages: action.pageIds.map(id => pageMap.get(id)!).filter(Boolean),
      }
      return s
    }

    case 'SET_PAGE_ORIENTATION': {
      const s = beginEdit(state)
      s.layout = {
        ...s.layout,
        pages: s.layout.pages.map(p => {
          if (p.id !== action.pageId) return p
          // When switching orientation: full-row widgets re-clamp to the new
          // grid width (WC.2) rather than being dropped for "not fitting";
          // anything else that genuinely doesn't fit is still cleared.
          const newConfig = GRID_CONFIG[action.orientation]
          const validWidgets = p.widgets
            .map(w => ({ ...w, ...clampPlacement(w.type, action.orientation, w.col, w.colSpan) }))
            .filter(w =>
              w.col + w.colSpan <= newConfig.cols && w.row + w.rowSpan <= newConfig.rows
            )
          return { ...p, orientation: action.orientation, widgets: validWidgets }
        }),
      }
      return s
    }

    case 'ADD_WIDGET': {
      const s = beginEdit(state)
      s.layout = {
        ...s.layout,
        pages: s.layout.pages.map(p => {
          if (p.id !== action.pageId) return p
          return { ...p, widgets: [...p.widgets, action.widget] }
        }),
      }
      return s
    }

    case 'MOVE_WIDGET': {
      const s = beginEdit(state)
      s.layout = {
        ...s.layout,
        pages: s.layout.pages.map(p => {
          if (p.id !== action.pageId) return p
          return {
            ...p,
            widgets: p.widgets.map(w => {
              if (w.id !== action.widgetId) return w
              // WC.2 — a full-row widget can move between rows, never off col 0.
              const clamped = clampPlacement(w.type, p.orientation, action.col, w.colSpan)
              return { ...w, col: clamped.col, colSpan: clamped.colSpan, row: action.row }
            }),
          }
        }),
      }
      return s
    }

    case 'RESIZE_WIDGET': {
      const s = beginEdit(state)
      s.layout = {
        ...s.layout,
        pages: s.layout.pages.map(p => {
          if (p.id !== action.pageId) return p
          return {
            ...p,
            widgets: p.widgets.map(w => {
              if (w.id !== action.widgetId) return w
              // WC.2 — horizontal resize is a no-op for full-row widgets.
              const clamped = clampPlacement(w.type, p.orientation, w.col, action.colSpan)
              return { ...w, colSpan: clamped.colSpan, rowSpan: action.rowSpan }
            }),
          }
        }),
      }
      return s
    }

    case 'UPDATE_WIDGET': {
      const page = state.layout.pages.find(p => p.id === action.pageId)
      if (!page?.widgets.some(w => w.id === action.widgetId)) return state
      const s = beginEdit(state)
      s.layout = {
        ...s.layout,
        pages: s.layout.pages.map(p => {
          if (p.id !== action.pageId) return p
          return {
            ...p,
            widgets: p.widgets.map(w => {
              if (w.id !== action.widgetId) return w
              // Spread, like every other widget action: placement and any key
              // this action does not own ride through untouched.
              const { titleOverride: _previous, ...rest } = w
              return action.titleOverride === undefined
                ? { ...rest, config: action.config }
                : { ...rest, config: action.config, titleOverride: action.titleOverride }
            }),
          }
        }),
      }
      return s
    }

    case 'DELETE_WIDGET': {
      const s = beginEdit(state)
      s.layout = {
        ...s.layout,
        pages: s.layout.pages.map(p => {
          if (p.id !== action.pageId) return p
          return { ...p, widgets: p.widgets.filter(w => w.id !== action.widgetId) }
        }),
      }
      if (s.selectedWidgetId === action.widgetId) {
        s.selectedWidgetId = null
      }
      return s
    }

    case 'MOVE_WIDGET_TO_PAGE': {
      const fromPage = state.layout.pages.find(p => p.id === action.fromPageId)
      const toPage = state.layout.pages.find(p => p.id === action.toPageId)
      if (!fromPage || !toPage) return state

      const widget = fromPage.widgets.find(w => w.id === action.widgetId)
      if (!widget) return state

      // Clamp span to fit the target page's grid (full-row types snap to the
      // target grid's full width — WC.2)
      const targetConfig = GRID_CONFIG[toPage.orientation]
      const def = WIDGET_DEFINITIONS[widget.type]
      const preClamp = clampPlacement(widget.type, toPage.orientation, 0, widget.colSpan)
      const clampedColSpan = Math.min(preClamp.colSpan, targetConfig.cols, def.maxColSpan)
      const clampedRowSpan = Math.min(widget.rowSpan, targetConfig.rows, def.maxRowSpan)

      // Find first available position on target page
      const pos = findFirstAvailablePosition(toPage, clampedColSpan, clampedRowSpan)
      if (!pos) return state // no room

      const s = beginEdit(state)
      const movedWidget: LayoutWidget = {
        ...widget,
        col: pos.col,
        row: pos.row,
        colSpan: clampedColSpan,
        rowSpan: clampedRowSpan,
      }
      s.layout = {
        ...s.layout,
        pages: s.layout.pages.map(p => {
          if (p.id === action.fromPageId) {
            return { ...p, widgets: p.widgets.filter(w => w.id !== action.widgetId) }
          }
          if (p.id === action.toPageId) {
            return { ...p, widgets: [...p.widgets, movedWidget] }
          }
          return p
        }),
      }
      // Switch to the target page and select the moved widget
      s.selectedPageId = action.toPageId
      s.selectedWidgetId = widget.id
      return s
    }

    case 'UNDO': {
      if (state.historyIndex <= 0) return state
      const newIndex = state.historyIndex - 1
      const layout = JSON.parse(JSON.stringify(state.history[newIndex]))
      return {
        ...state,
        layout,
        historyIndex: newIndex,
        isDirty: true,
        selectedPageId: layout.pages.find((p: LayoutPage) => p.id === state.selectedPageId)
          ? state.selectedPageId
          : layout.pages[0]?.id ?? null,
        selectedWidgetId: null,
      }
    }

    case 'REDO': {
      if (state.historyIndex >= state.history.length - 1) return state
      const newIndex = state.historyIndex + 1
      const layout = JSON.parse(JSON.stringify(state.history[newIndex]))
      return {
        ...state,
        layout,
        historyIndex: newIndex,
        isDirty: true,
        selectedPageId: layout.pages.find((p: LayoutPage) => p.id === state.selectedPageId)
          ? state.selectedPageId
          : layout.pages[0]?.id ?? null,
        selectedWidgetId: null,
      }
    }

    case 'MARK_SAVED':
      return { ...state, isDirty: false }

    default:
      return state
  }
}

// ── Props ─────────────────────────────────────────────────────────

interface PDFLayoutEditorModalProps {
  isOpen: boolean
  onClose: () => void
  initialLayout: PDFLayout | null
  sections?: ReportSections
  onSave: (layout: PDFLayout) => Promise<boolean>
  isSaving: boolean
  availableData: {
    report: boolean
    fullYear: boolean
    cashflow: boolean
    subscriptions: boolean
    wages: boolean
  }
  /**
   * businesses.id, as the page resolved it — for the settings panels that list
   * the business's own accounts. Absent, a panel says it could not load them.
   */
  businessId?: string
}

/**
 * Widget types whose placements have a settings panel: the ratio page's, an
 * uploaded page's name, the payroll page's roster and budget basis, the
 * external-data page's rows, and the presentation options of the cover,
 * summary and money-flow pages.
 */
function hasSettingsPanel(type: WidgetType): boolean {
  return (
    type === 'ratio_analysis' ||
    type === 'uploaded_insert' ||
    type === 'payroll_grid' ||
    type === 'external_metric' ||
    hasPlacementOptions(type)
  )
}

/**
 * The editor's keyboard shortcuts must not fire while the coach is typing.
 * The Delete guard used to check INPUT only, so Backspace in any other field
 * deleted the selected widget — and with a settings panel that is the widget
 * whose config is being typed.
 */
function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el) return false
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable
}

// ── Component ─────────────────────────────────────────────────────

export default function PDFLayoutEditorModal({
  isOpen,
  onClose,
  initialLayout,
  sections,
  onSave,
  isSaving,
  availableData,
  businessId,
}: PDFLayoutEditorModalProps) {
  // The placement whose settings panel is open. UI state, not editor state:
  // it is neither undoable nor saved.
  const [settingsWidgetId, setSettingsWidgetId] = useState<string | null>(null)
  // "Close without saving?" is showing.
  const [confirmingClose, setConfirmingClose] = useState(false)
  const [draggedItem, setDraggedItem] = useState<{
    type: 'palette-widget' | 'placed-widget' | 'page'
    widgetType?: WidgetType
    widget?: LayoutWidget
  } | null>(null)
  const [highlightedCells, setHighlightedCells] = useState<Set<string>>(new Set())
  const [invalidCells, setInvalidCells] = useState<Set<string>>(new Set())

  const defaultLayout = useMemo(() => generateDefaultLayout(sections), [sections])

  const [state, dispatch] = useReducer(editorReducer, {
    layout: initialLayout ?? defaultLayout,
    selectedPageId: (initialLayout ?? defaultLayout).pages[0]?.id ?? null,
    selectedWidgetId: null,
    isDirty: false,
    history: [JSON.parse(JSON.stringify(initialLayout ?? defaultLayout))],
    historyIndex: 0,
  })

  // Update layout when modal opens with new initial data
  // If there's a saved layout, sync it with current sections (adds new, removes disabled)
  useEffect(() => {
    if (!isOpen) return
    setSettingsWidgetId(null)
    setConfirmingClose(false)

    if (initialLayout && sections) {
      const { layout: synced, added, removed } = syncLayoutWithSettings(initialLayout, sections)
      dispatch({ type: 'SET_LAYOUT', layout: synced })

      // Notify user if widgets were auto-added or removed
      if (added.length > 0 || removed.length > 0) {
        const parts: string[] = []
        if (added.length > 0) {
          const labels = added.map(t => WIDGET_DEFINITIONS[t]?.label ?? t)
          parts.push(`Added: ${labels.join(', ')}`)
        }
        if (removed.length > 0) {
          const labels = removed.map(t => WIDGET_DEFINITIONS[t]?.label ?? t)
          parts.push(`Removed: ${labels.join(', ')}`)
        }
        toast.info(`Layout synced with settings — ${parts.join('. ')}`)
      }
    } else {
      dispatch({ type: 'SET_LAYOUT', layout: initialLayout ?? defaultLayout })
    }
  }, [isOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  const selectedPage = useMemo(
    () => state.layout.pages.find(p => p.id === state.selectedPageId) ?? null,
    [state.layout.pages, state.selectedPageId]
  )

  // Track which widget types are already placed across all pages
  const placedWidgetTypes = useMemo(() => {
    const types = new Set<WidgetType>()
    for (const page of state.layout.pages) {
      for (const w of page.widgets) {
        types.add(w.type)
      }
    }
    return types
  }, [state.layout.pages])

  // Looked up by id across every page, so an undo that removes the placement
  // closes its panel instead of leaving it editing a widget that is gone.
  const settingsTarget = useMemo(() => {
    if (!settingsWidgetId) return null
    for (const page of state.layout.pages) {
      const widget = page.widgets.find(w => w.id === settingsWidgetId)
      if (widget) return { pageId: page.id, widget }
    }
    return null
  }, [settingsWidgetId, state.layout.pages])

  useEffect(() => {
    if (settingsWidgetId && !settingsTarget) setSettingsWidgetId(null)
  }, [settingsWidgetId, settingsTarget])

  // ── DnD Handlers ──────────────────────────────────────────────

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const { active } = event
    const data = active.data.current

    if (data?.type === 'palette-widget') {
      setDraggedItem({ type: 'palette-widget', widgetType: data.widgetType })
    } else if (data?.type === 'placed-widget') {
      setDraggedItem({ type: 'placed-widget', widget: data.widget })
    } else if (data?.type === 'page') {
      setDraggedItem({ type: 'page' })
    }
  }, [])

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const { over } = event
    if (!over || !selectedPage) {
      setHighlightedCells(new Set())
      setInvalidCells(new Set())
      return
    }

    const overData = over.data.current
    if (overData?.type !== 'grid-cell') {
      setHighlightedCells(new Set())
      setInvalidCells(new Set())
      return
    }

    const { row, col: rawCol } = overData as { row: number; col: number }
    let colSpan = 1
    let rowSpan = 1
    let dragType: WidgetType | null = null

    if (draggedItem?.type === 'palette-widget' && draggedItem.widgetType) {
      const def = WIDGET_DEFINITIONS[draggedItem.widgetType]
      colSpan = def.defaultColSpan
      rowSpan = def.defaultRowSpan
      dragType = draggedItem.widgetType
    } else if (draggedItem?.type === 'placed-widget' && draggedItem.widget) {
      colSpan = draggedItem.widget.colSpan
      rowSpan = draggedItem.widget.rowSpan
      dragType = draggedItem.widget.type
    }

    // WC.2 — preview exactly what the drop will do: full-row widgets snap to
    // col 0 × full width regardless of which cell the cursor is over.
    const clamped = dragType
      ? clampPlacement(dragType, selectedPage.orientation, rawCol, colSpan)
      : { col: rawCol, colSpan }
    const col = clamped.col
    colSpan = clamped.colSpan

    const cells = getDropTargetCells(col, row, colSpan, rowSpan)
    const valid = canPlace(
      selectedPage,
      col,
      row,
      colSpan,
      rowSpan,
      draggedItem?.widget?.id
    )

    setHighlightedCells(new Set(cells))
    setInvalidCells(valid ? new Set() : new Set(cells))
  }, [selectedPage, draggedItem])

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event
    setDraggedItem(null)
    setHighlightedCells(new Set())
    setInvalidCells(new Set())

    if (!over || !selectedPage) return

    const activeData = active.data.current
    const overData = over.data.current

    // ── Page reorder ──
    if (activeData?.type === 'page' && over.id.toString().startsWith('page-')) {
      const activeId = active.id.toString().replace('page-', '')
      const overId = over.id.toString().replace('page-', '')
      if (activeId !== overId) {
        const oldIndex = state.layout.pages.findIndex(p => p.id === activeId)
        const newIndex = state.layout.pages.findIndex(p => p.id === overId)
        if (oldIndex !== -1 && newIndex !== -1) {
          const newOrder = arrayMove(state.layout.pages, oldIndex, newIndex).map(p => p.id)
          dispatch({ type: 'REORDER_PAGES', pageIds: newOrder })
        }
      }
      return
    }

    // Only handle drops onto grid cells
    if (overData?.type !== 'grid-cell') return
    const { row, col } = overData as { row: number; col: number }

    // ── Palette → Grid drop ──
    if (activeData?.type === 'palette-widget') {
      const widgetType = activeData.widgetType as WidgetType
      const def = WIDGET_DEFINITIONS[widgetType]
      const clamped = clampPlacement(widgetType, selectedPage.orientation, col, def.defaultColSpan)

      if (!canPlace(selectedPage, clamped.col, row, clamped.colSpan, def.defaultRowSpan)) return

      const widget: LayoutWidget = {
        id: generateId(),
        type: widgetType,
        col: clamped.col,
        row,
        colSpan: clamped.colSpan,
        rowSpan: def.defaultRowSpan,
      }
      dispatch({ type: 'ADD_WIDGET', pageId: selectedPage.id, widget })
      // An unconfigured ratio page prints "No ratios have been set up", so a
      // placement is only half done until its settings are filled in. A page
      // with presentation options is complete as dropped; they are there when
      // wanted.
      if (widgetType === 'ratio_analysis') setSettingsWidgetId(widget.id)
      return
    }

    // ── Placed widget reposition ──
    if (activeData?.type === 'placed-widget') {
      const widget = activeData.widget as LayoutWidget
      const clamped = clampPlacement(widget.type, selectedPage.orientation, col, widget.colSpan)
      if (!canPlace(selectedPage, clamped.col, row, clamped.colSpan, widget.rowSpan, widget.id)) return
      dispatch({
        type: 'MOVE_WIDGET',
        pageId: selectedPage.id,
        widgetId: widget.id,
        col: clamped.col,
        row,
      })
    }
  }, [selectedPage, state.layout.pages])

  const handleDragCancel = useCallback(() => {
    setDraggedItem(null)
    setHighlightedCells(new Set())
    setInvalidCells(new Set())
  }, [])

  // ── Widget Actions ────────────────────────────────────────────

  const handleDeleteWidget = useCallback((widgetId: string) => {
    if (!state.selectedPageId) return
    dispatch({ type: 'DELETE_WIDGET', pageId: state.selectedPageId, widgetId })
  }, [state.selectedPageId])

  const handleMoveWidgetToPage = useCallback((widgetId: string, toPageId: string) => {
    if (!state.selectedPageId) return
    dispatch({
      type: 'MOVE_WIDGET_TO_PAGE',
      fromPageId: state.selectedPageId,
      toPageId,
      widgetId,
    })
  }, [state.selectedPageId])

  const handleResizeWidget = useCallback((widgetId: string, deltaCol: number, deltaRow: number) => {
    if (!selectedPage) return
    const widget = selectedPage.widgets.find(w => w.id === widgetId)
    if (!widget) return

    const newColSpan = Math.max(1, widget.colSpan + deltaCol)
    const newRowSpan = Math.max(1, widget.rowSpan + deltaRow)

    if (canResize(selectedPage, widgetId, newColSpan, newRowSpan)) {
      dispatch({
        type: 'RESIZE_WIDGET',
        pageId: selectedPage.id,
        widgetId,
        colSpan: newColSpan,
        rowSpan: newRowSpan,
      })
    }
  }, [selectedPage])

  // ── Page Actions ──────────────────────────────────────────────

  const handleToggleOrientation = useCallback((pageId: string) => {
    const page = state.layout.pages.find(p => p.id === pageId)
    if (!page) return
    const newOrientation = page.orientation === 'portrait' ? 'landscape' : 'portrait'
    dispatch({ type: 'SET_PAGE_ORIENTATION', pageId, orientation: newOrientation })
  }, [state.layout.pages])

  // ── Save / Reset ──────────────────────────────────────────────

  const [localSaving, setLocalSaving] = useState(false)

  const handleSave = useCallback(async () => {
    setLocalSaving(true)
    try {
      const success = await onSave(state.layout)
      if (success) {
        dispatch({ type: 'MARK_SAVED' })
      }
    } catch (err) {
      console.error('[LayoutEditor] Save error:', err)
      toast.error('Failed to save layout')
    } finally {
      setLocalSaving(false)
    }
  }, [state.layout, onSave])

  const handleReset = useCallback(() => {
    dispatch({ type: 'SET_LAYOUT', layout: defaultLayout })
  }, [defaultLayout])

  // Nothing is kept until Save Layout. The X and Escape used to close straight
  // away, which was survivable while every edit was a drag; a ratio page's
  // settings are a long form, and after Apply a coach reasonably thinks he is
  // done — so unsaved changes are confirmed before they are thrown away.
  const requestClose = useCallback(() => {
    if (state.isDirty) setConfirmingClose(true)
    else onClose()
  }, [state.isDirty, onClose])

  // Closing a settings panel also drops the selection. "Edit ratios" selects
  // the placement, and focus falls to the page when the panel unmounts, so a
  // stray Backspace after Apply deleted the page it had just configured.
  const closeSettings = useCallback(() => {
    setSettingsWidgetId(null)
    dispatch({ type: 'SELECT_WIDGET', widgetId: null })
  }, [])

  // ── Keyboard Shortcuts ────────────────────────────────────────

  useEffect(() => {
    if (!isOpen) return

    const handler = (e: KeyboardEvent) => {
      // A settings panel owns the keyboard while it is open — including Escape,
      // which closes the panel, not the editor and every unsaved edit with it.
      if (settingsWidgetId) return
      // So does the close confirmation: Escape there means "keep editing".
      if (confirmingClose) {
        if (e.key === 'Escape') {
          e.preventDefault()
          setConfirmingClose(false)
        }
        return
      }
      // Cmd+Z in a text field undoes the typing, not the layout.
      const typing = isTypingTarget(e.target)
      // Undo
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey && !typing) {
        e.preventDefault()
        dispatch({ type: 'UNDO' })
      }
      // Redo
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && e.shiftKey && !typing) {
        e.preventDefault()
        dispatch({ type: 'REDO' })
      }
      // Delete selected widget
      if ((e.key === 'Delete' || e.key === 'Backspace') && state.selectedWidgetId && state.selectedPageId) {
        if (typing) return
        e.preventDefault()
        dispatch({
          type: 'DELETE_WIDGET',
          pageId: state.selectedPageId,
          widgetId: state.selectedWidgetId,
        })
      }
      // Escape to close
      if (e.key === 'Escape') {
        e.preventDefault()
        requestClose()
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isOpen, state.selectedWidgetId, state.selectedPageId, requestClose, settingsWidgetId, confirmingClose])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-100">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        {/* Toolbar */}
        <EditorToolbar
          isDirty={state.isDirty}
          isSaving={localSaving || isSaving}
          canUndo={state.historyIndex > 0}
          canRedo={state.historyIndex < state.history.length - 1}
          onSave={handleSave}
          onReset={handleReset}
          onClose={requestClose}
          onUndo={() => dispatch({ type: 'UNDO' })}
          onRedo={() => dispatch({ type: 'REDO' })}
        />

        {/* Main editor area */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left sidebar — page list */}
          <PageListSidebar
            pages={state.layout.pages}
            selectedPageId={state.selectedPageId}
            onSelectPage={(id) => dispatch({ type: 'SELECT_PAGE', pageId: id })}
            onAddPage={(o) => dispatch({ type: 'ADD_PAGE', orientation: o })}
            onDeletePage={(id) => dispatch({ type: 'DELETE_PAGE', pageId: id })}
            onToggleOrientation={handleToggleOrientation}
          />

          {/* Center — page canvas */}
          {selectedPage ? (
            <PageCanvas
              page={selectedPage}
              allPages={state.layout.pages}
              selectedWidgetId={state.selectedWidgetId}
              highlightedCells={highlightedCells}
              invalidCells={invalidCells}
              onSelectWidget={(id) => dispatch({ type: 'SELECT_WIDGET', widgetId: id })}
              onDeleteWidget={handleDeleteWidget}
              onResizeWidget={handleResizeWidget}
              onMoveWidgetToPage={handleMoveWidgetToPage}
              onOpenWidgetSettings={(id) => {
                dispatch({ type: 'SELECT_WIDGET', widgetId: id })
                setSettingsWidgetId(id)
              }}
              hasSettings={hasSettingsPanel}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-400">
              Add a page to get started
            </div>
          )}

          {/* Right sidebar — widget palette */}
          <WidgetPaletteSidebar
            placedWidgetTypes={placedWidgetTypes}
            availableData={availableData}
          />
        </div>

        {/* Drag overlay */}
        <DragOverlay>
          {draggedItem?.type === 'palette-widget' && draggedItem.widgetType && (
            <div className="bg-white shadow-xl rounded-lg border-2 border-brand-orange p-3 w-40 opacity-90">
              <WidgetPreview type={draggedItem.widgetType} compact />
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {settingsTarget?.widget.type === 'ratio_analysis' && (
        <RatioSettingsPanel
          // Keyed on the placement: opening another page's panel starts from
          // THAT widget's stored config, never the last panel's draft.
          key={settingsTarget.widget.id}
          widget={settingsTarget.widget}
          businessId={businessId}
          onCancel={closeSettings}
          onApply={({ config, titleOverride }) => {
            dispatch({
              type: 'UPDATE_WIDGET',
              pageId: settingsTarget.pageId,
              widgetId: settingsTarget.widget.id,
              config,
              titleOverride,
            })
            closeSettings()
          }}
        />
      )}

      {settingsTarget && hasPlacementOptions(settingsTarget.widget.type) && (
        <PlacementOptionsPanel
          key={settingsTarget.widget.id}
          widget={settingsTarget.widget as LayoutWidget & { type: PlacementOptionsType }}
          onCancel={closeSettings}
          onApply={(config) => {
            dispatch({
              type: 'UPDATE_WIDGET',
              pageId: settingsTarget.pageId,
              widgetId: settingsTarget.widget.id,
              config,
              // The title is not this panel's; the one stored rides through.
              titleOverride: settingsTarget.widget.titleOverride,
            })
            closeSettings()
          }}
        />
      )}

      {settingsTarget?.widget.type === 'payroll_grid' && (
        <PayrollGridSettingsPanel
          key={settingsTarget.widget.id}
          widget={settingsTarget.widget}
          onCancel={closeSettings}
          onApply={(config) => {
            dispatch({
              type: 'UPDATE_WIDGET',
              pageId: settingsTarget.pageId,
              widgetId: settingsTarget.widget.id,
              config,
              titleOverride: settingsTarget.widget.titleOverride,
            })
            closeSettings()
          }}
        />
      )}

      {settingsTarget?.widget.type === 'external_metric' && (
        <ExternalMetricSettingsPanel
          key={settingsTarget.widget.id}
          widget={settingsTarget.widget}
          onCancel={closeSettings}
          onApply={(config) => {
            dispatch({
              type: 'UPDATE_WIDGET',
              pageId: settingsTarget.pageId,
              widgetId: settingsTarget.widget.id,
              config,
              titleOverride: settingsTarget.widget.titleOverride,
            })
            closeSettings()
          }}
        />
      )}

      {settingsTarget?.widget.type === 'uploaded_insert' && (
        <InsertSettingsPanel
          key={settingsTarget.widget.id}
          widget={settingsTarget.widget}
          onCancel={closeSettings}
          onApply={({ config, titleOverride }) => {
            dispatch({
              type: 'UPDATE_WIDGET',
              pageId: settingsTarget.pageId,
              widgetId: settingsTarget.widget.id,
              config,
              titleOverride,
            })
            closeSettings()
          }}
        />
      )}

      {confirmingClose && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" aria-hidden="true" onClick={() => setConfirmingClose(false)} />
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="layout-close-heading"
            aria-describedby="layout-close-body"
            className="relative bg-white rounded-xl shadow-xl w-full max-w-sm p-5 space-y-3"
          >
            <h2 id="layout-close-heading" className="text-sm font-semibold text-gray-900">Close without saving?</h2>
            <p id="layout-close-body" className="text-xs text-gray-600">
              The changes made since the last Save Layout — including any page settings you applied — will be lost.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                autoFocus
                onClick={() => setConfirmingClose(false)}
                className="px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 rounded-md"
              >
                Keep editing
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmingClose(false)
                  onClose()
                }}
                className="px-3 py-1.5 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded-md"
              >
                Close without saving
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
