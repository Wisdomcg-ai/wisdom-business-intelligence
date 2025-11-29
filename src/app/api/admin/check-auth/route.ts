import { createRouteHandlerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

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
      .single()

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
    console.error('Auth check error:', error)
    return NextResponse.json({
      error: 'Server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
