'use client'

import { useState, useEffect, useRef } from 'react'
import { X, BookmarkPlus, Star } from 'lucide-react'

interface TemplateSaveModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (name: string, isDefault: boolean) => Promise<void>
  isSaving: boolean
}

export default function TemplateSaveModal({
  isOpen,
  onClose,
  onSave,
  isSaving,
}: TemplateSaveModalProps) {
  const [name, setName] = useState('')
  const [isDefault, setIsDefault] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isOpen) {
      setName('')
      setIsDefault(false)
      // Focus input after transition
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [isOpen])

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    await onSave(trimmed, isDefault)
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-sm bg-white rounded-xl shadow-2xl">
        {/* Header */}
        <div className="px-5 pt-5 pb-4 flex items-center justify-between border-b border-gray-100">
          <div className="flex items-center gap-2">
            <BookmarkPlus className="w-5 h-5 text-brand-orange" />
            <h2 className="text-base font-semibold text-gray-900">Save as Template</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Template name
            </label>
            <input
              ref={inputRef}
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Urban Road — Full Pack"
              maxLength={80}
              className="w-full rounded-lg border-gray-300 text-sm focus:border-brand-orange focus:ring-brand-orange"
            />
          </div>

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={isDefault}
              onChange={e => setIsDefault(e.target.checked)}
              className="mt-0.5 rounded border-gray-300 text-brand-orange focus:ring-brand-orange"
            />
            <div>
              <div className="flex items-center gap-1.5 text-sm font-medium text-gray-700">
                <Star className="w-3.5 h-3.5 text-amber-500" />
                Set as default template
              </div>
              <p className="text-xs text-gray-400 mt-0.5">
                Default template loads automatically when this client&apos;s report opens.
              </p>
            </div>
          </label>

          {/* Footer actions */}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving || !name.trim()}
              className="px-4 py-2 text-sm font-medium text-white bg-brand-orange hover:bg-brand-orange-600 rounded-lg transition-colors disabled:opacity-50"
            >
              {isSaving ? 'Saving…' : 'Save Template'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
