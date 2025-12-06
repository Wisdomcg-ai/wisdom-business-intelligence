'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { X, Calendar, Clock, User } from 'lucide-react'

interface Business {
  id: string
  business_name: string
}

interface CreateSessionModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  preselectedBusinessId?: string
}

export default function CreateSessionModal({
  isOpen,
  onClose,
  onSuccess,
  preselectedBusinessId
}: CreateSessionModalProps) {
  const supabase = createClient()
  const [businesses, setBusinesses] = useState<Business[]>([])
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    business_id: preselectedBusinessId || '',
    title: '',
    scheduled_at: '',
    duration_minutes: 60
  })

  useEffect(() => {
    if (isOpen) {
      loadBusinesses()
      if (preselectedBusinessId) {
        setFormData(prev => ({ ...prev, business_id: preselectedBusinessId }))
      }
    }
  }, [isOpen, preselectedBusinessId])

  async function loadBusinesses() {
    const res = await fetch('/api/coach/clients')
    const data = await res.json()
    if (data.success) {
      setBusinesses(data.clients)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_id: formData.business_id,
          title: formData.title,
          scheduled_at: new Date(formData.scheduled_at).toISOString(),
          duration_minutes: formData.duration_minutes
        })
      })

      const data = await res.json()

      if (data.success) {
        onSuccess()
        onClose()
        resetForm()
      } else {
        alert('Failed to create session: ' + data.error)
      }
    } catch (error) {
      console.error('Error creating session:', error)
      alert('Failed to create session')
    } finally {
      setLoading(false)
    }
  }

  function resetForm() {
    setFormData({
      business_id: preselectedBusinessId || '',
      title: '',
      scheduled_at: '',
      duration_minutes: 60
    })
  }

  function handleClose() {
    resetForm()
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-semibold text-gray-900">Schedule New Session</h3>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Client Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Client *
            </label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <select
                value={formData.business_id}
                onChange={(e) => setFormData({ ...formData, business_id: e.target.value })}
                required
                disabled={!!preselectedBusinessId}
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-transparent disabled:bg-gray-100"
              >
                <option value="">Select a client...</option>
                {businesses.map((business) => (
                  <option key={business.id} value={business.id}>
                    {business.business_name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Session Title */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Session Title *
            </label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="e.g., Monthly Strategy Review"
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-transparent"
            />
          </div>

          {/* Date & Time */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Date & Time *
            </label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="datetime-local"
                value={formData.scheduled_at}
                onChange={(e) => setFormData({ ...formData, scheduled_at: e.target.value })}
                required
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-transparent"
              />
            </div>
          </div>

          {/* Duration */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Duration (minutes) *
            </label>
            <div className="relative">
              <Clock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <select
                value={formData.duration_minutes}
                onChange={(e) => setFormData({ ...formData, duration_minutes: parseInt(e.target.value) })}
                required
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-transparent"
              >
                <option value={30}>30 minutes</option>
                <option value={45}>45 minutes</option>
                <option value={60}>60 minutes</option>
                <option value={90}>90 minutes</option>
                <option value={120}>120 minutes</option>
              </select>
            </div>
          </div>

          {/* Buttons */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={handleClose}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 bg-brand-orange text-white rounded-lg shadow-sm hover:bg-brand-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Creating...' : 'Create Session'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
