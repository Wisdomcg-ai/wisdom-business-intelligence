'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import TemplatePicker from './TemplatePicker'
import { templateToSnapshot, type ProcessTemplate } from '../utils/templates'
import type { ProcessSnapshot } from '@/types/process-builder'

interface NewProcessModalProps {
  onClose: () => void
  onCreate: (name: string, description: string, snapshot?: ProcessSnapshot) => Promise<void>
}

export default function NewProcessModal({ onClose, onCreate }: NewProcessModalProps) {
  const [step, setStep] = useState<'name' | 'template'>('name')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [creating, setCreating] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setStep('template')
  }

  const handleCreateBlank = async () => {
    setCreating(true)
    await onCreate(name.trim(), description.trim())
    setCreating(false)
  }

  const handleTemplateSelect = async (template: ProcessTemplate) => {
    setCreating(true)
    const snapshot = templateToSnapshot(template)
    await onCreate(name.trim(), description.trim(), snapshot)
    setCreating(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">
            {step === 'name' ? 'New Process' : 'Choose a Template'}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {step === 'name' ? (
          <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Process Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-1 focus:ring-brand-orange focus:border-brand-orange outline-none"
                placeholder="e.g. Sales Enquiry Process, Client Onboarding"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-1 focus:ring-brand-orange focus:border-brand-orange outline-none resize-none"
                placeholder="What does this process cover? When does it start and end?"
              />
            </div>

            <div className="flex gap-3 justify-end pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!name.trim()}
                className="px-4 py-2 text-sm text-white bg-brand-orange rounded-lg hover:bg-brand-orange/90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </form>
        ) : (
          <div className="px-6 py-5">
            {creating ? (
              <div className="py-8 text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-orange mx-auto mb-3" />
                <p className="text-sm text-gray-600">Creating process...</p>
              </div>
            ) : (
              <TemplatePicker
                onSelect={handleTemplateSelect}
                onSkip={handleCreateBlank}
              />
            )}
          </div>
        )}
      </div>
    </div>
  )
}
