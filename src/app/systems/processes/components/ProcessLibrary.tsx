'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, FileText, Trash2, Clock, GitBranch, Layers } from 'lucide-react'
import NewProcessModal from './NewProcessModal'
import type { ProcessDiagramRecord } from '@/types/process-builder'

interface ProcessLibraryProps {
  processes: ProcessDiagramRecord[]
  onCreate: (name: string, description: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
}

export default function ProcessLibrary({ processes, onCreate, onDelete }: ProcessLibraryProps) {
  const router = useRouter()
  const [showNewModal, setShowNewModal] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const handleConfirmDelete = async () => {
    if (deleteId) {
      await onDelete(deleteId)
      setDeleteId(null)
    }
  }

  if (processes.length === 0) {
    return (
      <>
        <div className="max-w-2xl mx-auto py-20 px-6 text-center">
          <div className="w-20 h-20 bg-brand-navy/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <GitBranch className="w-10 h-10 text-brand-navy" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-3">
            Map your first process
          </h2>
          <p className="text-gray-600 mb-2 max-w-md mx-auto">
            Document how work really gets done in your business. Start with sticky notes,
            organise into swimlanes, and produce professional diagrams.
          </p>
          <p className="text-sm text-gray-500 mb-8 max-w-md mx-auto">
            Think of a process you do regularly — sales enquiry, onboarding a client,
            completing a project — and map every step.
          </p>
          <button
            onClick={() => setShowNewModal(true)}
            className="inline-flex items-center gap-2 px-6 py-3 bg-brand-orange text-white rounded-lg font-medium hover:bg-brand-orange/90 transition-colors"
          >
            <Plus className="w-5 h-5" />
            New Process
          </button>
        </div>

        {showNewModal && (
          <NewProcessModal
            onClose={() => setShowNewModal(false)}
            onCreate={onCreate}
          />
        )}
      </>
    )
  }

  return (
    <>
      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Your Processes</h2>
            <p className="text-sm text-gray-500">{processes.length} process{processes.length !== 1 ? 'es' : ''}</p>
          </div>
          <button
            onClick={() => setShowNewModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-brand-orange text-white rounded-lg text-sm font-medium hover:bg-brand-orange/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Process
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {processes.map((process) => (
            <div
              key={process.id}
              onClick={() => router.push(`/systems/processes/${process.id}`)}
              className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md hover:border-brand-orange/30 transition-all cursor-pointer group"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 bg-brand-navy/10 rounded-lg flex items-center justify-center flex-shrink-0">
                  <FileText className="w-5 h-5 text-brand-navy" />
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setDeleteId(process.id)
                  }}
                  className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              <h3 className="font-semibold text-gray-900 mb-1 truncate">{process.name}</h3>
              {process.description && (
                <p className="text-sm text-gray-500 mb-3 line-clamp-2">{process.description}</p>
              )}

              <div className="flex items-center gap-3 text-xs text-gray-400">
                <span className="flex items-center gap-1">
                  <Layers className="w-3 h-3" />
                  {process.step_count} steps
                </span>
                <span className="flex items-center gap-1">
                  <GitBranch className="w-3 h-3" />
                  {process.swimlane_count} lanes
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {new Date(process.updated_at).toLocaleDateString()}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {showNewModal && (
        <NewProcessModal
          onClose={() => setShowNewModal(false)}
          onCreate={onCreate}
        />
      )}

      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl p-6 max-w-sm mx-4 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Delete Process?</h3>
            <p className="text-sm text-gray-600 mb-4">
              This will permanently delete this process and all its steps. This cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDeleteId(null)}
                className="px-4 py-2 text-sm text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                className="px-4 py-2 text-sm text-white bg-red-600 rounded-lg hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
