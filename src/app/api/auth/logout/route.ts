import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase/server'
import * as Sentry from '@sentry/nextjs'

/**
 * POST /api/auth/logout
 * Server-side logout endpoint to properly terminate sessions
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createRouteHandlerClient()

    // Get current user to log the action
    const { data: { user } } = await supabase.auth.getUser()

    if (user) {
      if (process.env.NODE_ENV !== 'production') {
        console.log('[Logout] User signing out:', user.id)
      }
    }

    // Sign out the user - this invalidates the session
    const { error } = await supabase.auth.signOut()

    if (error) {
      Sentry.captureException(error, { tags: { route: 'auth/logout' }, extra: { context: "[Logout] Error signing out" } } as any)
      return NextResponse.json({ error: 'Failed to sign out' }, { status: 500 })
    }

    // Clear any session cookies by returning with appropriate headers
    const response = NextResponse.json({ success: true })

    // Clear cookies (Supabase SSR handles most of this, but we ensure it's clean)
    response.cookies.delete('sb-access-token')
    response.cookies.delete('sb-refresh-token')

    return response
  } catch (error) {
    Sentry.captureException(error, { tags: { route: 'auth/logout' }, extra: { context: "[Logout] Unexpected error" } } as any)
    return NextResponse.json({ error: 'Failed to sign out' }, { status: 500 })
  }
}
