import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getSupabaseSecretKey } from '@/lib/supabase/keys'
import { checkRateLimit, getClientIP, createRateLimitKey, RATE_LIMIT_CONFIGS } from '@/lib/utils/rate-limiter'
import * as Sentry from '@sentry/nextjs'
import { z } from 'zod'
import { withSchema, withQuerySchema } from '@/lib/api/with-schema'

// Use service role for admin operations
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  getSupabaseSecretKey(),
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// GET searchParams: { token? } — the reset token to verify (string-typed query).
const GetQuerySchema = z.object({ token: z.string().optional() }).passthrough()

// POST body: { token, password } — token + new password to set.
const PostBodySchema = z.object({ token: z.string(), password: z.string() }).passthrough()

// Verify token is valid
async function getHandler(request: NextRequest) {
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
      return NextResponse.json({ valid: false, error: 'Invalid or expired token' }, { status: 400 })
    }

    // Check if already used
    if (tokenData.used_at) {
      return NextResponse.json({ valid: false, error: 'This reset link has already been used' }, { status: 400 })
    }

    // Check if expired
    if (new Date(tokenData.expires_at) < new Date()) {
      return NextResponse.json({ valid: false, error: 'This reset link has expired' }, { status: 400 })
    }

    return NextResponse.json({ valid: true })

  } catch (error) {
    Sentry.captureException(error, { tags: { route: 'auth/update-password' }, extra: { context: "[VerifyToken] Error" } } as any)
    return NextResponse.json({ valid: false, error: 'Failed to verify token' }, { status: 500 })
  }
}

export const GET = withQuerySchema(
  'auth/update-password',
  GetQuerySchema,
  getHandler as unknown as (request: Request) => Promise<Response>
)

// Update password with valid token
async function postHandler(request: NextRequest) {
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

    // Strong password validation
    if (password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
    }
    if (!/[A-Z]/.test(password)) {
      return NextResponse.json({ error: 'Password must contain at least one uppercase letter' }, { status: 400 })
    }
    if (!/[a-z]/.test(password)) {
      return NextResponse.json({ error: 'Password must contain at least one lowercase letter' }, { status: 400 })
    }
    if (!/[0-9]/.test(password)) {
      return NextResponse.json({ error: 'Password must contain at least one number' }, { status: 400 })
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
      Sentry.captureException(updateError, { tags: { route: 'auth/update-password' }, extra: { context: "[UpdatePassword] Error updating password" } } as any)
      return NextResponse.json({ error: 'Failed to update password' }, { status: 500 })
    }

    // Mark token as used
    await supabase
      .from('password_reset_tokens')
      .update({ used_at: new Date().toISOString() })
      .eq('id', tokenData.id)

    if (process.env.NODE_ENV !== 'production') {
      console.log('[UpdatePassword] Password updated for user:', tokenData.user_id)
    }

    return NextResponse.json({ success: true })

  } catch (error) {
    Sentry.captureException(error, { tags: { route: 'auth/update-password' }, extra: { context: "[UpdatePassword] Error" } } as any)
    return NextResponse.json({ error: 'Failed to update password' }, { status: 500 })
  }
}

export const POST = withSchema(
  'auth/update-password',
  PostBodySchema,
  postHandler as unknown as (request: Request) => Promise<Response>
)
