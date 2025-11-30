'use client'

import { useState, useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import {
  LayoutDashboard,
  ClipboardCheck,
  Target,
  FileText,
  TrendingUp,
  BarChart3,
  Banknote,
  Calendar,
  CalendarCheck,
  CheckSquare,
  XCircle,
  AlertCircle,
  Layers,
  Eye,
  Activity,
  Users,
  Building2,
  Settings,
  Zap,
  HelpCircle,
  MessageSquare,
  LineChart,
  MessageCircle,
  FileQuestion,
  FolderOpen,
  Compass,
  Award,
  Network,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  LogOut,
  User,
} from 'lucide-react'

interface NavItem {
  label: string
  href: string
  icon: any
  badge?: string
  disabled?: boolean
  children?: NavItem[]
}

interface NavSection {
  title: string
  items: NavItem[]
  defaultOpen?: boolean
  roleRequired?: 'coach' | 'client' | 'all'
}

interface BusinessData {
  name: string
  assessmentScore: string
  stage: string
  revenueTarget: number
  profitTarget: number
}

const getNavigation = (userRole: 'coach' | 'client'): NavSection[] => {
  const navigation: NavSection[] = [
    {
      title: 'DASHBOARD',
      defaultOpen: true,
      items: [{ label: 'Home', href: '/dashboard', icon: LayoutDashboard }],
    },
    {
      title: 'START HERE',
      defaultOpen: true,
      items: [
        { label: 'Business Profile', href: '/business-profile', icon: Building2 },
        { label: 'Business Assessment', href: '/assessment', icon: ClipboardCheck },
      ],
    },
    {
      title: 'ROADMAP',
      defaultOpen: true,
      items: [
        { label: 'Business Roadmap', href: '/business-roadmap', icon: Compass },
      ],
    },
    {
      title: 'BUSINESS PLAN',
      defaultOpen: true,
      items: [
        { label: 'Vision, Mission & Values', href: '/vision-mission', icon: Target },
        { label: 'SWOT Analysis', href: '/swot', icon: FileText },
        { label: 'Goals & Targets', href: '/goals', icon: Award },
        { label: 'One-Page Plan', href: '/one-page-plan', icon: FileText },
      ],
    },
    {
      title: 'FINANCES',
      defaultOpen: true,
      items: [
        { label: 'Financial Forecast', href: '/finances/forecast', icon: TrendingUp },
        { label: 'Budget vs Actual', href: '/finances/budget', icon: FileText },
        { label: '13-Week Cashflow', href: '/finances/cashflow', icon: Banknote, disabled: true },
      ],
    },
    {
      title: 'EXECUTE',
      defaultOpen: true,
      items: [
        { label: 'Business Dashboard', href: '/business-dashboard', icon: BarChart3 },
        { label: 'Issues List', href: '/issues-list', icon: AlertCircle },
      ],
    },
    {
      title: 'PRODUCTIVITY',
      defaultOpen: true,
      items: [
        { label: 'Open Loops', href: '/open-loops', icon: Layers },
        { label: 'To-Do', href: '/todo', icon: CheckSquare },
        { label: 'Stop Doing', href: '/stop-doing', icon: XCircle },
      ],
    },
    {
      title: 'REVIEWS',
      defaultOpen: true,
      items: [
        { label: 'Weekly Review', href: '/reviews/weekly', icon: Calendar },
        { label: 'Quarterly Review', href: '/quarterly-review', icon: CalendarCheck },
      ],
    },
    {
      title: 'BUSINESS ENGINES',
      defaultOpen: false,
      items: [
        {
          label: 'Marketing',
          href: '/engines/marketing',
          icon: LineChart,
          children: [
            { label: 'Value Proposition & USP', href: '/marketing/value-prop', icon: Target },
            { label: 'Marketing Channels', href: '/marketing/channels', icon: LineChart },
            { label: 'Content Planner', href: '/marketing/content', icon: FileText },
          ],
        },
        {
          label: 'Team',
          href: '/engines/team',
          icon: Users,
          children: [
            { label: 'Accountability Chart', href: '/team/accountability', icon: Network },
            { label: 'Org Chart Builder', href: '/team/org-chart', icon: Users },
            { label: 'Team Performance', href: '/team-performance', icon: Activity },
            { label: 'Hiring Roadmap', href: '/team/hiring-roadmap', icon: Building2 },
          ],
        },
        {
          label: 'Systems',
          href: '/engines/systems',
          icon: Settings,
          children: [
            { label: 'Systems & Processes', href: '/systems/processes', icon: Settings, disabled: true },
          ],
        },
      ],
    },
  ]

  if (userRole === 'coach') {
    navigation.push({
      title: 'COACH TOOLS',
      defaultOpen: false,
      items: [
        { label: 'Coach Notes', href: '/coach/notes', icon: MessageSquare, badge: 'Private' },
        { label: 'Client Overview', href: '/coach/clients', icon: Eye },
        { label: 'Engagement Tracking', href: '/coach/engagement', icon: LineChart },
        { label: 'Client Questions', href: '/coach/questions', icon: FileQuestion, badge: '3 New' },
      ],
    })
  } else {
    navigation.push({
      title: 'COACHING',
      defaultOpen: true,
      items: [
        { label: 'Messages', href: '/messages', icon: MessageCircle },
        { label: 'Session Notes', href: '/sessions', icon: FileText },
        { label: 'Resources', href: '/coaching/resources', icon: FolderOpen, disabled: true },
      ],
    })
  }

  return navigation
}

export default function SidebarLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [expandedSections, setExpandedSections] = useState<string[]>([
    'DASHBOARD',
    'START HERE',
    'ROADMAP',
    'BUSINESS PLAN',
    'FINANCES',
    'EXECUTE',
    'PRODUCTIVITY',
    'COACHING',
  ])
  const [expandedSubItems, setExpandedSubItems] = useState<string[]>([])
  const [navigation, setNavigation] = useState<NavSection[]>([])
  const [businessData, setBusinessData] = useState<BusinessData>({
    name: 'My Business',
    assessmentScore: '--',
    stage: 'BUILDING',
    revenueTarget: 0,
    profitTarget: 0,
  })
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [userName, setUserName] = useState<string>('User Account')
  const [userEmail, setUserEmail] = useState<string>('user@example.com')

  // Don't render client sidebar for coach routes, auth routes, or marketing pages
  const isCoachRoute = pathname?.startsWith('/coach')
  const isAdminRoute = pathname?.startsWith('/admin')
  const isAuthRoute = pathname?.startsWith('/auth') || pathname?.startsWith('/login')
  const isHomePage = pathname === '/'

  useEffect(() => {
    const loadUserData = async () => {
      try {
        // Load user data from Supabase - force fresh fetch
        const { data: { user }, error } = await supabase.auth.getUser()
        console.log('[Sidebar] Current user:', user?.email, error?.message)

        if (user) {
          const name = user.user_metadata?.first_name
            ? `${user.user_metadata.first_name} ${user.user_metadata.last_name || ''}`
            : user.email?.split('@')[0] || 'User Account'
          setUserName(name)
          setUserEmail(user.email || 'user@example.com')
        }

        // Load business data from localStorage
        const storedBusinessName = localStorage.getItem('businessName')
        const storedAssessmentScore = localStorage.getItem('assessmentScore')
        const storedStage = localStorage.getItem('businessStage')
        const storedRevenueTarget = localStorage.getItem('revenueTarget')
        const storedProfitTarget = localStorage.getItem('profitTarget')

        if (storedBusinessName || storedAssessmentScore) {
          setBusinessData({
            name: storedBusinessName || 'My Business',
            assessmentScore: storedAssessmentScore || '--',
            stage: storedStage || 'BUILDING',
            revenueTarget: storedRevenueTarget ? parseFloat(storedRevenueTarget) : 0,
            profitTarget: storedProfitTarget ? parseFloat(storedProfitTarget) : 0,
          })
        }

        setNavigation(getNavigation('client'))
      } catch (error) {
        console.error('Error loading user/business data:', error)
        setNavigation(getNavigation('client'))
      }
    }

    loadUserData()

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('[Sidebar] Auth state changed:', event, session?.user?.email)
      if (session?.user) {
        const name = session.user.user_metadata?.first_name
          ? `${session.user.user_metadata.first_name} ${session.user.user_metadata.last_name || ''}`
          : session.user.email?.split('@')[0] || 'User Account'
        setUserName(name)
        setUserEmail(session.user.email || 'user@example.com')
      }
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [supabase])

  const toggleSection = (section: string) => {
    setExpandedSections((prev) =>
      prev.includes(section) ? prev.filter((s) => s !== section) : [...prev, section]
    )
  }

  const toggleSubItem = (itemLabel: string) => {
    setExpandedSubItems((prev) =>
      prev.includes(itemLabel) ? prev.filter((s) => s !== itemLabel) : [...prev, itemLabel]
    )
  }

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut()
      localStorage.clear()
      router.push('/auth/login')
      router.refresh()
    } catch (error) {
      console.error('Error signing out:', error)
    }
  }

  // For coach/admin/auth routes and home page, just render children without the client sidebar
  if (isCoachRoute || isAdminRoute || isAuthRoute || isHomePage) {
    return <>{children}</>
  }

  return (
    <div className="flex h-screen bg-gray-50">
      <div className={`${sidebarOpen ? 'w-64' : 'w-20'} bg-white border-r border-gray-200 flex flex-col h-screen transition-all duration-200 ease-in-out fixed left-0 top-0 z-40`}>
        <div className="flex items-center justify-between p-4 border-b border-gray-200 h-16">
          {sidebarOpen ? (
            <div>
              <h1 className="text-sm font-bold text-gray-900 truncate">Business Coaching</h1>
              {businessData.name && businessData.name !== 'My Business' && (
                <p className="text-xs text-gray-500 truncate">{businessData.name}</p>
              )}
            </div>
          ) : (
            <div className="text-xs font-bold text-gray-900">BC</div>
          )}

          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-1 rounded hover:bg-gray-100 transition-colors"
            title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          >
            {sidebarOpen ? (
              <ChevronLeft className="h-4 w-4 text-gray-600" />
            ) : (
              <ChevronRight className="h-4 w-4 text-gray-600" />
            )}
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto">
          {navigation.map((section) => (
            <div key={section.title} className="border-b border-gray-100">
              {sidebarOpen ? (
                <>
                  <button
                    onClick={() => toggleSection(section.title)}
                    className="w-full px-4 py-2 flex items-center justify-between hover:bg-gray-50 transition-colors"
                  >
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      {section.title}
                    </span>
                    {expandedSections.includes(section.title) ? (
                      <ChevronUp className="h-3 w-3 text-gray-400" />
                    ) : (
                      <ChevronDown className="h-3 w-3 text-gray-400" />
                    )}
                  </button>

                  {expandedSections.includes(section.title) && (
                    <div className="space-y-1">
                      {section.items.map((item) => {
                        const Icon = item.icon
                        const isActive = pathname === item.href
                        const hasChildren = item.children && item.children.length > 0
                        const isExpanded = expandedSubItems.includes(item.label)

                        return (
                          <div key={item.href}>
                            {hasChildren ? (
                              <>
                                <button
                                  onClick={() => toggleSubItem(item.label)}
                                  className={`w-full flex items-center px-4 py-2 text-sm ${isActive ? 'bg-teal-50 text-teal-700' : 'text-gray-700 hover:bg-gray-50'}`}
                                >
                                  <Icon className="h-4 w-4 mr-3 flex-shrink-0" />
                                  <span className="flex-1 text-left">{item.label}</span>
                                  {isExpanded ? (
                                    <ChevronUp className="h-3 w-3 text-gray-400" />
                                  ) : (
                                    <ChevronDown className="h-3 w-3 text-gray-400" />
                                  )}
                                </button>
                                {isExpanded && (
                                  <div className="ml-4 border-l border-gray-200 space-y-1">
                                    {item.children!.map((child) => {
                                      const ChildIcon = child.icon
                                      const isChildActive = pathname === child.href
                                      return (
                                        <Link
                                          key={child.href}
                                          href={child.disabled ? '#' : child.href}
                                          className={`flex items-center pl-6 pr-4 py-2 text-sm ${isChildActive ? 'bg-teal-50 text-teal-700 border-r-2 border-teal-600' : 'text-gray-600 hover:bg-gray-50'} ${child.disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                                          onClick={(e) => child.disabled && e.preventDefault()}
                                        >
                                          <ChildIcon className="h-4 w-4 mr-3 flex-shrink-0" />
                                          <span className="flex-1">{child.label}</span>
                                        </Link>
                                      )
                                    })}
                                  </div>
                                )}
                              </>
                            ) : (
                              <Link
                                href={item.disabled ? '#' : item.href}
                                className={`flex items-center px-4 py-2 text-sm ${isActive ? 'bg-teal-50 text-teal-700 border-r-2 border-teal-600' : 'text-gray-700 hover:bg-gray-50'} ${item.disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                                onClick={(e) => item.disabled && e.preventDefault()}
                              >
                                <Icon className="h-4 w-4 mr-3 flex-shrink-0" />
                                <span className="flex-1">{item.label}</span>
                                {item.badge && (
                                  <span className={`text-xs px-2 py-0.5 rounded ${item.badge === 'Private' ? 'bg-gray-100 text-gray-600' : 'bg-teal-100 text-teal-700'}`}>
                                    {item.badge}
                                  </span>
                                )}
                              </Link>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </>
              ) : (
                <div className="space-y-1">
                  {section.items.map((item) => {
                    const Icon = item.icon
                    const isActive = pathname === item.href

                    return (
                      <Link
                        key={item.href}
                        href={item.disabled ? '#' : item.href}
                        className={`flex items-center justify-center py-2 px-1 ${isActive ? 'bg-teal-50 text-teal-700 border-r-2 border-teal-600' : 'text-gray-700 hover:bg-gray-50'} ${item.disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                        title={item.label}
                        onClick={(e) => item.disabled && e.preventDefault()}
                      >
                        <Icon className="h-5 w-5" />
                      </Link>
                    )
                  })}
                </div>
              )}
            </div>
          ))}
        </nav>

        <div className="border-t border-gray-200 p-4">
          <button
            onClick={handleSignOut}
            className="flex items-center text-sm text-gray-600 hover:text-red-600 py-1 w-full transition-colors"
          >
            <LogOut className="h-4 w-4 mr-3 flex-shrink-0" />
            {sidebarOpen && <span>Sign Out</span>}
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col" style={{ marginLeft: sidebarOpen ? '16rem' : '5rem' }}>
        {/* Minimal Header - User Menu Only */}
        <div className="bg-white border-b border-gray-200 px-6 py-3">
          <div className="flex items-center justify-end">
            <div className="relative">
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <div className="w-8 h-8 bg-teal-600 rounded-full flex items-center justify-center">
                  <User className="h-4 w-4 text-white" />
                </div>
                <span className="text-sm font-medium text-gray-700">{userName}</span>
                <ChevronDown className="h-4 w-4 text-gray-500" />
              </button>

              {userMenuOpen && (
                <div className="absolute right-0 mt-2 w-64 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
                  <div className="px-4 py-3 border-b border-gray-100">
                    <p className="text-sm font-semibold text-gray-900 truncate">{userName}</p>
                    <p className="text-xs text-gray-500 truncate" title={userEmail}>{userEmail}</p>
                  </div>

                  <div className="py-1">
                    <Link
                      href="/settings/account"
                      className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                      onClick={() => setUserMenuOpen(false)}
                    >
                      <Settings className="h-4 w-4 mr-3" />
                      Account Settings
                    </Link>
                    <Link
                      href="/settings/team"
                      className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                      onClick={() => setUserMenuOpen(false)}
                    >
                      <Users className="h-4 w-4 mr-3" />
                      Add Team Members
                    </Link>
                    <Link
                      href="/integrations"
                      className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                      onClick={() => setUserMenuOpen(false)}
                    >
                      <Zap className="h-4 w-4 mr-3" />
                      Integrations
                    </Link>
                    <Link
                      href="/help"
                      className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                      onClick={() => setUserMenuOpen(false)}
                    >
                      <HelpCircle className="h-4 w-4 mr-3" />
                      Help & Support
                    </Link>
                  </div>

                  <div className="border-t border-gray-100 py-1">
                    <button
                      onClick={() => {
                        setUserMenuOpen(false)
                        handleSignOut()
                      }}
                      className="w-full flex items-center px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <LogOut className="h-4 w-4 mr-3" />
                      Sign Out
                    </button>
                  </div>
                </div>
              )}

              {userMenuOpen && (
                <div className="fixed inset-0 z-40" onClick={() => setUserMenuOpen(false)} />
              )}
            </div>
          </div>
        </div>

        <main className="flex-1 overflow-y-auto bg-gray-50">{children}</main>
      </div>
    </div>
  )
}
