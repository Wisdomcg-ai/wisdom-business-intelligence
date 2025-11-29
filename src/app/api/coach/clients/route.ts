import { createRouteHandlerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createRouteHandlerClient()

  try {
    // Check if user is authenticated
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if user is coach or super admin
    const { data: roleData } = await supabase
      .from('system_roles')
      .select('role')
      .eq('user_id', user.id)
      .single()

    if (!roleData || (roleData.role !== 'coach' && roleData.role !== 'super_admin')) {
      return NextResponse.json({ error: 'Access denied. Coach privileges required.' }, { status: 403 })
    }

    // Get all businesses assigned to this coach
    const { data: businesses, error: businessError } = await supabase
      .from('businesses')
      .select(`
        id,
        name,
        business_name,
        industry,
        status,
        created_at,
        program_type,
        session_frequency,
        engagement_start_date,
        enabled_modules,
        owner_id
      `)
      .eq('assigned_coach_id', user.id)
      .order('business_name', { ascending: true })

    if (businessError) {
      console.error('Error loading clients:', businessError)
      return NextResponse.json({ error: 'Failed to load clients' }, { status: 500 })
    }

    // Get session counts for each client
    const businessIds = businesses?.map(b => b.id) || []

    let sessionCounts: Record<string, number> = {}
    if (businessIds.length > 0) {
      const { data: sessions } = await supabase
        .from('coaching_sessions')
        .select('business_id, id')
        .in('business_id', businessIds)

      if (sessions) {
        sessionCounts = sessions.reduce((acc, session) => {
          acc[session.business_id] = (acc[session.business_id] || 0) + 1
          return acc
        }, {} as Record<string, number>)
      }
    }

    // Enhance businesses with computed data
    const enhancedBusinesses = businesses?.map(business => ({
      ...business,
      sessionCount: sessionCounts[business.id] || 0
    }))

    return NextResponse.json({
      success: true,
      clients: enhancedBusinesses,
      totalCount: enhancedBusinesses?.length || 0
    })

  } catch (error) {
    console.error('Coach clients API error:', error)
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    )
  }
}
