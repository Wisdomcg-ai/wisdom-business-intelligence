import { createClient } from '@supabase/supabase-js';
import { getSupabaseSecretKey } from '@/lib/supabase/keys';
import { surfaceSupabaseError } from '@/lib/supabase/surfaceError';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  getSupabaseSecretKey()
);

/**
 * Verify that a user has access to a specific business.
 * Checks: owner, assigned coach, business_users membership, super_admin role.
 *
 * Accepts an id in EITHER id-space (businesses.id or business_profiles.id).
 * Owner, coach and membership are all facts about the businesses row, so a
 * business_profiles.id is resolved to its parent businesses.id and every check
 * runs against that. business_users.business_id references businesses(id): a
 * membership is never keyed on a profile id, and checking the raw input refused
 * every active team member whose page holds a business_profiles.id.
 *
 * This answers "does the user belong to this business", not "may they do this":
 * any ACTIVE member passes, whatever their role. A route that is owner / coach /
 * super_admin only (Xero connect, disconnect, monthly-report/sync-xero) keeps its
 * own role check.
 *
 * A failed lookup refuses (fail closed) and is surfaced — a refusal caused by a
 * database error must not pass for "not a member".
 */
export async function verifyBusinessAccess(userId: string, businessId: string): Promise<boolean> {
  // Try direct match on businesses table
  const { data: business, error: businessError } = await supabaseAdmin
    .from('businesses')
    .select('owner_id, assigned_coach_id')
    .eq('id', businessId)
    .maybeSingle();
  if (businessError) surfaceSupabaseError('verifyBusinessAccess.businesses', businessError);

  if (business?.owner_id === userId || business?.assigned_coach_id === userId) {
    return true;
  }

  // The businesses.id the membership check runs against: the input when it is a
  // businesses.id, the parent business when it is a business_profiles.id.
  let parentBusinessId = businessId;

  // If not found in businesses, try business_profiles (dual ID system)
  if (!business) {
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('business_profiles')
      .select('id, business_id')
      .eq('id', businessId)
      .maybeSingle();
    if (profileError) surfaceSupabaseError('verifyBusinessAccess.business_profiles', profileError);

    if (profile?.business_id) {
      parentBusinessId = profile.business_id;

      const { data: biz, error: bizError } = await supabaseAdmin
        .from('businesses')
        .select('owner_id, assigned_coach_id')
        .eq('id', profile.business_id)
        .maybeSingle();
      if (bizError) surfaceSupabaseError('verifyBusinessAccess.businesses', bizError);

      if (biz?.owner_id === userId || biz?.assigned_coach_id === userId) {
        return true;
      }
    }
  }

  // Check if user is an ACTIVE member of the (parent) business.
  // C-34 fix: only an active membership grants access. Without the status
  // filter, a deactivated or pending member would still be granted — see
  // verify-business-access-characterization.test.ts. Valid statuses are
  // 'pending' | 'active' | 'inactive' (business_users.status CHECK constraint).
  const { data: membership, error: membershipError } = await supabaseAdmin
    .from('business_users')
    .select('id')
    .eq('business_id', parentBusinessId)
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle();
  if (membershipError) surfaceSupabaseError('verifyBusinessAccess.business_users', membershipError);

  if (membership) {
    return true;
  }

  // Check if user is super_admin
  const { data: role, error: roleError } = await supabaseAdmin
    .from('system_roles')
    .select('role')
    .eq('user_id', userId)
    .maybeSingle();
  if (roleError) surfaceSupabaseError('verifyBusinessAccess.system_roles', roleError);

  return role?.role === 'super_admin';
}

/**
 * Resolve the owner user_id for a business, given an id in EITHER id-space
 * (businesses.id or business_profiles.id). Returns null if the business can't
 * be resolved.
 *
 * Used where a record is keyed by the business OWNER's user_id (e.g. team_data
 * / the org chart) but the request only carries a business id. Deriving the
 * owner server-side — instead of trusting a client-supplied user_id — is what
 * keeps that class of endpoint free of cross-tenant IDOR: the caller proves
 * access to the business via verifyBusinessAccess(), and the storage key is
 * computed here rather than accepted from the request.
 */
export async function getBusinessOwnerId(businessId: string): Promise<string | null> {
  // Direct: businesses.id
  const { data: business } = await supabaseAdmin
    .from('businesses')
    .select('owner_id')
    .eq('id', businessId)
    .maybeSingle();

  if (business?.owner_id) return business.owner_id;

  // Dual-ID: businessId may be a business_profiles.id
  const { data: profile } = await supabaseAdmin
    .from('business_profiles')
    .select('business_id')
    .eq('id', businessId)
    .maybeSingle();

  if (profile?.business_id) {
    const { data: biz } = await supabaseAdmin
      .from('businesses')
      .select('owner_id')
      .eq('id', profile.business_id)
      .maybeSingle();

    if (biz?.owner_id) return biz.owner_id;
  }

  return null;
}
