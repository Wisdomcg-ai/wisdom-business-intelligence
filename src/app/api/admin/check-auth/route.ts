import { createRouteHandlerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'

export async function GET() {
  const supabase = await createRouteHandlerClient()

  try {
    // Check if user is authenticated
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({
        authenticated: false,
        error: 'Not logged in',
        userError: userError?.message
      }, { status: 401 })
    }

    // Check user's role
    const { data: roleData, error: roleError } = await supabase
      .from('system_roles')
      .select('role')
      .eq('user_id', user.id)
      .maybeSingle()

    return NextResponse.json({
      authenticated: true,
      user: {
        id: user.id,
        email: user.email
      },
      role: roleData?.role || 'none',
      roleError: roleError?.message,
      hasRole: !!roleData,
      isSuperAdmin: roleData?.role === 'super_admin'
    })

  } catch (error) {
    Sentry.captureException(error, {
      tags: { route: 'admin/check-auth' },
      extra: { context: 'Auth check error' },
    } as any)
    return NextResponse.json({
      error: 'Server error',
      details: 'Internal server error'
    }, { status: 500 })
  }
}
