'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import {
  Search,
  Building2,
  MessageSquare,
  Calendar,
  ChevronRight,
  AlertCircle,
  Clock,
  Filter
} from 'lucide-react'

export interface Client {
  id: string
  businessName: string
  status: 'active' | 'pending' | 'at-risk' | 'inactive'
  lastSessionDate?: string
  healthScore?: number
  industry?: string
  unreadMessages?: number
  pendingActions?: number
}

interface ClientQuickListProps {
  clients: Client[]
  onMessageClient?: (clientId: string) => void
  onScheduleSession?: (clientId: string) => void
}

export function ClientQuickList({
  clients,
  onMessageClient,
  onScheduleSession
}: ClientQuickListProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  const filteredClients = useMemo(() => {
    return clients.filter((client) => {
      const matchesSearch = client.businessName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        client.industry?.toLowerCase().includes(searchQuery.toLowerCase())

      const matchesStatus = statusFilter === 'all' || client.status === statusFilter

      return matchesSearch && matchesStatus
    })
  }, [clients, searchQuery, statusFilter])

  const getStatusDot = (status: Client['status']) => {
    switch (status) {
      case 'active':
        return 'bg-brand-teal'
      case 'pending':
        return 'bg-amber-400'
      case 'at-risk':
        return 'bg-red-400'
      default:
        return 'bg-gray-400'
    }
  }

  const getStatusLabel = (status: Client['status']) => {
    switch (status) {
      case 'active':
        return 'Active'
      case 'pending':
        return 'Pending'
      case 'at-risk':
        return 'At Risk'
      default:
        return 'Inactive'
    }
  }

  const formatLastSession = (dateString?: string) => {
    if (!dateString) return 'Never'

    const date = new Date(dateString)
    const now = new Date()
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))

    if (diffDays === 0) return 'Today'
    if (diffDays === 1) return 'Yesterday'
    if (diffDays < 7) return `${diffDays} days ago`
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`
    return `${Math.floor(diffDays / 30)} months ago`
  }

  const statusCounts = useMemo(() => {
    return {
      all: clients.length,
      active: clients.filter(c => c.status === 'active').length,
      pending: clients.filter(c => c.status === 'pending').length,
      'at-risk': clients.filter(c => c.status === 'at-risk').length,
    }
  }, [clients])

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-100">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="bg-brand-orange p-2 rounded-lg">
              <Building2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">Clients</h3>
              <p className="text-sm text-gray-500">{clients.length} total</p>
            </div>
          </div>
          <Link
            href="/coach/clients"
            className="text-sm text-brand-orange hover:text-brand-orange-700 font-medium"
          >
            View all
          </Link>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search clients..."
            className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-orange focus:border-transparent"
          />
        </div>

        {/* Status Filter Tabs */}
        <div className="flex gap-2 mt-3">
          {(['all', 'active', 'at-risk', 'pending'] as const).map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                statusFilter === status
                  ? 'bg-brand-orange text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {status === 'all' ? 'All' : getStatusLabel(status as Client['status'])}
              <span className="ml-1 opacity-70">({statusCounts[status]})</span>
            </button>
          ))}
        </div>
      </div>

      {/* Client List */}
      <div className="divide-y divide-gray-100 max-h-[400px] overflow-y-auto">
        {filteredClients.length === 0 ? (
          <div className="px-5 py-8 text-center">
            <Building2 className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No clients found</p>
          </div>
        ) : (
          filteredClients.map((client) => (
            <div
              key={client.id}
              className="px-5 py-3 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  {/* Status Dot */}
                  <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${getStatusDot(client.status)}`} />

                  {/* Client Info */}
                  <div className="min-w-0">
                    <Link
                      href={`/coach/clients/${client.id}`}
                      className="font-medium text-gray-900 hover:text-brand-orange truncate block"
                    >
                      {client.businessName}
                    </Link>
                    <div className="flex items-center gap-3 text-xs text-gray-500 mt-0.5">
                      {client.industry && (
                        <span className="truncate">{client.industry}</span>
                      )}
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatLastSession(client.lastSessionDate)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Quick Actions & Badges */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  {/* Badges */}
                  {(client.unreadMessages ?? 0) > 0 && (
                    <span className="bg-brand-orange-100 text-brand-orange text-xs font-medium px-2 py-0.5 rounded-full">
                      {client.unreadMessages} msg
                    </span>
                  )}
                  {(client.pendingActions ?? 0) > 0 && (
                    <span className="bg-amber-100 text-amber-700 text-xs font-medium px-2 py-0.5 rounded-full">
                      {client.pendingActions} action
                    </span>
                  )}

                  {/* Health Score */}
                  {client.healthScore !== undefined && (
                    <div className={`text-xs font-bold px-2 py-0.5 rounded ${
                      client.healthScore >= 70 ? 'bg-brand-teal-100 text-brand-teal' :
                      client.healthScore >= 50 ? 'bg-amber-100 text-amber-700' :
                      'bg-red-100 text-red-700'
                    }`}>
                      {client.healthScore}%
                    </div>
                  )}

                  {/* Quick Action Buttons */}
                  <div className="flex items-center gap-1 ml-2">
                    <button
                      onClick={() => onMessageClient?.(client.id)}
                      className="p-1.5 text-gray-400 hover:text-brand-orange hover:bg-brand-orange-50 rounded-lg transition-colors"
                      title="Message"
                    >
                      <MessageSquare className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => onScheduleSession?.(client.id)}
                      className="p-1.5 text-gray-400 hover:text-brand-orange hover:bg-brand-orange-50 rounded-lg transition-colors"
                      title="Schedule"
                    >
                      <Calendar className="w-4 h-4" />
                    </button>
                    <Link
                      href={`/coach/clients/${client.id}`}
                      className="p-1.5 text-gray-400 hover:text-brand-orange hover:bg-brand-orange-50 rounded-lg transition-colors"
                      title="View"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      <div className="px-5 py-3 bg-gray-50 border-t border-gray-100">
        <Link
          href="/coach/clients/new"
          className="text-sm text-brand-orange hover:text-brand-orange-700 font-medium flex items-center justify-center gap-1"
        >
          Add new client
          <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  )
}

export default ClientQuickList
