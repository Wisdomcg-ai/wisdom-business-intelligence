'use client'

import { useEffect, useState } from 'react'
import { useBusinessContext } from '@/contexts/BusinessContext'
import { createClient } from '@/lib/supabase/client'

/**
 * Hook to get the active business ID for data queries.
 *
 * This hook handles two scenarios:
 * 1. Coach viewing a client: Returns the client's business ID from context
 * 2. Client viewing own data: Returns the client's own business ID
 *
 * Usage:
 * ```typescript
 * const { businessId, isLoading, error } = useActiveBusinessId()
 *
 * useEffect(() => {
 *   if (!businessId) return
 *   // Fetch data using businessId
 * }, [businessId])
 * ```
 */
export function useActiveBusinessId() {
  const { activeBusiness, isLoading: contextLoading } = useBusinessContext()
  const [businessId, setBusinessId] = useState<string | null>(activeBusiness?.id ?? null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // If context already has an active business, use it
    if (activeBusiness?.id) {
      setBusinessId(activeBusiness.id)
      setIsLoading(false)
      setError(null)
      return
    }

    // If context is still loading, wait
    if (contextLoading) {
      return
    }

    // If no active business in context, try to load the user's own business
    async function loadOwnBusiness() {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
          setBusinessId(null)
          setIsLoading(false)
          return
        }

        // First try via business_users
        const { data: businessUser } = await supabase
          .from('business_users')
          .select('business_id')
          .eq('user_id', user.id)
          .maybeSingle()

        let business = null
        if (businessUser) {
          const { data } = await supabase
            .from('businesses')
            .select('id')
            .eq('id', businessUser.business_id)
            .maybeSingle()
          business = data
        } else {
          // Fallback: try to find a business owned by this user
          const { data } = await supabase
            .from('businesses')
            .select('id')
            .eq('owner_id', user.id)
            .maybeSingle()
          business = data
        }
        const fetchError = null

        if (fetchError || !business) {
          // User might be a coach with no own business - that's OK
          setBusinessId(null)
          setIsLoading(false)
          return
        }

        setBusinessId(business.id)
        setError(null)
      } catch (err) {
        console.error('[useActiveBusinessId] Error loading business:', err)
        setError('Failed to load business')
      } finally {
        setIsLoading(false)
      }
    }

    loadOwnBusiness()
  }, [activeBusiness?.id, contextLoading])

  return {
    businessId,
    isLoading,
    error,
    // Convenience properties
    hasActiveBusiness: !!businessId,
  }
}

/**
 * Simple hook that just returns the business ID or null.
 * Use this when you don't need loading/error states.
 */
export function useBusinessId(): string | null {
  const { activeBusiness } = useBusinessContext()
  return activeBusiness?.id ?? null
}

export default useActiveBusinessId
