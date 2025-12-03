import { createRouteHandlerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { sendClientInvitation } from '@/lib/email/resend'

export async function POST(request: Request) {
  const supabase = await createRouteHandlerClient()

  try {
    // Check if user is authenticated
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if user is coach or super admin
    const { data: roleData } = await supabase
      .from('system_roles')
      .select('role')
      .eq('user_id', user.id)
      .single()

    if (!roleData || (roleData.role !== 'coach' && roleData.role !== 'super_admin')) {
      return NextResponse.json({ error: 'Access denied. Coach or admin privileges required.' }, { status: 403 })
    }

    const body = await request.json()
    const { businessId } = body

    if (!businessId) {
      return NextResponse.json({ error: 'Business ID is required' }, { status: 400 })
    }

    // Get business details - for coaches, verify they're assigned to this client
    let businessQuery = supabase
      .from('businesses')
      .select('id, business_name, temp_password, invitation_sent, owner_id')
      .eq('id', businessId)

    // If coach (not super admin), verify they're assigned to this client
    if (roleData.role === 'coach') {
      businessQuery = businessQuery.eq('assigned_coach_id', user.id)
    }

    const { data: business, error: businessError } = await businessQuery.single()

    if (businessError || !business) {
      return NextResponse.json({ error: 'Client not found or access denied' }, { status: 404 })
    }

    // Check if there's a temp password stored
    if (!business.temp_password) {
      return NextResponse.json({
        error: 'No pending invitation found. The invitation may have already been sent or the password was not stored.'
      }, { status: 400 })
    }

    // Get the client user's email and name from auth
    const { data: ownerData, error: ownerError } = await supabase
      .from('users')
      .select('email, first_name, last_name')
      .eq('id', business.owner_id)
      .single()

    if (ownerError || !ownerData) {
      // Try to get from user_roles
      const { data: userRoleData } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('business_id', businessId)
        .eq('role', 'owner')
        .single()

      if (!userRoleData) {
        return NextResponse.json({ error: 'Could not find client user' }, { status: 404 })
      }

      // Get user info via auth admin API
      const authResponse = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users/${userRoleData.user_id}`,
        {
          headers: {
            'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
            'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY || ''
          }
        }
      )

      if (!authResponse.ok) {
        return NextResponse.json({ error: 'Could not retrieve user information' }, { status: 500 })
      }

      const authUser = await authResponse.json()

      // Get coach name
      const coachName = user.user_metadata?.first_name && user.user_metadata?.last_name
        ? `${user.user_metadata.first_name} ${user.user_metadata.last_name}`
        : user.email?.split('@')[0] || 'Your Coach'

      const loginUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://wisdombi.ai'
      const clientName = authUser.user_metadata?.first_name || authUser.email?.split('@')[0] || 'there'

      // Send the invitation email
      const emailResult = await sendClientInvitation({
        to: authUser.email,
        clientName,
        coachName,
        businessName: business.business_name,
        loginUrl: `${loginUrl}/login`,
        tempPassword: business.temp_password
      })

      if (!emailResult.success) {
        console.error('[Send Invitation] Failed to send email:', emailResult.error)
        return NextResponse.json({
          error: `Failed to send invitation email: ${emailResult.error}`
        }, { status: 500 })
      }

      // Update business to mark invitation as sent and clear temp password
      await supabase
        .from('businesses')
        .update({
          invitation_sent: true,
          invitation_sent_at: new Date().toISOString(),
          temp_password: null
        })
        .eq('id', businessId)

      console.log('[Send Invitation] Email sent successfully:', emailResult.id)

      return NextResponse.json({
        success: true,
        message: 'Invitation email sent successfully',
        emailId: emailResult.id
      })
    }

    // We have ownerData - use it
    const coachName = user.user_metadata?.first_name && user.user_metadata?.last_name
      ? `${user.user_metadata.first_name} ${user.user_metadata.last_name}`
      : user.email?.split('@')[0] || 'Your Coach'

    const loginUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://wisdombi.ai'
    const clientName = ownerData.first_name || ownerData.email?.split('@')[0] || 'there'

    // Send the invitation email
    const emailResult = await sendClientInvitation({
      to: ownerData.email,
      clientName,
      coachName,
      businessName: business.business_name,
      loginUrl: `${loginUrl}/login`,
      tempPassword: business.temp_password
    })

    if (!emailResult.success) {
      console.error('[Send Invitation] Failed to send email:', emailResult.error)
      return NextResponse.json({
        error: `Failed to send invitation email: ${emailResult.error}`
      }, { status: 500 })
    }

    // Update business to mark invitation as sent and clear temp password
    await supabase
      .from('businesses')
      .update({
        invitation_sent: true,
        invitation_sent_at: new Date().toISOString(),
        temp_password: null
      })
      .eq('id', businessId)

    console.log('[Send Invitation] Email sent successfully:', emailResult.id)

    return NextResponse.json({
      success: true,
      message: 'Invitation email sent successfully',
      emailId: emailResult.id
    })

  } catch (error) {
    console.error('[Send Invitation] Error:', error)
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    )
  }
}
