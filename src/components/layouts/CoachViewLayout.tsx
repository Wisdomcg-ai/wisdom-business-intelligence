'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useBusinessContext } from '@/hooks/useBusinessContext'
import {
  ArrowLeft,
  Eye,
  Building2,
  LayoutDashboard,
  ClipboardCheck,
  Target,
  FileText,
  TrendingUp,
  BarChart3,
  AlertCircle,
  Layers,
  CheckSquare,
  XCircle,
  Calendar,
  CalendarDays,
  CalendarCheck,
  LineChart,
  Users,
  Compass,
  Award,
  Loader2,
  ChevronDown,
  ChevronUp
} from 'lucide-react'

interface NavItem {
  label: string
  href: string
  icon: React.ElementType
  disabled?: boolean
  children?: NavItem[]
}

interface NavSection {
  title: string
  items: NavItem[]
  defaultOpen?: boolean
}

// Same navigation as client sidebar
const getClientNavigation = (clientId: string): NavSection[] => [
  {
    title: 'DASHBOARD',
    defaultOpen: true,
    items: [
      { label: 'Home', href: `/coach/clients/${clientId}/view/dashboard`, icon: LayoutDashboard },
    ],
  },
  {
    title: 'START HERE',
    defaultOpen: true,
    items: [
      { label: 'Business Profile', href: `/coach/clients/${clientId}/view/business-profile`, icon: Building2 },
      { label: 'Business Assessment', href: `/coach/clients/${clientId}/view/assessment`, icon: ClipboardCheck },
    ],
  },
  {
    title: 'ROADMAP',
    defaultOpen: true,
    items: [
      { label: 'Business Roadmap', href: `/coach/clients/${clientId}/view/business-roadmap`, icon: Compass },
    ],
  },
  {
    title: 'BUSINESS PLAN',
    defaultOpen: true,
    items: [
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
      { label: 'Budget vs Actual', href: `/coach/clients/${clientId}/view/finances/budget`, icon: FileText },
    ],
  },
  {
    title: 'EXECUTE',
    defaultOpen: true,
    items: [
      { label: 'Business Dashboard', href: `/coach/clients/${clientId}/view/business-dashboard`, icon: BarChart3 },
      { label: 'Issues List', href: `/coach/clients/${clientId}/view/issues-list`, icon: AlertCircle },
    ],
  },
  {
    title: 'PRODUCTIVITY',
    defaultOpen: true,
    items: [
      { label: 'Open Loops', href: `/coach/clients/${clientId}/view/open-loops`, icon: Layers },
      { label: 'To-Do', href: `/coach/clients/${clientId}/view/todo`, icon: CheckSquare },
      { label: 'Stop Doing', href: `/coach/clients/${clientId}/view/stop-doing`, icon: XCircle },
    ],
  },
  {
    title: 'REVIEWS',
    defaultOpen: false,
    items: [
      { label: 'Weekly Review', href: `/coach/clients/${clientId}/view/reviews/weekly`, icon: Calendar },
      { label: 'Monthly Review', href: `/coach/clients/${clientId}/view/reviews/monthly`, icon: CalendarDays },
      { label: 'Quarterly Review', href: `/coach/clients/${clientId}/view/quarterly-review`, icon: CalendarCheck },
    ],
  },
  {
    title: 'BUSINESS ENGINES',
    defaultOpen: false,
    items: [
      { label: 'Marketing', href: `/coach/clients/${clientId}/view/marketing/value-prop`, icon: LineChart },
      { label: 'Team', href: `/coach/clients/${clientId}/view/team/accountability`, icon: Users },
    ],
  },
]

interface CoachViewLayoutProps {
  children: React.ReactNode
  clientId: string
}

export function CoachViewLayout({ children, clientId }: CoachViewLayoutProps) {
  const router = useRouter()
  const { activeBusiness, setActiveBusiness, isLoading, error } = useBusinessContext()
  const [expandedSections, setExpandedSections] = useState<string[]>([
    'DASHBOARD',
    'START HERE',
    'ROADMAP',
    'BUSINESS PLAN',
    'FINANCES',
    'EXECUTE',
    'PRODUCTIVITY',
  ])

  // Set active business when component mounts
  useEffect(() => {
    if (clientId && (!activeBusiness || activeBusiness.id !== clientId)) {
      setActiveBusiness(clientId)
    }
  }, [clientId, activeBusiness, setActiveBusiness])

  const toggleSection = (section: string) => {
    setExpandedSections((prev) =>
      prev.includes(section) ? prev.filter((s) => s !== section) : [...prev, section]
    )
  }

  const navigation = getClientNavigation(clientId)

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600 mx-auto mb-4" />
          <p className="text-gray-500">Loading client view...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Error Loading Client</h3>
          <p className="text-gray-500 mb-4">{error}</p>
          <Link
            href="/coach/clients"
            className="text-indigo-600 hover:text-indigo-700 font-medium"
          >
            Back to Clients
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Coach View Banner */}
      <div className="bg-indigo-600 text-white px-4 py-3 sticky top-0 z-50">
        <div className="max-w-full mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Eye className="w-5 h-5" />
            <span className="font-medium">COACH VIEW:</span>
            <div className="flex items-center gap-2 bg-indigo-500 px-3 py-1 rounded-lg">
              <Building2 className="w-4 h-4" />
              <span>{activeBusiness?.name || 'Loading...'}</span>
            </div>
          </div>
          <Link
            href="/coach/clients"
            className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Exit to Coach Portal
          </Link>
        </div>
      </div>

      <div className="flex">
        {/* Client Sidebar */}
        <aside className="w-64 bg-white border-r border-gray-200 min-h-[calc(100vh-52px)] sticky top-[52px]">
          <nav className="py-4">
            {navigation.map((section) => (
              <div key={section.title} className="border-b border-gray-100 last:border-b-0">
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
                  <div className="pb-2">
                    {section.items.map((item) => {
                      const Icon = item.icon
                      return (
                        <Link
                          key={item.href}
                          href={item.disabled ? '#' : item.href}
                          className={`flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 ${
                            item.disabled ? 'opacity-50 cursor-not-allowed' : ''
                          }`}
                          onClick={(e) => item.disabled && e.preventDefault()}
                        >
                          <Icon className="h-4 w-4 mr-3 flex-shrink-0 text-gray-400" />
                          <span>{item.label}</span>
                        </Link>
                      )
                    })}
                  </div>
                )}
              </div>
            ))}
          </nav>
        </aside>

        {/* Main Content */}
        <main className="flex-1 min-h-[calc(100vh-52px)]">
          {children}
        </main>
      </div>
    </div>
  )
}

export default CoachViewLayout
