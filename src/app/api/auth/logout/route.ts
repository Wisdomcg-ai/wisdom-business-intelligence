import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase/server'

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
      console.log('[Logout] User signing out:', user.id)
    }

    // Sign out the user - this invalidates the session
    const { error } = await supabase.auth.signOut()

    if (error) {
      console.error('[Logout] Error signing out:', error)
      return NextResponse.json({ error: 'Failed to sign out' }, { status: 500 })
    }

    // Clear any session cookies by returning with appropriate headers
    const response = NextResponse.json({ success: true })

    // Clear cookies (Supabase SSR handles most of this, but we ensure it's clean)
    response.cookies.delete('sb-access-token')
    response.cookies.delete('sb-refresh-token')

    return response
  } catch (error) {
    console.error('[Logout] Unexpected error:', error)
    return NextResponse.json({ error: 'Failed to sign out' }, { status: 500 })
  }
}
