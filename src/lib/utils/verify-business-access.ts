import { createClient } from '@supabase/supabase-js';
import { getSupabaseSecretKey } from '@/lib/supabase/keys';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  getSupabaseSecretKey()
);

/**
 * Verify that a user has access to a specific business.
 * Checks: owner, assigned coach, business_users membership, super_admin role.
 * Also handles the dual ID system (businesses.id vs business_profiles.id).
 */
export async function verifyBusinessAccess(userId: string, businessId: string): Promise<boolean> {
  // Try direct match on businesses table
  const { data: business } = await supabaseAdmin
    .from('businesses')
    .select('owner_id, assigned_coach_id')
    .eq('id', businessId)
    .maybeSingle();

  if (business?.owner_id === userId || business?.assigned_coach_id === userId) {
    return true;
  }

  // If not found in businesses, try business_profiles (dual ID system)
  if (!business) {
    const { data: profile } = await supabaseAdmin
      .from('business_profiles')
      .select('id, business_id')
      .eq('id', businessId)
      .maybeSingle();

    if (profile?.business_id) {
      const { data: biz } = await supabaseAdmin
        .from('businesses')
        .select('owner_id, assigned_coach_id')
        .eq('id', profile.business_id)
        .maybeSingle();

      if (biz?.owner_id === userId || biz?.assigned_coach_id === userId) {
        return true;
      }
    }
  }

  // Check if user is an ACTIVE business member.
  // C-34 fix: only an active membership grants access. Without the status
  // filter, a deactivated or pending member would still be granted — see
  // verify-business-access-characterization.test.ts. Valid statuses are
  // 'pending' | 'active' | 'inactive' (business_users.status CHECK constraint).
  const { data: membership } = await supabaseAdmin
    .from('business_users')
    .select('id')
    .eq('business_id', businessId)
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle();

  if (membership) {
    return true;
  }

  // Check if user is super_admin
  const { data: role } = await supabaseAdmin
    .from('system_roles')
    .select('role')
    .eq('user_id', userId)
    .maybeSingle();

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
