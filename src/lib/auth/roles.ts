import { createClient } from '@/lib/supabase/client'

export type SystemRole = 'super_admin' | 'coach' | 'client'

export interface UserWithRole {
  id: string
  email: string
  role: SystemRole
}

/**
 * Get the current user's system role
 */
export async function getUserSystemRole(): Promise<SystemRole | null> {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    console.log('[Auth] No user found')
    return null
  }

  console.log('[Auth] Checking role for user:', user.id)

  const { data, error } = await supabase
    .from('system_roles')
    .select('role')
    .eq('user_id', user.id)
    .single()

  if (error) {
    console.log('[Auth] Error fetching role:', error.message)
    // If table doesn't exist or no row found, default to client
    return 'client'
  }

  if (!data) {
    console.log('[Auth] No role data found, defaulting to client')
    return 'client'
  }

  console.log('[Auth] Found role:', data.role)
  return data.role as SystemRole
}

/**
 * Check if current user is super admin
 */
export async function isSuperAdmin(): Promise<boolean> {
  const role = await getUserSystemRole()
  return role === 'super_admin'
}

/**
 * Check if current user is coach
 */
export async function isCoach(): Promise<boolean> {
  const role = await getUserSystemRole()
  return role === 'coach'
}

/**
 * Get redirect path based on user role
 */
export function getRedirectPathForRole(role: SystemRole): string {
  switch (role) {
    case 'super_admin':
      return '/admin'
    case 'coach':
      return '/coach/clients'
    case 'client':
      return '/dashboard'
    default:
      return '/dashboard'
  }
}

/**
 * Redirect user to appropriate dashboard based on their role
 */
export async function redirectToRoleDashboard() {
  const role = await getUserSystemRole()
  if (!role) return '/login'
  return getRedirectPathForRole(role)
}
