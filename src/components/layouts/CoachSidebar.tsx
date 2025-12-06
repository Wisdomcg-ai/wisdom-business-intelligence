'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import {
  LayoutDashboard,
  Users,
  MessageSquare,
  ListChecks,
  BarChart3,
  Settings,
  ChevronDown,
  Building2,
  LogOut,
  UserPlus,
  FileText
} from 'lucide-react'
import { useState, useMemo } from 'react'
import { useUnreadMessages } from '@/hooks/useUnreadMessages'

interface Client {
  id: string
  business_name: string
  status: string
}

interface CoachSidebarProps {
  clients?: Client[]
  userName?: string
  onLogout?: () => void
}

export function CoachSidebar({ clients = [], userName = 'Coach', onLogout }: CoachSidebarProps) {
  const pathname = usePathname()
  const [clientsExpanded, setClientsExpanded] = useState(true)

  // Get unread message count with real-time updates
  const { unreadCount } = useUnreadMessages({ role: 'coach' })

  // Build nav items with dynamic badge
  const mainNavItems = useMemo(() => [
    { href: '/coach/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { href: '/coach/clients', icon: Users, label: 'Clients' },
    { href: '/coach/messages', icon: MessageSquare, label: 'Messages', badge: unreadCount },
    { href: '/coach/sessions', icon: FileText, label: 'Session Notes' },
    { href: '/coach/actions', icon: ListChecks, label: 'Actions' },
    { href: '/coach/reports', icon: BarChart3, label: 'Reports' },
  ], [unreadCount])

  const isActive = (href: string) => {
    if (href === '/coach/dashboard') {
      return pathname === '/coach' || pathname === '/coach/dashboard'
    }
    return pathname?.startsWith(href) ?? false
  }

  const getStatusDot = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-400'
      case 'pending':
        return 'bg-yellow-400'
      default:
        return 'bg-gray-400'
    }
  }

  return (
    <aside className="w-64 bg-slate-900 text-white flex flex-col h-screen fixed left-0 top-0 z-40">
      {/* Logo/Brand */}
      <div className="p-5 border-b border-slate-700">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-brand-orange rounded-xl flex items-center justify-center">
            <span className="text-lg font-bold">W</span>
          </div>
          <div>
            <h1 className="font-bold text-lg">Wisdom</h1>
            <p className="text-xs text-slate-400">Coach Portal</p>
          </div>
        </div>
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 overflow-y-auto py-4">
        <div className="px-3 space-y-1">
          {mainNavItems.map((item) => {
            const Icon = item.icon
            const active = isActive(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors group ${
                  active
                    ? 'bg-brand-orange text-white'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Icon className={`w-5 h-5 ${active ? 'text-white' : 'text-slate-400 group-hover:text-white'}`} />
                <span className="font-medium">{item.label}</span>
                {item.badge !== undefined && item.badge > 0 && (
                  <span className="ml-auto bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                    {item.badge}
                  </span>
                )}
              </Link>
            )
          })}
        </div>

        {/* Clients Section */}
        <div className="mt-6 px-3">
          <button
            onClick={() => setClientsExpanded(!clientsExpanded)}
            className="flex items-center justify-between w-full px-3 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wider hover:text-slate-300"
          >
            <span>My Clients</span>
            <ChevronDown className={`w-4 h-4 transition-transform ${clientsExpanded ? '' : '-rotate-90'}`} />
          </button>

          {clientsExpanded && (
            <div className="mt-2 space-y-1">
              {/* Add New Client */}
              <Link
                href="/coach/clients/new"
                className="flex items-center gap-3 px-3 py-2 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
              >
                <UserPlus className="w-4 h-4" />
                <span className="text-sm">Add New Client</span>
              </Link>

              {/* Client List */}
              {clients.slice(0, 8).map((client) => {
                const clientActive = pathname?.includes(`/coach/clients/${client.id}`) ?? false
                return (
                  <Link
                    key={client.id}
                    href={`/coach/clients/${client.id}/view/dashboard`}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                      clientActive
                        ? 'bg-slate-800 text-white'
                        : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                    }`}
                  >
                    <div className={`w-2 h-2 rounded-full ${getStatusDot(client.status)}`} />
                    <Building2 className="w-4 h-4 flex-shrink-0" />
                    <span className="text-sm truncate">{client.business_name}</span>
                  </Link>
                )
              })}

              {clients.length > 8 && (
                <Link
                  href="/coach/clients"
                  className="flex items-center gap-3 px-3 py-2 text-sm text-brand-orange-400 hover:text-brand-orange-300"
                >
                  View all {clients.length} clients
                </Link>
              )}

              {clients.length === 0 && (
                <p className="px-3 py-2 text-sm text-gray-500">No clients yet</p>
              )}
            </div>
          )}
        </div>
      </nav>

      {/* Bottom Section */}
      <div className="border-t border-slate-700 p-3 space-y-1">
        <Link
          href="/coach/settings"
          className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
            pathname === '/coach/settings'
              ? 'bg-brand-orange text-white'
              : 'text-slate-300 hover:bg-slate-800 hover:text-white'
          }`}
        >
          <Settings className="w-5 h-5" />
          <span className="font-medium">Settings</span>
        </Link>

        <button
          onClick={onLogout}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-300 hover:bg-slate-800 hover:text-white transition-colors w-full"
        >
          <LogOut className="w-5 h-5" />
          <span className="font-medium">Sign Out</span>
        </button>
      </div>

      {/* User Info */}
      <div className="p-4 border-t border-slate-700 bg-slate-800/50">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-brand-orange rounded-full flex items-center justify-center">
            <span className="text-sm font-semibold">{userName.charAt(0).toUpperCase()}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">{userName}</p>
            <p className="text-xs text-slate-400">Coach</p>
          </div>
        </div>
      </div>
    </aside>
  )
}

export default CoachSidebar
