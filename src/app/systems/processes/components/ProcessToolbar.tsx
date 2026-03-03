'use client'

import { useState } from 'react'
import {
  ArrowLeft,
  Save,
  Undo2,
  Redo2,
  Bot,
  Download,
} from 'lucide-react'
import Link from 'next/link'
import type { ProcessSnapshot } from '@/types/process-builder'
import ExportDialog from './ExportDialog'

interface ProcessToolbarProps {
  name: string
  isDirty: boolean
  canUndo: boolean
  canRedo: boolean
  snapshot: ProcessSnapshot
  aiPanelOpen: boolean
  onNameChange: (name: string) => void
  onSave: () => void
  onUndo: () => void
  onRedo: () => void
  onToggleAI: () => void
}

export default function ProcessToolbar({
  name,
  isDirty,
  canUndo,
  canRedo,
  snapshot,
  aiPanelOpen,
  onNameChange,
  onSave,
  onUndo,
  onRedo,
  onToggleAI,
}: ProcessToolbarProps) {
  const [showExport, setShowExport] = useState(false)

  return (
    <>
      <div className="flex items-center gap-2 px-4 py-2 bg-white border-b border-gray-200 shrink-0">
        {/* Back */}
        <Link
          href="/systems/processes"
          className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500 shrink-0"
          title="Back to library"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>

        {/* Process name */}
        <input
          type="text"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="Process name…"
          className="flex-1 text-sm font-semibold border-0 bg-transparent focus:outline-none focus:ring-0 text-gray-800 placeholder:text-gray-300 min-w-0"
        />

        {/* Dirty indicator */}
        {isDirty && (
          <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" title="Unsaved changes" />
        )}

        {/* Save */}
        <button
          onClick={onSave}
          className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500 shrink-0"
          title="Save (auto-saves after 2s)"
        >
          <Save className="w-4 h-4" />
        </button>

        {/* Divider */}
        <div className="w-px h-5 bg-gray-200" />

        {/* Undo/Redo */}
        <button
          onClick={onUndo}
          disabled={!canUndo}
          className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500 disabled:opacity-30 shrink-0"
          title="Undo (Cmd+Z)"
        >
          <Undo2 className="w-4 h-4" />
        </button>
        <button
          onClick={onRedo}
          disabled={!canRedo}
          className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500 disabled:opacity-30 shrink-0"
          title="Redo (Cmd+Shift+Z)"
        >
          <Redo2 className="w-4 h-4" />
        </button>

        {/* Divider */}
        <div className="w-px h-5 bg-gray-200" />

        {/* AI toggle */}
        <button
          onClick={onToggleAI}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors shrink-0 ${
            aiPanelOpen
              ? 'bg-purple-100 text-purple-700 border border-purple-200'
              : 'text-gray-500 hover:bg-gray-100 border border-transparent'
          }`}
          title="AI System Mapper"
        >
          <Bot className="w-3.5 h-3.5" />
          AI Mapper
        </button>

        {/* Export */}
        <button
          onClick={() => setShowExport(true)}
          disabled={snapshot.steps.length === 0}
          className="flex items-center gap-1.5 px-2.5 py-1.5 bg-brand-navy text-white rounded-lg text-xs font-medium hover:bg-brand-navy/90 disabled:opacity-40 transition-colors shrink-0"
        >
          <Download className="w-3.5 h-3.5" />
          Export
        </button>
      </div>

      {/* Export dialog */}
      {showExport && (
        <ExportDialog
          snapshot={snapshot}
          processName={name}
          onClose={() => setShowExport(false)}
        />
      )}
    </>
  )
}
