'use client'

import { useState } from 'react'
import {
  X,
  Send,
  Users,
  Building2,
  Check,
  Search,
  Loader2,
  AlertCircle
} from 'lucide-react'

interface Client {
  id: string
  businessName: string
  industry?: string
  status: string
}

interface BroadcastModalProps {
  isOpen: boolean
  onClose: () => void
  onSend: (clientIds: string[], message: string) => Promise<void>
  clients: Client[]
}

export function BroadcastModal({
  isOpen,
  onClose,
  onSend,
  clients
}: BroadcastModalProps) {
  const [step, setStep] = useState(1)
  const [selectedClientIds, setSelectedClientIds] = useState<string[]>([])
  const [message, setMessage] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [sending, setSending] = useState(false)
  const [filterStatus, setFilterStatus] = useState<string>('all')

  if (!isOpen) return null

  const filteredClients = clients.filter(client => {
    const matchesSearch = !searchQuery ||
      client.businessName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      client.industry?.toLowerCase().includes(searchQuery.toLowerCase())

    const matchesStatus = filterStatus === 'all' || client.status === filterStatus

    return matchesSearch && matchesStatus
  })

  const toggleClient = (clientId: string) => {
    setSelectedClientIds(prev =>
      prev.includes(clientId)
        ? prev.filter(id => id !== clientId)
        : [...prev, clientId]
    )
  }

  const selectAll = () => {
    setSelectedClientIds(filteredClients.map(c => c.id))
  }

  const deselectAll = () => {
    setSelectedClientIds([])
  }

  const handleSend = async () => {
    if (selectedClientIds.length === 0 || !message.trim()) return

    setSending(true)
    try {
      await onSend(selectedClientIds, message.trim())
      onClose()
      // Reset state
      setStep(1)
      setSelectedClientIds([])
      setMessage('')
    } catch (error) {
      console.error('Error sending broadcast:', error)
    } finally {
      setSending(false)
    }
  }

  const selectedClients = clients.filter(c => selectedClientIds.includes(c.id))

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        {/* Backdrop */}
        <div
          className="fixed inset-0 bg-black/50 transition-opacity"
          onClick={onClose}
        />

        {/* Modal */}
        <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-2xl">
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Broadcast Message</h2>
              <p className="text-sm text-gray-500">
                Step {step} of 2: {step === 1 ? 'Select Recipients' : 'Compose Message'}
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Step 1: Select Recipients */}
          {step === 1 && (
            <div className="p-6">
              {/* Search & Filter */}
              <div className="flex items-center gap-3 mb-4">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search clients..."
                    className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-orange"
                  />
                </div>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-orange"
                >
                  <option value="all">All Status</option>
                  <option value="active">Active</option>
                  <option value="at-risk">At Risk</option>
                  <option value="pending">Pending</option>
                </select>
              </div>

              {/* Selection Controls */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-gray-500" />
                  <span className="text-sm text-gray-600">
                    {selectedClientIds.length} of {clients.length} selected
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={selectAll}
                    className="text-sm text-brand-orange hover:text-brand-orange-700 font-medium"
                  >
                    Select All
                  </button>
                  <span className="text-gray-300">|</span>
                  <button
                    onClick={deselectAll}
                    className="text-sm text-gray-500 hover:text-gray-700"
                  >
                    Clear
                  </button>
                </div>
              </div>

              {/* Client List */}
              <div className="border border-gray-200 rounded-xl overflow-hidden max-h-[300px] overflow-y-auto">
                {filteredClients.length === 0 ? (
                  <div className="p-8 text-center text-gray-500">
                    No clients found
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {filteredClients.map(client => (
                      <label
                        key={client.id}
                        className={`flex items-center gap-4 p-4 cursor-pointer transition-colors ${
                          selectedClientIds.includes(client.id)
                            ? 'bg-brand-orange-50'
                            : 'hover:bg-gray-50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedClientIds.includes(client.id)}
                          onChange={() => toggleClient(client.id)}
                          className="w-5 h-5 text-brand-orange border-gray-300 rounded focus:ring-brand-orange"
                        />
                        <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center">
                          <Building2 className="w-5 h-5 text-gray-600" />
                        </div>
                        <div className="flex-1">
                          <p className="font-medium text-gray-900">{client.businessName}</p>
                          <p className="text-sm text-gray-500">{client.industry || 'No industry'}</p>
                        </div>
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                          client.status === 'active'
                            ? 'bg-green-100 text-green-700'
                            : client.status === 'at-risk'
                              ? 'bg-red-100 text-red-700'
                              : 'bg-yellow-100 text-yellow-700'
                        }`}>
                          {client.status}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Step 2: Compose Message */}
          {step === 2 && (
            <div className="p-6">
              {/* Selected Recipients Summary */}
              <div className="mb-4 p-4 bg-brand-orange-50 rounded-xl">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Users className="w-5 h-5 text-brand-orange" />
                    <span className="font-medium text-brand-orange-900">
                      {selectedClientIds.length} recipients
                    </span>
                  </div>
                  <button
                    onClick={() => setStep(1)}
                    className="text-sm text-brand-orange hover:text-brand-orange-700 font-medium"
                  >
                    Edit
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {selectedClients.slice(0, 5).map(client => (
                    <span
                      key={client.id}
                      className="px-2 py-1 bg-white text-sm text-gray-700 rounded-lg"
                    >
                      {client.businessName}
                    </span>
                  ))}
                  {selectedClients.length > 5 && (
                    <span className="px-2 py-1 text-sm text-brand-orange">
                      +{selectedClients.length - 5} more
                    </span>
                  )}
                </div>
              </div>

              {/* Message Composer */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Message
                </label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={6}
                  placeholder="Type your message here..."
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-orange"
                />
                <p className="mt-2 text-xs text-gray-500">
                  This message will be sent to all selected clients individually.
                </p>
              </div>

              {/* Warning */}
              <div className="mt-4 p-4 bg-amber-50 rounded-xl flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-amber-800">
                    Broadcast messages cannot be undone
                  </p>
                  <p className="text-xs text-amber-700 mt-1">
                    Each client will receive this message in their inbox. Make sure your message is appropriate for all recipients.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-2xl">
            <div className="flex items-center justify-between">
              {step === 2 && (
                <button
                  onClick={() => setStep(1)}
                  className="px-4 py-2 text-gray-600 hover:text-gray-900 font-medium transition-colors"
                >
                  Back
                </button>
              )}
              {step === 1 && <div />}

              {step === 1 ? (
                <button
                  onClick={() => setStep(2)}
                  disabled={selectedClientIds.length === 0}
                  className="flex items-center gap-2 px-6 py-2.5 bg-brand-orange text-white rounded-lg font-medium shadow-sm hover:bg-brand-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Continue
                  <Check className="w-4 h-4" />
                </button>
              ) : (
                <button
                  onClick={handleSend}
                  disabled={sending || !message.trim()}
                  className="flex items-center gap-2 px-6 py-2.5 bg-brand-orange text-white rounded-lg font-medium shadow-sm hover:bg-brand-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {sending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      Send to {selectedClientIds.length} clients
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default BroadcastModal
