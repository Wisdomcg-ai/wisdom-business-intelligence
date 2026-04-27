'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useBusinessContext } from '@/hooks/useBusinessContext'
import {
  ArrowLeft,
  Eye,
  Building2,
  Gauge,
  ClipboardCheck,
  Target,
  FileText,
  TrendingUp,
  BarChart3,
  Banknote,
  AlertCircle,
  Layers,
  CheckSquare,
  XCircle,
  Calendar,
  CalendarCheck,
  LineChart,
  Users,
  Compass,
  Award,
  Network,
  HeartHandshake,
  GitBranch,
  Settings,
  Briefcase,
  Lightbulb,
  MessageCircle,
  ChevronDown,
  ChevronUp,
  Link2 as Link2Icon
} from 'lucide-react'

interface NavItem {
  label: string
  href: string
  icon: React.ElementType
  disabled?: boolean
  badge?: string
  children?: NavItem[]
}

interface NavSection {
  title: string
  items: NavItem[]
  defaultOpen?: boolean
}

// Must match sidebar-layout.tsx exactly
const getClientNavigation = (clientId: string): NavSection[] => [
  {
    title: 'HOME',
    defaultOpen: true,
    items: [
      { label: 'Command Centre', href: `/coach/clients/${clientId}/view/dashboard`, icon: Gauge },
    ],
  },
  {
    title: 'SETUP',
    defaultOpen: true,
    items: [
      { label: 'Business Profile', href: `/coach/clients/${clientId}/view/business-profile`, icon: Building2 },
      { label: 'Assessment', href: `/coach/clients/${clientId}/view/assessment`, icon: ClipboardCheck },
    ],
  },
  {
    title: 'BUSINESS PLAN',
    defaultOpen: true,
    items: [
      { label: 'Roadmap', href: `/coach/clients/${clientId}/view/business-roadmap`, icon: Compass },
      { label: 'Vision, Mission & Values', href: `/coach/clients/${clientId}/view/vision-mission`, icon: Target },
      { label: 'SWOT Analysis', href: `/coach/clients/${clientId}/view/swot`, icon: FileText },
      { label: 'Goals & Targets', href: `/coach/clients/${clientId}/view/goals`, icon: Award },
      { label: 'One-Page Plan', href: `/coach/clients/${clientId}/view/one-page-plan`, icon: FileText },
    ],
  },
  {
    title: 'FINANCES',
    defaultOpen: true,
    items: [
      { label: 'Financial Forecast', href: `/coach/clients/${clientId}/view/finances/forecast`, icon: TrendingUp },
      { label: 'Monthly Report', href: `/coach/clients/${clientId}/view/finances/monthly-report`, icon: BarChart3 },
      { label: 'Cashflow Forecast', href: `/coach/clients/${clientId}/view/finances/cashflow`, icon: Banknote },
      { label: 'Consolidation', href: `/admin/consolidation/${clientId}?from=${encodeURIComponent(`/coach/clients/${clientId}/view/finances/monthly-report`)}`, icon: Layers },
    ],
  },
  {
    title: 'EXECUTE',
    defaultOpen: true,
    items: [
      { label: 'KPI Dashboard', href: `/coach/clients/${clientId}/view/business-dashboard`, icon: BarChart3 },
      { label: 'Weekly Review', href: `/coach/clients/${clientId}/view/reviews/weekly`, icon: Calendar },
      { label: 'Issues List', href: `/coach/clients/${clientId}/view/issues-list`, icon: AlertCircle },
      { label: 'Ideas Journal', href: `/coach/clients/${clientId}/view/ideas`, icon: Lightbulb },
      {
        label: 'Productivity',
        href: `/coach/clients/${clientId}/view/productivity`,
        icon: Briefcase,
        children: [
          { label: 'Open Loops', href: `/coach/clients/${clientId}/view/open-loops`, icon: Layers },
          { label: 'To-Do', href: `/coach/clients/${clientId}/view/todo`, icon: CheckSquare },
          { label: 'Stop Doing', href: `/coach/clients/${clientId}/view/stop-doing`, icon: XCircle },
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
        href: `/coach/clients/${clientId}/view/engines/marketing`,
        icon: LineChart,
        children: [
          { label: 'Value Proposition & USP', href: `/coach/clients/${clientId}/view/marketing/value-prop`, icon: Target },
          { label: 'Marketing Channels', href: `/coach/clients/${clientId}/view/marketing/channels`, icon: LineChart, disabled: true, badge: 'Soon' },
          { label: 'Content Planner', href: `/coach/clients/${clientId}/view/marketing/content`, icon: FileText, disabled: true, badge: 'Soon' },
        ],
      },
      {
        label: 'Team',
        href: `/coach/clients/${clientId}/view/engines/team`,
        icon: Users,
        children: [
          { label: 'Accountability Chart', href: `/coach/clients/${clientId}/view/team/accountability`, icon: Network },
          { label: 'Org Chart Builder', href: `/coach/clients/${clientId}/view/team/org-chart`, icon: Network },
          { label: 'Culture & Retention', href: `/coach/clients/${clientId}/view/team/hiring-roadmap`, icon: HeartHandshake },
        ],
      },
      {
        label: 'Systems',
        href: `/coach/clients/${clientId}/view/engines/systems`,
        icon: Settings,
        children: [
          { label: 'Workflow Builder', href: `/coach/clients/${clientId}/view/systems/processes`, icon: GitBranch },
        ],
      },
    ],
  },
  {
    title: 'REVIEW',
    defaultOpen: true,
    items: [
      { label: 'Quarterly Review', href: `/coach/clients/${clientId}/view/quarterly-review`, icon: CalendarCheck },
    ],
  },
  {
    title: 'COACHING',
    defaultOpen: true,
    items: [
      { label: 'Messages', href: `/coach/clients/${clientId}/view/messages`, icon: MessageCircle },
      { label: 'Session Notes', href: `/coach/clients/${clientId}/view/sessions`, icon: FileText },
    ],
  },
  {
    title: 'SETTINGS',
    defaultOpen: false,
    items: [
      // Lives inside the coach shell so connecting Xero for a client never
      // leaves /coach/clients/[id]/view/... — return_to preserves this path.
      { label: 'Integrations', href: `/coach/clients/${clientId}/view/integrations`, icon: Link2Icon },
      { label: 'Settings', href: `/coach/clients/${clientId}/view/settings`, icon: Settings },
    ],
  },
]

interface CoachViewLayoutProps {
  children: React.ReactNode
  clientId: string
}

// Paths that should NOT be intercepted (they belong outside the coach shell)
const PASSTHROUGH_PREFIXES = ['/coach/', '/admin/', '/auth/', '/api/']

export function CoachViewLayout({ children, clientId }: CoachViewLayoutProps) {
  const { activeBusiness } = useBusinessContext()
  const pathname = usePathname()
  const router = useRouter()

  // ── Navigation interceptor ──
  // When a coach is viewing a client, catch clicks on <a> tags with app-relative
  // hrefs (e.g. "/sessions") and redirect them to the coach-scoped equivalent
  // ("/coach/clients/{id}/view/sessions"). This prevents the 130+ hardcoded
  // <Link href="/…"> in imported page components from breaking out of the coach
  // shell.
  const rewriteHref = useCallback((href: string): string | null => {
    if (!href.startsWith('/')) return null // relative or external — leave alone
    if (PASSTHROUGH_PREFIXES.some((p) => href.startsWith(p))) return null
    return `/coach/clients/${clientId}/view${href}`
  }, [clientId])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement).closest('a')
      if (!anchor) return
      const href = anchor.getAttribute('href')
      if (!href) return
      const rewritten = rewriteHref(href)
      if (!rewritten) return

      // Intercept before Next.js Link processes the click
      e.preventDefault()
      e.stopPropagation()
      router.push(rewritten)
    }

    // Capture phase so we fire before React's synthetic event handlers
    document.addEventListener('click', handler, true)
    return () => document.removeEventListener('click', handler, true)
  }, [rewriteHref, router])

  // Also intercept pushState/replaceState for router.push() calls in child pages.
  // Next.js router.push ultimately calls history.pushState. We monkey-patch it
  // while the coach view is mounted and restore on unmount.
  useEffect(() => {
    const origPush = history.pushState.bind(history)
    const origReplace = history.replaceState.bind(history)

    const patchUrl = (url: string | URL | null | undefined): string | URL | null | undefined => {
      if (!url || typeof url !== 'string') return url
      const rewritten = rewriteHref(url)
      return rewritten ?? url
    }

    history.pushState = function (data: any, unused: string, url?: string | URL | null) {
      return origPush(data, unused, patchUrl(url) as any)
    }
    history.replaceState = function (data: any, unused: string, url?: string | URL | null) {
      return origReplace(data, unused, patchUrl(url) as any)
    }

    return () => {
      history.pushState = origPush
      history.replaceState = origReplace
    }
  }, [rewriteHref])

  const [expandedSections, setExpandedSections] = useState<string[]>([
    'HOME',
    'SETUP',
    'BUSINESS PLAN',
    'FINANCES',
    'EXECUTE',
    'REVIEW',
    'COACHING',
  ])
  const [expandedSubItems, setExpandedSubItems] = useState<string[]>([])

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

  const navigation = getClientNavigation(clientId)

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Coach View Banner */}
      <div className="bg-brand-orange text-white px-4 py-3 sticky top-0 z-50">
        <div className="max-w-full mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Eye className="w-5 h-5" />
            <span className="font-medium">COACH VIEW:</span>
            <div className="flex items-center gap-2 bg-brand-orange-500 px-3 py-1 rounded-lg">
              <Building2 className="w-4 h-4" />
              <span>{activeBusiness?.name || 'Loading...'}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={`/coach/clients/${clientId}`}
              className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors text-sm"
            >
              <ArrowLeft className="w-4 h-4" />
              Client File
            </Link>
            <Link
              href="/coach/clients"
              className="flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg transition-colors text-sm font-medium"
            >
              Exit Coach View
            </Link>
          </div>
        </div>
      </div>

      <div className="flex">
        {/* Client Sidebar — matches client sidebar-layout.tsx */}
        <aside className="hidden lg:block w-64 bg-brand-navy border-r border-brand-navy-700 min-h-[calc(100svh-52px)] sm:min-h-[calc(100vh-52px)] sticky top-[52px] flex-shrink-0">
          <nav className="py-4">
            {navigation.map((section) => (
              <div key={section.title} className="border-b border-brand-navy-700">
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
              </div>
            ))}
          </nav>
        </aside>

        {/* Main Content */}
        <main className="flex-1 min-h-[calc(100svh-52px)] sm:min-h-[calc(100vh-52px)] overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  )
}

export default CoachViewLayout
