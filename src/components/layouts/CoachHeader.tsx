'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Search,
  Bell,
  Plus,
  ChevronDown,
  Calendar,
  MessageSquare,
  UserPlus,
  FileText
} from 'lucide-react'

interface Notification {
  id: string
  type: 'message' | 'action' | 'session' | 'system'
  title: string
  description: string
  time: string
  read: boolean
}

interface CoachHeaderProps {
  title?: string
  subtitle?: string
  notifications?: Notification[]
  onSearch?: (query: string) => void
}

export function CoachHeader({
  title,
  subtitle,
  notifications = [],
  onSearch
}: CoachHeaderProps) {
  const router = useRouter()
  const [searchQuery, setSearchQuery] = useState('')
  const [showNotifications, setShowNotifications] = useState(false)
  const [showQuickAdd, setShowQuickAdd] = useState(false)

  const unreadCount = notifications.filter(n => !n.read).length

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (onSearch && searchQuery.trim()) {
      onSearch(searchQuery)
    }
  }

  const quickAddItems = [
    { icon: UserPlus, label: 'New Client', href: '/coach/clients/new' },
    { icon: Calendar, label: 'Schedule Session', action: 'schedule' },
    { icon: MessageSquare, label: 'Send Message', action: 'message' },
    { icon: FileText, label: 'Create Action', action: 'action' },
  ]

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
      <div className="px-6 py-4">
        <div className="flex items-center justify-between gap-4">
          {/* Left: Title or Search */}
          <div className="flex-1 flex items-center gap-6">
            {title ? (
              <div>
                <h1 className="text-xl font-bold text-gray-900">{title}</h1>
                {subtitle && <p className="text-sm text-gray-500">{subtitle}</p>}
              </div>
            ) : (
              <form onSubmit={handleSearch} className="flex-1 max-w-lg">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search clients, sessions, actions..."
                    className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-orange focus:border-transparent text-sm"
                  />
                </div>
              </form>
            )}
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2">
            {/* Quick Add Button */}
            <div className="relative">
              <button
                onClick={() => setShowQuickAdd(!showQuickAdd)}
                className="flex items-center gap-2 px-4 py-2.5 bg-brand-orange text-white rounded-xl hover:bg-brand-orange-600 transition-colors font-medium text-sm"
              >
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">Quick Add</span>
                <ChevronDown className={`w-4 h-4 transition-transform ${showQuickAdd ? 'rotate-180' : ''}`} />
              </button>

              {showQuickAdd && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setShowQuickAdd(false)}
                  />
                  <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-lg border border-gray-200 py-2 z-50">
                    {quickAddItems.map((item) => {
                      const Icon = item.icon
                      return (
                        <button
                          key={item.label}
                          onClick={() => {
                            setShowQuickAdd(false)
                            if (item.href) {
                              router.push(item.href)
                            }
                          }}
                          className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                        >
                          <Icon className="w-4 h-4 text-gray-500" />
                          {item.label}
                        </button>
                      )
                    })}
                  </div>
                </>
              )}
            </div>

            {/* Notifications */}
            <div className="relative">
              <button
                onClick={() => setShowNotifications(!showNotifications)}
                className="relative p-2.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors"
              >
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && (
                  <span className="absolute top-1 right-1 w-5 h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>

              {showNotifications && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setShowNotifications(false)}
                  />
                  <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-lg border border-gray-200 z-50 overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                      <h3 className="font-semibold text-gray-900">Notifications</h3>
                      {unreadCount > 0 && (
                        <span className="text-xs text-brand-orange font-medium">{unreadCount} new</span>
                      )}
                    </div>
                    <div className="max-h-96 overflow-y-auto">
                      {notifications.length === 0 ? (
                        <div className="px-4 py-8 text-center text-gray-500">
                          <Bell className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                          <p className="text-sm">No notifications</p>
                        </div>
                      ) : (
                        notifications.map((notification) => (
                          <div
                            key={notification.id}
                            className={`px-4 py-3 border-b border-gray-50 hover:bg-gray-50 cursor-pointer ${
                              !notification.read ? 'bg-brand-orange-50/50' : ''
                            }`}
                          >
                            <div className="flex items-start gap-3">
                              <div className={`w-2 h-2 rounded-full mt-2 ${
                                notification.read ? 'bg-gray-300' : 'bg-brand-orange'
                              }`} />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-900">{notification.title}</p>
                                <p className="text-xs text-gray-500 mt-0.5">{notification.description}</p>
                                <p className="text-xs text-gray-400 mt-1">{notification.time}</p>
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                    <div className="px-4 py-3 border-t border-gray-100 bg-gray-50">
                      <button className="text-sm text-brand-orange hover:text-brand-orange-700 font-medium w-full text-center">
                        View all notifications
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}

export default CoachHeader
