'use client'

import { Save, RotateCcw, X, Undo2, Redo2, Loader2 } from 'lucide-react'

interface EditorToolbarProps {
  isDirty: boolean
  isSaving: boolean
  canUndo: boolean
  canRedo: boolean
  onSave: () => void
  onReset: () => void
  onClose: () => void
  onUndo: () => void
  onRedo: () => void
}

export default function EditorToolbar({
  isDirty,
  isSaving,
  canUndo,
  canRedo,
  onSave,
  onReset,
  onClose,
  onUndo,
  onRedo,
}: EditorToolbarProps) {
  return (
    <div className="h-14 bg-brand-navy flex items-center justify-between px-4 shrink-0">
      <div className="flex items-center gap-3">
        <h2 className="text-white font-semibold text-lg">PDF Layout Editor</h2>
        {isDirty && (
          <span className="text-xs text-amber-300 bg-amber-900/30 px-2 py-0.5 rounded">
            Unsaved changes
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={onUndo}
          disabled={!canUndo}
          className="p-2 text-white/70 hover:text-white hover:bg-white/10 rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title="Undo (Ctrl+Z)"
        >
          <Undo2 className="w-4 h-4" />
        </button>
        <button
          onClick={onRedo}
          disabled={!canRedo}
          className="p-2 text-white/70 hover:text-white hover:bg-white/10 rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title="Redo (Ctrl+Shift+Z)"
        >
          <Redo2 className="w-4 h-4" />
        </button>

        <div className="w-px h-6 bg-white/20 mx-1" />

        <button
          onClick={onReset}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-white/70 hover:text-white hover:bg-white/10 rounded transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Reset
        </button>

        <button
          onClick={onSave}
          disabled={!isDirty || isSaving}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-brand-orange hover:bg-brand-orange-600 rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Save Layout
        </button>

        <button
          onClick={onClose}
          className="p-2 text-white/70 hover:text-white hover:bg-white/10 rounded transition-colors ml-1"
          title="Close"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
    </div>
  )
}
