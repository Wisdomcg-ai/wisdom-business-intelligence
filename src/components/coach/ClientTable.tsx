'use client'

import Link from 'next/link'
import {
  Building2,
  Calendar,
  MessageSquare,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  MoreHorizontal,
  Eye,
  Clock
} from 'lucide-react'
import { useState } from 'react'

export interface ClientTableData {
  id: string
  businessName: string
  industry?: string
  status: 'active' | 'pending' | 'at-risk' | 'inactive'
  healthScore?: number
  lastSessionDate?: string
  nextSessionDate?: string
  programType?: string
  unreadMessages?: number
  pendingActions?: number
}

type SortField = 'businessName' | 'status' | 'healthScore' | 'lastSessionDate'
type SortDirection = 'asc' | 'desc'

interface ClientTableProps {
  clients: ClientTableData[]
  onMessage?: (clientId: string) => void
  onSchedule?: (clientId: string) => void
  onView?: (clientId: string) => void
}

export function ClientTable({ clients, onMessage, onSchedule, onView }: ClientTableProps) {
  const [sortField, setSortField] = useState<SortField>('businessName')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  const sortedClients = [...clients].sort((a, b) => {
    let comparison = 0
    switch (sortField) {
      case 'businessName':
        comparison = a.businessName.localeCompare(b.businessName)
        break
      case 'status':
        comparison = a.status.localeCompare(b.status)
        break
      case 'healthScore':
        comparison = (a.healthScore ?? 0) - (b.healthScore ?? 0)
        break
      case 'lastSessionDate':
        const dateA = a.lastSessionDate ? new Date(a.lastSessionDate).getTime() : 0
        const dateB = b.lastSessionDate ? new Date(b.lastSessionDate).getTime() : 0
        comparison = dateA - dateB
        break
    }
    return sortDirection === 'asc' ? comparison : -comparison
  })

  const getStatusStyles = (status: ClientTableData['status']) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-700'
      case 'pending':
        return 'bg-yellow-100 text-yellow-700'
      case 'at-risk':
        return 'bg-red-100 text-red-700'
      default:
        return 'bg-gray-100 text-gray-700'
    }
  }

  const getHealthScoreColor = (score?: number) => {
    if (score === undefined) return 'text-gray-400'
    if (score >= 70) return 'text-green-600 bg-green-50'
    if (score >= 50) return 'text-yellow-600 bg-yellow-50'
    return 'text-red-600 bg-red-50'
  }

  const formatDate = (dateString?: string) => {
    if (!dateString) return '--'
    const date = new Date(dateString)
    const now = new Date()
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))

    if (diffDays === 0) return 'Today'
    if (diffDays === 1) return 'Yesterday'
    if (diffDays < 7) return `${diffDays}d ago`
    return date.toLocaleDateString('en-AU', { month: 'short', day: 'numeric' })
  }

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null
    return sortDirection === 'asc' ? (
      <ChevronUp className="w-4 h-4" />
    ) : (
      <ChevronDown className="w-4 h-4" />
    )
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th
                className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('businessName')}
              >
                <div className="flex items-center gap-1">
                  Client
                  <SortIcon field="businessName" />
                </div>
              </th>
              <th
                className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('status')}
              >
                <div className="flex items-center gap-1">
                  Status
                  <SortIcon field="status" />
                </div>
              </th>
              <th
                className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('healthScore')}
              >
                <div className="flex items-center gap-1">
                  Health
                  <SortIcon field="healthScore" />
                </div>
              </th>
              <th
                className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('lastSessionDate')}
              >
                <div className="flex items-center gap-1">
                  Last Session
                  <SortIcon field="lastSessionDate" />
                </div>
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                Program
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                Alerts
              </th>
              <th className="px-6 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {sortedClients.map((client) => (
              <tr key={client.id} className="hover:bg-gray-50 transition-colors">
                {/* Client Name */}
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0">
                      <Building2 className="w-4 h-4 text-gray-600" />
                    </div>
                    <div>
                      <Link
                        href={`/coach/clients/${client.id}`}
                        className="font-medium text-gray-900 hover:text-brand-orange"
                      >
                        {client.businessName}
                      </Link>
                      {client.industry && (
                        <p className="text-sm text-gray-500">{client.industry}</p>
                      )}
                    </div>
                  </div>
                </td>

                {/* Status */}
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusStyles(client.status)}`}>
                    {client.status}
                  </span>
                </td>

                {/* Health Score */}
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-sm font-bold ${getHealthScoreColor(client.healthScore)}`}>
                    {client.healthScore !== undefined ? `${client.healthScore}%` : '--'}
                  </span>
                </td>

                {/* Last Session */}
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center gap-1.5 text-sm text-gray-600">
                    <Clock className="w-4 h-4 text-gray-400" />
                    {formatDate(client.lastSessionDate)}
                  </div>
                </td>

                {/* Program */}
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className="text-sm text-gray-600">
                    {client.programType || '--'}
                  </span>
                </td>

                {/* Alerts */}
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center gap-2">
                    {(client.unreadMessages ?? 0) > 0 && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-brand-orange-50 text-brand-orange-700 rounded-full text-xs font-medium">
                        <MessageSquare className="w-3 h-3" />
                        {client.unreadMessages}
                      </span>
                    )}
                    {(client.pendingActions ?? 0) > 0 && (
                      <span className="inline-flex items-center px-2 py-0.5 bg-amber-50 text-amber-700 rounded-full text-xs font-medium">
                        {client.pendingActions} actions
                      </span>
                    )}
                    {(client.unreadMessages ?? 0) === 0 && (client.pendingActions ?? 0) === 0 && (
                      <span className="text-sm text-gray-400">--</span>
                    )}
                  </div>
                </td>

                {/* Actions */}
                <td className="px-6 py-4 whitespace-nowrap text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      onClick={() => onMessage?.(client.id)}
                      className="p-3 sm:p-2 text-gray-400 hover:text-brand-orange hover:bg-brand-orange-50 rounded-lg transition-colors"
                      title="Message"
                    >
                      <MessageSquare className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => onSchedule?.(client.id)}
                      className="p-3 sm:p-2 text-gray-400 hover:text-brand-orange hover:bg-brand-orange-50 rounded-lg transition-colors"
                      title="Schedule"
                    >
                      <Calendar className="w-4 h-4" />
                    </button>
                    <Link
                      href={`/coach/clients/${client.id}`}
                      className="p-3 sm:p-2 text-gray-400 hover:text-brand-orange hover:bg-brand-orange-50 rounded-lg transition-colors"
                      title="View"
                    >
                      <Eye className="w-4 h-4" />
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Empty State */}
      {sortedClients.length === 0 && (
        <div className="px-6 py-12 text-center">
          <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-1">No clients found</h3>
          <p className="text-gray-500">Try adjusting your filters or add a new client.</p>
        </div>
      )}
    </div>
  )
}

export default ClientTable
