'use client'

import { useEffect, useState } from 'react'
import { ClientCompletionDashboard, type ClientCompletion } from '@/components/coach/ClientCompletionDashboard'
import PageHeader from '@/components/ui/PageHeader'
import { BarChart3, RefreshCw, Loader2 } from 'lucide-react'

export default function EngagementPage() {
  const [clients, setClients] = useState<ClientCompletion[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function loadData(isRefresh = false) {
    try {
      if (isRefresh) {
        setRefreshing(true)
      } else {
        setLoading(true)
      }
      setError(null)

      const response = await fetch('/api/coach/client-completion')
      if (!response.ok) {
        throw new Error('Failed to load engagement data')
      }

      const data = await response.json()
      setClients(data.clients || [])
    } catch (err) {
      console.error('Error loading engagement data:', err)
      setError(err instanceof Error ? err.message : 'Failed to load data')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-brand-orange-500 animate-spin" />
          <p className="text-gray-500 text-sm">Loading engagement data...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-red-600 font-medium">{error}</p>
          <button
            onClick={() => loadData()}
            className="mt-3 text-sm text-brand-orange hover:text-brand-orange-600"
          >
            Try again
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <PageHeader
        variant="banner"
        title="Client Engagement"
        subtitle="Module completion, engagement signals, and alerts across all clients"
        icon={BarChart3}
        actions={
          <button
            onClick={() => loadData(true)}
            disabled={refreshing}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-xl transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        }
      />

      <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <ClientCompletionDashboard clients={clients} isLoading={refreshing} />
      </div>
    </div>
  )
}
