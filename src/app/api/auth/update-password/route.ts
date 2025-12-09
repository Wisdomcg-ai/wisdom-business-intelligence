import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { checkRateLimit, getClientIP, createRateLimitKey, RATE_LIMIT_CONFIGS } from '@/lib/utils/rate-limiter'

// Use service role for admin operations
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// Verify token is valid
export async function GET(request: NextRequest) {
  try {
    // Rate limiting - 10 token verification requests per 15 minutes per IP
    const clientIP = getClientIP(request)
    const rateLimitKey = createRateLimitKey('update-password-verify', clientIP)
    const rateLimit = checkRateLimit(rateLimitKey, RATE_LIMIT_CONFIGS.auth)

    if (!rateLimit.allowed) {
      return NextResponse.json(
        { valid: false, error: 'Too many requests. Please try again later.' },
        { status: 429 }
      )
    }

    const token = request.nextUrl.searchParams.get('token')

    if (!token) {
      return NextResponse.json({ valid: false, error: 'Token is required' }, { status: 400 })
    }

    // Find the token
    const { data: tokenData, error } = await supabase
      .from('password_reset_tokens')
      .select('id, user_id, expires_at, used_at')
      .eq('token', token)
      .single()

    if (error || !tokenData) {
      return NextResponse.json({ valid: false, error: 'Invalid or expired token' })
    }

    // Check if already used
    if (tokenData.used_at) {
      return NextResponse.json({ valid: false, error: 'This reset link has already been used' })
    }

    // Check if expired
    if (new Date(tokenData.expires_at) < new Date()) {
      return NextResponse.json({ valid: false, error: 'This reset link has expired' })
    }

    return NextResponse.json({ valid: true })

  } catch (error) {
    console.error('[VerifyToken] Error:', error)
    return NextResponse.json({ valid: false, error: 'Failed to verify token' }, { status: 500 })
  }
}

// Update password with valid token
export async function POST(request: NextRequest) {
  try {
    // Rate limiting - 5 password update attempts per 15 minutes per IP
    const clientIP = getClientIP(request)
    const rateLimitKey = createRateLimitKey('update-password', clientIP)
    const rateLimit = checkRateLimit(rateLimitKey, RATE_LIMIT_CONFIGS.auth)

    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        {
          status: 429,
          headers: {
            'Retry-After': String(Math.ceil(rateLimit.resetIn / 1000))
          }
        }
      )
    }

    const { token, password } = await request.json()

    if (!token || !password) {
      return NextResponse.json({ error: 'Token and password are required' }, { status: 400 })
    }

    if (password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 })
    }

    // Find and validate the token
    const { data: tokenData, error: tokenError } = await supabase
      .from('password_reset_tokens')
      .select('id, user_id, expires_at, used_at')
      .eq('token', token)
      .single()

    if (tokenError || !tokenData) {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 400 })
    }

    if (tokenData.used_at) {
      return NextResponse.json({ error: 'This reset link has already been used' }, { status: 400 })
    }

    if (new Date(tokenData.expires_at) < new Date()) {
      return NextResponse.json({ error: 'This reset link has expired' }, { status: 400 })
    }

    // Update the user's password
    const { error: updateError } = await supabase.auth.admin.updateUserById(
      tokenData.user_id,
      { password }
    )

    if (updateError) {
      console.error('[UpdatePassword] Error updating password:', updateError)
      return NextResponse.json({ error: 'Failed to update password' }, { status: 500 })
    }

    // Mark token as used
    await supabase
      .from('password_reset_tokens')
      .update({ used_at: new Date().toISOString() })
      .eq('id', tokenData.id)

    console.log('[UpdatePassword] Password updated for user:', tokenData.user_id)

    return NextResponse.json({ success: true })

  } catch (error) {
    console.error('[UpdatePassword] Error:', error)
    return NextResponse.json({ error: 'Failed to update password' }, { status: 500 })
  }
}
