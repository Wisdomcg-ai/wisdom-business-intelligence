'use client'

import {
  Search,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Undo2,
  Redo2,
  Download,
  LayoutGrid,
  List,
  Image,
  LayoutTemplate,
} from 'lucide-react'
import { ViewMode, OrgChartVersion } from '../types'
import VersionManager from './VersionManager'
import DepartmentFilter from './DepartmentFilter'

interface OrgChartToolbarProps {
  search: string
  onSearchChange: (search: string) => void
  departments: string[]
  departmentColors: Record<string, string>
  departmentFilter: string | null
  onDepartmentFilter: (department: string | null) => void
  versions: OrgChartVersion[]
  activeVersionId: string
  onSwitchVersion: (id: string) => void
  onCreateVersion: (label: string, date: string | null) => void
  onRenameVersion: (id: string, label: string) => void
  onDeleteVersion: (id: string) => void
  viewMode: ViewMode
  onViewModeChange: (mode: ViewMode) => void
  zoom: number
  onZoomChange: (zoom: number) => void
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  onExportPDF: () => void
  onOpenTemplates?: () => void
}

export default function OrgChartToolbar({
  search,
  onSearchChange,
  departments,
  departmentColors,
  departmentFilter,
  onDepartmentFilter,
  versions,
  activeVersionId,
  onSwitchVersion,
  onCreateVersion,
  onRenameVersion,
  onDeleteVersion,
  viewMode,
  onViewModeChange,
  zoom,
  onZoomChange,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onExportPDF,
  onOpenTemplates,
}: OrgChartToolbarProps) {
  const zoomPercent = Math.round(zoom * 100)

  const handleFitToScreen = () => {
    onZoomChange(1)
  }

  const viewModes: { mode: ViewMode; icon: typeof LayoutGrid; label: string }[] = [
    { mode: 'detailed', icon: LayoutGrid, label: 'Detailed' },
    { mode: 'compact', icon: List, label: 'Compact' },
    { mode: 'photo', icon: Image, label: 'Photo' },
  ]

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2 bg-white border-b border-gray-200 flex-wrap">
      {/* Left: Search + department filter */}
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search people..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg w-48 focus:ring-1 focus:ring-brand-orange focus:border-brand-orange outline-none"
          />
        </div>
        <DepartmentFilter
          departments={departments}
          departmentColors={departmentColors}
          activeFilter={departmentFilter}
          onFilter={onDepartmentFilter}
        />
      </div>

      {/* Center: Version manager */}
      <VersionManager
        versions={versions}
        activeVersionId={activeVersionId}
        onSwitch={onSwitchVersion}
        onCreate={onCreateVersion}
        onRename={onRenameVersion}
        onDelete={onDeleteVersion}
      />

      {/* Right: View mode, zoom, undo/redo, export */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {/* View mode toggle */}
        <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
          {viewModes.map((vm) => {
            const Icon = vm.icon
            return (
              <button
                key={vm.mode}
                onClick={() => onViewModeChange(vm.mode)}
                title={vm.label}
                className={`p-1.5 rounded-md transition-colors ${
                  viewMode === vm.mode
                    ? 'bg-white shadow-sm text-gray-700'
                    : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
              </button>
            )
          })}
        </div>

        <div className="w-px h-5 bg-gray-200" />

        {/* Zoom controls */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => onZoomChange(Math.max(0.25, zoom - 0.1))}
            className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
            title="Zoom out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <span className="text-xs text-gray-500 w-10 text-center font-mono">
            {zoomPercent}%
          </span>
          <button
            onClick={() => onZoomChange(Math.min(2, zoom + 0.1))}
            className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
            title="Zoom in"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleFitToScreen}
            className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
            title="Fit to screen"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="w-px h-5 bg-gray-200" />

        {/* Undo/Redo */}
        <div className="flex items-center gap-0.5">
          <button
            onClick={onUndo}
            disabled={!canUndo}
            className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            title="Undo (Ctrl+Z)"
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onRedo}
            disabled={!canRedo}
            className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            title="Redo (Ctrl+Y)"
          >
            <Redo2 className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="w-px h-5 bg-gray-200" />

        {/* Templates */}
        {onOpenTemplates && (
          <button
            onClick={onOpenTemplates}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            title="Apply a template"
          >
            <LayoutTemplate className="w-3.5 h-3.5" />
            Templates
          </button>
        )}

        {/* Export */}
        <button
          onClick={onExportPDF}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-brand-navy text-white rounded-lg hover:bg-brand-navy-700 transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
          PDF
        </button>
      </div>
    </div>
  )
}
