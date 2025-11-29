'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  Building2,
  TrendingUp,
  TrendingDown,
  Minus,
  ChevronDown,
  ChevronUp,
  ArrowUpDown,
  FileText,
  ExternalLink
} from 'lucide-react'

export interface ClientProgress {
  id: string
  businessName: string
  industry?: string
  healthScore: number
  healthTrend: number // change from last period
  sessionsCompleted: number
  goalsProgress: number // percentage
  actionsCompleted: number
  actionsPending: number
  lastSessionDate?: string
  status: 'active' | 'at-risk' | 'pending' | 'inactive'
}

interface ClientProgressTableProps {
  clients: ClientProgress[]
  onGenerateReport?: (clientId: string) => void
}

type SortKey = 'businessName' | 'healthScore' | 'sessionsCompleted' | 'goalsProgress' | 'actionsCompleted'
type SortDirection = 'asc' | 'desc'

export function ClientProgressTable({ clients, onGenerateReport }: ClientProgressTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('healthScore')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const sortedClients = [...clients].sort((a, b) => {
    let comparison = 0
    switch (sortKey) {
      case 'businessName':
        comparison = a.businessName.localeCompare(b.businessName)
        break
      case 'healthScore':
        comparison = a.healthScore - b.healthScore
        break
      case 'sessionsCompleted':
        comparison = a.sessionsCompleted - b.sessionsCompleted
        break
      case 'goalsProgress':
        comparison = a.goalsProgress - b.goalsProgress
        break
      case 'actionsCompleted':
        comparison = a.actionsCompleted - b.actionsCompleted
        break
    }
    return sortDirection === 'asc' ? comparison : -comparison
  })

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDirection('desc')
    }
  }

  const SortHeader = ({ label, sortKeyName }: { label: string; sortKeyName: SortKey }) => (
    <button
      onClick={() => handleSort(sortKeyName)}
      className="flex items-center gap-1 text-xs font-medium text-gray-500 uppercase tracking-wider hover:text-gray-900"
    >
      {label}
      {sortKey === sortKeyName ? (
        sortDirection === 'asc' ? (
          <ChevronUp className="w-4 h-4" />
        ) : (
          <ChevronDown className="w-4 h-4" />
        )
      ) : (
        <ArrowUpDown className="w-3 h-3 opacity-50" />
      )}
    </button>
  )

  const getTrendIcon = (trend: number) => {
    if (trend > 0) return <TrendingUp className="w-4 h-4 text-green-600" />
    if (trend < 0) return <TrendingDown className="w-4 h-4 text-red-600" />
    return <Minus className="w-4 h-4 text-gray-400" />
  }

  const getHealthColor = (score: number) => {
    if (score >= 70) return 'text-green-600 bg-green-100'
    if (score >= 50) return 'text-yellow-600 bg-yellow-100'
    return 'text-red-600 bg-red-100'
  }

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Never'
    return new Date(dateString).toLocaleDateString('en-AU', {
      month: 'short',
      day: 'numeric'
    })
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200">
        <h3 className="font-semibold text-gray-900">Client Progress</h3>
        <p className="text-sm text-gray-500 mt-1">Track progress across all clients</p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-3 text-left">
                <SortHeader label="Client" sortKeyName="businessName" />
              </th>
              <th className="px-6 py-3 text-left">
                <SortHeader label="Health" sortKeyName="healthScore" />
              </th>
              <th className="px-6 py-3 text-left">
                <SortHeader label="Sessions" sortKeyName="sessionsCompleted" />
              </th>
              <th className="px-6 py-3 text-left">
                <SortHeader label="Goals" sortKeyName="goalsProgress" />
              </th>
              <th className="px-6 py-3 text-left">
                <SortHeader label="Actions" sortKeyName="actionsCompleted" />
              </th>
              <th className="px-6 py-3 text-left">
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Last Session
                </span>
              </th>
              <th className="px-6 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sortedClients.map(client => (
              <>
                <tr
                  key={client.id}
                  className="hover:bg-gray-50 transition-colors"
                >
                  {/* Client */}
                  <td className="px-6 py-4">
                    <Link
                      href={`/coach/clients/${client.id}`}
                      className="flex items-center gap-3 group"
                    >
                      <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center">
                        <Building2 className="w-5 h-5 text-slate-600" />
                      </div>
                      <div>
                        <p className="font-medium text-gray-900 group-hover:text-indigo-600">
                          {client.businessName}
                        </p>
                        {client.industry && (
                          <p className="text-sm text-gray-500">{client.industry}</p>
                        )}
                      </div>
                    </Link>
                  </td>

                  {/* Health Score */}
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <span className={`px-2.5 py-1 rounded-full text-sm font-medium ${getHealthColor(client.healthScore)}`}>
                        {client.healthScore}%
                      </span>
                      {getTrendIcon(client.healthTrend)}
                    </div>
                  </td>

                  {/* Sessions */}
                  <td className="px-6 py-4">
                    <span className="text-gray-900 font-medium">{client.sessionsCompleted}</span>
                  </td>

                  {/* Goals */}
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <div className="w-20 h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-indigo-500 rounded-full"
                          style={{ width: `${client.goalsProgress}%` }}
                        />
                      </div>
                      <span className="text-sm text-gray-600">{client.goalsProgress}%</span>
                    </div>
                  </td>

                  {/* Actions */}
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-1">
                      <span className="text-green-600 font-medium">{client.actionsCompleted}</span>
                      <span className="text-gray-400">/</span>
                      <span className="text-gray-500">{client.actionsCompleted + client.actionsPending}</span>
                    </div>
                  </td>

                  {/* Last Session */}
                  <td className="px-6 py-4">
                    <span className="text-gray-600">{formatDate(client.lastSessionDate)}</span>
                  </td>

                  {/* Actions */}
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setExpandedId(expandedId === client.id ? null : client.id)}
                        className="p-2 text-gray-400 hover:text-gray-600 rounded-lg transition-colors"
                      >
                        {expandedId === client.id ? (
                          <ChevronUp className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
                      </button>
                      {onGenerateReport && (
                        <button
                          onClick={() => onGenerateReport(client.id)}
                          className="p-2 text-gray-400 hover:text-indigo-600 rounded-lg transition-colors"
                          title="Generate Report"
                        >
                          <FileText className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>

                {/* Expanded Row */}
                {expandedId === client.id && (
                  <tr key={`${client.id}-expanded`} className="bg-gray-50">
                    <td colSpan={7} className="px-6 py-4">
                      <div className="grid grid-cols-4 gap-6">
                        <div>
                          <p className="text-xs text-gray-500 uppercase mb-1">Status</p>
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            client.status === 'active' ? 'bg-green-100 text-green-700' :
                            client.status === 'at-risk' ? 'bg-red-100 text-red-700' :
                            'bg-yellow-100 text-yellow-700'
                          }`}>
                            {client.status}
                          </span>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 uppercase mb-1">Health Trend</p>
                          <div className="flex items-center gap-1">
                            {getTrendIcon(client.healthTrend)}
                            <span className={client.healthTrend >= 0 ? 'text-green-600' : 'text-red-600'}>
                              {client.healthTrend >= 0 ? '+' : ''}{client.healthTrend}%
                            </span>
                            <span className="text-gray-500 text-sm">vs last month</span>
                          </div>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 uppercase mb-1">Pending Actions</p>
                          <span className={client.actionsPending > 5 ? 'text-red-600' : 'text-gray-900'}>
                            {client.actionsPending} items
                          </span>
                        </div>
                        <div className="flex items-center justify-end">
                          <Link
                            href={`/coach/clients/${client.id}`}
                            className="flex items-center gap-2 text-indigo-600 hover:text-indigo-700 font-medium text-sm"
                          >
                            View Full Profile
                            <ExternalLink className="w-4 h-4" />
                          </Link>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>

      {clients.length === 0 && (
        <div className="p-12 text-center">
          <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500">No client data available</p>
        </div>
      )}
    </div>
  )
}

export default ClientProgressTable
