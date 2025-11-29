'use client'

import { useState } from 'react'
import { X, Send, Loader2 } from 'lucide-react'

interface AskCoachModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (question: string, priority: 'normal' | 'urgent') => Promise<void>
}

export default function AskCoachModal({ isOpen, onClose, onSubmit }: AskCoachModalProps) {
  const [question, setQuestion] = useState('')
  const [priority, setPriority] = useState<'normal' | 'urgent'>('normal')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!isOpen) return null

  const handleSubmit = async () => {
    if (!question.trim()) {
      setError('Please enter a question')
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      await onSubmit(question.trim(), priority)
      setQuestion('')
      setPriority('normal')
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send question')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleClose = () => {
    if (!isSubmitting) {
      setQuestion('')
      setPriority('normal')
      setError(null)
      onClose()
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 z-40"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900">Ask Your Coach</h2>
            <button
              onClick={handleClose}
              disabled={isSubmitting}
              className="text-gray-400 hover:text-gray-500 disabled:opacity-50"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6">
            <div className="mb-4">
              <label htmlFor="question" className="block text-sm font-medium text-gray-700 mb-2">
                What's on your mind?
              </label>
              <textarea
                id="question"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Type your question here..."
                rows={6}
                disabled={isSubmitting}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent disabled:opacity-50 disabled:bg-gray-50"
              />
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Priority
              </label>
              <div className="flex gap-4">
                <label className="flex items-center cursor-pointer">
                  <input
                    type="radio"
                    value="normal"
                    checked={priority === 'normal'}
                    onChange={(e) => setPriority(e.target.value as 'normal' | 'urgent')}
                    disabled={isSubmitting}
                    className="mr-2"
                  />
                  <span className="text-sm text-gray-700">Normal</span>
                </label>
                <label className="flex items-center cursor-pointer">
                  <input
                    type="radio"
                    value="urgent"
                    checked={priority === 'urgent'}
                    onChange={(e) => setPriority(e.target.value as 'normal' | 'urgent')}
                    disabled={isSubmitting}
                    className="mr-2"
                  />
                  <span className="text-sm text-gray-700">Urgent</span>
                </label>
              </div>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-800">{error}</p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 px-6 py-4 bg-gray-50 border-t border-gray-200">
            <button
              onClick={handleClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={isSubmitting || !question.trim()}
              className="px-4 py-2 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Send Question
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
