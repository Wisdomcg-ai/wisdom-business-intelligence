import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createRouteHandlerClient } from '@/lib/supabase/server'
import { sendPasswordReset } from '@/lib/email/resend'
import crypto from 'crypto'
import { checkRateLimit, getClientIP, createRateLimitKey, RATE_LIMIT_CONFIGS } from '@/lib/utils/rate-limiter'

// Use service role for admin operations
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// Generate a secure random password
function generatePassword(length = 12): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%'
  let password = ''
  const randomBytes = crypto.randomBytes(length)
  for (let i = 0; i < length; i++) {
    password += chars[randomBytes[i] % chars.length]
  }
  return password
}

export async function POST(request: NextRequest) {
  try {
    // Rate limiting - 5 admin password reset requests per 15 minutes per IP
    const clientIP = getClientIP(request)
    const rateLimitKey = createRateLimitKey('admin-password-reset', clientIP)
    const rateLimit = checkRateLimit(rateLimitKey, RATE_LIMIT_CONFIGS.auth)

    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        {
          status: 429,
          headers: {
            'Retry-After': String(Math.ceil(rateLimit.resetIn / 1000)),
            'X-RateLimit-Remaining': '0'
          }
        }
      )
    }

    // Verify admin is authenticated
    const supabase = await createRouteHandlerClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if user is admin
    const { data: userData } = await supabase
      .from('users')
      .select('system_role')
      .eq('id', user.id)
      .single()

    if (userData?.system_role !== 'super_admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { userId, email, action } = await request.json()

    if (!userId || !email) {
      return NextResponse.json({ error: 'User ID and email are required' }, { status: 400 })
    }

    if (action === 'send_email') {
      // Option 1: Send reset email to user
      const token = crypto.randomBytes(32).toString('hex')
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000) // 1 hour

      // Invalidate existing tokens
      await supabaseAdmin
        .from('password_reset_tokens')
        .delete()
        .eq('user_id', userId)

      // Store new token
      const { error: insertError } = await supabaseAdmin
        .from('password_reset_tokens')
        .insert({
          user_id: userId,
          token,
          expires_at: expiresAt.toISOString()
        })

      if (insertError) {
        console.error('[AdminReset] Error storing token:', insertError)
        return NextResponse.json({ error: 'Failed to create reset token' }, { status: 500 })
      }

      // Get user's name
      const { data: targetUser } = await supabaseAdmin
        .from('users')
        .select('first_name')
        .eq('id', userId)
        .single()

      const userName = targetUser?.first_name || email.split('@')[0]
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://wisdombi.ai'
      const resetUrl = `${appUrl}/auth/update-password?token=${token}`

      // Send email
      const emailResult = await sendPasswordReset({
        to: email,
        name: userName,
        resetUrl
      })

      if (!emailResult.success) {
        console.error('[AdminReset] Email failed:', emailResult.error)
        return NextResponse.json({ error: 'Failed to send reset email' }, { status: 500 })
      }

      return NextResponse.json({ success: true, method: 'email' })

    } else {
      // Option 2: Generate temp password and reset directly
      const tempPassword = generatePassword()

      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
        userId,
        { password: tempPassword }
      )

      if (updateError) {
        console.error('[AdminReset] Error updating password:', updateError)
        return NextResponse.json({ error: 'Failed to reset password' }, { status: 500 })
      }

      console.log('[AdminReset] Password reset for user:', userId)

      return NextResponse.json({
        success: true,
        method: 'temp_password',
        tempPassword
      })
    }

  } catch (error) {
    console.error('[AdminReset] Error:', error)
    return NextResponse.json({ error: 'Failed to reset password' }, { status: 500 })
  }
}
