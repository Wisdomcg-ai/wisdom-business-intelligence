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

  // First try the system_roles table
  const { data: roleData, error: roleError } = await supabase
    .from('system_roles')
    .select('role')
    .eq('user_id', user.id)
    .single()

  if (!roleError && roleData?.role) {
    console.log('[Auth] Found role in system_roles:', roleData.role)
    return roleData.role as SystemRole
  }

  // Fallback: check the users table system_role column
  const { data: userData, error: userError } = await supabase
    .from('users')
    .select('system_role')
    .eq('id', user.id)
    .single()

  if (!userError && userData?.system_role) {
    console.log('[Auth] Found role in users table:', userData.system_role)
    return userData.system_role as SystemRole
  }

  // Default to client if no role found anywhere
  console.log('[Auth] No role found, defaulting to client')
  return 'client'
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
