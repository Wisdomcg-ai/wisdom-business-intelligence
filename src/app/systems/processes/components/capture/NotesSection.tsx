'use client'

import { useState } from 'react'
import { Plus, Trash2, StickyNote } from 'lucide-react'
import type { StickyNote as StickyNoteType } from '@/types/process-builder'
import { STICKY_NOTE_COLORS } from '@/types/process-builder'
import type { BuilderAction } from '../../types'

interface NotesSectionProps {
  notes: StickyNoteType[]
  dispatch: React.Dispatch<BuilderAction>
}

export default function NotesSection({ notes, dispatch }: NotesSectionProps) {
  const [input, setInput] = useState('')
  const [colorIdx, setColorIdx] = useState(0)

  const handleAdd = () => {
    if (!input.trim()) return
    dispatch({
      type: 'ADD_NOTE',
      payload: {
        id: crypto.randomUUID(),
        text: input.trim(),
        color: STICKY_NOTE_COLORS[colorIdx],
      },
    })
    setInput('')
  }

  if (notes.length === 0 && !input) {
    return null
  }

  return (
    <div className="border border-gray-200 rounded-xl bg-white overflow-hidden">
      <div className="px-3 py-2 flex items-center gap-2 border-b border-gray-100">
        <StickyNote className="w-4 h-4 text-amber-500" />
        <span className="text-sm font-semibold text-gray-700">Brainstorm Notes</span>
        <span className="text-xs text-gray-400 ml-auto">{notes.length}</span>
      </div>

      <div className="px-3 py-2.5 space-y-1.5">
        {notes.map((note) => (
          <div
            key={note.id}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-md text-sm group"
            style={{ backgroundColor: note.color }}
          >
            <span className="flex-1 text-gray-700">{note.text}</span>
            <button
              onClick={() => dispatch({ type: 'DELETE_NOTE', payload: note.id })}
              className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-white/50 rounded text-gray-400 transition-opacity"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        ))}

        {/* Add note */}
        <div className="flex items-center gap-1.5">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            placeholder="Add a note…"
            className="flex-1 text-sm border border-gray-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-orange-300 focus:border-orange-300"
          />
          <button
            onClick={handleAdd}
            disabled={!input.trim()}
            className="p-1.5 bg-amber-500 text-white rounded-md hover:bg-amber-600 disabled:opacity-40 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Color picker */}
        <div className="flex items-center gap-1">
          {STICKY_NOTE_COLORS.map((color, i) => (
            <button
              key={color}
              onClick={() => setColorIdx(i)}
              className={`w-4 h-4 rounded-full border-2 transition-colors ${
                colorIdx === i ? 'border-gray-500 scale-110' : 'border-transparent'
              }`}
              style={{ backgroundColor: color }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
