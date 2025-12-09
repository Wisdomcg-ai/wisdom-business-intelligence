import { createRouteHandlerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { sendEmail } from '@/lib/email/resend'
import crypto from 'crypto'

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

// Generate invite token
function generateInviteToken(): string {
  return crypto.randomBytes(32).toString('hex')
}

export async function POST(request: Request) {
  const supabase = await createRouteHandlerClient()

  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const {
      businessId,
      firstName,
      lastName,
      email,
      phone,
      position,
      role,
      sectionPermissions,
      createAccount = true // Whether to create auth user or just invite
    } = body

    // Validate required fields
    if (!businessId || !firstName || !email || !role) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Verify user has permission to invite to this business
    const { data: userBusiness } = await supabase
      .from('business_users')
      .select('role')
      .eq('business_id', businessId)
      .eq('user_id', user.id)
      .single()

    // Also check if they're the owner
    const { data: ownedBusiness } = await supabase
      .from('businesses')
      .select('id, business_name, owner_id')
      .eq('id', businessId)
      .single()

    const isOwner = ownedBusiness?.owner_id === user.id
    const canInvite = isOwner || userBusiness?.role === 'owner' || userBusiness?.role === 'admin'

    if (!canInvite) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 })
    }

    const businessName = ownedBusiness?.business_name || 'the team'

    // Check if user already exists
    const { data: existingAuthUser } = await supabase
      .from('users')
      .select('id, email')
      .eq('email', email.toLowerCase())
      .maybeSingle()

    if (existingAuthUser) {
      // Check if already a team member
      const { data: existingMember } = await supabase
        .from('business_users')
        .select('id')
        .eq('business_id', businessId)
        .eq('user_id', existingAuthUser.id)
        .maybeSingle()

      if (existingMember) {
        return NextResponse.json({ error: 'This user is already a team member' }, { status: 400 })
      }

      // Add existing user directly to team
      const { error: insertError } = await supabase
        .from('business_users')
        .insert({
          business_id: businessId,
          user_id: existingAuthUser.id,
          role: role,
          status: 'active',
          invited_by: user.id,
          invited_at: new Date().toISOString(),
          section_permissions: sectionPermissions || {}
        })

      if (insertError) {
        console.error('[Team Invite] Insert error:', insertError)
        return NextResponse.json({ error: 'Failed to add team member' }, { status: 500 })
      }

      // Send notification email
      const inviterName = user.user_metadata?.first_name
        ? `${user.user_metadata.first_name} ${user.user_metadata.last_name || ''}`
        : user.email?.split('@')[0] || 'Someone'

      await sendEmail({
        to: email,
        subject: `You've been added to ${businessName} on WisdomBI`,
        html: `
          <p>Hi ${firstName},</p>
          <p><strong>${inviterName}</strong> has added you to <strong>${businessName}</strong> on WisdomBI.</p>
          <p>You can now access the team's business data by logging in with your existing account.</p>
          <p><a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://wisdombi.ai'}/login" style="display: inline-block; background: #F5821F; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px;">Log In Now</a></p>
        `
      })

      return NextResponse.json({
        success: true,
        message: `${firstName} has been added to your team`,
        userExists: true
      })
    }

    // User doesn't exist - create auth account and invite
    if (createAccount) {
      const generatedPassword = generateSecurePassword()

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
            email: email.toLowerCase(),
            password: generatedPassword,
            email_confirm: true,
            user_metadata: {
              first_name: firstName,
              last_name: lastName || ''
            }
          })
        }
      )

      const authData = await authResponse.json()

      if (!authResponse.ok || authData.error) {
        console.error('[Team Invite] Auth error:', authData)
        return NextResponse.json(
          { error: `Failed to create user: ${authData.msg || authData.error?.message || 'Unknown error'}` },
          { status: 400 }
        )
      }

      const newUserId = authData.id

      // Set system role as client
      await supabase
        .from('system_roles')
        .insert({
          user_id: newUserId,
          role: 'client',
          created_by: user.id
        })

      // Add to business_users
      const { error: memberError } = await supabase
        .from('business_users')
        .insert({
          business_id: businessId,
          user_id: newUserId,
          role: role,
          status: 'active',
          invited_by: user.id,
          invited_at: new Date().toISOString(),
          section_permissions: sectionPermissions || {}
        })

      if (memberError) {
        console.error('[Team Invite] Member insert error:', memberError)
      }

      // Send invitation email with credentials
      const inviterName = user.user_metadata?.first_name
        ? `${user.user_metadata.first_name} ${user.user_metadata.last_name || ''}`
        : user.email?.split('@')[0] || 'Your colleague'

      const loginUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://wisdombi.ai'

      await sendEmail({
        to: email,
        subject: `${inviterName} invited you to ${businessName} on WisdomBI`,
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="text-align: center; margin-bottom: 30px;">
              <img src="https://wisdombi.ai/images/logo-main.png" alt="WisdomBI" style="max-width: 180px; height: auto;" />
            </div>

            <h2 style="color: #172238;">You're Invited to Join ${businessName}</h2>

            <p>Hi ${firstName},</p>

            <p><strong>${inviterName}</strong> has invited you to join <strong>${businessName}</strong> on WisdomBI - a business intelligence platform for tracking goals, metrics, and growth.</p>

            ${position ? `<p>You've been added as: <strong>${position}</strong></p>` : ''}

            <div style="background: #fef3c7; border: 1px solid #fcd34d; border-radius: 8px; padding: 20px; margin: 20px 0;">
              <p style="margin: 0 0 10px 0;"><strong>Your login credentials:</strong></p>
              <p style="margin: 0;"><strong>Email:</strong> ${email}</p>
              <p style="margin: 10px 0 0 0;"><strong>Temporary Password:</strong></p>
              <code style="background: #fff; padding: 8px 16px; border-radius: 4px; font-size: 16px; display: inline-block;">${generatedPassword}</code>
              <p style="margin: 10px 0 0 0; font-size: 14px; color: #92400e;">Please change this after your first login.</p>
            </div>

            <div style="text-align: center; margin: 30px 0;">
              <a href="${loginUrl}/login" style="display: inline-block; background: #F5821F; color: white; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; font-size: 16px;">
                Log In Now
              </a>
            </div>

            <p style="color: #6b7280; font-size: 14px;">
              If you have any questions, reach out to ${inviterName} or your team administrator.
            </p>

            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
            <p style="color: #9ca3af; font-size: 12px; text-align: center;">
              WisdomBI - Business Intelligence Platform<br>
              This email was sent to ${email}
            </p>
          </body>
          </html>
        `
      })

      // Also store in team_invites for tracking
      await supabase
        .from('team_invites')
        .upsert({
          business_id: businessId,
          email: email.toLowerCase(),
          first_name: firstName,
          last_name: lastName || null,
          phone: phone || null,
          position: position || null,
          role: role,
          invited_by: user.id,
          status: 'accepted',
          accepted_at: new Date().toISOString(),
          section_permissions: sectionPermissions || {}
        }, { onConflict: 'business_id,email' })

      return NextResponse.json({
        success: true,
        message: `Invitation sent to ${firstName} ${lastName || ''}`,
        emailSent: true,
        userCreated: true
      })
    } else {
      // Just create pending invite without account (legacy flow)
      const inviteToken = generateInviteToken()

      const { error: inviteError } = await supabase
        .from('team_invites')
        .insert({
          business_id: businessId,
          email: email.toLowerCase(),
          first_name: firstName,
          last_name: lastName || null,
          phone: phone || null,
          position: position || null,
          role: role,
          invited_by: user.id,
          status: 'pending',
          invite_token: inviteToken,
          section_permissions: sectionPermissions || {}
        })

      if (inviteError) {
        if (inviteError.code === '23505') {
          return NextResponse.json({ error: 'An invite has already been sent to this email' }, { status: 400 })
        }
        throw inviteError
      }

      // Send invite email with token link
      const inviterName = user.user_metadata?.first_name
        ? `${user.user_metadata.first_name} ${user.user_metadata.last_name || ''}`
        : user.email?.split('@')[0] || 'Someone'

      const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://wisdombi.ai'}/accept-invite?token=${inviteToken}`

      await sendEmail({
        to: email,
        subject: `${inviterName} invited you to join ${businessName}`,
        html: `
          <p>Hi ${firstName},</p>
          <p><strong>${inviterName}</strong> has invited you to join <strong>${businessName}</strong> on WisdomBI.</p>
          <p>Click the button below to create your account and join the team:</p>
          <p><a href="${inviteUrl}" style="display: inline-block; background: #F5821F; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px;">Accept Invitation</a></p>
          <p style="font-size: 12px; color: #666;">This invitation will expire in 7 days.</p>
        `
      })

      return NextResponse.json({
        success: true,
        message: `Invitation sent to ${firstName}`,
        emailSent: true,
        pendingInvite: true
      })
    }

  } catch (error) {
    console.error('[Team Invite] Error:', error)
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    )
  }
}
