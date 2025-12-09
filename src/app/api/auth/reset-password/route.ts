import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendPasswordReset } from '@/lib/email/resend'
import crypto from 'crypto'
import { checkRateLimit, getClientIP, createRateLimitKey, RATE_LIMIT_CONFIGS } from '@/lib/utils/rate-limiter'

// Use service role for admin operations
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

export async function POST(request: NextRequest) {
  try {
    // Rate limiting - 3 password reset requests per hour per IP
    const clientIP = getClientIP(request)
    const rateLimitKey = createRateLimitKey('password-reset', clientIP)
    const rateLimit = checkRateLimit(rateLimitKey, RATE_LIMIT_CONFIGS.passwordReset)

    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many password reset requests. Please try again later.' },
        {
          status: 429,
          headers: {
            'Retry-After': String(Math.ceil(rateLimit.resetIn / 1000)),
            'X-RateLimit-Remaining': '0'
          }
        }
      )
    }

    const { email } = await request.json()

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }

    // Find user by email
    const { data: { users }, error: listError } = await supabase.auth.admin.listUsers()

    if (listError) {
      console.error('[ResetPassword] Error listing users:', listError)
      return NextResponse.json({ error: 'Failed to process request' }, { status: 500 })
    }

    const user = users.find(u => u.email?.toLowerCase() === email.toLowerCase())

    // Always return success to prevent email enumeration
    if (!user) {
      console.log('[ResetPassword] User not found:', email)
      return NextResponse.json({ success: true })
    }

    // Generate secure token
    const token = crypto.randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000) // 1 hour

    // Invalidate any existing tokens for this user
    await supabase
      .from('password_reset_tokens')
      .delete()
      .eq('user_id', user.id)

    // Store the new token
    const { error: insertError } = await supabase
      .from('password_reset_tokens')
      .insert({
        user_id: user.id,
        token,
        expires_at: expiresAt.toISOString()
      })

    if (insertError) {
      console.error('[ResetPassword] Error storing token:', insertError)
      return NextResponse.json({ error: 'Failed to process request' }, { status: 500 })
    }

    // Get user's name from the users table
    const { data: userData } = await supabase
      .from('users')
      .select('first_name')
      .eq('id', user.id)
      .single()

    const userName = userData?.first_name || email.split('@')[0]

    // Build reset URL
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://wisdombi.ai'
    const resetUrl = `${appUrl}/auth/update-password?token=${token}`

    // Send the branded email
    const emailResult = await sendPasswordReset({
      to: email,
      name: userName,
      resetUrl
    })

    if (!emailResult.success) {
      console.error('[ResetPassword] Email failed:', emailResult.error)
      // Don't reveal email failure to user
    } else {
      console.log('[ResetPassword] Email sent:', emailResult.id)
    }

    return NextResponse.json({ success: true })

  } catch (error) {
    console.error('[ResetPassword] Error:', error)
    return NextResponse.json({ error: 'Failed to process request' }, { status: 500 })
  }
}
