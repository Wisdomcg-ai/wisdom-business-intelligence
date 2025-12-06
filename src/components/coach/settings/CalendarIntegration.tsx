'use client'

import { useState } from 'react'
import {
  Calendar,
  Link as LinkIcon,
  Unlink,
  Check,
  ExternalLink,
  RefreshCw,
  Loader2
} from 'lucide-react'

interface CalendarConnection {
  provider: 'google' | 'outlook' | 'apple'
  connected: boolean
  email?: string
  lastSync?: string
}

interface CalendarIntegrationProps {
  connections: CalendarConnection[]
  onConnect: (provider: 'google' | 'outlook' | 'apple') => Promise<void>
  onDisconnect: (provider: 'google' | 'outlook' | 'apple') => Promise<void>
  onSync: (provider: 'google' | 'outlook' | 'apple') => Promise<void>
}

export function CalendarIntegration({
  connections,
  onConnect,
  onDisconnect,
  onSync
}: CalendarIntegrationProps) {
  const [loading, setLoading] = useState<string | null>(null)
  const [syncing, setSyncing] = useState<string | null>(null)

  const providers = [
    {
      id: 'google' as const,
      name: 'Google Calendar',
      description: 'Sync sessions with your Google Calendar',
      icon: (
        <svg className="w-6 h-6" viewBox="0 0 24 24">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
        </svg>
      ),
      color: 'bg-white border-gray-200'
    },
    {
      id: 'outlook' as const,
      name: 'Outlook Calendar',
      description: 'Sync sessions with Microsoft Outlook',
      icon: (
        <svg className="w-6 h-6" viewBox="0 0 24 24">
          <path fill="#0078D4" d="M24 7.387v10.478c0 .23-.08.424-.238.576-.158.152-.354.228-.586.228h-8.176V6.583h8.176c.232 0 .428.076.586.228.158.152.238.346.238.576zM7.176 6.583V18.67H1c-.276 0-.5-.224-.5-.5V7.083c0-.276.224-.5.5-.5h6.176z"/>
          <path fill="#0078D4" d="M15 6.583v12.086H7.176V6.583H15z"/>
          <path fill="#28A8EA" d="M15 6.583H7.176V4.5c0-.276.224-.5.5-.5H15v2.583zM15 18.67v2.33c0 .276-.224.5-.5.5H7.676a.5.5 0 01-.5-.5v-2.33H15z"/>
        </svg>
      ),
      color: 'bg-white border-gray-200'
    },
    {
      id: 'apple' as const,
      name: 'Apple Calendar',
      description: 'Sync sessions with Apple Calendar',
      icon: (
        <svg className="w-6 h-6" viewBox="0 0 24 24">
          <path fill="#333" d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
        </svg>
      ),
      color: 'bg-white border-gray-200'
    }
  ]

  const handleConnect = async (provider: 'google' | 'outlook' | 'apple') => {
    setLoading(provider)
    try {
      await onConnect(provider)
    } finally {
      setLoading(null)
    }
  }

  const handleDisconnect = async (provider: 'google' | 'outlook' | 'apple') => {
    setLoading(provider)
    try {
      await onDisconnect(provider)
    } finally {
      setLoading(null)
    }
  }

  const handleSync = async (provider: 'google' | 'outlook' | 'apple') => {
    setSyncing(provider)
    try {
      await onSync(provider)
    } finally {
      setSyncing(null)
    }
  }

  const getConnection = (provider: 'google' | 'outlook' | 'apple') => {
    return connections.find(c => c.provider === provider)
  }

  const formatLastSync = (dateString?: string) => {
    if (!dateString) return 'Never'
    const date = new Date(dateString)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(minutes / 60)
    const days = Math.floor(hours / 24)

    if (minutes < 1) return 'Just now'
    if (minutes < 60) return `${minutes}m ago`
    if (hours < 24) return `${hours}h ago`
    return `${days}d ago`
  }

  return (
    <div className="rounded-xl shadow-sm border border-gray-200 bg-white overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200">
        <h3 className="font-semibold text-gray-900">Calendar Integration</h3>
        <p className="text-sm text-gray-500 mt-1">Connect your calendar to sync sessions automatically</p>
      </div>

      <div className="p-6 space-y-4">
        {providers.map(provider => {
          const connection = getConnection(provider.id)
          const isConnected = connection?.connected
          const isLoading = loading === provider.id
          const isSyncing = syncing === provider.id

          return (
            <div
              key={provider.id}
              className={`p-4 rounded-xl border ${provider.color} ${
                isConnected ? 'ring-2 ring-green-500 ring-offset-2' : ''
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-gray-50 rounded-xl flex items-center justify-center">
                    {provider.icon}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium text-gray-900">{provider.name}</h4>
                      {isConnected && (
                        <span className="flex items-center gap-1 text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
                          <Check className="w-3 h-3" />
                          Connected
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-500">
                      {isConnected ? connection.email : provider.description}
                    </p>
                    {isConnected && connection.lastSync && (
                      <p className="text-xs text-gray-400 mt-1">
                        Last synced: {formatLastSync(connection.lastSync)}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {isConnected ? (
                    <>
                      <button
                        onClick={() => handleSync(provider.id)}
                        disabled={isSyncing}
                        className="p-2 text-gray-600 hover:text-brand-orange hover:bg-brand-orange-50 rounded-lg transition-colors disabled:opacity-50"
                        title="Sync now"
                      >
                        <RefreshCw className={`w-5 h-5 ${isSyncing ? 'animate-spin' : ''}`} />
                      </button>
                      <button
                        onClick={() => handleDisconnect(provider.id)}
                        disabled={isLoading}
                        className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 hover:bg-gray-50 text-red-600 rounded-lg transition-colors disabled:opacity-50"
                      >
                        {isLoading ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Unlink className="w-4 h-4" />
                        )}
                        Disconnect
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => handleConnect(provider.id)}
                      disabled={isLoading}
                      className="flex items-center gap-2 px-4 py-2 bg-brand-orange hover:bg-brand-orange-600 text-white rounded-lg transition-colors disabled:opacity-50"
                    >
                      {isLoading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <LinkIcon className="w-4 h-4" />
                      )}
                      Connect
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}

        {/* Info Box */}
        <div className="mt-6 p-4 bg-brand-orange-50 rounded-lg border border-brand-orange-100">
          <div className="flex gap-3">
            <Calendar className="w-5 h-5 text-brand-orange flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="font-medium text-brand-navy">How calendar sync works</h4>
              <p className="text-sm text-brand-orange-700 mt-1">
                When you schedule a session in Wisdom, it will automatically appear in your connected calendar.
                Changes made in either place will sync automatically.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default CalendarIntegration
