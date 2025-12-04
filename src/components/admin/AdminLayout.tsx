'use client'

import { useState, useEffect, createContext, useContext, ReactNode } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getUserSystemRole } from '@/lib/auth/roles'
import {
  LayoutDashboard,
  Users,
  Briefcase,
  Settings,
  LogOut,
  ChevronDown,
  Bell,
  Search,
  Menu,
  X,
  Building2,
  Shield,
  HelpCircle,
  ExternalLink
} from 'lucide-react'

// Context for admin data sharing
interface AdminContextType {
  user: { name: string; email: string; initials: string } | null
  refreshData: () => void
}

const AdminContext = createContext<AdminContextType>({ user: null, refreshData: () => {} })
export const useAdmin = () => useContext(AdminContext)

interface AdminLayoutProps {
  children: ReactNode
}

const navigation = [
  {
    name: 'Dashboard',
    href: '/admin/dashboard-new',
    icon: LayoutDashboard,
    description: 'Overview & quick actions'
  },
  {
    name: 'Clients',
    href: '/admin/clients-new',
    icon: Building2,
    description: 'Manage client businesses'
  },
  {
    name: 'Coaches',
    href: '/admin/coaches-new',
    icon: Briefcase,
    description: 'Manage coaching team'
  },
  {
    name: 'All Users',
    href: '/admin/users-new',
    icon: Users,
    description: 'User accounts & passwords'
  },
]

const secondaryNavigation = [
  { name: 'Settings', href: '/admin/settings', icon: Settings },
  { name: 'Help', href: '/admin/help', icon: HelpCircle },
]

export default function AdminLayout({ children }: AdminLayoutProps) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [user, setUser] = useState<{ name: string; email: string; initials: string } | null>(null)
  const [showUserMenu, setShowUserMenu] = useState(false)

  useEffect(() => {
    checkAuth()
  }, [])

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
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) {
      router.push('/admin/login')
      return
    }

    const role = await getUserSystemRole()
    if (role !== 'super_admin') {
      router.push('/login')
      return
    }

    const firstName = authUser.user_metadata?.first_name || ''
    const lastName = authUser.user_metadata?.last_name || ''
    const name = firstName ? `${firstName} ${lastName}`.trim() : authUser.email?.split('@')[0] || 'Admin'
    const initials = firstName && lastName
      ? `${firstName[0]}${lastName[0]}`.toUpperCase()
      : name.slice(0, 2).toUpperCase()

    setUser({
      name,
      email: authUser.email || '',
      initials
    })
    setLoading(false)
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/admin/login')
  }

  function switchToCoachPortal() {
    router.push('/coach/clients')
  }

  function refreshData() {
    // Trigger a refresh - child components can call this
    checkAuth()
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="w-16 h-16 border-4 border-slate-700 rounded-full" />
            <div className="absolute inset-0 w-16 h-16 border-4 border-teal-500 border-t-transparent rounded-full animate-spin" />
          </div>
          <div className="text-center">
            <p className="text-white font-medium">Loading Admin Portal</p>
            <p className="text-slate-500 text-sm mt-1">Please wait...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <AdminContext.Provider value={{ user, refreshData }}>
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
            <div className="flex items-center justify-between h-16 px-5 border-b border-slate-800/80">
              <Link href="/admin" className="flex items-center gap-3 group">
                <div className="w-10 h-10 bg-gradient-to-br from-teal-400 to-teal-600 rounded-xl flex items-center justify-center shadow-lg shadow-teal-500/25 group-hover:shadow-teal-500/40 transition-shadow">
                  <Shield className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h1 className="text-white font-bold text-lg tracking-tight">Wisdom BI</h1>
                  <p className="text-slate-500 text-[11px] font-medium uppercase tracking-wider">Admin Portal</p>
                </div>
              </Link>
              <button
                onClick={() => setSidebarOpen(false)}
                className="lg:hidden p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Main Navigation */}
            <nav className="flex-1 px-3 py-6 overflow-y-auto">
              <div className="space-y-1">
                {navigation.map((item) => {
                  const isActive = item.href === '/admin/dashboard-new'
                    ? pathname === '/admin/dashboard-new'
                    : pathname?.startsWith(item.href)

                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      className={`
                        group flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium
                        transition-all duration-200 relative
                        ${isActive
                          ? 'bg-gradient-to-r from-teal-500/20 to-teal-500/5 text-white'
                          : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                        }
                      `}
                    >
                      {/* Active indicator */}
                      {isActive && (
                        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-teal-500 rounded-r-full" />
                      )}

                      <item.icon className={`w-5 h-5 flex-shrink-0 ${isActive ? 'text-teal-400' : 'text-slate-500 group-hover:text-slate-300'}`} />
                      <div className="flex-1 min-w-0">
                        <div className={isActive ? 'text-white' : ''}>{item.name}</div>
                        <div className="text-[11px] text-slate-500 truncate">{item.description}</div>
                      </div>
                    </Link>
                  )
                })}
              </div>

              {/* Secondary Navigation */}
              <div className="mt-8 pt-6 border-t border-slate-800/80">
                <p className="px-4 mb-3 text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
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
                            : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/50'
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

            {/* Portal Switcher */}
            <div className="px-3 py-3 border-t border-slate-800/80">
              <button
                onClick={switchToCoachPortal}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-800/60 transition-all duration-200 group"
              >
                <div className="w-8 h-8 bg-indigo-500/20 rounded-lg flex items-center justify-center group-hover:bg-indigo-500/30 transition-colors">
                  <Briefcase className="w-4 h-4 text-indigo-400" />
                </div>
                <span className="flex-1 text-left">Coach Portal</span>
                <ExternalLink className="w-4 h-4 text-slate-600 group-hover:text-slate-400" />
              </button>
            </div>

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
                  <div className="w-10 h-10 bg-gradient-to-br from-teal-400 to-emerald-500 rounded-xl flex items-center justify-center text-white font-bold text-sm shadow-lg shadow-teal-500/20">
                    {user?.initials}
                  </div>
                  <div className="flex-1 text-left min-w-0">
                    <p className="text-white text-sm font-medium truncate">{user?.name}</p>
                    <p className="text-slate-500 text-xs truncate">{user?.email}</p>
                  </div>
                  <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform duration-200 ${showUserMenu ? 'rotate-180' : ''}`} />
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
                  className="lg:hidden p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors"
                >
                  <Menu className="w-5 h-5" />
                </button>

                {/* Search */}
                <div className="hidden sm:block">
                  <div className="relative group">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-teal-500 transition-colors" />
                    <input
                      type="text"
                      placeholder="Search clients, coaches..."
                      className="w-72 lg:w-80 pl-10 pr-12 py-2.5 bg-slate-100 border-0 rounded-xl text-sm placeholder-slate-400 focus:ring-2 focus:ring-teal-500/20 focus:bg-white transition-all"
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 hidden sm:flex items-center gap-0.5">
                      <kbd className="px-1.5 py-0.5 bg-slate-200/80 text-slate-500 text-[10px] rounded font-medium">⌘</kbd>
                      <kbd className="px-1.5 py-0.5 bg-slate-200/80 text-slate-500 text-[10px] rounded font-medium">K</kbd>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right side */}
              <div className="flex items-center gap-2">
                {/* Mobile search */}
                <button className="sm:hidden p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors">
                  <Search className="w-5 h-5" />
                </button>

                {/* Notifications */}
                <button className="relative p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors">
                  <Bell className="w-5 h-5" />
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full ring-2 ring-white" />
                </button>

                {/* Mobile user avatar */}
                <button
                  onClick={() => setSidebarOpen(true)}
                  className="lg:hidden w-9 h-9 bg-gradient-to-br from-teal-400 to-emerald-500 rounded-xl flex items-center justify-center text-white font-semibold text-sm shadow-lg shadow-teal-500/20"
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
            <div className="flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500">
              <p>© 2024 Wisdom Business Intelligence. All rights reserved.</p>
              <p>Admin Portal v2.0</p>
            </div>
          </footer>
        </div>
      </div>
    </AdminContext.Provider>
  )
}
