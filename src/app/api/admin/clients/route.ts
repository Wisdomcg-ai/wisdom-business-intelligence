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
      accessLevel,
      sendInvitation = true // New: default to true for backwards compatibility
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

    // Generate secure password
    const generatedPassword = generateSecurePassword()

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
            last_name: lastName
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

    // STEP 2: Create business record (with owner_id linked to the new user)
    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .insert({
        name: businessName,
        business_name: businessName,
        owner_id: newUserId, // Link to the new user for data queries
        owner_name: `${firstName} ${lastName}`,
        owner_email: email,
        assigned_coach_id: user.id, // Assign to current admin (who is also the coach)
        enabled_modules: permissions,
        status: 'active',
        invitation_sent: false, // Track invitation status
        temp_password: sendInvitation ? null : generatedPassword // Store password if not sending now
      })
      .select()
      .single()

    if (businessError) {
      console.error('Business creation error:', businessError)
      // Rollback: Delete the auth user we just created
      try {
        await fetch(
          `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users/${newUserId}`,
          {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
              'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY || ''
            }
          }
        )
        console.log('[Admin Clients] Rolled back auth user creation due to business creation failure')
      } catch (rollbackError) {
        console.error('[Admin Clients] Failed to rollback auth user:', rollbackError)
      }
      return NextResponse.json(
        { error: `Failed to create business: ${businessError.message}` },
        { status: 500 }
      )
    }

    // STEP 2b: Create business_profile record (required for coach dashboard to show data)
    const { error: profileError } = await supabase
      .from('business_profiles')
      .insert({
        business_id: business.id,
        user_id: newUserId,
        business_name: businessName,
        company_name: businessName,
        profile_completed: false
      })

    if (profileError) {
      console.error('Business profile creation error:', profileError)
      // Don't fail - this is non-critical but log it
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

    // STEP 3b: Create business_users association
    await supabase
      .from('business_users')
      .insert({
        business_id: business.id,
        user_id: newUserId,
        role: 'owner'
      })

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

    // STEP 7: Send invitation email to client (if requested)
    let emailSent = false
    let emailError: string | undefined

    if (sendInvitation) {
      const coachName = user.user_metadata?.first_name && user.user_metadata?.last_name
        ? `${user.user_metadata.first_name} ${user.user_metadata.last_name}`
        : user.email?.split('@')[0] || 'Your Coach'

      const loginUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://wisdombi.ai'

      const emailResult = await sendClientInvitation({
        to: email,
        clientName: firstName,
        coachName,
        businessName,
        loginUrl: `${loginUrl}/login`,
        tempPassword: generatedPassword
      })

      emailSent = emailResult.success
      emailError = emailResult.error

      if (!emailResult.success) {
        console.error('Failed to send invitation email:', emailResult.error)
        // Don't fail the request - client was created successfully
      } else {
        console.log('[Admin Client Create] Invitation email sent:', emailResult.id)
        // Update business record to mark invitation as sent
        await supabase
          .from('businesses')
          .update({
            invitation_sent: true,
            invitation_sent_at: new Date().toISOString(),
            temp_password: null // Clear stored password after sending
          })
          .eq('id', business.id)
      }
    } else {
      console.log('[Admin Client Create] Invitation deferred - credentials stored for later')
    }

    // Return success - DO NOT include password in response for security
    // Password is either sent via email or stored in temp_password field for later retrieval
    return NextResponse.json({
      success: true,
      business: {
        id: business.id,
        name: businessName
      },
      user: {
        email
        // Note: Password not returned for security - check email or resend invitation
      },
      emailSent,
      invitationDeferred: !sendInvitation,
      emailError,
      message: emailSent
        ? 'Client created and invitation sent via email'
        : 'Client created. Use "Resend Invitation" to send login credentials.'
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

    // Get business to find owner_id for auth user deletion
    const { data: business } = await supabase
      .from('businesses')
      .select('owner_id')
      .eq('id', clientId)
      .single()

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

    // 12. Delete system_roles for the user
    if (business?.owner_id) {
      await supabase.from('system_roles').delete().eq('user_id', business.owner_id)

      // 13. Delete auth user using Admin API
      const authResponse = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users/${business.owner_id}`,
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
      }
    }

    console.log('[Admin] Client deleted:', clientId)
    return NextResponse.json({ success: true })

  } catch (error) {
    console.error('Client deletion error:', error)
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 })
  }
}
