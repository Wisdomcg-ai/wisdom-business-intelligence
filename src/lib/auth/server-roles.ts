import type { SupabaseClient } from '@supabase/supabase-js'
import type { SystemRole } from './roles'

// Postgrest "no rows" — distinguish from genuine errors so a transient
// network/RLS failure never silently promotes a user into the client branch.
const PGRST_NO_ROWS = 'PGRST116'

/**
 * Server-side equivalent of getUserSystemRole() (src/lib/auth/roles.ts).
 *
 * The browser helper builds its own client via @/lib/supabase/client and reads
 * auth.getUser() — neither works inside a route handler. This takes the route's
 * AUTH-BOUND client and an already-resolved userId and applies the exact same
 * source-of-truth order: system_roles.role → users.system_role → 'client'.
 *
 * Returns null on a transient/real error (NOT 'client') so callers fail closed
 * on uncertainty rather than silently treating a coach as a client.
 */
export async function getUserSystemRoleServer(
  supabase: SupabaseClient,
  userId: string,
): Promise<SystemRole | null> {
  // system_roles is the source of truth.
  const { data: roleData, error: roleError } = await supabase
    .from('system_roles')
    .select('role')
    .eq('user_id', userId)
    .maybeSingle()

  if (roleData?.role) return roleData.role as SystemRole
  if (roleError && roleError.code !== PGRST_NO_ROWS) {
    console.error('[Auth] system_roles query failed:', roleError)
    return null
  }

  // Fallback to users.system_role.
  const { data: userData, error: userError } = await supabase
    .from('users')
    .select('system_role')
    .eq('id', userId)
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
 * True only for the coach + admin roles. A 'client' or a null (unknown/transient
 * error) role returns false, so role-gated routes fail closed.
 */
export function isCoachOrAdmin(role: SystemRole | null): boolean {
  return role === 'coach' || role === 'super_admin'
}
