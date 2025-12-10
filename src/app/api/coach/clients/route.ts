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

// POST - Create a new client (with auth user and email invitation)
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
      return NextResponse.json({ error: 'Access denied. Coach privileges required.' }, { status: 403 })
    }

    const body = await request.json()
    const {
      businessName,
      industry,
      ownerFirstName,
      ownerLastName,
      ownerEmail,
      ownerPhone,
      website,
      address,
      programType,
      sessionFrequency,
      customFrequency,
      engagementStartDate,
      enabledModules,
      sendInvitation = true,
      teamMembers = [] // Array of team members to invite
    } = body

    // Validate required fields
    if (!businessName || !ownerFirstName || !ownerLastName || !ownerEmail) {
      return NextResponse.json(
        { error: 'Missing required fields: businessName, ownerFirstName, ownerLastName, and ownerEmail are required' },
        { status: 400 }
      )
    }

    // Generate secure password
    const generatedPassword = generateSecurePassword()

    // STEP 1: Create auth user using Admin API
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
          email: ownerEmail,
          password: generatedPassword,
          email_confirm: true,
          user_metadata: {
            first_name: ownerFirstName,
            last_name: ownerLastName
          }
        })
      }
    )

    const authData = await authResponse.json()

    if (!authResponse.ok || authData.error) {
      console.error('[Coach Client Create] Auth error:', authData)
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
        industry: industry || null,
        website: website || null,
        address: address || null,
        owner_id: newUserId,
        owner_name: `${ownerFirstName} ${ownerLastName}`,
        owner_email: ownerEmail,
        assigned_coach_id: user.id,
        status: 'active',
        program_type: programType || null,
        session_frequency: sessionFrequency || null,
        custom_frequency: customFrequency || null,
        engagement_start_date: engagementStartDate || null,
        enabled_modules: enabledModules || {},
        invitation_sent: false,
        temp_password: sendInvitation ? null : generatedPassword
      })
      .select()
      .single()

    if (businessError || !business) {
      console.error('[Coach Client Create] Business error:', businessError)
      return NextResponse.json(
        { error: `Failed to create business: ${businessError?.message}` },
        { status: 500 }
      )
    }

    // STEP 3: Create business_profile
    await supabase
      .from('business_profiles')
      .insert({
        business_id: business.id,
        user_id: newUserId,
        business_name: businessName,
        company_name: businessName,
        industry: industry || null,
        website: website || null,
        profile_completed: false
      })

    // STEP 4: Create business_users association
    await supabase
      .from('business_users')
      .insert({
        business_id: business.id,
        user_id: newUserId,
        role: 'owner'
      })

    // Also add coach as business_user
    await supabase
      .from('business_users')
      .insert({
        business_id: business.id,
        user_id: user.id,
        role: 'coach'
      })

    // STEP 5: Create user_roles
    await supabase
      .from('user_roles')
      .insert({
        user_id: newUserId,
        business_id: business.id,
        role: 'owner',
        created_by: user.id
      })

    // STEP 6: Set system role as client
    await supabase
      .from('system_roles')
      .insert({
        user_id: newUserId,
        role: 'client',
        created_by: user.id
      })

    // STEP 7: Create business_contacts
    await supabase
      .from('business_contacts')
      .insert({
        business_id: business.id,
        first_name: ownerFirstName,
        last_name: ownerLastName,
        email: ownerEmail,
        phone: ownerPhone || null,
        is_primary: true,
        role: 'Owner'
      })

    // STEP 8: Send invitation email
    let emailSent = false
    let emailError: string | undefined

    if (sendInvitation) {
      const coachName = user.user_metadata?.first_name && user.user_metadata?.last_name
        ? `${user.user_metadata.first_name} ${user.user_metadata.last_name}`
        : user.email?.split('@')[0] || 'Your Coach'

      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://wisdombi.ai'

      const emailResult = await sendClientInvitation({
        to: ownerEmail,
        clientName: ownerFirstName,
        coachName,
        businessName,
        loginUrl: `${baseUrl}/auth/login`,
        tempPassword: generatedPassword
      })

      emailSent = emailResult.success
      emailError = emailResult.error

      if (emailResult.success) {
        // Update business record
        await supabase
          .from('businesses')
          .update({
            invitation_sent: true,
            invitation_sent_at: new Date().toISOString(),
            temp_password: null
          })
          .eq('id', business.id)
      }
    }

    // STEP 9: Process team members (if any)
    const teamMemberResults: Array<{ email: string; success: boolean; error?: string }> = []

    if (teamMembers && teamMembers.length > 0) {
      const coachName = user.user_metadata?.first_name && user.user_metadata?.last_name
        ? `${user.user_metadata.first_name} ${user.user_metadata.last_name}`
        : user.email?.split('@')[0] || 'Your Coach'
      const teamBaseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://wisdombi.ai'

      for (const member of teamMembers) {
        try {
          // Generate password for team member
          const memberPassword = generateSecurePassword()

          // Create auth user for team member
          const memberAuthResponse = await fetch(
            `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
                'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY || ''
              },
              body: JSON.stringify({
                email: member.email.toLowerCase(),
                password: memberPassword,
                email_confirm: true,
                user_metadata: {
                  first_name: member.firstName,
                  last_name: member.lastName || ''
                }
              })
            }
          )

          const memberAuthData = await memberAuthResponse.json()

          if (!memberAuthResponse.ok || memberAuthData.error) {
            console.error('[Coach Client Create] Team member auth error:', memberAuthData)
            teamMemberResults.push({
              email: member.email,
              success: false,
              error: memberAuthData.msg || memberAuthData.error?.message || 'Failed to create user'
            })
            continue
          }

          const memberId = memberAuthData.id

          // Set system role as client
          await supabase
            .from('system_roles')
            .insert({
              user_id: memberId,
              role: 'client',
              created_by: user.id
            })

          // Add to business_users
          await supabase
            .from('business_users')
            .insert({
              business_id: business.id,
              user_id: memberId,
              role: member.role || 'member',
              status: 'active',
              invited_by: user.id,
              invited_at: new Date().toISOString()
            })

          // Add to business_contacts if position provided
          if (member.position) {
            await supabase
              .from('business_contacts')
              .insert({
                business_id: business.id,
                first_name: member.firstName,
                last_name: member.lastName || '',
                email: member.email,
                phone: member.phone || null,
                is_primary: false,
                role: member.position
              })
          }

          // Send invitation email to team member
          const memberEmailResult = await sendClientInvitation({
            to: member.email,
            clientName: member.firstName,
            coachName,
            businessName,
            loginUrl: `${teamBaseUrl}/auth/login`,
            tempPassword: memberPassword
          })

          teamMemberResults.push({
            email: member.email,
            success: memberEmailResult.success,
            error: memberEmailResult.error
          })

        } catch (memberError) {
          console.error('[Coach Client Create] Team member error:', memberError)
          teamMemberResults.push({
            email: member.email,
            success: false,
            error: 'Unexpected error creating team member'
          })
        }
      }
    }

    console.log('[Coach Client Create] Success:', {
      businessId: business.id,
      userId: newUserId,
      emailSent,
      teamMembersProcessed: teamMemberResults.length
    })

    // Build response message
    let message = emailSent
      ? 'Client created and invitation sent via email'
      : 'Client created. Use "Resend Invitation" to send login credentials.'

    if (teamMemberResults.length > 0) {
      const successCount = teamMemberResults.filter(r => r.success).length
      const failCount = teamMemberResults.length - successCount
      if (successCount > 0) {
        message += ` ${successCount} team member${successCount > 1 ? 's' : ''} invited.`
      }
      if (failCount > 0) {
        message += ` ${failCount} team member invitation${failCount > 1 ? 's' : ''} failed.`
      }
    }

    return NextResponse.json({
      success: true,
      business: {
        id: business.id,
        name: businessName
      },
      user: {
        email: ownerEmail
      },
      emailSent,
      invitationDeferred: !sendInvitation,
      emailError,
      teamMemberResults: teamMemberResults.length > 0 ? teamMemberResults : undefined,
      message
    })

  } catch (error) {
    console.error('[Coach Client Create] Error:', error)
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    )
  }
}

export async function GET() {
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
      return NextResponse.json({ error: 'Access denied. Coach privileges required.' }, { status: 403 })
    }

    // Get all businesses assigned to this coach
    const { data: businesses, error: businessError } = await supabase
      .from('businesses')
      .select(`
        id,
        name,
        business_name,
        industry,
        status,
        created_at,
        program_type,
        session_frequency,
        engagement_start_date,
        enabled_modules,
        owner_id
      `)
      .eq('assigned_coach_id', user.id)
      .order('business_name', { ascending: true })

    if (businessError) {
      console.error('Error loading clients:', businessError)
      return NextResponse.json({ error: 'Failed to load clients' }, { status: 500 })
    }

    // Get session counts for each client
    const businessIds = businesses?.map(b => b.id) || []

    let sessionCounts: Record<string, number> = {}
    if (businessIds.length > 0) {
      const { data: sessions } = await supabase
        .from('coaching_sessions')
        .select('business_id, id')
        .in('business_id', businessIds)

      if (sessions) {
        sessionCounts = sessions.reduce((acc, session) => {
          acc[session.business_id] = (acc[session.business_id] || 0) + 1
          return acc
        }, {} as Record<string, number>)
      }
    }

    // Enhance businesses with computed data
    const enhancedBusinesses = businesses?.map(business => ({
      ...business,
      sessionCount: sessionCounts[business.id] || 0
    }))

    return NextResponse.json({
      success: true,
      clients: enhancedBusinesses,
      totalCount: enhancedBusinesses?.length || 0
    })

  } catch (error) {
    console.error('Coach clients API error:', error)
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    )
  }
}
