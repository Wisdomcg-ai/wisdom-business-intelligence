'use client'

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getUserSystemRole } from '@/lib/auth/roles'

// Types
interface CurrentUser {
  id: string
  email: string
  role: 'client' | 'coach' | 'admin'
  firstName?: string
  lastName?: string
}

interface ActiveBusiness {
  id: string
  name: string
  ownerId: string
  industry?: string
  status?: string
}

interface ViewerContext {
  role: 'owner' | 'coach' | 'admin'  // Role relative to the active business
  isViewingAsCoach: boolean          // True when a coach is viewing a client's data
  canEdit: boolean                    // Permission to edit data
  canDelete: boolean                  // Permission to delete data
}

interface BusinessContextType {
  // Current logged-in user
  currentUser: CurrentUser | null

  // The business whose data we're viewing/editing
  activeBusiness: ActiveBusiness | null

  // Context about who is viewing and their permissions
  viewerContext: ViewerContext

  // Loading state
  isLoading: boolean

  // Error state
  error: string | null

  // Actions
  setActiveBusiness: (businessId: string) => Promise<void>
  clearActiveBusiness: () => void
  refreshUser: () => Promise<void>
}

// Default context values
const defaultViewerContext: ViewerContext = {
  role: 'owner',
  isViewingAsCoach: false,
  canEdit: true,
  canDelete: false,
}

const defaultContext: BusinessContextType = {
  currentUser: null,
  activeBusiness: null,
  viewerContext: defaultViewerContext,
  isLoading: true,
  error: null,
  setActiveBusiness: async () => {},
  clearActiveBusiness: () => {},
  refreshUser: async () => {},
}

// Create the context
const BusinessContext = createContext<BusinessContextType>(defaultContext)

// Provider component
interface BusinessContextProviderProps {
  children: ReactNode
}

export function BusinessContextProvider({ children }: BusinessContextProviderProps) {
  const supabase = createClient()

  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null)
  const [activeBusiness, setActiveBusinessState] = useState<ActiveBusiness | null>(null)
  const [viewerContext, setViewerContext] = useState<ViewerContext>(defaultViewerContext)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load current user on mount
  const loadCurrentUser = useCallback(async () => {
    console.log('[BusinessContext] Loading current user...')
    try {
      console.log('[BusinessContext] Calling supabase.auth.getUser()...')
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      console.log('[BusinessContext] getUser returned:', user?.id || 'none', authError?.message || 'no error')

      if (!user) {
        console.log('[BusinessContext] No user, setting loading to false')
        setCurrentUser(null)
        setIsLoading(false)
        return
      }

      // Get user's system role
      const role = await getUserSystemRole()

      // Map system role to context role
      const mappedRole = role === 'super_admin' ? 'admin' : role || 'client'

      setCurrentUser({
        id: user.id,
        email: user.email || '',
        role: mappedRole as 'client' | 'coach' | 'admin',
        firstName: user.user_metadata?.first_name,
        lastName: user.user_metadata?.last_name,
      })

      // If user is a client, automatically load their business
      if (role === 'client' || role === null) {
        // First try via business_users join table (for team members)
        const { data: businessUser } = await supabase
          .from('business_users')
          .select('business_id')
          .eq('user_id', user.id)
          .eq('status', 'active')
          .maybeSingle()

        let business = null
        if (businessUser) {
          const { data } = await supabase
            .from('businesses')
            .select('id, name, owner_id, industry, status')
            .eq('id', businessUser.business_id)
            .maybeSingle()
          business = data
        } else {
          // Fallback: try direct owner_id lookup
          const { data } = await supabase
            .from('businesses')
            .select('id, name, owner_id, industry, status')
            .eq('owner_id', user.id)
            .maybeSingle()
          business = data
        }

        if (business) {
          setActiveBusinessState({
            id: business.id,
            name: business.name || 'Unnamed Business',
            ownerId: business.owner_id,
            industry: business.industry || undefined,
            status: business.status || undefined,
          })
          setViewerContext({
            role: 'owner',
            isViewingAsCoach: false,
            canEdit: true,
            canDelete: true,
          })
        }
      }

    } catch (err) {
      console.error('[BusinessContext] Error loading user:', err)
      setError('Failed to load user data')
    } finally {
      console.log('[BusinessContext] Finished loading, setting isLoading to false')
      setIsLoading(false)
    }
  }, [supabase])

  // Set active business (used when coach views a client)
  const setActiveBusiness = useCallback(async (businessId: string) => {
    try {
      console.log('[BusinessContext] Setting active business:', businessId)
      setIsLoading(true)
      setError(null)

      // Fetch the business directly - don't need user for this
      const { data: business, error: fetchError } = await supabase
        .from('businesses')
        .select('id, name, owner_id, industry, status, assigned_coach_id')
        .eq('id', businessId)
        .single()

      console.log('[BusinessContext] Business fetch result:', { business: business?.name, error: fetchError?.message })

      if (fetchError || !business) {
        setError('Business not found or you do not have access')
        setIsLoading(false)
        return
      }

      // For coach view, always set as viewing as coach
      setActiveBusinessState({
        id: business.id,
        name: business.name || 'Unnamed Business',
        ownerId: business.owner_id,
        industry: business.industry || undefined,
        status: business.status || undefined,
      })

      setViewerContext({
        role: 'coach',
        isViewingAsCoach: true,
        canEdit: true,
        canDelete: false,
      })

      console.log('[BusinessContext] Active business set:', business.name)

    } catch (err) {
      console.error('[BusinessContext] Error setting active business:', err)
      setError('Failed to load business data')
    } finally {
      setIsLoading(false)
    }
  }, [supabase])

  // Clear active business (used when coach exits client view)
  const clearActiveBusiness = useCallback(() => {
    setActiveBusinessState(null)
    setViewerContext(defaultViewerContext)
  }, [])

  // Refresh user data
  const refreshUser = useCallback(async () => {
    await loadCurrentUser()
  }, [loadCurrentUser])

  // Load user on mount
  useEffect(() => {
    console.log('[BusinessContext] Mounted - loading current user')
    loadCurrentUser()
  }, [loadCurrentUser])

  // Listen for auth state changes - disabled for now to prevent blocking
  // useEffect(() => {
  //   const { data: { subscription } } = supabase.auth.onAuthStateChange(
  //     async (event, _session) => {
  //       if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
  //         await loadCurrentUser()
  //       } else if (event === 'SIGNED_OUT') {
  //         setCurrentUser(null)
  //         setActiveBusinessState(null)
  //         setViewerContext(defaultViewerContext)
  //       }
  //     }
  //   )
  //
  //   return () => {
  //     subscription.unsubscribe()
  //   }
  // }, [supabase, loadCurrentUser])

  const value: BusinessContextType = {
    currentUser,
    activeBusiness,
    viewerContext,
    isLoading,
    error,
    setActiveBusiness,
    clearActiveBusiness,
    refreshUser,
  }

  return (
    <BusinessContext.Provider value={value}>
      {children}
    </BusinessContext.Provider>
  )
}

// Custom hook to use the context
export function useBusinessContext() {
  const context = useContext(BusinessContext)
  if (context === undefined) {
    throw new Error('useBusinessContext must be used within a BusinessContextProvider')
  }
  return context
}

// Export the context for edge cases
export { BusinessContext }
