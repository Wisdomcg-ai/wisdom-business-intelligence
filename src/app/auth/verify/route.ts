import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const token = requestUrl.searchParams.get('token')
  const email = requestUrl.searchParams.get('email')

  if (!token || !email) {
    console.error('[Auth Verify] Missing token or email')
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

    // Generate a magic link and get the session directly
    const generateLinkResponse = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/generate_link`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
          'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY || ''
        },
        body: JSON.stringify({
          type: 'magiclink',
          email: email,
          options: {
            redirect_to: `${requestUrl.origin}/change-password`
          }
        })
      }
    )

    if (!generateLinkResponse.ok) {
      console.error('[Auth Verify] Failed to generate link')
      return NextResponse.redirect(
        new URL('/auth/login?error=verification_failed', request.url)
      )
    }

    const linkData = await generateLinkResponse.json()

    // The action_link contains the full URL with token
    // Redirect must go to /auth/callback to exchange code for session
    // The callback will then redirect to /change-password based on must_change_password flag
    if (linkData.action_link) {
      // Parse the action link to modify the redirect to go through our callback
      const actionUrl = new URL(linkData.action_link)
      actionUrl.searchParams.set('redirect_to', `${requestUrl.origin}/auth/callback`)

      console.log('[Auth Verify] Redirecting to action link:', actionUrl.toString())
      return NextResponse.redirect(actionUrl.toString())
    }

    // Fallback: If we have hashed_token, use verify endpoint
    if (linkData.hashed_token) {
      const verifyUrl = new URL(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/verify`)
      verifyUrl.searchParams.set('token', linkData.hashed_token)
      verifyUrl.searchParams.set('type', 'magiclink')
      verifyUrl.searchParams.set('redirect_to', `${requestUrl.origin}/auth/callback`)

      console.log('[Auth Verify] Redirecting to verify endpoint')
      return NextResponse.redirect(verifyUrl.toString())
    }

    console.error('[Auth Verify] No action_link or hashed_token in response')
    return NextResponse.redirect(
      new URL('/auth/login?error=verification_failed', request.url)
    )

  } catch (error) {
    console.error('[Auth Verify] Error:', error)
    return NextResponse.redirect(
      new URL('/auth/login?error=verification_failed', request.url)
    )
  }
}
