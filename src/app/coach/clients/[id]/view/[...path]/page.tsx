'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useBusinessContext } from '@/contexts/BusinessContext'
import { Loader2, AlertCircle, Construction, ArrowLeft, Eye } from 'lucide-react'

// Map of path to component imports
const getPageComponent = (path: string[]) => {
  const fullPath = path.join('/')

  // Map paths to their respective components
  const componentMap: Record<string, () => Promise<any>> = {
    // Core pages
    'dashboard': () => import('@/app/dashboard/page'),
    'business-profile': () => import('@/app/business-profile/page'),
    'business-roadmap': () => import('@/app/business-roadmap/page'),
    'business-dashboard': () => import('@/app/business-dashboard/page'),
    'vision-mission': () => import('@/app/vision-mission/page'),
    'one-page-plan': () => import('@/app/one-page-plan/page'),

    // Assessment
    'assessment': () => import('@/app/assessment/page'),
    'assessment/history': () => import('@/app/assessment/history/page'),

    // SWOT
    'swot': () => import('@/app/swot/page'),
    'swot/history': () => import('@/app/swot/history/page'),
    'swot/compare': () => import('@/app/swot/compare/page'),

    // Goals
    'goals': () => import('@/app/goals/page'),
    'goals/vision': () => import('@/app/goals/vision/page'),
    'goals/forecast': () => import('@/app/goals/forecast/page'),
    'goals/create': () => import('@/app/goals/create/page'),

    // Finances
    'finances/forecast': () => import('@/app/finances/forecast/page'),
    'finances/budget': () => import('@/app/financials/page'),
    'financials': () => import('@/app/financials/page'),

    // Reviews
    'reviews/weekly': () => import('@/app/reviews/weekly/page'),
    'reviews/monthly': () => import('@/app/reviews/weekly/page'),
    'reviews/quarterly': () => import('@/app/reviews/quarterly/page'),
    'quarterly-review': () => import('@/app/quarterly-review/page'),

    // Team
    'team/accountability': () => import('@/app/team/accountability/page'),
    'team/hiring-roadmap': () => import('@/app/team/hiring-roadmap/page'),

    // Marketing
    'marketing/value-prop': () => import('@/app/marketing/value-prop/page'),

    // Operations
    'issues-list': () => import('@/app/issues-list/page'),
    'open-loops': () => import('@/app/open-loops/page'),
    'stop-doing': () => import('@/app/stop-doing/page'),
    'todo': () => import('@/app/todo/page'),

    // Integrations
    'integrations': () => import('@/app/integrations/page'),
  }

  return componentMap[fullPath]
}

interface PageProps {
  params: {
    id: string
    path: string[]
  }
}

export default function CoachViewPage({ params }: PageProps) {
  const clientId = params.id
  const pathArray = params.path

  const { activeBusiness, setActiveBusiness, isLoading: contextLoading } = useBusinessContext()
  const [PageComponent, setPageComponent] = useState<React.ComponentType<any> | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [businessSet, setBusinessSet] = useState(false)

  const pathString = pathArray.join('/')

  // CRITICAL: Set the active business when the page loads
  // This is what makes the coach view work - it tells all child components
  // which business's data to load
  useEffect(() => {
    const initBusiness = async () => {
      // Only set if not already set to this client
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

  if (contextLoading || isLoading || !businessSet) {
    return (
      <div className="min-h-[400px] flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600 mx-auto mb-4" />
          <p className="text-gray-500">
            {!businessSet ? 'Loading client data...' : `Loading ${pathString}...`}
          </p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-[400px] flex items-center justify-center">
        <div className="text-center">
          <Construction className="w-12 h-12 text-amber-500 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Page Coming Soon</h3>
          <p className="text-gray-500 mb-4">
            This view is being set up for coach access.
          </p>
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
          <p className="text-gray-500">
            The requested page could not be loaded.
          </p>
        </div>
      </div>
    )
  }

  // Render the client page component with coach view banner
  // The component will use useBusinessContext() to get the correct business data
  return (
    <div className="min-h-screen">
      {/* Coach View Banner */}
      <div className="bg-indigo-600 text-white px-4 py-2 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <Link
            href="/coach/clients"
            className="flex items-center gap-2 hover:bg-indigo-700 px-3 py-1.5 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="font-medium">Back to Clients</span>
          </Link>
          <div className="h-6 w-px bg-indigo-400" />
          <div className="flex items-center gap-2">
            <Eye className="w-4 h-4" />
            <span className="text-sm">
              Viewing: <span className="font-semibold">{activeBusiness?.name || 'Client'}</span>
            </span>
          </div>
        </div>
        <Link
          href="/coach/dashboard"
          className="text-sm hover:bg-indigo-700 px-3 py-1.5 rounded-lg transition-colors"
        >
          Coach Dashboard
        </Link>
      </div>

      {/* Page Content */}
      <PageComponent />
    </div>
  )
}
