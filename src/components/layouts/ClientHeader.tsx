'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  Bell,
  Search,
  MessageSquare,
  Calendar,
  ChevronDown,
  X,
  CheckCircle,
  AlertCircle,
  Clock
} from 'lucide-react'

interface Notification {
  id: string
  type: 'message' | 'action' | 'session' | 'info'
  title: string
  description?: string
  time: string
  read: boolean
}

interface ClientHeaderProps {
  title?: string
  subtitle?: string
  notifications?: Notification[]
  onSearch?: (query: string) => void
}

export function ClientHeader({
  title,
  subtitle,
  notifications = [],
  onSearch
}: ClientHeaderProps) {
  const [showNotifications, setShowNotifications] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  const unreadCount = notifications.filter(n => !n.read).length

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    onSearch?.(searchQuery)
  }

  const getNotificationIcon = (type: Notification['type']) => {
    switch (type) {
      case 'message':
        return <MessageSquare className="w-4 h-4 text-brand-orange" />
      case 'action':
        return <CheckCircle className="w-4 h-4 text-amber-600" />
      case 'session':
        return <Calendar className="w-4 h-4 text-brand-orange" />
      default:
        return <AlertCircle className="w-4 h-4 text-gray-600" />
    }
  }

  return (
    <header className="h-16 bg-white border-b border-gray-200 px-6 flex items-center justify-between sticky top-0 z-30">
      {/* Left - Title or Search */}
      <div className="flex items-center gap-6">
        {title ? (
          <div>
            <h1 className="text-xl font-bold text-gray-900">{title}</h1>
            {subtitle && <p className="text-sm text-gray-500">{subtitle}</p>}
          </div>
        ) : (
          <form onSubmit={handleSearch} className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search..."
              className="w-80 pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-orange focus:border-transparent"
            />
          </form>
        )}
      </div>

      {/* Right - Actions */}
      <div className="flex items-center gap-4">
        {/* Quick Actions */}
        <Link
          href="/messages"
          className="flex items-center gap-2 px-4 py-2 text-brand-orange-700 bg-brand-orange-50 hover:bg-brand-orange-100 rounded-lg transition-colors"
        >
          <MessageSquare className="w-4 h-4" />
          <span className="text-sm font-medium">Message Coach</span>
        </Link>

        {/* Notifications */}
        <div className="relative">
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="relative p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
                {unreadCount}
              </span>
            )}
          </button>

          {showNotifications && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setShowNotifications(false)}
              />
              <div className="absolute right-0 top-full mt-2 w-96 bg-white rounded-xl border border-gray-200 shadow-lg z-50 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                  <h3 className="font-semibold text-gray-900">Notifications</h3>
                  <button
                    onClick={() => setShowNotifications(false)}
                    className="p-1 text-gray-400 hover:text-gray-600 rounded"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="max-h-96 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="p-8 text-center">
                      <Bell className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                      <p className="text-gray-500 text-sm">No notifications yet</p>
                    </div>
                  ) : (
                    notifications.map(notification => (
                      <div
                        key={notification.id}
                        className={`px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors ${
                          !notification.read ? 'bg-brand-orange-50/50' : ''
                        }`}
                      >
                        <div className="flex gap-3">
                          <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center flex-shrink-0">
                            {getNotificationIcon(notification.type)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm ${!notification.read ? 'font-medium text-gray-900' : 'text-gray-700'}`}>
                              {notification.title}
                            </p>
                            {notification.description && (
                              <p className="text-sm text-gray-500 truncate">{notification.description}</p>
                            )}
                            <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {notification.time}
                            </p>
                          </div>
                          {!notification.read && (
                            <div className="w-2 h-2 bg-brand-orange-500 rounded-full flex-shrink-0 mt-2" />
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {notifications.length > 0 && (
                  <div className="p-3 border-t border-gray-100">
                    <button className="w-full py-2 text-sm text-brand-orange hover:text-brand-orange-700 font-medium">
                      Mark all as read
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  )
}

export default ClientHeader
