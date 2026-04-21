'use client'

import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react'
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

// Granular permissions for the viewer
interface ViewerPermissions {
  // Shared boards (Issues, Loops, Ideas)
  canViewSharedBoards: boolean
  canAddToSharedBoards: boolean
  canEditOwnItems: boolean
  canEditAllItems: boolean
  canDeleteOwnItems: boolean
  canDeleteAllItems: boolean

  // Weekly Reviews
  canViewOwnReviews: boolean
  canViewAllReviews: boolean

  // Strategic items (Goals, KPIs, Forecasts)
  canViewStrategicItems: boolean
  canEditStrategicItems: boolean

  // Team management
  canManageTeam: boolean
}

interface ViewerContext {
  role: 'owner' | 'admin' | 'member' | 'viewer' | 'coach'  // Role relative to the active business
  isViewingAsCoach: boolean          // True when a coach is viewing a client's data
  canEdit: boolean                    // Permission to edit data (legacy, for backwards compatibility)
  canDelete: boolean                  // Permission to delete data (legacy, for backwards compatibility)
  permissions: ViewerPermissions      // Granular permissions
}

interface BusinessContextType {
  // Current logged-in user
  currentUser: CurrentUser | null

  // The business whose data we're viewing/editing
  activeBusiness: ActiveBusiness | null

  // Cached business_profiles.id for the active business (avoids repeated lookups)
  businessProfileId: string | null

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

  /**
   * Build a navigation href that stays within the coach view shell when applicable.
   * When a coach is viewing a client, `/sessions` → `/coach/clients/{id}/view/sessions`.
   * When a client is viewing their own data, returns the path unchanged.
   */
  buildHref: (path: string) => string
}

// Permission mapping by role
function getPermissionsForRole(role: ViewerContext['role'], isOwner: boolean): ViewerPermissions {
  if (isOwner || role === 'owner') {
    return {
      canViewSharedBoards: true,
      canAddToSharedBoards: true,
      canEditOwnItems: true,
      canEditAllItems: true,
      canDeleteOwnItems: true,
      canDeleteAllItems: true,
      canViewOwnReviews: true,
      canViewAllReviews: true,
      canViewStrategicItems: true,
      canEditStrategicItems: true,
      canManageTeam: true,
    }
  }

  if (role === 'admin') {
    return {
      canViewSharedBoards: true,
      canAddToSharedBoards: true,
      canEditOwnItems: true,
      canEditAllItems: true,
      canDeleteOwnItems: true,
      canDeleteAllItems: true,
      canViewOwnReviews: true,
      canViewAllReviews: true,
      canViewStrategicItems: true,
      canEditStrategicItems: true,
      canManageTeam: true,
    }
  }

  if (role === 'member') {
    return {
      canViewSharedBoards: true,
      canAddToSharedBoards: true,
      canEditOwnItems: true,
      canEditAllItems: false,
      canDeleteOwnItems: true,
      canDeleteAllItems: false,
      canViewOwnReviews: true,
      canViewAllReviews: false,
      canViewStrategicItems: true,
      canEditStrategicItems: false,
      canManageTeam: false,
    }
  }

  if (role === 'coach') {
    return {
      canViewSharedBoards: true,
      canAddToSharedBoards: true,
      canEditOwnItems: true,
      canEditAllItems: true,
      canDeleteOwnItems: true,
      canDeleteAllItems: true,
      canViewOwnReviews: true,
      canViewAllReviews: true,
      canViewStrategicItems: true,
      canEditStrategicItems: true,
      canManageTeam: true,
    }
  }

  // Viewer (read-only)
  return {
    canViewSharedBoards: true,
    canAddToSharedBoards: false,
    canEditOwnItems: false,
    canEditAllItems: false,
    canDeleteOwnItems: false,
    canDeleteAllItems: false,
    canViewOwnReviews: true,
    canViewAllReviews: false,
    canViewStrategicItems: true,
    canEditStrategicItems: false,
    canManageTeam: false,
  }
}

// Default permissions for unauthenticated/loading state
const defaultPermissions: ViewerPermissions = {
  canViewSharedBoards: false,
  canAddToSharedBoards: false,
  canEditOwnItems: false,
  canEditAllItems: false,
  canDeleteOwnItems: false,
  canDeleteAllItems: false,
  canViewOwnReviews: false,
  canViewAllReviews: false,
  canViewStrategicItems: false,
  canEditStrategicItems: false,
  canManageTeam: false,
}

// Default context values
const defaultViewerContext: ViewerContext = {
  role: 'owner',
  isViewingAsCoach: false,
  canEdit: true,
  canDelete: false,
  permissions: defaultPermissions,
}

const defaultContext: BusinessContextType = {
  currentUser: null,
  activeBusiness: null,
  businessProfileId: null,
  viewerContext: defaultViewerContext,
  isLoading: true,
  error: null,
  setActiveBusiness: async () => {},
  clearActiveBusiness: () => {},
  refreshUser: async () => {},
  buildHref: (path: string) => path,
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
  const [businessProfileId, setBusinessProfileId] = useState<string | null>(null)
  const [viewerContext, setViewerContext] = useState<ViewerContext>(defaultViewerContext)
  // IMPORTANT: Start with isLoading=true because we load user data on mount
  // This prevents race conditions where components render before user/business data is ready
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Load current user on mount
  const loadCurrentUser = useCallback(async () => {
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser()

      if (!user) {
        setCurrentUser(null)
        setIsLoading(false)
        return
      }

      // Get role after confirming user exists (getUserSystemRole calls getUser internally).
      // IMPORTANT: getUserSystemRole now returns null on transient errors (not 'client').
      // We treat null as "unknown" and refuse to auto-load a business — previously this
      // path silently pinned coaches to whatever business they owned, producing the
      // "saves to my business" bug when the role query hiccuped.
      const role = await getUserSystemRole()
      const mappedRole = role === 'super_admin' ? 'admin' : role === 'coach' ? 'coach' : role === 'client' ? 'client' : null

      if (mappedRole === null) {
        // Unknown role (transient error or unauthenticated). Surface as an error state
        // so pages show an empty state rather than silently using the wrong business.
        setCurrentUser({
          id: user.id,
          email: user.email || '',
          role: 'client', // placeholder; components gate on activeBusiness anyway
          firstName: user.user_metadata?.first_name,
          lastName: user.user_metadata?.last_name,
        })
        setError('Could not determine user role — please refresh')
        setIsLoading(false)
        return
      }

      setCurrentUser({
        id: user.id,
        email: user.email || '',
        role: mappedRole,
        firstName: user.user_metadata?.first_name,
        lastName: user.user_metadata?.last_name,
      })

      // Only auto-load a business for CONFIRMED clients. Coaches/admins must enter
      // a client via /coach/clients/[id]/view/... which calls setActiveBusiness
      // explicitly — they never get a default business attached to their session.
      if (mappedRole === 'client') {
        // First try via business_users join table (for team members)
        // Now also fetch the role for proper permissions
        const { data: businessUser, error: businessUserError } = await supabase
          .from('business_users')
          .select('business_id, role')
          .eq('user_id', user.id)
          .eq('status', 'active')
          .maybeSingle()

        let business = null
        let loadedVia = ''

        if (businessUser) {
          loadedVia = 'team_member (business_users table)'
          const { data, error: bizError } = await supabase
            .from('businesses')
            .select('id, name, owner_id, industry, status')
            .eq('id', businessUser.business_id)
            .maybeSingle()
          business = data
        } else {
          // Fallback: try direct owner_id lookup
          loadedVia = 'owner (businesses.owner_id)'
          const { data, error: ownerError } = await supabase
            .from('businesses')
            .select('id, name, owner_id, industry, status')
            .eq('owner_id', user.id)
            .maybeSingle()
          business = data
        }

        if (business) {
          const isOwner = business.owner_id === user.id
          // Determine role: if owner, use 'owner'; otherwise use role from business_users
          const businessRole: ViewerContext['role'] = isOwner
            ? 'owner'
            : (businessUser?.role as ViewerContext['role']) || 'member'

          const permissions = getPermissionsForRole(businessRole, isOwner)

          setActiveBusinessState({
            id: business.id,
            name: business.name || 'Unnamed Business',
            ownerId: business.owner_id,
            industry: business.industry || undefined,
            status: business.status || undefined,
          })
          setViewerContext({
            role: businessRole,
            isViewingAsCoach: false,
            canEdit: permissions.canEditOwnItems || permissions.canEditAllItems,
            canDelete: permissions.canDeleteOwnItems || permissions.canDeleteAllItems,
            permissions,
          })

          // Cache business_profiles.id for downstream hooks
          const { data: profile } = await supabase
            .from('business_profiles')
            .select('id')
            .eq('business_id', business.id)
            .maybeSingle()

          if (profile?.id) {
            setBusinessProfileId(profile.id)
          }
        }
      }

    } catch (err) {
      console.error('[BusinessContext] Error loading user:', err)
      setError('Failed to load user data')
    } finally {
      setIsLoading(false)
    }
  }, [supabase])

  // Set active business (used when coach views a client)
  const setActiveBusiness = useCallback(async (businessId: string) => {
    try {
      setIsLoading(true)
      setError(null)

      // First verify we have a current user
      if (!currentUser) {
        console.error('[BusinessContext] No current user when trying to set active business')
        setError('Not authenticated')
        setIsLoading(false)
        return
      }

      // Fetch the business directly
      const { data: business, error: fetchError } = await supabase
        .from('businesses')
        .select('id, name, owner_id, industry, status, assigned_coach_id')
        .eq('id', businessId)
        .maybeSingle()

      if (fetchError || !business) {
        setError('Business not found or you do not have access')
        setIsLoading(false)
        return
      }

      // SECURITY: Verify the user has access to this business
      const isOwner = business.owner_id === currentUser.id
      const isAssignedCoach = business.assigned_coach_id === currentUser.id
      const isCoach = currentUser.role === 'coach'
      const isSuperAdmin = currentUser.role === 'admin'

      // If not owner, coach, or super admin, check team membership
      let isTeamMember = false
      let teamMemberRole: string | null = null
      if (!isOwner && !isAssignedCoach && !isCoach && !isSuperAdmin) {
        const { data: teamMember } = await supabase
          .from('business_users')
          .select('id, role')
          .eq('business_id', businessId)
          .eq('user_id', currentUser.id)
          .eq('status', 'active')
          .maybeSingle()

        isTeamMember = !!teamMember
        teamMemberRole = teamMember?.role || null
      }

      // Deny access if no valid relationship exists
      if (!isOwner && !isAssignedCoach && !isCoach && !isSuperAdmin && !isTeamMember) {
        console.error('[BusinessContext] Access denied - user not authorized for this business:', {
          userId: currentUser.id,
          businessId,
          isOwner,
          isAssignedCoach,
          isSuperAdmin,
          isTeamMember
        })
        setError('You do not have access to this business')
        setIsLoading(false)
        return
      }

      // Fetch business profile ID
      const { data: profile } = await supabase
        .from('business_profiles')
        .select('id')
        .eq('business_id', business.id)
        .maybeSingle()

      setActiveBusinessState({
        id: business.id,
        name: business.name || 'Unnamed Business',
        ownerId: business.owner_id,
        industry: business.industry || undefined,
        status: business.status || undefined,
      })

      setBusinessProfileId(profile?.id || null)

      // Determine the viewer's role
      let viewerRole: ViewerContext['role']
      if (isOwner) {
        viewerRole = 'owner'
      } else if (isTeamMember && teamMemberRole) {
        viewerRole = teamMemberRole as ViewerContext['role']
      } else if (isAssignedCoach || isCoach || isSuperAdmin) {
        viewerRole = 'coach'
      } else {
        viewerRole = 'viewer'
      }

      const permissions = getPermissionsForRole(viewerRole, isOwner)
      const isViewingAsCoach = isAssignedCoach || isCoach || (isSuperAdmin && !isOwner && !isTeamMember)

      setViewerContext({
        role: viewerRole,
        isViewingAsCoach,
        canEdit: permissions.canEditOwnItems || permissions.canEditAllItems,
        canDelete: permissions.canDeleteOwnItems || permissions.canDeleteAllItems,
        permissions,
      })

    } catch (err) {
      console.error('[BusinessContext] Error setting active business:', err)
      setError('Failed to load business data')
    } finally {
      setIsLoading(false)
    }
  }, [supabase, currentUser])

  // Clear active business (used when coach exits client view)
  const clearActiveBusiness = useCallback(() => {
    setActiveBusinessState(null)
    setBusinessProfileId(null)
    setViewerContext(defaultViewerContext)
  }, [])

  // Refresh user data
  const refreshUser = useCallback(async () => {
    await loadCurrentUser()
  }, [loadCurrentUser])

  // Refs must be declared before effects that use them
  const currentUserRef = useRef(currentUser)
  currentUserRef.current = currentUser
  const loadCurrentUserRef = useRef(loadCurrentUser)
  loadCurrentUserRef.current = loadCurrentUser
  const isLoadingUserRef = useRef(false)

  // Load user on mount
  useEffect(() => {
    isLoadingUserRef.current = true
    loadCurrentUser().finally(() => {
      isLoadingUserRef.current = false
    })
  }, [loadCurrentUser])

  // Listen for auth state changes - reload user when session changes
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, _session) => {
        if (event === 'SIGNED_IN' && !isLoadingUserRef.current) {
          const sessionUserId = _session?.user?.id
          // Reload if no user loaded yet OR if the user changed (e.g. coach login replacing client session)
          if (!currentUserRef.current || currentUserRef.current.id !== sessionUserId) {
            // Clear stale business data when user changes
            if (currentUserRef.current && currentUserRef.current.id !== sessionUserId) {
              setActiveBusinessState(null)
              setBusinessProfileId(null)
              setViewerContext(defaultViewerContext)
            }
            isLoadingUserRef.current = true
            try {
              await loadCurrentUserRef.current()
            } finally {
              isLoadingUserRef.current = false
            }
          }
        } else if (event === 'SIGNED_OUT') {
          setCurrentUser(null)
          setActiveBusinessState(null)
          setBusinessProfileId(null)
          setViewerContext(defaultViewerContext)
        }
      }
    )

    return () => {
      subscription.unsubscribe()
    }
  }, [supabase])

  // Build navigation hrefs that stay inside the coach view shell.
  // When a coach is viewing a client, `/sessions` → `/coach/clients/{id}/view/sessions`.
  const buildHref = useCallback((path: string): string => {
    if (viewerContext.isViewingAsCoach && activeBusiness?.id) {
      const cleanPath = path.startsWith('/') ? path.slice(1) : path
      return `/coach/clients/${activeBusiness.id}/view/${cleanPath}`
    }
    return path
  }, [viewerContext.isViewingAsCoach, activeBusiness?.id])

  const value: BusinessContextType = {
    currentUser,
    activeBusiness,
    businessProfileId,
    viewerContext,
    isLoading,
    error,
    setActiveBusiness,
    clearActiveBusiness,
    refreshUser,
    buildHref,
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
