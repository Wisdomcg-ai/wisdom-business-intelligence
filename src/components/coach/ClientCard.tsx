'use client'

import Link from 'next/link'
import {
  Building2,
  Calendar,
  MessageSquare,
  ChevronRight,
  Clock,
  AlertTriangle,
  Eye,
  Briefcase
} from 'lucide-react'

export interface ClientCardData {
  id: string
  businessName: string
  industry?: string
  status: 'active' | 'pending' | 'at-risk' | 'inactive'
  lastSessionDate?: string
  nextSessionDate?: string
  programType?: string
  unreadMessages?: number
  pendingActions?: number
}

interface ClientCardProps {
  client: ClientCardData
  onMessage?: (clientId: string) => void
  onSchedule?: (clientId: string) => void
}

export function ClientCard({ client, onMessage, onSchedule }: ClientCardProps) {
  const getStatusStyles = (status: ClientCardData['status']) => {
    switch (status) {
      case 'active':
        return { dot: 'bg-green-400', badge: 'bg-green-100 text-green-700 border-green-200' }
      case 'pending':
        return { dot: 'bg-yellow-400', badge: 'bg-yellow-100 text-yellow-700 border-yellow-200' }
      case 'at-risk':
        return { dot: 'bg-red-400', badge: 'bg-red-100 text-red-700 border-red-200' }
      default:
        return { dot: 'bg-gray-400', badge: 'bg-gray-100 text-gray-700 border-gray-200' }
    }
  }

  const formatDate = (dateString?: string) => {
    if (!dateString) return null
    const date = new Date(dateString)
    const now = new Date()
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))

    if (diffDays === 0) return 'Today'
    if (diffDays === 1) return 'Yesterday'
    if (diffDays < 7) return `${diffDays}d ago`
    return date.toLocaleDateString('en-AU', { month: 'short', day: 'numeric' })
  }

  const statusStyles = getStatusStyles(client.status)

  return (
    <div className="bg-white rounded-xl border border-gray-200 hover:border-brand-orange-300 hover:shadow-lg transition-all group">
      <div className="p-5">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center">
              <Building2 className="w-5 h-5 text-gray-600" />
            </div>
            <div>
              <Link
                href={`/coach/clients/${client.id}/view/dashboard`}
                className="font-semibold text-gray-900 hover:text-brand-orange transition-colors"
              >
                {client.businessName}
              </Link>
              {client.industry && (
                <p className="text-sm text-gray-500">{client.industry}</p>
              )}
            </div>
          </div>
          <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full border text-xs font-medium ${statusStyles.badge}`}>
            <div className={`w-1.5 h-1.5 rounded-full ${statusStyles.dot}`} />
            {client.status}
          </div>
        </div>

        {/* Program Type */}
        {client.programType && (
          <div className="flex items-center gap-2 mb-3 text-sm text-gray-600">
            <Briefcase className="w-4 h-4" />
            <span>{client.programType}</span>
          </div>
        )}

        {/* Session Info */}
        <div className="flex items-center justify-between text-sm mb-4">
          <div className="flex items-center gap-1.5 text-gray-500">
            <Clock className="w-4 h-4" />
            <span>Last: {formatDate(client.lastSessionDate) || 'Never'}</span>
          </div>
          {client.nextSessionDate && (
            <div className="flex items-center gap-1.5 text-brand-orange">
              <Calendar className="w-4 h-4" />
              <span>Next: {formatDate(client.nextSessionDate)}</span>
            </div>
          )}
        </div>

        {/* Alerts */}
        {((client.unreadMessages ?? 0) > 0 || (client.pendingActions ?? 0) > 0 || client.status === 'at-risk') && (
          <div className="flex flex-wrap gap-2 mb-4">
            {client.status === 'at-risk' && (
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-50 text-red-700 rounded-full text-xs font-medium">
                <AlertTriangle className="w-3 h-3" />
                Needs attention
              </span>
            )}
            {(client.unreadMessages ?? 0) > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-brand-orange-50 text-brand-orange-700 rounded-full text-xs font-medium">
                <MessageSquare className="w-3 h-3" />
                {client.unreadMessages} unread
              </span>
            )}
            {(client.pendingActions ?? 0) > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-amber-50 text-amber-700 rounded-full text-xs font-medium">
                {client.pendingActions} pending actions
              </span>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 pt-3 border-t border-gray-100">
          <Link
            href={`/coach/clients/${client.id}/view/dashboard`}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-brand-orange hover:bg-brand-orange-600 rounded-lg transition-colors"
          >
            <Eye className="w-4 h-4" />
            Open
          </Link>
          <button
            onClick={() => onMessage?.(client.id)}
            className="flex items-center justify-center p-3 sm:p-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            title="Message"
          >
            <MessageSquare className="w-4 h-4" />
          </button>
          <button
            onClick={() => onSchedule?.(client.id)}
            className="flex items-center justify-center p-3 sm:p-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            title="Schedule"
          >
            <Calendar className="w-4 h-4" />
          </button>
          <Link
            href={`/coach/clients/${client.id}`}
            className="flex items-center justify-center p-3 sm:p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
            title="Client Profile"
          >
            <ChevronRight className="w-5 h-5" />
          </Link>
        </div>
      </div>
    </div>
  )
}

export default ClientCard
