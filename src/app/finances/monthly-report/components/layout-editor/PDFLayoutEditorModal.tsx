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

// ── Reducer ───────────────────────────────────────────────────────

const MAX_HISTORY = 50

function pushHistory(state: EditorState): EditorState {
  const newHistory = state.history.slice(0, state.historyIndex + 1)
  newHistory.push(JSON.parse(JSON.stringify(state.layout)))
  if (newHistory.length > MAX_HISTORY) newHistory.shift()
  return { ...state, history: newHistory, historyIndex: newHistory.length - 1, isDirty: true }
}

function editorReducer(state: EditorState, action: EditorAction): EditorState {
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
      const s = pushHistory(state)
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
      const s = pushHistory(state)
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
      const s = pushHistory(state)
      const pageMap = new Map(s.layout.pages.map(p => [p.id, p]))
      s.layout = {
        ...s.layout,
        pages: action.pageIds.map(id => pageMap.get(id)!).filter(Boolean),
      }
      return s
    }

    case 'SET_PAGE_ORIENTATION': {
      const s = pushHistory(state)
      s.layout = {
        ...s.layout,
        pages: s.layout.pages.map(p => {
          if (p.id !== action.pageId) return p
          // When switching orientation, clear widgets that don't fit
          const newConfig = GRID_CONFIG[action.orientation]
          const validWidgets = p.widgets.filter(w =>
            w.col + w.colSpan <= newConfig.cols && w.row + w.rowSpan <= newConfig.rows
          )
          return { ...p, orientation: action.orientation, widgets: validWidgets }
        }),
      }
      return s
    }

    case 'ADD_WIDGET': {
      const s = pushHistory(state)
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
      const s = pushHistory(state)
      s.layout = {
        ...s.layout,
        pages: s.layout.pages.map(p => {
          if (p.id !== action.pageId) return p
          return {
            ...p,
            widgets: p.widgets.map(w => {
              if (w.id !== action.widgetId) return w
              return { ...w, col: action.col, row: action.row }
            }),
          }
        }),
      }
      return s
    }

    case 'RESIZE_WIDGET': {
      const s = pushHistory(state)
      s.layout = {
        ...s.layout,
        pages: s.layout.pages.map(p => {
          if (p.id !== action.pageId) return p
          return {
            ...p,
            widgets: p.widgets.map(w => {
              if (w.id !== action.widgetId) return w
              return { ...w, colSpan: action.colSpan, rowSpan: action.rowSpan }
            }),
          }
        }),
      }
      return s
    }

    case 'DELETE_WIDGET': {
      const s = pushHistory(state)
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

      // Clamp span to fit the target page's grid
      const targetConfig = GRID_CONFIG[toPage.orientation]
      const def = WIDGET_DEFINITIONS[widget.type]
      const clampedColSpan = Math.min(widget.colSpan, targetConfig.cols, def.maxColSpan)
      const clampedRowSpan = Math.min(widget.rowSpan, targetConfig.rows, def.maxRowSpan)

      // Find first available position on target page
      const pos = findFirstAvailablePosition(toPage, clampedColSpan, clampedRowSpan)
      if (!pos) return state // no room

      const s = pushHistory(state)
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
}: PDFLayoutEditorModalProps) {
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

    const { row, col } = overData as { row: number; col: number }
    let colSpan = 1
    let rowSpan = 1

    if (draggedItem?.type === 'palette-widget' && draggedItem.widgetType) {
      const def = WIDGET_DEFINITIONS[draggedItem.widgetType]
      colSpan = def.defaultColSpan
      rowSpan = def.defaultRowSpan
    } else if (draggedItem?.type === 'placed-widget' && draggedItem.widget) {
      colSpan = draggedItem.widget.colSpan
      rowSpan = draggedItem.widget.rowSpan
    }

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

      if (!canPlace(selectedPage, col, row, def.defaultColSpan, def.defaultRowSpan)) return

      const widget: LayoutWidget = {
        id: generateId(),
        type: widgetType,
        col,
        row,
        colSpan: def.defaultColSpan,
        rowSpan: def.defaultRowSpan,
      }
      dispatch({ type: 'ADD_WIDGET', pageId: selectedPage.id, widget })
      return
    }

    // ── Placed widget reposition ──
    if (activeData?.type === 'placed-widget') {
      const widget = activeData.widget as LayoutWidget
      if (!canPlace(selectedPage, col, row, widget.colSpan, widget.rowSpan, widget.id)) return
      dispatch({
        type: 'MOVE_WIDGET',
        pageId: selectedPage.id,
        widgetId: widget.id,
        col,
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

  // ── Keyboard Shortcuts ────────────────────────────────────────

  useEffect(() => {
    if (!isOpen) return

    const handler = (e: KeyboardEvent) => {
      // Undo
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        dispatch({ type: 'UNDO' })
      }
      // Redo
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && e.shiftKey) {
        e.preventDefault()
        dispatch({ type: 'REDO' })
      }
      // Delete selected widget
      if ((e.key === 'Delete' || e.key === 'Backspace') && state.selectedWidgetId && state.selectedPageId) {
        // Don't delete if focused on an input
        if ((e.target as HTMLElement).tagName === 'INPUT') return
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
        onClose()
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isOpen, state.selectedWidgetId, state.selectedPageId, onClose])

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
          onClose={onClose}
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
    </div>
  )
}
