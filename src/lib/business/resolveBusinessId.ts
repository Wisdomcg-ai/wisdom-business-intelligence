/**
 * Role-aware business-ID resolver.
 *
 * Prior to this helper, many pages did `bizId = someLookup?.id || user.id`
 * or `.eq('owner_id', user.id)` as a fallback. When the user was a coach (not
 * a client), those fallbacks pinned the page to either:
 *   - the coach's Supabase auth UUID masquerading as a business ID, or
 *   - whatever business the coach happened to own (e.g. a test/demo business),
 * producing silent writes to the wrong business.
 *
 * Rules enforced here:
 *   1. If activeBusiness.id is set (coach viewing a client, or client with
 *      context loaded), use it. No further lookup.
 *   2. Otherwise, only run the owner/team lookup for role === 'client'.
 *      Coaches/admins with no active business return null — pages must show
 *      an empty "select a client" state rather than guess.
 *   3. Never fall back to user.id as a business ID. Ever.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export type BusinessRole = 'client' | 'coach' | 'admin'

export interface ResolveResult {
  businessId: string | null
  /**
   * Why we returned the value we did — useful for UI empty states.
   *  - 'active'          activeBusiness from context
   *  - 'client-team'     client resolved via business_users
   *  - 'client-owner'    client resolved via businesses.owner_id
   *  - 'coach-no-client' coach/admin with no activeBusiness (render "pick a client")
   *  - 'no-business'     client with no business at all (onboarding)
   *  - 'unauthenticated' no user
   */
  reason:
    | 'active'
    | 'client-team'
    | 'client-owner'
    | 'coach-no-client'
    | 'no-business'
    | 'unauthenticated'
}

/**
 * Runtime invariant: a resolved business ID must never equal the user's
 * auth UUID. If it does, the old "saves to my business" bug has recurred and
 * we fail loudly rather than silently write to the wrong row.
 */
function assertNotUserId(businessId: string, userId: string | null | undefined, reason: string): void {
  if (userId && businessId === userId) {
    const err = new Error(
      `[resolveBusinessId] INVARIANT VIOLATED: resolved businessId == userId (reason="${reason}"). ` +
      `This indicates the pre-fix fallback bug has recurred — a page is treating the user's auth UUID as a business id.`
    )
    // Log to Sentry if present; log to console unconditionally. Throw so the
    // caller fails fast rather than writing to the wrong business.
    if (typeof window !== 'undefined' && (window as any).Sentry?.captureException) {
      (window as any).Sentry.captureException(err)
    }
    console.error(err)
    throw err
  }
}

export async function resolveBusinessId(
  supabase: SupabaseClient,
  params: {
    userId: string | null | undefined
    role: BusinessRole | null | undefined
    activeBusinessId: string | null | undefined
  }
): Promise<ResolveResult> {
  if (params.activeBusinessId) {
    assertNotUserId(params.activeBusinessId, params.userId, 'active')
    return { businessId: params.activeBusinessId, reason: 'active' }
  }
  if (!params.userId) {
    return { businessId: null, reason: 'unauthenticated' }
  }
  if (params.role !== 'client') {
    // Coach/admin/unknown — do NOT fall back to owner_id with the coach's UUID.
    return { businessId: null, reason: 'coach-no-client' }
  }

  // Client: try team membership first (handles non-owner team members), then owner.
  const { data: businessUser } = await supabase
    .from('business_users')
    .select('business_id')
    .eq('user_id', params.userId)
    .eq('status', 'active')
    .maybeSingle()

  if (businessUser?.business_id) {
    assertNotUserId(businessUser.business_id, params.userId, 'client-team')
    return { businessId: businessUser.business_id, reason: 'client-team' }
  }

  const { data: ownedBusiness } = await supabase
    .from('businesses')
    .select('id')
    .eq('owner_id', params.userId)
    .maybeSingle()

  if (ownedBusiness?.id) {
    assertNotUserId(ownedBusiness.id, params.userId, 'client-owner')
    return { businessId: ownedBusiness.id, reason: 'client-owner' }
  }

  return { businessId: null, reason: 'no-business' }
}
