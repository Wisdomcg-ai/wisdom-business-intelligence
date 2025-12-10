'use client'

import { useEffect, useState, useMemo } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { useBusinessContext } from '@/contexts/BusinessContext'
import { createClient } from '@/lib/supabase/client'
import {
  Loader2,
  AlertCircle,
  Construction,
  ArrowLeft,
  Eye,
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
  Layers,
  Activity,
  Users,
  Building2,
  Settings,
  HelpCircle,
  LineChart,
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

// Map of path to component imports - MUST match all client routes
const getPageComponent = (path: string[]) => {
  const fullPath = path.join('/')

  const componentMap: Record<string, () => Promise<any>> = {
    // HOME
    'dashboard': () => import('@/app/dashboard/page'),

    // SETUP
    'business-profile': () => import('@/app/business-profile/page'),
    'assessment': () => import('@/app/assessment/page'),
    'assessment/history': () => import('@/app/assessment/history/page'),

    // BUSINESS PLAN
    'business-roadmap': () => import('@/app/business-roadmap/page'),
    'vision-mission': () => import('@/app/vision-mission/page'),
    'swot': () => import('@/app/swot/page'),
    'swot/history': () => import('@/app/swot/history/page'),
    'swot/compare': () => import('@/app/swot/compare/page'),
    'goals': () => import('@/app/goals/page'),
    'goals/vision': () => import('@/app/goals/vision/page'),
    'goals/forecast': () => import('@/app/goals/forecast/page'),
    'goals/create': () => import('@/app/goals/create/page'),
    'one-page-plan': () => import('@/app/one-page-plan/page'),

    // FINANCES
    'finances/forecast': () => import('@/app/finances/forecast/page'),
    'finances/budget': () => import('@/app/finances/forecast/page'),

    // EXECUTE
    'business-dashboard': () => import('@/app/business-dashboard/page'),
    'reviews/weekly': () => import('@/app/reviews/weekly/page'),
    'reviews/quarterly': () => import('@/app/reviews/quarterly/page'),
    'issues-list': () => import('@/app/issues-list/page'),
    'ideas': () => import('@/app/ideas/page'),
    'open-loops': () => import('@/app/open-loops/page'),
    'todo': () => import('@/app/todo/page'),
    'stop-doing': () => import('@/app/stop-doing/page'),

    // BUSINESS ENGINES - Marketing
    'marketing/value-prop': () => import('@/app/marketing/value-prop/page'),

    // BUSINESS ENGINES - Team
    'team/accountability': () => import('@/app/team/accountability/page'),
    'team/hiring-roadmap': () => import('@/app/team/hiring-roadmap/page'),

    // REVIEW
    'quarterly-review': () => import('@/app/quarterly-review/page'),

    // SETTINGS
    'settings': () => import('@/app/settings/page'),

    // INTEGRATIONS
    'integrations': () => import('@/app/integrations/page'),
  }

  return componentMap[fullPath]
}

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
}

// Generate navigation with coach view paths - MUST match sidebar-layout.tsx exactly
const getCoachViewNavigation = (clientId: string): NavSection[] => {
  const base = `/coach/clients/${clientId}/view`

  return [
    {
      title: 'HOME',
      defaultOpen: true,
      items: [{ label: 'Command Centre', href: `${base}/dashboard`, icon: Gauge }],
    },
    {
      title: 'SETUP',
      defaultOpen: true,
      items: [
        { label: 'Business Profile', href: `${base}/business-profile`, icon: Building2 },
        { label: 'Assessment', href: `${base}/assessment`, icon: ClipboardCheck },
      ],
    },
    {
      title: 'BUSINESS PLAN',
      defaultOpen: true,
      items: [
        { label: 'Roadmap', href: `${base}/business-roadmap`, icon: Compass },
        { label: 'Vision, Mission & Values', href: `${base}/vision-mission`, icon: Target },
        { label: 'SWOT Analysis', href: `${base}/swot`, icon: FileText },
        { label: 'Goals & Targets', href: `${base}/goals`, icon: Award },
        { label: 'One-Page Plan', href: `${base}/one-page-plan`, icon: FileText },
      ],
    },
    {
      title: 'FINANCES',
      defaultOpen: true,
      items: [
        { label: 'Financial Forecast', href: `${base}/finances/forecast`, icon: TrendingUp },
        { label: 'Budget vs Actual', href: '#', icon: Banknote, disabled: true, badge: 'Soon' },
        { label: '13-Week Rolling Cashflow', href: '#', icon: Banknote, disabled: true, badge: 'Soon' },
      ],
    },
    {
      title: 'EXECUTE',
      defaultOpen: true,
      items: [
        { label: 'KPI Dashboard', href: `${base}/business-dashboard`, icon: BarChart3 },
        { label: 'Weekly Review', href: `${base}/reviews/weekly`, icon: Calendar },
        { label: 'Issues List', href: `${base}/issues-list`, icon: AlertCircle },
        { label: 'Ideas Journal', href: `${base}/ideas`, icon: Lightbulb },
        {
          label: 'Productivity',
          href: '#',
          icon: Briefcase,
          children: [
            { label: 'Open Loops', href: `${base}/open-loops`, icon: Layers },
            { label: 'To-Do', href: `${base}/todo`, icon: CheckSquare },
            { label: 'Stop Doing', href: `${base}/stop-doing`, icon: XCircle },
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
          href: '#',
          icon: LineChart,
          children: [
            { label: 'Value Proposition & USP', href: `${base}/marketing/value-prop`, icon: Target },
            { label: 'Marketing Channels', href: '#', icon: LineChart, disabled: true, badge: 'Soon' },
            { label: 'Content Planner', href: '#', icon: FileText, disabled: true, badge: 'Soon' },
          ],
        },
        {
          label: 'Team',
          href: '#',
          icon: Users,
          children: [
            { label: 'Accountability Chart', href: `${base}/team/accountability`, icon: Network },
            { label: 'Org Chart Builder', href: '#', icon: Users, disabled: true, badge: 'Soon' },
            { label: 'Team Performance', href: '#', icon: Activity, disabled: true, badge: 'Soon' },
            { label: 'Hiring Roadmap', href: `${base}/team/hiring-roadmap`, icon: Building2 },
          ],
        },
        {
          label: 'Systems',
          href: '#',
          icon: Settings,
          children: [
            { label: 'Systems & Processes', href: '#', icon: Settings, disabled: true, badge: 'Soon' },
          ],
        },
      ],
    },
    {
      title: 'REVIEW',
      defaultOpen: true,
      items: [
        { label: 'Quarterly Review', href: `${base}/quarterly-review`, icon: CalendarCheck },
      ],
    },
  ]
}

interface PageProps {
  params: {
    id: string
    path: string[]
  }
}

export default function CoachViewPage({ params }: PageProps) {
  const clientId = params?.id
  const pathArray = params?.path
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  const { activeBusiness, setActiveBusiness, isLoading: contextLoading } = useBusinessContext()
  const [PageComponent, setPageComponent] = useState<React.ComponentType<any> | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [businessSet, setBusinessSet] = useState(false)

  // Sidebar state - match client sidebar
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [expandedSections, setExpandedSections] = useState<string[]>(['HOME'])
  const [expandedSubItems, setExpandedSubItems] = useState<string[]>([])
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [userName, setUserName] = useState<string>('Coach')
  const [userEmail, setUserEmail] = useState<string>('')

  const pathString = pathArray.join('/')
  const navigation = useMemo(() => getCoachViewNavigation(clientId), [clientId])

  // Load coach user info
  useEffect(() => {
    const loadUserData = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const name = user.user_metadata?.first_name
          ? `${user.user_metadata.first_name} ${user.user_metadata.last_name || ''}`
          : user.email?.split('@')[0] || 'Coach'
        setUserName(name)
        setUserEmail(user.email || '')
      }
    }
    loadUserData()
  }, [supabase])

  // Set the active business when the page loads
  useEffect(() => {
    const initBusiness = async () => {
      if (clientId && (!activeBusiness || activeBusiness.id !== clientId)) {
        console.log('[CoachViewPage] Setting active business to client:', clientId)
        await setActiveBusiness(clientId)
      }
      setBusinessSet(true)
    }
    initBusiness()
  }, [clientId, activeBusiness?.id, setActiveBusiness])

  // Load the page component after business is set
  useEffect(() => {
    if (!businessSet) return

    const loadComponent = async () => {
      setIsLoading(true)
      setError(null)

      try {
        const componentLoader = getPageComponent(pathArray)

        if (!componentLoader) {
          setError(`Page not found: ${pathString}`)
          setIsLoading(false)
          return
        }

        const module = await componentLoader()
        setPageComponent(() => module.default)
      } catch (err) {
        console.error('Error loading page component:', err)
        setError(`Failed to load page: ${pathString}`)
      } finally {
        setIsLoading(false)
      }
    }

    loadComponent()
  }, [pathArray, pathString, businessSet])

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
    await supabase.auth.signOut()
    localStorage.clear()
    router.push('/auth/login')
  }

  // Check if current path matches navigation item
  const isActiveLink = (href: string) => {
    return pathname === href
  }

  if (contextLoading || isLoading || !businessSet) {
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
          </div>
          <div className="text-center">
            <p className="text-white font-medium text-lg">
              {!businessSet ? 'Loading client data...' : `Loading ${pathString}...`}
            </p>
          </div>
        </div>
      </div>
    )
  }

  // Render content based on state
  const renderContent = () => {
    if (error) {
      return (
        <div className="min-h-[400px] flex items-center justify-center">
          <div className="text-center">
            <Construction className="w-12 h-12 text-amber-500 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">Page Coming Soon</h3>
            <p className="text-gray-500 mb-4">This view is being set up for coach access.</p>
            <p className="text-sm text-gray-400">Path: {pathString}</p>
          </div>
        </div>
      )
    }

    if (!PageComponent) {
      return (
        <div className="min-h-[400px] flex items-center justify-center">
          <div className="text-center">
            <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">Page Not Found</h3>
            <p className="text-gray-500">The requested page could not be loaded.</p>
          </div>
        </div>
      )
    }

    return <PageComponent />
  }

  // Full layout matching client sidebar exactly
  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar - identical to client sidebar */}
      <div className={`${sidebarOpen ? 'w-64' : 'w-20'} bg-brand-navy flex flex-col h-screen transition-all duration-200 ease-in-out fixed left-0 top-0 z-40`}>
        {/* Logo Header */}
        <div className={`bg-white ${sidebarOpen ? 'px-3 py-3' : 'px-2 py-3'} border-b border-brand-navy-700`}>
          <div className="flex items-center justify-center">
            <Link href={`/coach/clients/${clientId}/view/dashboard`} className="block">
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
          {sidebarOpen && activeBusiness?.name && (
            <p className="text-xs text-brand-navy text-center mt-2 truncate font-medium">
              {activeBusiness.name}
            </p>
          )}
        </div>

        {/* Coach View Banner - unique to coach view */}
        <div className={`bg-brand-orange text-white ${sidebarOpen ? 'px-3 py-2' : 'px-1 py-2'} flex items-center gap-2`}>
          <Eye className="w-4 h-4 flex-shrink-0" />
          {sidebarOpen && (
            <span className="text-xs font-medium truncate">COACH VIEW</span>
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

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto">
          {navigation.map((section) => (
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
                        const isActive = isActiveLink(item.href)
                        const hasChildren = item.children && item.children.length > 0
                        const isExpanded = expandedSubItems.includes(item.label)

                        return (
                          <div key={item.label}>
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
                                      const isChildActive = isActiveLink(child.href)
                                      return (
                                        <Link
                                          key={child.label}
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
                                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${item.badge === 'Soon' ? 'bg-white/20 text-white/70' : 'bg-brand-orange/30 text-brand-orange-300'}`}>
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
                    const isActive = isActiveLink(item.href)

                    return (
                      <Link
                        key={item.label}
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

        {/* Exit Coach View & Sign Out */}
        <div className="border-t border-brand-navy-700 p-4 space-y-2">
          <Link
            href="/coach/clients"
            className="flex items-center text-sm text-brand-orange hover:text-brand-orange-300 py-1 w-full transition-colors"
          >
            <ArrowLeft className="h-4 w-4 mr-3 flex-shrink-0" />
            {sidebarOpen && <span>Exit to Coach Portal</span>}
          </Link>
          <button
            onClick={handleSignOut}
            className="flex items-center text-sm text-white hover:text-red-400 py-1 w-full transition-colors"
          >
            <LogOut className="h-4 w-4 mr-3 flex-shrink-0" />
            {sidebarOpen && <span>Sign Out</span>}
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col" style={{ marginLeft: sidebarOpen ? '16rem' : '5rem' }}>
        {/* Header with User Menu */}
        <div className="bg-white border-b border-gray-200 px-6 py-3">
          <div className="flex items-center justify-between">
            {/* Coach View Indicator */}
            <div className="flex items-center gap-2 bg-brand-orange/10 text-brand-orange px-3 py-1.5 rounded-lg">
              <Eye className="w-4 h-4" />
              <span className="text-sm font-medium">
                Viewing: {activeBusiness?.name || 'Client'}
              </span>
            </div>

            {/* User Menu */}
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
                    <p className="text-xs text-gray-500 truncate">{userEmail}</p>
                  </div>

                  <div className="py-1">
                    <Link
                      href="/coach/dashboard"
                      className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                      onClick={() => setUserMenuOpen(false)}
                    >
                      <LayoutDashboard className="h-4 w-4 mr-3" />
                      Coach Dashboard
                    </Link>
                    <Link
                      href="/coach/clients"
                      className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                      onClick={() => setUserMenuOpen(false)}
                    >
                      <Users className="h-4 w-4 mr-3" />
                      All Clients
                    </Link>
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

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto bg-gray-50">
          {renderContent()}
        </main>
      </div>
    </div>
  )
}
