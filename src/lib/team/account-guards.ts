/**
 * Guards for the team routes that can reach ANOTHER person's account (S1,
 * 22 Sep 2026 system diagnostic).
 *
 * The hole these close: /api/team/invite added any existing account — found
 * by email — to the caller's team as an ACTIVE member, and
 * /api/team/remove-member with deleteCompletely then deleted that account's
 * system role, users row and auth login whenever it had no other
 * business_users rows. Coaches and super_admins have no business_users rows,
 * so a client owner could invite Matt's email and then delete his account.
 *
 * Two rules, both fail-closed (a lookup error refuses, never allows):
 *   1. Only a super_admin may add a coach or super_admin account to a team.
 *   2. "Delete completely" is only for a plain client account that owns no
 *      business, coaches no business and belongs to no other team.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

/** system_roles.role values allowed by system_roles_role_check. */
export type SystemRole = 'super_admin' | 'coach' | 'client'

/**
 * The account's system role, or null when it has no system_roles row (an
 * account with no row is treated as a client everywhere else in the app).
 * Throws when the lookup itself fails, so callers fail closed.
 */
export async function lookupSystemRole(
  admin: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const { data, error } = await admin
    .from('system_roles')
    .select('role')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw new Error(`system_roles lookup failed: ${error.message}`)
  return (data as { role?: string } | null)?.role ?? null
}

/** Anything other than a plain client (or no row) is privileged — including a role this code doesn't know. */
export function isPrivilegedRole(role: string | null): boolean {
  return role !== null && role !== 'client'
}

/**
 * What a "delete completely" request may do to `targetUserId`'s account:
 *   refuse       — privileged, or owns/coaches a business: change nothing.
 *   remove_only  — belongs to another team: remove from THIS team, keep the
 *                  account (the long-standing behaviour).
 *   delete       — a plain client on this team only: remove and delete.
 */
export type FullDeletionVerdict =
  | { kind: 'refuse'; reason: string }
  | { kind: 'remove_only' }
  | { kind: 'delete' }

/**
 * Decide a "delete completely" request. Call this BEFORE any mutation.
 * `excludingMembershipId` is the business_users row being removed in the same
 * request, so it doesn't count as "another team". Throws on a failed lookup.
 */
export async function checkFullAccountDeletion(
  admin: SupabaseClient,
  targetUserId: string,
  excludingMembershipId: string,
): Promise<FullDeletionVerdict> {
  const role = await lookupSystemRole(admin, targetUserId)
  if (isPrivilegedRole(role)) {
    return { kind: 'refuse', reason: 'This account belongs to a coach or administrator and cannot be deleted from a team page.' }
  }

  const { data: owned, error: ownedError } = await admin
    .from('businesses')
    .select('id')
    .or(`owner_id.eq.${targetUserId},assigned_coach_id.eq.${targetUserId}`)
    .limit(1)
  if (ownedError) throw new Error(`businesses lookup failed: ${ownedError.message}`)
  if ((owned ?? []).length > 0) {
    return { kind: 'refuse', reason: 'This person owns or coaches a business, so their account cannot be deleted from a team page.' }
  }

  const { data: memberships, error: membershipError } = await admin
    .from('business_users')
    .select('id')
    .eq('user_id', targetUserId)
    .neq('id', excludingMembershipId)
    .limit(1)
  if (membershipError) throw new Error(`business_users lookup failed: ${membershipError.message}`)
  if ((memberships ?? []).length > 0) return { kind: 'remove_only' }

  return { kind: 'delete' }
}
