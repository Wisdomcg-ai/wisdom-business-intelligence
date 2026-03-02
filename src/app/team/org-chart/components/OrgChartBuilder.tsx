'use client'

import { useReducer, useMemo, useCallback, useEffect, useState, useRef } from 'react'
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
} from '@dnd-kit/core'
import {
  OrgChartData,
  OrgChartPerson,
  VersionDiffResult,
} from '../types'
import {
  orgChartReducer,
  createInitialState,
  OrgChartAction,
} from '../utils/org-chart-reducer'
import { calculateTreeLayout } from '../utils/tree-layout'
import {
  searchPeople,
  getAllDepartments,
  findPerson,
  getDescendantIds,
  getNextSortOrder,
  getChildren,
  getDirectReportCount,
} from '../utils/tree-helpers'
import { getAnalytics } from '../utils/org-chart-analytics'
import { compareVersions, getDiffStatus } from '../utils/version-diff'
import { generateOrgChartPDF, PDFExportOptions } from '../utils/org-chart-pdf'
import OrgChartToolbar from './OrgChartToolbar'
import OrgChartCanvas from './OrgChartCanvas'
import PersonDetailPanel from './PersonDetailPanel'
import QuickAddPopover from './QuickAddPopover'
import NodeContextMenu from './NodeContextMenu'
import AnalyticsBar from './AnalyticsBar'
import EmptyState from './EmptyState'
import TemplatePickerModal from './TemplatePickerModal'
import { OrgChartTemplate } from '../utils/templates'
import PDFExportDialog from './PDFExportDialog'

interface OrgChartBuilderProps {
  initialData: OrgChartData | null
  onDataChange: (data: OrgChartData) => void
}

export default function OrgChartBuilder({
  initialData,
  onDataChange,
}: OrgChartBuilderProps) {
  const [state, dispatch] = useReducer(
    orgChartReducer,
    initialData || undefined,
    createInitialState
  )

  // Drag state
  const [dragPersonId, setDragPersonId] = useState<string | null>(null)

  // Quick add popover
  const [quickAdd, setQuickAdd] = useState<{
    parentId: string
    position: { x: number; y: number }
  } | null>(null)

  // Context menu
  const [contextMenu, setContextMenu] = useState<{
    personId: string
    position: { x: number; y: number }
  } | null>(null)

  // Template picker modal
  const [showTemplatePicker, setShowTemplatePicker] = useState(false)

  // PDF export dialog
  const [showPDFDialog, setShowPDFDialog] = useState(false)

  // DnD sensor
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

  // Sync loaded data into reducer when initialData arrives after mount
  const initialDataRef = useRef<string | null>(null)
  useEffect(() => {
    if (initialData) {
      const key = JSON.stringify(initialData)
      if (key !== initialDataRef.current) {
        initialDataRef.current = key
        dispatch({ type: 'SET_DATA', payload: initialData })
      }
    }
  }, [initialData])

  // Notify parent when data changes
  useEffect(() => {
    if (state.isDirty) {
      onDataChange(state.data)
    }
  }, [state.data, state.isDirty, onDataChange])

  // Active version
  const activeVersion = useMemo(
    () =>
      state.data.versions.find((v) => v.id === state.data.activeVersionId) ||
      state.data.versions[0],
    [state.data.versions, state.data.activeVersionId]
  )

  const people = activeVersion?.people || []

  // Tree layout
  const layout = useMemo(
    () => calculateTreeLayout(people, state.viewMode, state.collapsedIds),
    [people, state.viewMode, state.collapsedIds]
  )

  // Search / filter
  const matchingIds = useMemo(() => {
    if (state.search) {
      return searchPeople(people, state.search)
    }
    if (state.departmentFilter) {
      const filtered = new Set<string>()
      for (const p of people) {
        if (p.department === state.departmentFilter) {
          filtered.add(p.id)
        }
      }
      return filtered
    }
    return null
  }, [people, state.search, state.departmentFilter])

  // Departments
  const departments = useMemo(() => getAllDepartments(people), [people])

  // Analytics
  const analytics = useMemo(() => getAnalytics(people), [people])

  // Version diff
  const diff: VersionDiffResult | null = useMemo(() => {
    if (state.data.activeVersionId === 'current') return null
    const currentVersion = state.data.versions.find((v) => v.id === 'current')
    if (!currentVersion) return null
    return compareVersions(currentVersion, activeVersion)
  }, [state.data.activeVersionId, state.data.versions, activeVersion])

  // Selected person
  const selectedPerson = useMemo(
    () =>
      state.selectedPersonId
        ? findPerson(people, state.selectedPersonId) || null
        : null,
    [people, state.selectedPersonId]
  )

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Don't handle when typing in inputs
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        dispatch({ type: 'UNDO' })
      } else if (
        ((e.ctrlKey || e.metaKey) && e.key === 'y') ||
        ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'z')
      ) {
        e.preventDefault()
        dispatch({ type: 'REDO' })
      } else if (e.key === 'Escape') {
        dispatch({ type: 'SELECT_PERSON', payload: null })
        dispatch({ type: 'TOGGLE_EDIT_PANEL', payload: false })
        setQuickAdd(null)
        setContextMenu(null)
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (state.selectedPersonId) {
          dispatch({ type: 'DELETE_PERSON', payload: { id: state.selectedPersonId } })
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [state.selectedPersonId])

  // Drag handlers
  const handleDragStart = (event: DragStartEvent) => {
    const personId = event.active.data?.current?.personId as string
    if (personId) setDragPersonId(personId)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    setDragPersonId(null)
    const draggedId = event.active.data?.current?.personId as string
    const dropTargetId = event.over?.data?.current?.personId as string

    if (!draggedId || !dropTargetId || draggedId === dropTargetId) return

    // Prevent circular reparenting
    const descendants = getDescendantIds(people, draggedId)
    if (descendants.has(dropTargetId)) return

    dispatch({
      type: 'REPARENT_PERSON',
      payload: { personId: draggedId, newParentId: dropTargetId },
    })
  }

  // Stable zoom callback (avoids new reference every render for OrgChartCanvas)
  const handleZoom = useCallback(
    (z: number) => dispatch({ type: 'SET_ZOOM', payload: z }),
    []
  )

  // Person creation
  const createPerson = useCallback(
    (
      name: string,
      title: string,
      parentId: string | null,
      extra?: Partial<OrgChartPerson>
    ) => {
      const person: OrgChartPerson = {
        id: `person-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name,
        title,
        department: extra?.department || '',
        employmentType: extra?.employmentType || 'full-time',
        startDate: extra?.startDate || '',
        salary: extra?.salary || 0,
        parentId,
        sortOrder: getNextSortOrder(people, parentId),
        isVacant: extra?.isVacant || false,
        ...extra,
      }
      dispatch({ type: 'ADD_PERSON', payload: { person } })
      dispatch({ type: 'SELECT_PERSON', payload: person.id })
      return person.id
    },
    [people]
  )

  // Quick-start handler
  const handleQuickStart = () => {
    createPerson('Owner', 'Owner / CEO', null)
  }

  // Quick add handlers
  const handleAddReport = (
    parentId: string,
    position: { x: number; y: number }
  ) => {
    setQuickAdd({ parentId, position })
    setContextMenu(null)
  }

  const handleQuickAddSubmit = (name: string, title: string) => {
    if (quickAdd) {
      createPerson(name, title, quickAdd.parentId)
      setQuickAdd(null)
    }
  }

  // Context menu handlers
  const handleContextMenu = (
    personId: string,
    position: { x: number; y: number }
  ) => {
    setContextMenu({ personId, position })
    setQuickAdd(null)
  }

  // PDF export
  const handleExportPDF = (options?: PDFExportOptions) => {
    const doc = generateOrgChartPDF(state.data, undefined, options)
    const versionLabel = activeVersion?.label || 'org-chart'
    doc.save(`${versionLabel.replace(/\s+/g, '-').toLowerCase()}-org-chart.pdf`)
    setShowPDFDialog(false)
  }

  // Template handlers
  const handleApplyTemplateAsVersion = useCallback(
    (template: OrgChartTemplate, label: string) => {
      dispatch({
        type: 'APPLY_TEMPLATE_AS_VERSION',
        payload: { template, versionLabel: label },
      })
    },
    []
  )

  const handleMergeTemplate = useCallback(
    (template: OrgChartTemplate) => {
      dispatch({ type: 'MERGE_TEMPLATE', payload: { template } })
    },
    []
  )

  // For empty state: apply template directly to the current version
  const handleEmptyStateTemplate = useCallback(
    (template: OrgChartTemplate) => {
      dispatch({ type: 'MERGE_TEMPLATE', payload: { template } })
    },
    []
  )

  // Empty state
  if (people.length === 0) {
    return (
      <div className="flex flex-col h-full">
        <OrgChartToolbar
          search={state.search}
          onSearchChange={(s) => dispatch({ type: 'SET_SEARCH', payload: s })}
          departments={[]}
          departmentColors={state.data.settings.departmentColors}
          departmentFilter={null}
          onDepartmentFilter={() => {}}
          versions={state.data.versions}
          activeVersionId={state.data.activeVersionId}
          onSwitchVersion={(id) => dispatch({ type: 'SWITCH_VERSION', payload: id })}
          onCreateVersion={(label, date) =>
            dispatch({
              type: 'CREATE_VERSION',
              payload: {
                id: `ver-${Date.now()}`,
                label,
                date,
              },
            })
          }
          onRenameVersion={(id, label) =>
            dispatch({ type: 'RENAME_VERSION', payload: { id, label } })
          }
          onDeleteVersion={(id) => dispatch({ type: 'DELETE_VERSION', payload: id })}
          viewMode={state.viewMode}
          onViewModeChange={(mode) =>
            dispatch({ type: 'SET_VIEW_MODE', payload: mode })
          }
          zoom={state.zoom}
          onZoomChange={(z) => dispatch({ type: 'SET_ZOOM', payload: z })}
          canUndo={state.historyIndex > 0}
          canRedo={state.historyIndex < state.history.length - 1}
          onUndo={() => dispatch({ type: 'UNDO' })}
          onRedo={() => dispatch({ type: 'REDO' })}
          onExportPDF={() => setShowPDFDialog(true)}
        />
        <EmptyState onQuickStart={handleQuickStart} onApplyTemplate={handleEmptyStateTemplate} />

        {/* PDF Export Dialog */}
        {showPDFDialog && (
          <PDFExportDialog
            defaultShowSalaries={state.data.settings.showSalaries}
            onExport={handleExportPDF}
            onClose={() => setShowPDFDialog(false)}
          />
        )}
      </div>
    )
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex flex-col h-full">
        <OrgChartToolbar
          search={state.search}
          onSearchChange={(s) => dispatch({ type: 'SET_SEARCH', payload: s })}
          departments={departments}
          departmentColors={state.data.settings.departmentColors}
          departmentFilter={state.departmentFilter}
          onDepartmentFilter={(d) =>
            dispatch({ type: 'SET_DEPARTMENT_FILTER', payload: d })
          }
          versions={state.data.versions}
          activeVersionId={state.data.activeVersionId}
          onSwitchVersion={(id) =>
            dispatch({ type: 'SWITCH_VERSION', payload: id })
          }
          onCreateVersion={(label, date) =>
            dispatch({
              type: 'CREATE_VERSION',
              payload: {
                id: `ver-${Date.now()}`,
                label,
                date,
              },
            })
          }
          onRenameVersion={(id, label) =>
            dispatch({ type: 'RENAME_VERSION', payload: { id, label } })
          }
          onDeleteVersion={(id) =>
            dispatch({ type: 'DELETE_VERSION', payload: id })
          }
          viewMode={state.viewMode}
          onViewModeChange={(mode) =>
            dispatch({ type: 'SET_VIEW_MODE', payload: mode })
          }
          zoom={state.zoom}
          onZoomChange={(z) => dispatch({ type: 'SET_ZOOM', payload: z })}
          canUndo={state.historyIndex > 0}
          canRedo={state.historyIndex < state.history.length - 1}
          onUndo={() => dispatch({ type: 'UNDO' })}
          onRedo={() => dispatch({ type: 'REDO' })}
          onExportPDF={() => setShowPDFDialog(true)}
          onOpenTemplates={() => setShowTemplatePicker(true)}
        />

        <div className="relative flex flex-1 min-h-0">
          {/* Canvas */}
          <OrgChartCanvas
            people={people}
            positions={layout.positions}
            totalWidth={layout.totalWidth}
            totalHeight={layout.totalHeight}
            viewMode={state.viewMode}
            zoom={state.zoom}
            selectedPersonId={state.selectedPersonId}
            collapsedIds={state.collapsedIds}
            departmentColors={state.data.settings.departmentColors}
            matchingIds={matchingIds}
            diff={diff}
            onSelectPerson={(id) =>
              dispatch({ type: 'SELECT_PERSON', payload: id })
            }
            onToggleCollapse={(id) =>
              dispatch({ type: 'TOGGLE_COLLAPSE', payload: id })
            }
            onAddReport={handleAddReport}
            onContextMenu={handleContextMenu}
            onZoom={handleZoom}
          />

          {/* Floating Detail Panel */}
          {state.editPanelOpen && selectedPerson && (
            <div className="absolute top-3 right-3 bottom-3 z-20 animate-in slide-in-from-right-4 duration-200">
              <PersonDetailPanel
                person={selectedPerson}
                existingDepartments={departments}
                onUpdate={(updates) =>
                  dispatch({
                    type: 'UPDATE_PERSON',
                    payload: { id: selectedPerson.id, updates },
                  })
                }
                onDelete={() =>
                  dispatch({
                    type: 'DELETE_PERSON',
                    payload: { id: selectedPerson.id },
                  })
                }
                onClose={() =>
                  dispatch({ type: 'TOGGLE_EDIT_PANEL', payload: false })
                }
              />
            </div>
          )}
        </div>

        {/* Analytics bar */}
        <AnalyticsBar
          analytics={analytics}
          departmentColors={state.data.settings.departmentColors}
          diff={diff}
        />

        {/* Quick Add Popover */}
        {quickAdd && (
          <QuickAddPopover
            parentId={quickAdd.parentId}
            position={quickAdd.position}
            onAdd={handleQuickAddSubmit}
            onClose={() => setQuickAdd(null)}
          />
        )}

        {/* Context Menu */}
        {contextMenu && (
          <NodeContextMenu
            personId={contextMenu.personId}
            position={contextMenu.position}
            onEdit={() => {
              dispatch({ type: 'SELECT_PERSON', payload: contextMenu.personId })
              dispatch({ type: 'TOGGLE_EDIT_PANEL', payload: true })
            }}
            onAddReport={() => {
              handleAddReport(contextMenu.personId, contextMenu.position)
            }}
            onDuplicate={() => {
              dispatch({
                type: 'DUPLICATE_PERSON',
                payload: {
                  id: contextMenu.personId,
                  newId: `person-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                },
              })
            }}
            onDelete={() => {
              dispatch({
                type: 'DELETE_PERSON',
                payload: { id: contextMenu.personId },
              })
            }}
            onClose={() => setContextMenu(null)}
          />
        )}

        {/* Template Picker Modal */}
        {showTemplatePicker && (
          <TemplatePickerModal
            onApplyAsVersion={handleApplyTemplateAsVersion}
            onMergeIntoCurrent={handleMergeTemplate}
            onClose={() => setShowTemplatePicker(false)}
          />
        )}

        {/* PDF Export Dialog */}
        {showPDFDialog && (
          <PDFExportDialog
            defaultShowSalaries={state.data.settings.showSalaries}
            onExport={handleExportPDF}
            onClose={() => setShowPDFDialog(false)}
          />
        )}
      </div>
    </DndContext>
  )
}
