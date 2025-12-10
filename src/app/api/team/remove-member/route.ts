import { createRouteHandlerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const supabase = await createRouteHandlerClient()
  const adminSupabase = createServiceRoleClient()

  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { memberId, businessId, deleteCompletely = false } = body

    if (!memberId || !businessId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Verify user has permission to remove from this business
    const { data: ownedBusiness } = await adminSupabase
      .from('businesses')
      .select('id, owner_id')
      .eq('id', businessId)
      .single()

    const { data: userBusiness } = await adminSupabase
      .from('business_users')
      .select('role')
      .eq('business_id', businessId)
      .eq('user_id', user.id)
      .single()

    const isOwner = ownedBusiness?.owner_id === user.id
    const canRemove = isOwner || userBusiness?.role === 'owner' || userBusiness?.role === 'admin'

    if (!canRemove) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 })
    }

    // Get the member's user_id before deleting
    const { data: member } = await adminSupabase
      .from('business_users')
      .select('user_id')
      .eq('id', memberId)
      .single()

    if (!member) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 })
    }

    const memberUserId = member.user_id

    // Don't allow deleting the business owner
    if (memberUserId === ownedBusiness?.owner_id) {
      return NextResponse.json({ error: 'Cannot remove the business owner' }, { status: 400 })
    }

    // Remove from business_users
    const { error: removeError } = await adminSupabase
      .from('business_users')
      .delete()
      .eq('id', memberId)

    if (removeError) {
      console.error('[Remove Member] Error removing from business_users:', removeError)
      return NextResponse.json({ error: 'Failed to remove team member' }, { status: 500 })
    }

    // If deleteCompletely is true, remove from all tables and auth
    if (deleteCompletely) {
      // Check if user is in any other businesses
      const { data: otherBusinesses } = await adminSupabase
        .from('business_users')
        .select('id')
        .eq('user_id', memberUserId)

      // Only fully delete if they're not in any other businesses
      if (!otherBusinesses || otherBusinesses.length === 0) {
        // Delete from team_invites
        await adminSupabase
          .from('team_invites')
          .delete()
          .eq('email', (await adminSupabase
            .from('users')
            .select('email')
            .eq('id', memberUserId)
            .single()
          ).data?.email || '')

        // Delete from system_roles
        await adminSupabase
          .from('system_roles')
          .delete()
          .eq('user_id', memberUserId)

        // Delete from users table
        await adminSupabase
          .from('users')
          .delete()
          .eq('id', memberUserId)

        // Delete from auth.users using Admin API
        const deleteAuthResponse = await fetch(
          `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users/${memberUserId}`,
          {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
              'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY || ''
            }
          }
        )

        if (!deleteAuthResponse.ok) {
          console.error('[Remove Member] Failed to delete from auth.users')
        }

        return NextResponse.json({
          success: true,
          message: 'User completely removed from the system',
          deletedCompletely: true
        })
      } else {
        return NextResponse.json({
          success: true,
          message: 'User removed from team (still in other businesses)',
          deletedCompletely: false
        })
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Team member removed',
      deletedCompletely: false
    })

  } catch (error) {
    console.error('[Remove Member] Error:', error)
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    )
  }
}
