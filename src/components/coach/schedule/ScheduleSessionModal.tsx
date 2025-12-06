'use client'

import { useState, useEffect } from 'react'
import {
  X,
  Calendar,
  Clock,
  Video,
  Phone,
  MapPin,
  Building2,
  Search,
  Loader2,
  Check
} from 'lucide-react'

interface Client {
  id: string
  businessName: string
  industry?: string
}

interface ScheduleSessionModalProps {
  isOpen: boolean
  onClose: () => void
  onSchedule: (data: {
    businessId: string
    date: string
    time: string
    duration: number
    type: 'video' | 'phone' | 'in-person'
    notes?: string
  }) => Promise<void>
  clients: Client[]
  initialDate?: Date
  initialHour?: number
  preselectedClientId?: string
}

export function ScheduleSessionModal({
  isOpen,
  onClose,
  onSchedule,
  clients,
  initialDate,
  initialHour,
  preselectedClientId
}: ScheduleSessionModalProps) {
  const [step, setStep] = useState(1)
  const [saving, setSaving] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  // Form state
  const [selectedClientId, setSelectedClientId] = useState(preselectedClientId || '')
  const [date, setDate] = useState(initialDate?.toISOString().split('T')[0] || new Date().toISOString().split('T')[0])
  const [time, setTime] = useState(initialHour ? `${String(initialHour).padStart(2, '0')}:00` : '09:00')
  const [duration, setDuration] = useState(60)
  const [sessionType, setSessionType] = useState<'video' | 'phone' | 'in-person'>('video')
  const [notes, setNotes] = useState('')

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setStep(preselectedClientId ? 2 : 1)
      setSelectedClientId(preselectedClientId || '')
      setDate(initialDate?.toISOString().split('T')[0] || new Date().toISOString().split('T')[0])
      setTime(initialHour ? `${String(initialHour).padStart(2, '0')}:00` : '09:00')
      setDuration(60)
      setSessionType('video')
      setNotes('')
      setSearchQuery('')
    }
  }, [isOpen, initialDate, initialHour, preselectedClientId])

  if (!isOpen) return null

  const filteredClients = clients.filter(client =>
    client.businessName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    client.industry?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const selectedClient = clients.find(c => c.id === selectedClientId)

  const handleSchedule = async () => {
    if (!selectedClientId || !date || !time) return

    setSaving(true)
    try {
      await onSchedule({
        businessId: selectedClientId,
        date,
        time,
        duration,
        type: sessionType,
        notes: notes || undefined
      })
      onClose()
    } catch (error) {
      console.error('Error scheduling session:', error)
    } finally {
      setSaving(false)
    }
  }

  const timeSlots = Array.from({ length: 24 }, (_, i) => {
    const hour = String(i).padStart(2, '0')
    return `${hour}:00`
  }).filter(t => {
    const hour = parseInt(t)
    return hour >= 7 && hour <= 19 // 7 AM to 7 PM
  })

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        {/* Backdrop */}
        <div
          className="fixed inset-0 bg-black/50 transition-opacity"
          onClick={onClose}
        />

        {/* Modal */}
        <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg">
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Schedule Session</h2>
              <p className="text-sm text-gray-500">
                Step {step} of 2: {step === 1 ? 'Select Client' : 'Session Details'}
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Step 1: Select Client */}
          {step === 1 && (
            <div className="p-6">
              {/* Search */}
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search clients..."
                  className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-orange"
                />
              </div>

              {/* Client List */}
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {filteredClients.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    No clients found
                  </div>
                ) : (
                  filteredClients.map(client => (
                    <button
                      key={client.id}
                      onClick={() => {
                        setSelectedClientId(client.id)
                        setStep(2)
                      }}
                      className={`w-full flex items-center gap-4 p-4 rounded-xl border transition-colors ${
                        selectedClientId === client.id
                          ? 'border-brand-orange bg-brand-orange-50'
                          : 'border-gray-200 hover:border-brand-orange-300 hover:bg-gray-50'
                      }`}
                    >
                      <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center">
                        <Building2 className="w-5 h-5 text-gray-600" />
                      </div>
                      <div className="flex-1 text-left">
                        <p className="font-medium text-gray-900">{client.businessName}</p>
                        {client.industry && (
                          <p className="text-sm text-gray-500">{client.industry}</p>
                        )}
                      </div>
                      {selectedClientId === client.id && (
                        <Check className="w-5 h-5 text-brand-orange" />
                      )}
                    </button>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Step 2: Session Details */}
          {step === 2 && (
            <div className="p-6 space-y-6">
              {/* Selected Client */}
              {selectedClient && (
                <div className="flex items-center gap-4 p-4 bg-brand-orange-50 rounded-xl">
                  <div className="w-10 h-10 bg-brand-orange-100 rounded-lg flex items-center justify-center">
                    <Building2 className="w-5 h-5 text-brand-orange" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-gray-900">{selectedClient.businessName}</p>
                    {selectedClient.industry && (
                      <p className="text-sm text-gray-500">{selectedClient.industry}</p>
                    )}
                  </div>
                  <button
                    onClick={() => setStep(1)}
                    className="text-sm text-brand-orange hover:text-brand-orange-700 font-medium"
                  >
                    Change
                  </button>
                </div>
              )}

              {/* Date & Time */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <Calendar className="w-4 h-4 inline mr-1" />
                    Date
                  </label>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    min={new Date().toISOString().split('T')[0]}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-orange"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <Clock className="w-4 h-4 inline mr-1" />
                    Time
                  </label>
                  <select
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-orange"
                  >
                    {timeSlots.map(slot => (
                      <option key={slot} value={slot}>
                        {formatTimeSlot(slot)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Duration */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Duration</label>
                <div className="flex gap-2">
                  {[30, 45, 60, 90].map(mins => (
                    <button
                      key={mins}
                      type="button"
                      onClick={() => setDuration(mins)}
                      className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                        duration === mins
                          ? 'bg-brand-orange text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {mins} min
                    </button>
                  ))}
                </div>
              </div>

              {/* Session Type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Session Type</label>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { value: 'video', label: 'Video', Icon: Video },
                    { value: 'phone', label: 'Phone', Icon: Phone },
                    { value: 'in-person', label: 'In-Person', Icon: MapPin }
                  ] as const).map(({ value, label, Icon }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setSessionType(value)}
                      className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-colors ${
                        sessionType === value
                          ? 'border-brand-orange bg-brand-orange-50 text-brand-orange-700'
                          : 'border-gray-200 text-gray-600 hover:border-brand-orange-300'
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                      <span className="text-sm font-medium">{label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Notes (optional)
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  placeholder="Add any notes for this session..."
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-orange"
                />
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-2xl">
            <div className="flex items-center justify-between">
              {step === 2 && !preselectedClientId && (
                <button
                  onClick={() => setStep(1)}
                  className="px-4 py-2 text-gray-600 hover:text-gray-900 font-medium transition-colors"
                >
                  Back
                </button>
              )}
              {step === 1 && <div />}
              <button
                onClick={step === 1 ? () => {} : handleSchedule}
                disabled={step === 1 || !selectedClientId || saving}
                className="flex items-center gap-2 px-6 py-2.5 bg-brand-orange text-white rounded-lg font-medium shadow-sm hover:bg-brand-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Scheduling...
                  </>
                ) : (
                  <>
                    <Calendar className="w-4 h-4" />
                    Schedule Session
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function formatTimeSlot(time: string): string {
  const [hours] = time.split(':')
  const hour = parseInt(hours)
  const ampm = hour >= 12 ? 'PM' : 'AM'
  const displayHour = hour % 12 || 12
  return `${displayHour}:00 ${ampm}`
}

export default ScheduleSessionModal
