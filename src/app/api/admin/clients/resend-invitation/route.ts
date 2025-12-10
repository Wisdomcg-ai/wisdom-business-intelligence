import { createRouteHandlerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { sendClientInvitation } from '@/lib/email/resend'

// Generate a secure random password
function generateSecurePassword(length = 16): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%^&*'
  let password = ''
  const array = new Uint32Array(length)
  crypto.getRandomValues(array)
  for (let i = 0; i < length; i++) {
    password += chars[array[i] % chars.length]
  }
  return password
}

export async function POST(request: Request) {
  const supabase = await createRouteHandlerClient()

  try {
    // Check if user is authenticated and is admin/coach
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if user is super admin or coach
    const { data: roleData } = await supabase
      .from('system_roles')
      .select('role')
      .eq('user_id', user.id)
      .single()

    if (!roleData || (roleData.role !== 'super_admin' && roleData.role !== 'coach')) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    const { email } = await request.json()

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }

    // Find the business by owner email
    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .select('id, name, business_name, owner_id, owner_name')
      .eq('owner_email', email)
      .single()

    if (businessError || !business) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    }

    // Generate a new password
    const newPassword = generateSecurePassword()

    // Update the user's password using Admin API
    const authResponse = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users/${business.owner_id}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
          'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY || ''
        },
        body: JSON.stringify({
          password: newPassword
        })
      }
    )

    if (!authResponse.ok) {
      console.error('[Resend Invitation] Failed to reset password')
      return NextResponse.json({ error: 'Failed to reset password' }, { status: 500 })
    }

    // Get coach name
    const coachName = user.user_metadata?.first_name && user.user_metadata?.last_name
      ? `${user.user_metadata.first_name} ${user.user_metadata.last_name}`
      : user.email?.split('@')[0] || 'Your Coach'

    // Parse client name from owner_name
    const clientName = business.owner_name?.split(' ')[0] || 'there'

    // Send invitation email
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://wisdombi.ai'

    const emailResult = await sendClientInvitation({
      to: email,
      clientName,
      coachName,
      businessName: business.business_name || business.name,
      loginUrl: `${baseUrl}/auth/login`,
      tempPassword: newPassword
    })

    if (!emailResult.success) {
      console.error('[Resend Invitation] Email failed:', emailResult.error)
      return NextResponse.json({
        error: 'Password reset but email failed to send',
        details: emailResult.error
      }, { status: 500 })
    }

    // Update business record
    await supabase
      .from('businesses')
      .update({
        invitation_sent: true,
        invitation_sent_at: new Date().toISOString(),
        temp_password: null
      })
      .eq('id', business.id)

    console.log('[Resend Invitation] Success for:', email)

    return NextResponse.json({
      success: true,
      message: 'Invitation sent successfully'
    })

  } catch (error) {
    console.error('[Resend Invitation] Error:', error)
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    )
  }
}
