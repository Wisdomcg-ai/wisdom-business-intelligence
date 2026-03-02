'use client'

import { useEffect, useState } from 'react'
import { useBusinessContext } from '@/contexts/BusinessContext'
import { Loader2, AlertCircle, Construction } from 'lucide-react'

// Map of path to component imports - MUST match all client routes
const getPageComponent = (path: string[]) => {
  const fullPath = path.join('/')

  const componentMap: Record<string, () => Promise<any>> = {
    // HOME
    'dashboard': () => import('@/app/dashboard/page'),
    'dashboard/assessment-results': () => import('@/app/dashboard/assessment-results/page'),

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
    'finances/monthly-report': () => import('@/app/finances/monthly-report/page'),
    'finances/cashflow': () => import('@/app/finances/cashflow/page'),
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
    'team/org-chart': () => import('@/app/team/org-chart/page'),

    // REVIEW
    'quarterly-review': () => import('@/app/quarterly-review/page'),

    // SETTINGS
    'settings': () => import('@/app/settings/page'),

    // INTEGRATIONS
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
  const clientId = params?.id
  const pathArray = params?.path
  const pathString = pathArray.join('/')

  const { activeBusiness, setActiveBusiness, isLoading: contextLoading } = useBusinessContext()
  const [PageComponent, setPageComponent] = useState<React.ComponentType<any> | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [businessSet, setBusinessSet] = useState(false)

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

  // Loading state
  if (contextLoading || isLoading || !businessSet) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-brand-orange mx-auto mb-4" />
          <p className="text-gray-500">
            {!businessSet ? 'Loading client data...' : `Loading ${pathString}...`}
          </p>
        </div>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Construction className="w-12 h-12 text-amber-500 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Page Coming Soon</h3>
          <p className="text-gray-500 mb-4">This view is being set up for coach access.</p>
          <p className="text-sm text-gray-400">Path: {pathString}</p>
        </div>
      </div>
    )
  }

  // No component loaded
  if (!PageComponent) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Page Not Found</h3>
          <p className="text-gray-500">The requested page could not be loaded.</p>
        </div>
      </div>
    )
  }

  // Render the loaded page component — sidebar is handled by CoachViewLayout in layout.tsx
  return <PageComponent />
}
