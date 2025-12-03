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

    // Get the client user's email and name
    // First try custom users table, then fall back to Supabase Auth admin API
    let clientEmail: string
    let clientName: string

    const { data: ownerData } = await supabase
      .from('users')
      .select('email, first_name, last_name')
      .eq('id', business.owner_id)
      .maybeSingle()

    if (ownerData?.email) {
      clientEmail = ownerData.email
      clientName = ownerData.first_name || ownerData.email.split('@')[0] || 'there'
    } else {
      // Fall back to Supabase Auth admin API
      const authResponse = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users/${business.owner_id}`,
        {
          headers: {
            'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
            'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY || ''
          }
        }
      )

      if (!authResponse.ok) {
        console.error('[Send Invitation] Auth API error:', authResponse.status, await authResponse.text())
        return NextResponse.json({ error: 'Could not find client user. Owner ID may be invalid.' }, { status: 404 })
      }

      const authUser = await authResponse.json()
      clientEmail = authUser.email
      clientName = authUser.user_metadata?.first_name || authUser.email?.split('@')[0] || 'there'
    }

    if (!clientEmail) {
      return NextResponse.json({ error: 'Could not determine client email address' }, { status: 404 })
    }

    // Get coach name
    const coachName = user.user_metadata?.first_name && user.user_metadata?.last_name
      ? `${user.user_metadata.first_name} ${user.user_metadata.last_name}`
      : user.email?.split('@')[0] || 'Your Coach'

    const loginUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://wisdombi.ai'

    // Send the invitation email
    const emailResult = await sendClientInvitation({
      to: clientEmail,
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
