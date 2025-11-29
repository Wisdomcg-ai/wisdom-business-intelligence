/**
 * Re-export the useBusinessContext hook from the context file
 * This provides a cleaner import path for components
 *
 * Usage:
 * import { useBusinessContext } from '@/hooks/useBusinessContext'
 *
 * const { activeBusiness, viewerContext, currentUser } = useBusinessContext()
 */

export { useBusinessContext } from '@/contexts/BusinessContext'
