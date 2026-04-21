import { createClient } from '@/lib/supabase/client'

export type SystemRole = 'super_admin' | 'coach' | 'client'

export interface UserWithRole {
  id: string
  email: string
  role: SystemRole
}

// Postgrest "no rows" — distinguish from genuine errors so a transient
// network/RLS failure never silently promotes a coach into the client branch.
const PGRST_NO_ROWS = 'PGRST116'

/**
 * Get the current user's system role.
 *
 * Returns:
 *  - 'coach' | 'super_admin' | 'client' when the role is known
 *  - 'client' only when BOTH tables confirmed "no row" for this user
 *  - null on auth failure OR transient error (caller must treat as unknown,
 *    NOT as client — previously we defaulted to 'client' which caused coaches
 *    to be auto-loaded into a random owned business on Supabase hiccups).
 */
export async function getUserSystemRole(): Promise<SystemRole | null> {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // system_roles is the source of truth
  const { data: roleData, error: roleError } = await supabase
    .from('system_roles')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle()

  if (roleData?.role) return roleData.role as SystemRole

  // Real error (not just "no row") — propagate as unknown
  if (roleError && roleError.code !== PGRST_NO_ROWS) {
    console.error('[Auth] system_roles query failed:', roleError)
    return null
  }

  // Fallback to users.system_role
  const { data: userData, error: userError } = await supabase
    .from('users')
    .select('system_role')
    .eq('id', user.id)
    .maybeSingle()

  if (userData?.system_role) return userData.system_role as SystemRole

  if (userError && userError.code !== PGRST_NO_ROWS) {
    console.error('[Auth] users.system_role query failed:', userError)
    return null
  }

  // Both tables confirmed no row — user is a client by default.
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
