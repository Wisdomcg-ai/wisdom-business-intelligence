'use client'

import { useState, useEffect, createContext, useContext, ReactNode, useMemo } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getUserSystemRole } from '@/lib/auth/roles'
import {
  LayoutDashboard,
  Users,
  MessageSquare,
  Calendar,
  ListChecks,
  BarChart3,
  Settings,
  LogOut,
  ChevronDown,
  Building2,
  Bell,
  Search,
  Menu,
  X,
  Briefcase,
  Shield,
  HelpCircle,
  ExternalLink,
  UserPlus
} from 'lucide-react'
import { useUnreadMessages } from '@/hooks/useUnreadMessages'

// Context for coach data sharing
interface CoachContextType {
  user: { name: string; email: string; initials: string } | null
  clients: Client[]
  refreshData: () => void
}

interface Client {
  id: string
  business_name: string
  status: string
}

const CoachContext = createContext<CoachContextType>({ user: null, clients: [], refreshData: () => {} })
export const useCoach = () => useContext(CoachContext)

interface CoachLayoutNewProps {
  children: ReactNode
}

const navigation = [
  {
    name: 'Dashboard',
    href: '/coach/dashboard',
    icon: LayoutDashboard,
    description: 'Overview & quick actions'
  },
  {
    name: 'Clients',
    href: '/coach/clients',
    icon: Building2,
    description: 'Manage your clients'
  },
  {
    name: 'Schedule',
    href: '/coach/schedule',
    icon: Calendar,
    description: 'Sessions & calendar'
  },
  {
    name: 'Messages',
    href: '/coach/messages',
    icon: MessageSquare,
    description: 'Client conversations',
    badge: true // Will show unread count
  },
  {
    name: 'Actions',
    href: '/coach/actions',
    icon: ListChecks,
    description: 'Track action items'
  },
  {
    name: 'Reports',
    href: '/coach/reports',
    icon: BarChart3,
    description: 'Analytics & insights'
  },
]

const secondaryNavigation = [
  { name: 'Settings', href: '/coach/settings', icon: Settings },
  { name: 'Help', href: '/coach/help', icon: HelpCircle },
]

export default function CoachLayoutNew({ children }: CoachLayoutNewProps) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [user, setUser] = useState<{ name: string; email: string; initials: string } | null>(null)
  const [clients, setClients] = useState<Client[]>([])
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [clientsExpanded, setClientsExpanded] = useState(true)
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)

  // Get unread message count
  const { unreadCount } = useUnreadMessages({ role: 'coach' })

  // Check if we're on login page
  const isPublicPage = pathname === '/coach/login'

  useEffect(() => {
    if (!isPublicPage) {
      checkAuth()
    } else {
      setLoading(false)
    }
  }, [isPublicPage])

  // Close sidebar on route change (mobile)
  useEffect(() => {
    setSidebarOpen(false)
  }, [pathname])

  // Close user menu when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (showUserMenu) {
        setShowUserMenu(false)
      }
    }
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [showUserMenu])

  async function checkAuth() {
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (!authUser) {
        router.push('/coach/login')
        return
      }

      const role = await getUserSystemRole()
      if (role !== 'coach' && role !== 'super_admin') {
        router.push('/login')
        return
      }

      setIsSuperAdmin(role === 'super_admin')

      const firstName = authUser.user_metadata?.first_name || ''
      const lastName = authUser.user_metadata?.last_name || ''
      const name = firstName ? `${firstName} ${lastName}`.trim() : authUser.email?.split('@')[0] || 'Coach'
      const initials = firstName && lastName
        ? `${firstName[0]}${lastName[0]}`.toUpperCase()
        : name.slice(0, 2).toUpperCase()

      setUser({
        name,
        email: authUser.email || '',
        initials
      })

      // Load clients
      await loadClients(authUser.id)

      setLoading(false)
    } catch (error) {
      console.error('[CoachLayout] Auth error:', error)
      router.push('/coach/login')
    }
  }

  async function loadClients(userId: string) {
    try {
      const { data, error } = await supabase
        .from('businesses')
        .select('id, business_name, status')
        .eq('assigned_coach_id', userId)
        .order('business_name', { ascending: true })

      if (!error && data) {
        setClients(data.map(b => ({
          id: b.id,
          business_name: b.business_name || 'Unnamed Business',
          status: b.status || 'active'
        })))
      }
    } catch (error) {
      console.error('[CoachLayout] Error loading clients:', error)
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/coach/login')
  }

  function switchToAdminPortal() {
    router.push('/admin')
  }

  function refreshData() {
    checkAuth()
  }

  const getStatusDot = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-400'
      case 'pending': return 'bg-yellow-400'
      case 'at-risk': return 'bg-red-400'
      default: return 'bg-gray-400'
    }
  }

  // For public pages, render without layout
  if (isPublicPage) {
    return <>{children}</>
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-brand-navy flex items-center justify-center">
        <div className="flex flex-col items-center gap-6">
          <div className="relative">
            <Image
              src="/images/logo-wbi.png"
              alt="WisdomBi"
              width={410}
              height={170}
              className="h-14 w-auto animate-pulse"
              priority
            />
            <div className="absolute -inset-2 border-4 border-brand-orange/30 border-t-brand-orange rounded-full animate-spin" />
          </div>
          <div className="text-center">
            <p className="text-white font-medium text-lg">Loading Coach Portal</p>
            <p className="text-brand-orange-300 text-sm mt-1">Please wait...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <CoachContext.Provider value={{ user, clients, refreshData }}>
      <div className="min-h-screen bg-slate-100">
        {/* Mobile sidebar backdrop */}
        <div
          className={`fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-40 lg:hidden transition-opacity duration-300 ${
            sidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
          onClick={() => setSidebarOpen(false)}
        />

        {/* Sidebar */}
        <aside className={`
          fixed top-0 left-0 z-50 h-full w-[280px] bg-slate-900
          transform transition-transform duration-300 ease-out
          lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        `}>
          <div className="flex flex-col h-full">
            {/* Logo Header */}
            <div className="bg-white px-4 py-3 border-b border-gray-200">
              <div className="flex items-center justify-center relative">
                <Link href="/coach/dashboard" className="block">
                  <Image
                    src="/images/logo-wbi.png"
                    alt="WisdomBi"
                    width={410}
                    height={170}
                    className="h-12 w-auto"
                    priority
                  />
                </Link>
                <button
                  onClick={() => setSidebarOpen(false)}
                  className="lg:hidden absolute right-0 p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Main Navigation */}
            <nav className="flex-1 px-3 py-6 overflow-y-auto">
              <div className="space-y-1">
                {navigation.map((item) => {
                  const isActive = item.href === '/coach/dashboard'
                    ? pathname === '/coach' || pathname === '/coach/dashboard'
                    : pathname?.startsWith(item.href)

                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      className={`
                        group flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium
                        transition-all duration-200 relative
                        ${isActive
                          ? 'bg-gradient-to-r from-brand-orange/20 to-brand-orange/5 text-white'
                          : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                        }
                      `}
                    >
                      {/* Active indicator */}
                      {isActive && (
                        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-brand-orange rounded-r-full" />
                      )}

                      <item.icon className={`w-5 h-5 flex-shrink-0 ${isActive ? 'text-brand-orange' : 'text-gray-500 group-hover:text-slate-300'}`} />
                      <div className="flex-1 min-w-0">
                        <div className={isActive ? 'text-white' : ''}>{item.name}</div>
                        <div className="text-xs text-gray-500 truncate">{item.description}</div>
                      </div>
                      {item.badge && unreadCount > 0 && (
                        <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                          {unreadCount}
                        </span>
                      )}
                    </Link>
                  )
                })}
              </div>

              {/* My Clients Section */}
              <div className="mt-8 pt-6 border-t border-slate-800/80">
                <button
                  onClick={() => setClientsExpanded(!clientsExpanded)}
                  className="w-full flex items-center justify-between px-4 mb-3 text-xs font-semibold text-gray-600 uppercase tracking-wider hover:text-slate-400 transition-colors"
                >
                  <span>My Clients</span>
                  <ChevronDown className={`w-4 h-4 transition-transform ${clientsExpanded ? '' : '-rotate-90'}`} />
                </button>

                {clientsExpanded && (
                  <div className="space-y-1">
                    <Link
                      href="/coach/clients/new"
                      className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium text-gray-500 hover:text-slate-300 hover:bg-slate-800/50 transition-all duration-200"
                    >
                      <UserPlus className="w-4 h-4" />
                      Add New Client
                    </Link>

                    {clients.slice(0, 6).map((client) => {
                      const clientActive = pathname?.includes(`/coach/clients/${client.id}`)
                      return (
                        <Link
                          key={client.id}
                          href={`/coach/clients/${client.id}`}
                          className={`
                            flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200
                            ${clientActive
                              ? 'bg-slate-800 text-white'
                              : 'text-gray-500 hover:text-slate-300 hover:bg-slate-800/50'
                            }
                          `}
                        >
                          <div className={`w-2 h-2 rounded-full ${getStatusDot(client.status)}`} />
                          <span className="truncate">{client.business_name}</span>
                        </Link>
                      )
                    })}

                    {clients.length > 6 && (
                      <Link
                        href="/coach/clients"
                        className="flex items-center gap-3 px-4 py-2 text-sm text-brand-orange hover:text-brand-orange-400"
                      >
                        View all {clients.length} clients
                      </Link>
                    )}

                    {clients.length === 0 && (
                      <p className="px-4 py-2 text-sm text-gray-600">No clients yet</p>
                    )}
                  </div>
                )}
              </div>

              {/* Secondary Navigation */}
              <div className="mt-8 pt-6 border-t border-slate-800/80">
                <p className="px-4 mb-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Support
                </p>
                <div className="space-y-1">
                  {secondaryNavigation.map((item) => {
                    const isActive = pathname?.startsWith(item.href)
                    return (
                      <Link
                        key={item.name}
                        href={item.href}
                        className={`
                          flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200
                          ${isActive
                            ? 'bg-slate-800 text-white'
                            : 'text-gray-500 hover:text-slate-300 hover:bg-slate-800/50'
                          }
                        `}
                      >
                        <item.icon className="w-4 h-4" />
                        {item.name}
                      </Link>
                    )
                  })}
                </div>
              </div>
            </nav>

            {/* Admin Portal Switcher (only for super_admin) */}
            {isSuperAdmin && (
              <div className="px-3 py-3 border-t border-slate-800/80">
                <button
                  onClick={switchToAdminPortal}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-800/60 transition-all duration-200 group"
                >
                  <div className="w-8 h-8 bg-brand-navy-500/20 rounded-lg flex items-center justify-center group-hover:bg-brand-navy-500/30 transition-colors">
                    <Shield className="w-4 h-4 text-brand-navy-400" />
                  </div>
                  <span className="flex-1 text-left">Admin Portal</span>
                  <ExternalLink className="w-4 h-4 text-gray-600 group-hover:text-slate-400" />
                </button>
              </div>
            )}

            {/* User Profile */}
            <div className="p-3 border-t border-slate-800/80">
              <div className="relative">
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setShowUserMenu(!showUserMenu)
                  }}
                  className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-slate-800/60 transition-all duration-200"
                >
                  <div className="w-10 h-10 bg-gradient-to-br from-brand-orange to-brand-orange-600 rounded-xl flex items-center justify-center text-white font-bold text-sm shadow-lg shadow-brand-orange/20">
                    {user?.initials}
                  </div>
                  <div className="flex-1 text-left min-w-0">
                    <p className="text-white text-sm font-medium truncate">{user?.name}</p>
                    <p className="text-gray-500 text-xs truncate">{user?.email}</p>
                  </div>
                  <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform duration-200 ${showUserMenu ? 'rotate-180' : ''}`} />
                </button>

                {/* User Dropdown */}
                {showUserMenu && (
                  <div
                    className="absolute bottom-full left-0 right-0 mb-2 bg-slate-800 rounded-xl shadow-xl border border-slate-700/50 overflow-hidden animate-in slide-in-from-bottom-2 duration-200"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="p-2">
                      <button
                        onClick={handleLogout}
                        className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-slate-300 hover:bg-slate-700 hover:text-white rounded-lg transition-colors"
                      >
                        <LogOut className="w-4 h-4" />
                        Sign out
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </aside>

        {/* Main Content Area */}
        <div className="lg:pl-[280px] min-h-screen flex flex-col">
          {/* Top Header Bar */}
          <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-xl border-b border-slate-200/80">
            <div className="flex items-center justify-between h-16 px-4 sm:px-6">
              {/* Left side */}
              <div className="flex items-center gap-4">
                {/* Mobile menu button */}
                <button
                  onClick={() => setSidebarOpen(true)}
                  className="lg:hidden p-2 text-gray-600 hover:text-brand-navy hover:bg-slate-100 rounded-xl transition-colors"
                >
                  <Menu className="w-5 h-5" />
                </button>

                {/* Search */}
                <div className="hidden sm:block">
                  <div className="relative group">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-brand-orange transition-colors" />
                    <input
                      type="text"
                      placeholder="Search clients..."
                      className="w-72 lg:w-80 pl-10 pr-4 py-2.5 bg-slate-100 border-0 rounded-xl text-sm placeholder-slate-400 focus:ring-2 focus:ring-brand-orange/20 focus:bg-white transition-all"
                    />
                  </div>
                </div>
              </div>

              {/* Right side */}
              <div className="flex items-center gap-2">
                {/* Mobile search */}
                <button className="sm:hidden p-2 text-gray-600 hover:text-brand-navy hover:bg-slate-100 rounded-xl transition-colors">
                  <Search className="w-5 h-5" />
                </button>

                {/* Notifications */}
                <button className="relative p-2 text-gray-600 hover:text-brand-navy hover:bg-slate-100 rounded-xl transition-colors">
                  <Bell className="w-5 h-5" />
                  {unreadCount > 0 && (
                    <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full ring-2 ring-white" />
                  )}
                </button>

                {/* Mobile user avatar */}
                <button
                  onClick={() => setSidebarOpen(true)}
                  className="lg:hidden w-9 h-9 bg-gradient-to-br from-brand-orange to-brand-orange-600 rounded-xl flex items-center justify-center text-white font-semibold text-sm shadow-lg shadow-brand-orange/20"
                >
                  {user?.initials}
                </button>
              </div>
            </div>
          </header>

          {/* Page Content */}
          <main className="flex-1 p-4 sm:p-6 lg:p-8">
            {children}
          </main>

          {/* Footer */}
          <footer className="border-t border-slate-200 bg-white px-4 sm:px-6 py-4">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-gray-500">
              <p>&copy; 2025 WisdomBi. All rights reserved.</p>
              <div className="flex items-center gap-3">
                <Link href="/privacy" className="hover:text-brand-orange">Privacy</Link>
                <span>•</span>
                <Link href="/terms" className="hover:text-brand-orange">Terms</Link>
                <span>•</span>
                <Link href="/help" className="hover:text-brand-orange">Help</Link>
              </div>
            </div>
          </footer>
        </div>
      </div>
    </CoachContext.Provider>
  )
}
