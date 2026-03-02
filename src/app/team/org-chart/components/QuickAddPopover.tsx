'use client'

import { useState, useRef, useEffect } from 'react'
import { Plus, X } from 'lucide-react'

interface QuickAddPopoverProps {
  parentId: string
  position: { x: number; y: number }
  onAdd: (name: string, title: string) => void
  onClose: () => void
}

export default function QuickAddPopover({
  parentId,
  position,
  onAdd,
  onClose,
}: QuickAddPopoverProps) {
  const [name, setName] = useState('')
  const [title, setTitle] = useState('')
  const nameRef = useRef<HTMLInputElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    nameRef.current?.focus()
  }, [])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onClose])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (name.trim()) {
      onAdd(name.trim(), title.trim() || 'Team Member')
    }
  }

  return (
    <div
      ref={popoverRef}
      className="absolute z-50 bg-white rounded-lg shadow-xl border border-gray-200 p-3 w-56"
      style={{
        left: position.x,
        top: position.y,
        transform: 'translate(-50%, 8px)',
      }}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-gray-500">Add Direct Report</span>
        <button
          onClick={onClose}
          className="p-0.5 hover:bg-gray-100 rounded text-gray-400"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
      <form onSubmit={handleSubmit} className="space-y-2">
        <input
          ref={nameRef}
          type="text"
          placeholder="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-md focus:ring-1 focus:ring-brand-orange focus:border-brand-orange outline-none"
        />
        <input
          type="text"
          placeholder="Job title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-md focus:ring-1 focus:ring-brand-orange focus:border-brand-orange outline-none"
        />
        <button
          type="submit"
          disabled={!name.trim()}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 bg-brand-orange text-white text-sm rounded-md hover:bg-brand-orange-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Add
        </button>
      </form>
    </div>
  )
}
