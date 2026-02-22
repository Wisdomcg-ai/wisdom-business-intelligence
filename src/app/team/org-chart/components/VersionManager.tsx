'use client'

import { useState, useRef, useEffect } from 'react'
import {
  ChevronDown,
  Plus,
  Edit3,
  Trash2,
  Check,
  X,
  GitBranch,
} from 'lucide-react'
import { OrgChartVersion } from '../types'

interface VersionManagerProps {
  versions: OrgChartVersion[]
  activeVersionId: string
  onSwitch: (id: string) => void
  onCreate: (label: string, date: string | null) => void
  onRename: (id: string, label: string) => void
  onDelete: (id: string) => void
}

export default function VersionManager({
  versions,
  activeVersionId,
  onSwitch,
  onCreate,
  onRename,
  onDelete,
}: VersionManagerProps) {
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const [newDate, setNewDate] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editLabel, setEditLabel] = useState('')
  const dropdownRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const activeVersion = versions.find((v) => v.id === activeVersionId) || versions[0]

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
        setCreating(false)
        setEditingId(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (creating && inputRef.current) inputRef.current.focus()
  }, [creating])

  const handleCreate = () => {
    if (newLabel.trim()) {
      onCreate(newLabel.trim(), newDate || null)
      setNewLabel('')
      setNewDate('')
      setCreating(false)
    }
  }

  const handleRename = (id: string) => {
    if (editLabel.trim()) {
      onRename(id, editLabel.trim())
      setEditingId(null)
    }
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-1.5 text-sm bg-white border border-gray-200 rounded-lg hover:border-gray-300 transition-colors"
      >
        <GitBranch className="w-3.5 h-3.5 text-gray-500" />
        <span className="font-medium text-gray-700">{activeVersion?.label}</span>
        <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
      </button>

      {open && (
        <div className="absolute top-full mt-1 left-0 w-72 bg-white rounded-lg shadow-xl border border-gray-200 z-50 overflow-hidden">
          {/* Version list */}
          <div className="max-h-60 overflow-y-auto py-1">
            {versions.map((v) => (
              <div
                key={v.id}
                className={`flex items-center justify-between px-3 py-2 hover:bg-gray-50 ${
                  v.id === activeVersionId ? 'bg-brand-orange/5' : ''
                }`}
              >
                {editingId === v.id ? (
                  <div className="flex items-center gap-1.5 flex-1">
                    <input
                      type="text"
                      value={editLabel}
                      onChange={(e) => setEditLabel(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleRename(v.id)}
                      className="flex-1 px-2 py-1 text-sm border border-gray-200 rounded focus:ring-1 focus:ring-brand-orange outline-none"
                    />
                    <button
                      onClick={() => handleRename(v.id)}
                      className="p-1 text-green-600 hover:bg-green-50 rounded"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="p-1 text-gray-400 hover:bg-gray-100 rounded"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <>
                    <button
                      onClick={() => {
                        onSwitch(v.id)
                        setOpen(false)
                      }}
                      className="flex items-center gap-2 flex-1 min-w-0 text-left"
                    >
                      <div
                        className={`w-2 h-2 rounded-full flex-shrink-0 ${
                          v.id === activeVersionId ? 'bg-brand-orange' : 'bg-gray-300'
                        }`}
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-700 truncate">
                          {v.label}
                        </p>
                        {v.date && (
                          <p className="text-[11px] text-gray-400">{v.date}</p>
                        )}
                      </div>
                    </button>
                    {v.id !== 'current' && (
                      <div className="flex items-center gap-0.5 flex-shrink-0">
                        <button
                          onClick={() => {
                            setEditingId(v.id)
                            setEditLabel(v.label)
                          }}
                          className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
                        >
                          <Edit3 className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => onDelete(v.id)}
                          className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>

          {/* Create new version */}
          <div className="border-t border-gray-100 p-2">
            {creating ? (
              <div className="space-y-2">
                <input
                  ref={inputRef}
                  type="text"
                  placeholder="Version name (e.g. FY27)"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                  className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-md focus:ring-1 focus:ring-brand-orange outline-none"
                />
                <input
                  type="date"
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-md focus:ring-1 focus:ring-brand-orange outline-none"
                />
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleCreate}
                    disabled={!newLabel.trim()}
                    className="flex-1 px-3 py-1.5 text-xs bg-brand-orange text-white rounded-md hover:bg-brand-orange-600 disabled:opacity-40 transition-colors"
                  >
                    Create Plan
                  </button>
                  <button
                    onClick={() => setCreating(false)}
                    className="px-3 py-1.5 text-xs border border-gray-200 text-gray-600 rounded-md hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setCreating(true)}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-brand-orange hover:bg-brand-orange/5 rounded-md transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Create Future Plan
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
