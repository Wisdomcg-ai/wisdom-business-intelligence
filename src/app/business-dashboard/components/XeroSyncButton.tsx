'use client'

import { useState } from 'react'
import { RefreshCw, CheckCircle } from 'lucide-react'
import { toast } from 'sonner'

interface XeroSyncButtonProps {
  businessId: string
  onSyncComplete?: () => void
}

export function XeroSyncButton({ businessId, onSyncComplete }: XeroSyncButtonProps) {
  const [isSyncing, setIsSyncing] = useState(false)
  const [lastResult, setLastResult] = useState<'success' | 'error' | null>(null)

  const handleSync = async () => {
    if (isSyncing) return

    setIsSyncing(true)
    try {
      const response = await fetch('/api/Xero/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_id: businessId }),
      })

      if (response.ok) {
        setLastResult('success')
        toast.success('Xero data synced')
        onSyncComplete?.()
        setTimeout(() => setLastResult(null), 3000)
      } else {
        setLastResult('error')
        toast.error('Sync failed — try again later')
        setTimeout(() => setLastResult(null), 3000)
      }
    } catch {
      setLastResult('error')
      toast.error('Sync failed — try again later')
      setTimeout(() => setLastResult(null), 3000)
    } finally {
      setIsSyncing(false)
    }
  }

  return (
    <button
      onClick={handleSync}
      disabled={isSyncing}
      className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg text-sm font-medium bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
    >
      {lastResult === 'success' ? (
        <CheckCircle className="w-4 h-4 text-green-500" />
      ) : (
        <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
      )}
      <span className="hidden sm:inline">Sync Xero</span>
    </button>
  )
}
