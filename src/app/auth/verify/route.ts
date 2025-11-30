import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const token = requestUrl.searchParams.get('token')
  const email = requestUrl.searchParams.get('email')

  if (!token || !email) {
    return NextResponse.redirect(
      new URL('/auth/login?error=invalid_link', request.url)
    )
  }

  try {
    // Use Admin API to find and verify the user
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
          'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY || ''
        }
      }
    )

    if (!response.ok) {
      console.error('[Auth Verify] Failed to fetch users')
      return NextResponse.redirect(
        new URL('/auth/login?error=verification_failed', request.url)
      )
    }

    const { users } = await response.json()
    const user = users?.find((u: any) => u.email?.toLowerCase() === email.toLowerCase())

    if (!user) {
      console.error('[Auth Verify] User not found:', email)
      return NextResponse.redirect(
        new URL('/auth/login?error=user_not_found', request.url)
      )
    }

    // Verify the magic token
    const storedToken = user.user_metadata?.magic_token
    const tokenExpiry = user.user_metadata?.magic_token_expiry

    if (!storedToken || storedToken !== token) {
      console.error('[Auth Verify] Invalid token')
      return NextResponse.redirect(
        new URL('/auth/login?error=invalid_token', request.url)
      )
    }

    // Check if token has expired
    if (tokenExpiry && new Date(tokenExpiry) < new Date()) {
      console.error('[Auth Verify] Token expired')
      return NextResponse.redirect(
        new URL('/auth/login?error=token_expired', request.url)
      )
    }

    // Generate a magic link for sign-in using Supabase
    const supabase = await createRouteHandlerClient()

    // Use generateLink to create a magic link
    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: email,
      options: {
        redirectTo: `${requestUrl.origin}/auth/callback`
      }
    })

    if (linkError || !linkData?.properties?.hashed_token) {
      console.error('[Auth Verify] Failed to generate magic link:', linkError)
      return NextResponse.redirect(
        new URL('/auth/login?error=verification_failed', request.url)
      )
    }

    // Clear the magic token from user metadata (one-time use)
    await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users/${user.id}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
          'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY || ''
        },
        body: JSON.stringify({
          user_metadata: {
            ...user.user_metadata,
            magic_token: null,
            magic_token_expiry: null
          }
        })
      }
    )

    // Verify the token with Supabase to create a session
    const verifyUrl = new URL(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/verify`)
    verifyUrl.searchParams.set('token', linkData.properties.hashed_token)
    verifyUrl.searchParams.set('type', 'magiclink')
    verifyUrl.searchParams.set('redirect_to', `${requestUrl.origin}/change-password`)

    return NextResponse.redirect(verifyUrl.toString())

  } catch (error) {
    console.error('[Auth Verify] Error:', error)
    return NextResponse.redirect(
      new URL('/auth/login?error=verification_failed', request.url)
    )
  }
}
