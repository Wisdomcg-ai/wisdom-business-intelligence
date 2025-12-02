'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import {
  LayoutDashboard,
  Building2,
  Target,
  TrendingUp,
  Calendar,
  ListChecks,
  FileText,
  MessageSquare,
  Settings,
  LogOut,
  User,
  HelpCircle,
  ChevronLeft,
  ChevronRight
} from 'lucide-react'

interface Coach {
  name: string
  email?: string
}

interface ClientSidebarProps {
  businessName?: string
  userName?: string
  coach?: Coach
  onLogout?: () => void
  isExpanded: boolean
  onToggle: () => void
}

const mainNavItems = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/business-profile', icon: Building2, label: 'My Business' },
  { href: '/business-roadmap', icon: Target, label: 'Roadmap' },
  { href: '/goals', icon: Target, label: 'Goals & Planning' },
  { href: '/finances/forecast', icon: TrendingUp, label: 'Financials' },
  { href: '/quarterly-review', icon: Calendar, label: 'Quarterly Review' },
  { href: '/actions', icon: ListChecks, label: 'Actions' },
  { href: '/documents', icon: FileText, label: 'Documents' },
  { href: '/messages', icon: MessageSquare, label: 'Messages' },
]

export function ClientSidebar({ businessName = 'My Business', userName = 'User', coach, onLogout, isExpanded, onToggle }: ClientSidebarProps) {
  const pathname = usePathname()

  const isActive = (href: string) => {
    if (href === '/dashboard') {
      return pathname === '/' || pathname === '/dashboard'
    }
    return pathname?.startsWith(href) ?? false
  }

  return (
    <aside className={`${isExpanded ? 'w-64' : 'w-[72px]'} bg-white border-r border-gray-200 flex flex-col h-screen fixed left-0 top-0 z-40 transition-all duration-300`}>
      {/* Logo/Brand */}
      <div className={`${isExpanded ? 'p-5' : 'p-3'} border-b border-gray-100`}>
        <div className={`flex items-center ${isExpanded ? 'gap-3' : 'justify-center'}`}>
          <div className="w-10 h-10 bg-teal-600 rounded-xl flex items-center justify-center flex-shrink-0">
            <span className="text-lg font-bold text-white">W</span>
          </div>
          {isExpanded && (
            <div>
              <h1 className="font-bold text-lg text-gray-900">Wisdom</h1>
              <p className="text-xs text-gray-500">Business Intelligence</p>
            </div>
          )}
        </div>
      </div>

      {/* Business Name */}
      <div className={`${isExpanded ? 'px-5' : 'px-3'} py-4 bg-teal-50 border-b border-teal-100`}>
        <div className={`flex items-center ${isExpanded ? 'gap-3' : 'justify-center'}`}>
          <div className="w-8 h-8 bg-teal-600 rounded-lg flex items-center justify-center flex-shrink-0" title={!isExpanded ? businessName : undefined}>
            <Building2 className="w-4 h-4 text-white" />
          </div>
          {isExpanded && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate">{businessName}</p>
              <p className="text-xs text-teal-600">Client Portal</p>
            </div>
          )}
        </div>
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 overflow-y-auto py-4">
        <div className={`${isExpanded ? 'px-3' : 'px-2'} space-y-1`}>
          {mainNavItems.map((item) => {
            const Icon = item.icon
            const active = isActive(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                title={!isExpanded ? item.label : undefined}
                className={`flex items-center ${isExpanded ? 'gap-3 px-3' : 'justify-center px-2'} py-2.5 rounded-lg transition-colors group ${
                  active
                    ? 'bg-teal-50 text-teal-700 border border-teal-200'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                <Icon className={`w-5 h-5 flex-shrink-0 ${active ? 'text-teal-600' : 'text-gray-400 group-hover:text-gray-600'}`} />
                {isExpanded && <span className="font-medium">{item.label}</span>}
              </Link>
            )
          })}
        </div>

        {/* Your Coach Section */}
        {coach && isExpanded && (
          <div className="mt-6 px-3">
            <div className="px-3 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Your Coach
            </div>
            <div className="mt-2 mx-3 p-4 bg-gradient-to-br from-teal-50 to-cyan-50 rounded-xl border border-teal-100">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-teal-600 rounded-full flex items-center justify-center">
                  <User className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="font-semibold text-gray-900">{coach.name}</p>
                  <p className="text-xs text-gray-500">Business Coach</p>
                </div>
              </div>
              <div className="space-y-2">
                <Link
                  href="/messages"
                  className="flex items-center gap-2 px-3 py-2 bg-white rounded-lg text-sm text-teal-700 hover:bg-teal-50 transition-colors border border-teal-100"
                >
                  <MessageSquare className="w-4 h-4" />
                  Message Coach
                </Link>
                <Link
                  href="/schedule-session"
                  className="flex items-center gap-2 px-3 py-2 bg-white rounded-lg text-sm text-teal-700 hover:bg-teal-50 transition-colors border border-teal-100"
                >
                  <Calendar className="w-4 h-4" />
                  Request Session
                </Link>
              </div>
            </div>
          </div>
        )}
        {/* Collapsed coach indicator */}
        {coach && !isExpanded && (
          <div className="mt-6 px-2">
            <Link
              href="/messages"
              title={`Message ${coach.name}`}
              className="flex items-center justify-center p-2.5 rounded-lg text-gray-600 hover:bg-teal-50 hover:text-teal-700 transition-colors"
            >
              <User className="w-5 h-5" />
            </Link>
          </div>
        )}
      </nav>

      {/* Toggle Button */}
      <div className={`${isExpanded ? 'px-3' : 'px-2'} py-2 border-t border-gray-100`}>
        <button
          onClick={onToggle}
          className={`flex items-center ${isExpanded ? 'gap-3 px-3' : 'justify-center px-2'} py-2.5 rounded-lg text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors w-full`}
          title={isExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
        >
          {isExpanded ? (
            <>
              <ChevronLeft className="w-5 h-5 text-gray-400" />
              <span className="font-medium">Collapse</span>
            </>
          ) : (
            <ChevronRight className="w-5 h-5 text-gray-400" />
          )}
        </button>
      </div>

      {/* Bottom Section */}
      <div className={`border-t border-gray-100 ${isExpanded ? 'p-3' : 'p-2'} space-y-1`}>
        <Link
          href="/help"
          title={!isExpanded ? 'Help & Support' : undefined}
          className={`flex items-center ${isExpanded ? 'gap-3 px-3' : 'justify-center px-2'} py-2.5 rounded-lg text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors`}
        >
          <HelpCircle className="w-5 h-5 text-gray-400" />
          {isExpanded && <span className="font-medium">Help & Support</span>}
        </Link>

        <Link
          href="/settings"
          title={!isExpanded ? 'Settings' : undefined}
          className={`flex items-center ${isExpanded ? 'gap-3 px-3' : 'justify-center px-2'} py-2.5 rounded-lg transition-colors ${
            pathname === '/settings'
              ? 'bg-teal-50 text-teal-700 border border-teal-200'
              : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
          }`}
        >
          <Settings className="w-5 h-5 text-gray-400" />
          {isExpanded && <span className="font-medium">Settings</span>}
        </Link>

        <button
          onClick={onLogout}
          title={!isExpanded ? 'Sign Out' : undefined}
          className={`flex items-center ${isExpanded ? 'gap-3 px-3' : 'justify-center px-2'} py-2.5 rounded-lg text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors w-full`}
        >
          <LogOut className="w-5 h-5 text-gray-400" />
          {isExpanded && <span className="font-medium">Sign Out</span>}
        </button>
      </div>

      {/* User Info */}
      <div className={`${isExpanded ? 'p-4' : 'p-2'} border-t border-gray-100 bg-gray-50`}>
        <div className={`flex items-center ${isExpanded ? 'gap-3' : 'justify-center'}`}>
          <div className="w-9 h-9 bg-teal-600 rounded-full flex items-center justify-center flex-shrink-0" title={!isExpanded ? userName : undefined}>
            <span className="text-sm font-semibold text-white">{userName.charAt(0).toUpperCase()}</span>
          </div>
          {isExpanded && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{userName}</p>
              <p className="text-xs text-gray-500">Business Owner</p>
            </div>
          )}
        </div>
      </div>
    </aside>
  )
}

export default ClientSidebar
