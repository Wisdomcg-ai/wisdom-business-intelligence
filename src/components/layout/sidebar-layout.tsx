'use client'

import { useState, useEffect, useMemo } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { SectionPermissions } from '@/app/settings/team/page'
import { hasPermission, FULL_PERMISSIONS } from '@/lib/permissions'
import { useLoginTracker } from '@/hooks/useLoginTracker'
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
  HelpCircle,
  MessageSquare,
  LineChart,
  MessageCircle,
  FileQuestion,
  Compass,
  Award,
  Network,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  LogOut,
  User,
  Gauge,
  Briefcase,
  Lightbulb,
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

interface UserPermissionData {
  role: string
  permissions: SectionPermissions | null
}

const getNavigation = (userRole: 'coach' | 'client'): NavSection[] => {
  const navigation: NavSection[] = [
    {
      title: 'HOME',
      defaultOpen: true,
      items: [{ label: 'Command Centre', href: '/dashboard', icon: Gauge }],
    },
    {
      title: 'SETUP',
      defaultOpen: true,
      items: [
        { label: 'Business Profile', href: '/business-profile', icon: Building2 },
        { label: 'Assessment', href: '/assessment', icon: ClipboardCheck },
      ],
    },
    {
      title: 'BUSINESS PLAN',
      defaultOpen: true,
      items: [
        { label: 'Roadmap', href: '/business-roadmap', icon: Compass },
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
        { label: 'Budget vs Actual', href: '/finances/budget', icon: Banknote, disabled: true, badge: 'Soon' },
        { label: '13-Week Rolling Cashflow', href: '/finances/cashflow', icon: Banknote, disabled: true, badge: 'Soon' },
      ],
    },
    {
      title: 'EXECUTE',
      defaultOpen: true,
      items: [
        { label: 'KPI Dashboard', href: '/business-dashboard', icon: BarChart3 },
        { label: 'Weekly Review', href: '/reviews/weekly', icon: Calendar },
        { label: 'Issues List', href: '/issues-list', icon: AlertCircle },
        { label: 'Ideas Journal', href: '/ideas', icon: Lightbulb },
        {
          label: 'Productivity',
          href: '/productivity',
          icon: Briefcase,
          children: [
            { label: 'Open Loops', href: '/open-loops', icon: Layers },
            { label: 'To-Do', href: '/todo', icon: CheckSquare },
            { label: 'Stop Doing', href: '/stop-doing', icon: XCircle },
          ],
        },
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
            { label: 'Marketing Channels', href: '/marketing/channels', icon: LineChart, disabled: true, badge: 'Soon' },
            { label: 'Content Planner', href: '/marketing/content', icon: FileText, disabled: true, badge: 'Soon' },
          ],
        },
        {
          label: 'Team',
          href: '/engines/team',
          icon: Users,
          children: [
            { label: 'Accountability Chart', href: '/team/accountability', icon: Network },
            { label: 'Org Chart Builder', href: '/team/org-chart', icon: Users, disabled: true, badge: 'Soon' },
            { label: 'Team Performance', href: '/team-performance', icon: Activity, disabled: true, badge: 'Soon' },
            { label: 'Hiring Roadmap', href: '/team/hiring-roadmap', icon: Building2 },
          ],
        },
        {
          label: 'Systems',
          href: '/engines/systems',
          icon: Settings,
          children: [
            { label: 'Systems & Processes', href: '/systems/processes', icon: Settings, disabled: true, badge: 'Soon' },
          ],
        },
      ],
    },
    {
      title: 'REVIEW',
      defaultOpen: true,
      items: [
        { label: 'Quarterly Review', href: '/quarterly-review', icon: CalendarCheck },
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
      ],
    })
  }

  return navigation
}

export default function SidebarLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  // Track user login for activity monitoring
  useLoginTracker()

  const [loading, setLoading] = useState(true)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [expandedSections, setExpandedSections] = useState<string[]>([
    'HOME',
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
  const [userPermissions, setUserPermissions] = useState<UserPermissionData>({
    role: 'owner',
    permissions: FULL_PERMISSIONS,
  })

  // Filter navigation based on user permissions
  const filteredNavigation = useMemo(() => {
    return navigation
      .map((section) => {
        // Check if the section title requires permission
        if (!hasPermission(section.title, userPermissions.permissions, userPermissions.role)) {
          return null
        }

        // Filter items within the section
        const filteredItems = section.items
          .filter((item) => hasPermission(item.label, userPermissions.permissions, userPermissions.role))
          .map((item) => {
            // Filter children if they exist
            if (item.children) {
              const filteredChildren = item.children.filter((child) =>
                hasPermission(child.label, userPermissions.permissions, userPermissions.role)
              )
              // Only include item if it has visible children
              if (filteredChildren.length === 0) {
                return null
              }
              return { ...item, children: filteredChildren }
            }
            return item
          })
          .filter((item): item is NavItem => item !== null)

        // Don't show section if no items are visible
        if (filteredItems.length === 0) {
          return null
        }

        return { ...section, items: filteredItems }
      })
      .filter((section): section is NavSection => section !== null)
  }, [navigation, userPermissions])

  // Don't render client sidebar for coach routes, auth routes, marketing pages, or legal pages
  const isCoachRoute = pathname?.startsWith('/coach')
  const isAdminRoute = pathname?.startsWith('/admin')
  const isAuthRoute = pathname?.startsWith('/auth') || pathname?.startsWith('/login')
  const isHomePage = pathname === '/'
  const isLegalPage = pathname === '/privacy' || pathname === '/terms'

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

          // Load user's business membership and permissions
          // Wrapped in try-catch to handle cases where section_permissions column doesn't exist yet
          const storedBusinessId = localStorage.getItem('businessId')
          if (storedBusinessId) {
            try {
              const { data: businessUser, error: businessUserError } = await supabase
                .from('business_users')
                .select('role, section_permissions')
                .eq('business_id', storedBusinessId)
                .eq('user_id', user.id)
                .single()

              if (businessUserError) {
                // If section_permissions column doesn't exist, try fetching just the role
                console.warn('[Sidebar] Error fetching permissions, trying fallback:', businessUserError.message)
                const { data: roleOnly } = await supabase
                  .from('business_users')
                  .select('role')
                  .eq('business_id', storedBusinessId)
                  .eq('user_id', user.id)
                  .single()

                if (roleOnly) {
                  // Default to full permissions if column doesn't exist
                  setUserPermissions({
                    role: roleOnly.role || 'owner',
                    permissions: FULL_PERMISSIONS,
                  })
                }
              } else if (businessUser) {
                setUserPermissions({
                  role: businessUser.role || 'member',
                  permissions: businessUser.section_permissions as SectionPermissions | null,
                })
              }
            } catch (permError) {
              console.error('[Sidebar] Failed to load permissions:', permError)
              // Default to full permissions on error
              setUserPermissions({
                role: 'owner',
                permissions: FULL_PERMISSIONS,
              })
            }
          }
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
        setLoading(false)
      } catch (error) {
        console.error('Error loading user/business data:', error)
        setNavigation(getNavigation('client'))
        setLoading(false)
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
      prev.includes(section)
        ? prev.filter((s) => s !== section)
        : [...prev, section]
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

  // For coach/admin/auth routes, home page, and legal pages, just render children without the client sidebar
  if (isCoachRoute || isAdminRoute || isAuthRoute || isHomePage || isLegalPage) {
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
            <p className="text-white font-medium text-lg">Loading</p>
            <p className="text-brand-orange-300 text-sm mt-1">Please wait...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-gray-50">
      <div className={`${sidebarOpen ? 'w-64' : 'w-20'} bg-brand-navy flex flex-col h-screen transition-all duration-200 ease-in-out fixed left-0 top-0 z-40`}>
        {/* Logo Header - Keep white background for logo visibility */}
        <div className={`bg-white ${sidebarOpen ? 'px-3 py-3' : 'px-2 py-3'} border-b border-brand-navy-700`}>
          <div className="flex items-center justify-center">
            <Link href="/dashboard" className="block">
              <Image
                src="/images/logo-wbi.png"
                alt="WisdomBi"
                width={410}
                height={170}
                className={`${sidebarOpen ? 'h-12' : 'h-10'} w-auto`}
                priority
              />
            </Link>
          </div>
          {sidebarOpen && businessData.name && businessData.name !== 'My Business' && (
            <p className="text-xs text-brand-navy text-center mt-2 truncate font-medium">{businessData.name}</p>
          )}
        </div>

        {/* Sidebar Toggle */}
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className={`flex items-center justify-center ${sidebarOpen ? 'px-4' : 'px-2'} py-2 border-b border-brand-navy-700 hover:bg-white/10 transition-colors w-full`}
          title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
        >
          {sidebarOpen ? (
            <>
              <ChevronLeft className="h-4 w-4 text-white" />
              <span className="text-xs text-white ml-1">Collapse</span>
            </>
          ) : (
            <ChevronRight className="h-4 w-4 text-white" />
          )}
        </button>

        <nav className="flex-1 overflow-y-auto">
          {filteredNavigation.map((section) => (
            <div key={section.title} className="border-b border-brand-navy-700">
              {sidebarOpen ? (
                <>
                  <button
                    onClick={() => toggleSection(section.title)}
                    className="w-full px-4 py-2 flex items-center justify-between hover:bg-white/5 transition-colors"
                  >
                    <span className="text-xs font-semibold text-white/80 uppercase tracking-wider">
                      {section.title}
                    </span>
                    {expandedSections.includes(section.title) ? (
                      <ChevronUp className="h-3 w-3 text-white/70" />
                    ) : (
                      <ChevronDown className="h-3 w-3 text-white/70" />
                    )}
                  </button>

                  {expandedSections.includes(section.title) && (
                    <div className="space-y-0.5 pb-2">
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
                                  className={`w-full flex items-center px-4 py-2 text-sm ${isActive ? 'bg-white/15 text-white font-medium border-l-2 border-brand-orange ml-0.5' : 'text-white hover:bg-white/10'}`}
                                >
                                  <Icon className="h-4 w-4 mr-3 flex-shrink-0" />
                                  <span className="flex-1 text-left">{item.label}</span>
                                  {isExpanded ? (
                                    <ChevronUp className="h-3 w-3 text-white/70" />
                                  ) : (
                                    <ChevronDown className="h-3 w-3 text-white/70" />
                                  )}
                                </button>
                                {isExpanded && (
                                  <div className="ml-4 border-l border-white/20 space-y-0.5">
                                    {item.children!.map((child) => {
                                      const ChildIcon = child.icon
                                      const isChildActive = pathname === child.href
                                      return (
                                        <Link
                                          key={child.href}
                                          href={child.disabled ? '#' : child.href}
                                          className={`flex items-center pl-6 pr-4 py-2 text-sm ${isChildActive ? 'bg-white/15 text-white font-medium border-l-2 border-brand-orange -ml-px' : 'text-white/90 hover:bg-white/10 hover:text-white'} ${child.disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                                          onClick={(e) => child.disabled && e.preventDefault()}
                                        >
                                          <ChildIcon className="h-4 w-4 mr-3 flex-shrink-0" />
                                          <span className="flex-1">{child.label}</span>
                                          {child.badge && (
                                            <span className="text-[10px] bg-white/20 text-white/70 px-1.5 py-0.5 rounded font-medium ml-2">
                                              {child.badge}
                                            </span>
                                          )}
                                        </Link>
                                      )
                                    })}
                                  </div>
                                )}
                              </>
                            ) : (
                              <Link
                                href={item.disabled ? '#' : item.href}
                                className={`flex items-center px-4 py-2 text-sm ${isActive ? 'bg-white/15 text-white font-medium border-l-2 border-brand-orange ml-0.5' : 'text-white hover:bg-white/10'} ${item.disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                                onClick={(e) => item.disabled && e.preventDefault()}
                              >
                                <Icon className="h-4 w-4 mr-3 flex-shrink-0" />
                                <span className="flex-1">{item.label}</span>
                                {item.badge && (
                                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${item.badge === 'Private' ? 'bg-white/10 text-white/60' : item.badge === 'Soon' ? 'bg-white/20 text-white/70' : 'bg-brand-orange/30 text-brand-orange-300'}`}>
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
                <div className="space-y-0.5 py-1">
                  {section.items.map((item) => {
                    const Icon = item.icon
                    const isActive = pathname === item.href

                    return (
                      <Link
                        key={item.href}
                        href={item.disabled ? '#' : item.href}
                        className={`flex items-center justify-center py-2 px-1 ${isActive ? 'bg-white/15 text-white border-l-2 border-brand-orange' : 'text-white hover:bg-white/10'} ${item.disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
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

        <div className="border-t border-brand-navy-700 p-4">
          <button
            onClick={handleSignOut}
            className="flex items-center text-sm text-white hover:text-red-400 py-1 w-full transition-colors"
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
                <div className="w-8 h-8 bg-brand-orange rounded-full flex items-center justify-center">
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
                      href="/settings"
                      className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                      onClick={() => setUserMenuOpen(false)}
                    >
                      <Settings className="h-4 w-4 mr-3" />
                      Settings
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
