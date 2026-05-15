/**
 * requireSectionPermission — shared helper for API-layer section-permission enforcement.
 *
 * Called by route handlers to determine whether a given user is permitted to
 * access a section-gated resource for a specific business.
 *
 * IMPORTANT: This helper MUST receive an auth-bound Supabase client
 * (e.g., from `createRouteHandlerClient()`) — NOT a service-role client.
 * See Phase 65 CONTEXT.md "Service-role bypass policy" for rationale.
 *
 * Allow / deny rules (in short-circuit order):
 *   1. owner        — user is `businesses.owner_id`
 *   2. admin        — user has `business_users` row with role='admin', status='active'
 *   3. coach        — user is `businesses.assigned_coach_id`
 *   4. super_admin  — user has `system_roles` row with role='super_admin'
 *   5. permission_granted — user has `business_users` row, status='active',
 *                           and section_permissions[sectionKey] is true or missing
 *   6. permission_denied  — user has `business_users` row, status='active',
 *                           and section_permissions[sectionKey] === false
 *   7. not_a_member       — none of the above matched
 *
 * Section-key spelling: `finances` (not `financials`).
 * See .planning/phases/65-section-permission-api-enforcement/65-01-SECTION-KEY-VERIFICATION.md
 *
 * Phase: 65-section-permission-api-enforcement
 * Plan:  65-01
 */

import type { SupabaseClient } from '@supabase/supabase-js'

// ─── Types ─────────────────────────────────────────────────────────────────────

export type SectionPermissionVerdict =
  | { allow: true; reason: 'owner' | 'admin' | 'coach' | 'super_admin' | 'permission_granted' }
  | { allow: false; reason: 'permission_denied' | 'not_a_member'; sectionKey: string }

// ─── Helper ────────────────────────────────────────────────────────────────────

/**
 * Check whether `userId` is permitted to access the section identified by
 * `sectionKey` within `businessId`.
 *
 * @param supabase   Auth-bound Supabase client (from createRouteHandlerClient).
 *                   MUST NOT be a service-role client.
 * @param userId     Authenticated user's UUID (from supabase.auth.getUser()).
 * @param businessId The `businesses.id` to check against.
 * @param sectionKey The section-permission key (e.g. `'finances'`).
 *
 * @returns A SectionPermissionVerdict. Throws on DB errors.
 */
export async function requireSectionPermission(
  supabase: SupabaseClient,
  userId: string,
  businessId: string,
  sectionKey: 'finances' | string,
): Promise<SectionPermissionVerdict> {
  // ── 1. Owner check ──────────────────────────────────────────────────────────
  // Mirrors the pattern used in src/app/api/goals/resolve-business/route.ts and
  // src/app/api/goals/save/route.ts: query businesses.owner_id directly.
  const { data: businessRow, error: ownerErr } = await supabase
    .from('businesses')
    .select('owner_id')
    .eq('id', businessId)
    .maybeSingle()

  if (ownerErr) throw ownerErr

  if (businessRow?.owner_id === userId) {
    return { allow: true, reason: 'owner' }
  }

  // ── 2. Coach check ─────────────────────────────────────────────────────────
  // Mirrors the pattern in src/app/api/goals/save/route.ts:
  //   businesses.assigned_coach_id === user.id → isCoach
  const { data: coachRow, error: coachErr } = await supabase
    .from('businesses')
    .select('assigned_coach_id')
    .eq('id', businessId)
    .maybeSingle()

  if (coachErr) throw coachErr

  if (coachRow?.assigned_coach_id === userId) {
    return { allow: true, reason: 'coach' }
  }

  // ── 3. business_users row lookup ───────────────────────────────────────────
  // Fetch once; used for both admin and active-member checks below.
  // Mirrors the query pattern in src/lib/utils/verify-business-access.ts:46-56.
  const { data: memberRow, error: memberErr } = await supabase
    .from('business_users')
    .select('role, status, section_permissions')
    .eq('business_id', businessId)
    .eq('user_id', userId)
    .maybeSingle()

  if (memberErr) throw memberErr

  // ── 4. Admin check ─────────────────────────────────────────────────────────
  // An active admin row implies full access regardless of section_permissions.
  if (memberRow?.role === 'admin' && memberRow?.status === 'active') {
    return { allow: true, reason: 'admin' }
  }

  // ── 5. Super-admin check ───────────────────────────────────────────────────
  // Mirrors the pattern in src/app/api/goals/resolve-business/route.ts:57-63:
  //   system_roles.role = 'super_admin' for the given user.
  const { data: superAdminRow, error: superAdminErr } = await supabase
    .from('system_roles')
    .select('role')
    .eq('user_id', userId)
    .eq('role', 'super_admin')
    .maybeSingle()

  if (superAdminErr) throw superAdminErr

  if (superAdminRow?.role === 'super_admin') {
    return { allow: true, reason: 'super_admin' }
  }

  // ── 6. Active-member section-permission check ──────────────────────────────
  // Only rows with status='active' are considered members. Pending or inactive
  // rows fall through to not_a_member (consistent with RLS policy behavior).
  if (memberRow && memberRow.status === 'active') {
    const permissions = memberRow.section_permissions as Record<string, unknown> | null | undefined

    // Retrieve the specific section key's value.
    // The canonical key is 'finances' (not 'financials') — see
    // 65-01-SECTION-KEY-VERIFICATION.md for the grep evidence and rationale.
    const keyValue = permissions?.[sectionKey]

    if (keyValue === false) {
      // Explicit deny
      return { allow: false, reason: 'permission_denied', sectionKey }
    }

    // Missing key (undefined), true, or any other non-false value → allow.
    // "Missing key defaults to true" is the least-surprise rule:
    // rows created before a key existed retain access until explicitly denied.
    return { allow: true, reason: 'permission_granted' }
  }

  // ── 7. Fallthrough — not a member ──────────────────────────────────────────
  // No owner / coach / admin / super_admin / active-member row matched.
  // This also covers status='pending' and status='inactive' rows.
  return { allow: false, reason: 'not_a_member', sectionKey }
}
