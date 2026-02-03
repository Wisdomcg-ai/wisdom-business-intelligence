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
      canAddToSharedBoards: false,
      canEditOwnItems: false,
      canEditAllItems: false,
      canDeleteOwnItems: false,
      canDeleteAllItems: false,
      canViewOwnReviews: true,
      canViewAllReviews: true,
      canViewStrategicItems: true,
      canEditStrategicItems: false,
      canManageTeam: false,
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
    console.log('[BusinessContext] Loading current user...')
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      console.log('[BusinessContext] getUser returned:', user?.id || 'none', authError?.message || 'no error')

      if (!user) {
        console.log('[BusinessContext] No user, setting loading to false')
        setCurrentUser(null)
        setIsLoading(false)
        return
      }

      // Get role after confirming user exists (getUserSystemRole calls getUser internally)
      const role = await getUserSystemRole()
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
        console.log('[BusinessContext] Looking up business for client user:', user.id)

        // First try via business_users join table (for team members)
        // Now also fetch the role for proper permissions
        const { data: businessUser, error: businessUserError } = await supabase
          .from('business_users')
          .select('business_id, role')
          .eq('user_id', user.id)
          .eq('status', 'active')
          .maybeSingle()

        console.log('[BusinessContext] business_users lookup result:', {
          found: !!businessUser,
          businessId: businessUser?.business_id,
          role: businessUser?.role,
          error: businessUserError?.message
        })

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
          console.log('[BusinessContext] Loaded business as TEAM MEMBER:', {
            businessId: data?.id,
            businessName: data?.name,
            ownerId: data?.owner_id,
            error: bizError?.message
          })
        } else {
          // Fallback: try direct owner_id lookup
          loadedVia = 'owner (businesses.owner_id)'
          const { data, error: ownerError } = await supabase
            .from('businesses')
            .select('id, name, owner_id, industry, status')
            .eq('owner_id', user.id)
            .maybeSingle()
          business = data
          console.log('[BusinessContext] Loaded business as OWNER:', {
            businessId: data?.id,
            businessName: data?.name,
            error: ownerError?.message
          })
        }

        if (business) {
          const isOwner = business.owner_id === user.id
          // Determine role: if owner, use 'owner'; otherwise use role from business_users
          const businessRole: ViewerContext['role'] = isOwner
            ? 'owner'
            : (businessUser?.role as ViewerContext['role']) || 'member'

          const permissions = getPermissionsForRole(businessRole, isOwner)

          console.log('[BusinessContext] Setting active business:', {
            id: business.id,
            name: business.name,
            ownerId: business.owner_id,
            loadedVia,
            userIsOwner: isOwner,
            businessRole,
            permissions: {
              canDeleteOwnItems: permissions.canDeleteOwnItems,
              canDeleteAllItems: permissions.canDeleteAllItems,
              canEditStrategicItems: permissions.canEditStrategicItems
            }
          })
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
        } else {
          console.log('[BusinessContext] No business found for user:', user.id)
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
        .single()

      console.log('[BusinessContext] Business fetch result:', { business: business?.name, error: fetchError?.message })

      if (fetchError || !business) {
        setError('Business not found or you do not have access')
        setIsLoading(false)
        return
      }

      // SECURITY: Verify the user has access to this business
      const isOwner = business.owner_id === currentUser.id
      const isAssignedCoach = business.assigned_coach_id === currentUser.id
      const isSuperAdmin = currentUser.role === 'admin'

      // If not owner, assigned coach, or super admin, check team membership
      let isTeamMember = false
      let teamMemberRole: string | null = null
      if (!isOwner && !isAssignedCoach && !isSuperAdmin) {
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
      if (!isOwner && !isAssignedCoach && !isSuperAdmin && !isTeamMember) {
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
      } else if (isAssignedCoach || isSuperAdmin) {
        viewerRole = 'coach'
      } else {
        viewerRole = 'viewer'
      }

      const permissions = getPermissionsForRole(viewerRole, isOwner)
      const isViewingAsCoach = isAssignedCoach || (isSuperAdmin && !isOwner && !isTeamMember)

      setViewerContext({
        role: viewerRole,
        isViewingAsCoach,
        canEdit: permissions.canEditOwnItems || permissions.canEditAllItems,
        canDelete: permissions.canDeleteOwnItems || permissions.canDeleteAllItems,
        permissions,
      })

      console.log('[BusinessContext] Active business set:', business.name, {
        isOwner,
        isAssignedCoach,
        isSuperAdmin,
        isTeamMember,
        viewerRole,
        teamMemberRole,
        permissions: {
          canDeleteOwnItems: permissions.canDeleteOwnItems,
          canDeleteAllItems: permissions.canDeleteAllItems
        }
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
    console.log('[BusinessContext] Mounted - loading current user')
    isLoadingUserRef.current = true
    loadCurrentUser().finally(() => {
      isLoadingUserRef.current = false
    })
  }, [loadCurrentUser])

  // Listen for auth state changes - reload user when session becomes available
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, _session) => {
        if (event === 'SIGNED_IN' && !currentUserRef.current && !isLoadingUserRef.current) {
          console.log('[BusinessContext] Auth SIGNED_IN detected, reloading user...')
          isLoadingUserRef.current = true
          try {
            await loadCurrentUserRef.current()
          } finally {
            isLoadingUserRef.current = false
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
