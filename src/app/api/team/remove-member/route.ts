import { createRouteHandlerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin'
import { getSupabaseSecretKey } from '@/lib/supabase/keys'
import { NextResponse } from 'next/server'
import { csrfProtection } from '@/lib/security/csrf'
import * as Sentry from '@sentry/nextjs'
import { z } from 'zod'
import { withSchema } from '@/lib/api/with-schema'
import { checkFullAccountDeletion, type FullDeletionVerdict } from '@/lib/team/account-guards'

// VALID-03 (observe mode): POST removes a team member from a business.
const RemoveMemberPostSchema = z.object({
  memberId: z.string().min(1),
  businessId: z.string().min(1),
  deleteCompletely: z.boolean().optional(),
})

async function postHandler(request: Request) {
  const supabase = await createRouteHandlerClient()
  const adminSupabase = createServiceRoleClient()

  try {
    // CSRF protection
    const csrf = await csrfProtection(request)
    if (!csrf.valid) {
      return NextResponse.json({ error: csrf.error }, { status: 403 })
    }

    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { memberId, businessId, deleteCompletely = false } = body

    if (!memberId || !businessId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Check user's system role (super_admin, coach, client)
    const { data: systemRole } = await adminSupabase
      .from('system_roles')
      .select('role')
      .eq('user_id', user.id)
      .single()

    const isSuperAdmin = systemRole?.role === 'super_admin'

    // Verify user has permission to remove from this business
    const { data: ownedBusiness } = await adminSupabase
      .from('businesses')
      .select('id, owner_id, assigned_coach_id')
      .eq('id', businessId)
      .single()

    const { data: userBusiness } = await adminSupabase
      .from('business_users')
      .select('role')
      .eq('business_id', businessId)
      .eq('user_id', user.id)
      .single()

    const isOwner = ownedBusiness?.owner_id === user.id
    const isAssignedCoach = ownedBusiness?.assigned_coach_id === user.id
    const isBusinessAdmin = userBusiness?.role === 'owner' || userBusiness?.role === 'admin'

    // Super admins can remove from any business
    // Coaches can remove from businesses they're assigned to
    // Business owners/admins can remove from their own business
    const canRemove = isSuperAdmin || isAssignedCoach || isOwner || isBusinessAdmin

    if (!canRemove) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 })
    }

    // Get the member's user_id before deleting.
    // AUTHZ-SR-02 (24 Aug 2026): scope the lookup to the AUTHORIZED business.
    // canRemove above only proved access to `businessId`; `memberId` is a
    // standalone business_users PK unrelated to it. Without `.eq('business_id',
    // businessId)` a logged-in owner/admin of their own business could pass a
    // memberId from ANOTHER tenant and evict that member — and with
    // deleteCompletely, destroy their entire account. Scoping makes a
    // cross-tenant memberId resolve to "not found" (fails closed).
    const { data: member } = await adminSupabase
      .from('business_users')
      .select('user_id')
      .eq('id', memberId)
      .eq('business_id', businessId)
      .single()

    if (!member) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 })
    }

    const memberUserId = member.user_id

    // Don't allow deleting the business owner
    if (memberUserId === ownedBusiness?.owner_id) {
      return NextResponse.json({ error: 'Cannot remove the business owner' }, { status: 400 })
    }

    // S1 (22 Sep 2026): decide what "delete completely" may do BEFORE touching
    // anything. Invite used to add any existing account (a coach's, Matt's) to
    // the caller's team, and this branch then deleted that account because it
    // had no other business_users rows. The guard refuses privileged accounts
    // and anyone who owns or coaches a business; a lookup failure refuses too.
    let verdict: FullDeletionVerdict | null = null
    if (deleteCompletely) {
      try {
        verdict = await checkFullAccountDeletion(adminSupabase, memberUserId, memberId)
      } catch (guardError) {
        Sentry.captureException(guardError, { tags: { route: 'team/remove-member', invariant: 'team_delete_guard_failed' } } as any)
        return NextResponse.json({ error: "Couldn't confirm this account is safe to delete — nothing was changed. Try again." }, { status: 500 })
      }
      if (verdict.kind === 'refuse') {
        return NextResponse.json({ error: verdict.reason }, { status: 403 })
      }
    }

    // Remove from business_users (scoped to the authorized business — see AUTHZ-SR-02 above)
    const { error: removeError } = await adminSupabase
      .from('business_users')
      .delete()
      .eq('id', memberId)
      .eq('business_id', businessId)

    if (removeError) {
      Sentry.captureException(removeError, { tags: { route: 'team/remove-member' }, extra: { context: "[Remove Member] Error removing from business_users" } } as any)
      return NextResponse.json({ error: 'Failed to remove team member' }, { status: 500 })
    }

    if (verdict?.kind === 'remove_only') {
      return NextResponse.json({
        success: true,
        message: 'User removed from team (still in other businesses)',
        deletedCompletely: false
      })
    }

    if (verdict?.kind === 'delete') {
      const { data: memberRow, error: emailError } = await adminSupabase
        .from('users')
        .select('email')
        .eq('id', memberUserId)
        .maybeSingle()
      const memberEmail = (memberRow as { email?: string } | null)?.email

      // Every step is checked: a half-deleted account (auth login gone, role
      // row left, or the reverse) is worse than either end state.
      const failures: string[] = []
      if (emailError) failures.push(`users email lookup: ${emailError.message}`)
      if (memberEmail) {
        const { error } = await adminSupabase.from('team_invites').delete().eq('email', memberEmail)
        if (error) failures.push(`team_invites: ${error.message}`)
      }
      {
        const { error } = await adminSupabase.from('system_roles').delete().eq('user_id', memberUserId)
        if (error) failures.push(`system_roles: ${error.message}`)
      }
      {
        const { error } = await adminSupabase.from('users').delete().eq('id', memberUserId)
        if (error) failures.push(`users: ${error.message}`)
      }

      // Delete from auth.users using Admin API
      const deleteAuthResponse = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users/${memberUserId}`,
        {
          method: 'DELETE',
          headers: {
            'apikey': getSupabaseSecretKey()
          }
        }
      )
      if (!deleteAuthResponse.ok) failures.push(`auth.users: HTTP ${deleteAuthResponse.status}`)

      if (failures.length > 0) {
        Sentry.captureMessage('[Remove Member] Account deletion incomplete', {
          level: 'error',
          tags: { route: 'team/remove-member', invariant: 'team_account_delete_incomplete' },
          extra: { memberUserId, failures },
        } as any)
        return NextResponse.json({
          success: false,
          error: 'They were removed from the team, but their account could not be fully deleted. Contact support.',
          deletedCompletely: false
        }, { status: 500 })
      }

      return NextResponse.json({
        success: true,
        message: 'User completely removed from the system',
        deletedCompletely: true
      })
    }

    return NextResponse.json({
      success: true,
      message: 'Team member removed',
      deletedCompletely: false
    })

  } catch (error) {
    Sentry.captureException(error, { tags: { route: 'team/remove-member' }, extra: { context: "[Remove Member] Error" } } as any)
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    )
  }
}

export const POST = withSchema('team/remove-member', RemoveMemberPostSchema, postHandler)
