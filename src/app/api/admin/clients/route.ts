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

// Generate a secure magic link token
function generateMagicToken(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz0123456789'
  let token = ''
  const array = new Uint32Array(32)
  crypto.getRandomValues(array)
  for (let i = 0; i < 32; i++) {
    token += chars[array[i] % chars.length]
  }
  return token
}

export async function POST(request: Request) {
  const supabase = await createRouteHandlerClient()

  try {
    // Check if user is authenticated and is super admin
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    console.log('[Admin Client Create] User check:', {
      hasUser: !!user,
      userId: user?.id,
      email: user?.email,
      userError: userError?.message
    })

    if (userError || !user) {
      console.error('[Admin Client Create] Not authenticated:', userError)
      return NextResponse.json({ error: 'Unauthorized', details: userError?.message }, { status: 401 })
    }

    // Check if user is super admin
    const { data: roleData, error: systemRoleError } = await supabase
      .from('system_roles')
      .select('role')
      .eq('user_id', user.id)
      .single()

    console.log('[Admin Client Create] Role check:', {
      hasUser: !!user,
      hasRole: !!roleData,
      role: roleData?.role,
      roleError: systemRoleError?.message
    })

    if (!roleData || roleData.role !== 'super_admin') {
      console.error('[Admin Client Create] Access denied. Role:', roleData?.role)
      return NextResponse.json({
        error: 'Access denied. Super admin privileges required.',
        currentRole: roleData?.role || 'none'
      }, { status: 403 })
    }

    // Get form data
    const body = await request.json()
    const {
      businessName,
      firstName,
      lastName,
      email,
      position,
      accessLevel
    } = body

    // Validate required fields
    if (!businessName || !firstName || !lastName || !email || !position) {
      return NextResponse.json(
        { error: 'Missing required fields: businessName, firstName, lastName, email, and position are required' },
        { status: 400 }
      )
    }

    // Map access level to permissions
    let permissions = {
      plan: false,
      forecast: false,
      goals: false,
      chat: false,
      documents: false
    }

    if (accessLevel === 'full') {
      permissions = {
        plan: true,
        forecast: true,
        goals: true,
        chat: true,
        documents: true
      }
    } else if (accessLevel === 'view_only') {
      permissions = {
        plan: true,
        forecast: true,
        goals: true,
        chat: true,
        documents: true
      }
    } else if (accessLevel === 'limited') {
      permissions = {
        plan: true,
        forecast: false,
        goals: true,
        chat: true,
        documents: true
      }
    }

    // Generate secure password and magic token
    const generatedPassword = generateSecurePassword()
    const magicToken = generateMagicToken()
    const tokenExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 days

    // STEP 1: Create user in Supabase Auth using Admin API
    // Create auth user
    const authResponse = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
          'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY || ''
        },
        body: JSON.stringify({
          email,
          password: generatedPassword,
          email_confirm: true,
          user_metadata: {
            first_name: firstName,
            last_name: lastName,
            must_change_password: true,
            magic_token: magicToken,
            magic_token_expiry: tokenExpiry,
            onboarding_step: 'password' // Track onboarding progress
          }
        })
      }
    )

    const authData = await authResponse.json()

    if (!authResponse.ok || authData.error) {
      console.error('Auth error:', authData)
      const errorMessage = authData.msg || authData.error?.message || authData.message || 'Unknown error'
      return NextResponse.json(
        { error: `Failed to create user: ${errorMessage}` },
        { status: 400 }
      )
    }

    const newUserId = authData.id
    if (!newUserId) {
      return NextResponse.json(
        { error: 'Failed to create user account' },
        { status: 500 }
      )
    }

    // STEP 2: Create business record
    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .insert({
        name: businessName,
        business_name: businessName,
        assigned_coach_id: user.id, // Assign to current admin (who is also the coach)
        enabled_modules: permissions,
        status: 'active'
      })
      .select()
      .single()

    if (businessError) {
      console.error('Business creation error:', businessError)
      // TODO: Rollback auth user creation
      return NextResponse.json(
        { error: `Failed to create business: ${businessError.message}` },
        { status: 500 }
      )
    }

    // STEP 3: Assign user role (owner)
    const { error: userRoleError } = await supabase
      .from('user_roles')
      .insert({
        user_id: newUserId,
        business_id: business.id,
        role: 'owner',
        created_by: user.id
      })

    if (userRoleError) {
      console.error('Role assignment error:', userRoleError)
    }

    // STEP 4: Set system role as client
    const { error: clientRoleError } = await supabase
      .from('system_roles')
      .insert({
        user_id: newUserId,
        role: 'client',
        created_by: user.id
      })

    if (clientRoleError) {
      console.error('System role error:', clientRoleError)
    }

    // STEP 5: Create user permissions based on access level
    const canEdit = accessLevel === 'full'
    const { error: permissionsError } = await supabase
      .from('user_permissions')
      .insert({
        user_id: newUserId,
        business_id: business.id,
        can_view_annual_plan: permissions.plan,
        can_view_forecast: permissions.forecast,
        can_view_goals: permissions.goals,
        can_view_documents: permissions.documents,
        can_view_chat: permissions.chat,
        can_edit_annual_plan: canEdit && permissions.plan,
        can_edit_forecast: canEdit && permissions.forecast,
        can_edit_goals: canEdit && permissions.goals,
        can_upload_documents: canEdit && permissions.documents,
        can_manage_users: false
      })

    if (permissionsError) {
      console.error('Permissions creation error:', permissionsError)
    }

    // STEP 6: Create onboarding progress tracker
    const { error: onboardingError } = await supabase
      .from('onboarding_progress')
      .insert({
        business_id: business.id
      })

    if (onboardingError) {
      console.error('Onboarding tracking error:', onboardingError)
    }

    // STEP 7: Send invitation email to client
    const coachName = user.user_metadata?.first_name && user.user_metadata?.last_name
      ? `${user.user_metadata.first_name} ${user.user_metadata.last_name}`
      : user.email?.split('@')[0] || 'Your Coach'

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://wisdombi.ai'
    const magicLinkUrl = `${baseUrl}/auth/verify?token=${magicToken}&email=${encodeURIComponent(email)}`

    const emailResult = await sendClientInvitation({
      to: email,
      clientName: firstName,
      coachName,
      businessName,
      loginUrl: magicLinkUrl, // Now a magic link that auto-signs in
      tempPassword: undefined // No longer sending password in email
    })

    if (!emailResult.success) {
      console.error('Failed to send invitation email:', emailResult.error)
      // Don't fail the request - client was created successfully
    } else {
      console.log('[Admin Client Create] Invitation email sent:', emailResult.id)
    }

    // Return success with password (only for admin to see)
    return NextResponse.json({
      success: true,
      business: {
        id: business.id,
        name: businessName
      },
      user: {
        email,
        temporaryPassword: generatedPassword // Return this so admin can manually send if needed
      },
      emailSent: emailResult.success,
      emailError: emailResult.success ? undefined : emailResult.error
    })

  } catch (error) {
    console.error('Client creation error:', error)
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    )
  }
}

// PATCH - Update client status (active/inactive)
export async function PATCH(request: Request) {
  const supabase = await createRouteHandlerClient()

  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if user is super admin
    const { data: roleData } = await supabase
      .from('system_roles')
      .select('role')
      .eq('user_id', user.id)
      .single()

    if (!roleData || roleData.role !== 'super_admin') {
      return NextResponse.json({ error: 'Access denied. Super admin privileges required.' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const clientId = searchParams.get('id')

    if (!clientId) {
      return NextResponse.json({ error: 'Client ID is required' }, { status: 400 })
    }

    const body = await request.json()
    const { status } = body

    if (!status || !['active', 'inactive', 'pending'].includes(status)) {
      return NextResponse.json({ error: 'Invalid status. Must be active, inactive, or pending.' }, { status: 400 })
    }

    // Update business status
    const { error: updateError } = await supabase
      .from('businesses')
      .update({ status })
      .eq('id', clientId)

    if (updateError) {
      console.error('Error updating client status:', updateError)
      return NextResponse.json({ error: 'Failed to update client status' }, { status: 500 })
    }

    return NextResponse.json({ success: true, status })

  } catch (error) {
    console.error('Client update error:', error)
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 })
  }
}

// DELETE - Permanently delete a client and all associated data
export async function DELETE(request: Request) {
  const supabase = await createRouteHandlerClient()

  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if user is super admin
    const { data: roleData } = await supabase
      .from('system_roles')
      .select('role')
      .eq('user_id', user.id)
      .single()

    if (!roleData || roleData.role !== 'super_admin') {
      return NextResponse.json({ error: 'Access denied. Super admin privileges required.' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const clientId = searchParams.get('id')

    if (!clientId) {
      return NextResponse.json({ error: 'Client ID is required' }, { status: 400 })
    }

    // Get user_id from user_roles (owner of this business)
    const { data: userRole } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('business_id', clientId)
      .eq('role', 'owner')
      .single()

    const ownerUserId = userRole?.user_id

    // Delete in order to handle foreign key constraints
    // 1. Delete user_permissions
    await supabase.from('user_permissions').delete().eq('business_id', clientId)

    // 2. Delete user_roles
    await supabase.from('user_roles').delete().eq('business_id', clientId)

    // 3. Delete onboarding_progress
    await supabase.from('onboarding_progress').delete().eq('business_id', clientId)

    // 4. Delete coaching_sessions
    await supabase.from('coaching_sessions').delete().eq('business_id', clientId)

    // 5. Delete messages
    await supabase.from('messages').delete().eq('business_id', clientId)

    // 6. Delete annual_goals
    await supabase.from('annual_goals').delete().eq('business_id', clientId)

    // 7. Delete quarterly_goals
    await supabase.from('quarterly_goals').delete().eq('business_id', clientId)

    // 8. Delete kpis
    await supabase.from('kpis').delete().eq('business_id', clientId)

    // 9. Delete action_items
    await supabase.from('action_items').delete().eq('business_id', clientId)

    // 10. Delete documents
    await supabase.from('documents').delete().eq('business_id', clientId)

    // 11. Delete business record
    const { error: businessError } = await supabase
      .from('businesses')
      .delete()
      .eq('id', clientId)

    if (businessError) {
      console.error('Error deleting business:', businessError)
      return NextResponse.json({ error: 'Failed to delete client business' }, { status: 500 })
    }

    // 12. Delete system_roles and auth user
    if (ownerUserId) {
      await supabase.from('system_roles').delete().eq('user_id', ownerUserId)

      // 13. Delete auth user using Admin API
      const authResponse = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users/${ownerUserId}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
            'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY || ''
          }
        }
      )

      if (!authResponse.ok) {
        console.error('Failed to delete auth user, but business data was deleted')
      } else {
        console.log('[Admin] Auth user deleted:', ownerUserId)
      }
    } else {
      console.warn('[Admin] No owner user found for business, skipping auth user deletion')
    }

    console.log('[Admin] Client deleted:', clientId)
    return NextResponse.json({ success: true })

  } catch (error) {
    console.error('Client deletion error:', error)
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 })
  }
}
