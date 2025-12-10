'use client'

import { useMemo } from 'react'
import { usePathname } from 'next/navigation'

interface CoachViewInfo {
  isCoachView: boolean
  clientId: string | null
  basePath: string
  getPath: (path: string) => string
}

/**
 * Hook to detect if we're in coach view mode and provide correct routing
 *
 * In coach view, the URL structure is: /coach/clients/[clientId]/view/[...path]
 * This hook helps transform regular paths to coach view paths when needed.
 *
 * @example
 * const { isCoachView, getPath } = useCoachView()
 * // In coach view: getPath('/assessment') -> '/coach/clients/123/view/assessment'
 * // Normal view: getPath('/assessment') -> '/assessment'
 */
export function useCoachView(): CoachViewInfo {
  const pathname = usePathname()

  return useMemo(() => {
    // Check if we're in coach view mode
    const coachViewMatch = pathname?.match(/^\/coach\/clients\/([^/]+)\/view/)
    const isCoachView = !!coachViewMatch
    const clientId = coachViewMatch?.[1] || null
    const basePath = isCoachView ? `/coach/clients/${clientId}/view` : ''

    const getPath = (path: string): string => {
      // Remove leading slash if present for consistency
      const cleanPath = path.startsWith('/') ? path.slice(1) : path

      if (isCoachView) {
        return `${basePath}/${cleanPath}`
      }

      // Return original path (ensure it starts with /)
      return path.startsWith('/') ? path : `/${path}`
    }

    return {
      isCoachView,
      clientId,
      basePath,
      getPath
    }
  }, [pathname])
}

export default useCoachView
