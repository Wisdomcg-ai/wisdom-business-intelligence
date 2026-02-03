import { createClient } from '@supabase/supabase-js'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// Service client for database operations (bypasses RLS)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Helper to verify user is authenticated
async function getAuthenticatedUser() {
  const cookieStore = cookies()
  const supabase = createRouteHandlerClient({ cookies: () => cookieStore })
  const { data: { user }, error } = await supabase.auth.getUser()
  return { user, error, supabase }
}

/**
 * GET /api/forecasts/scenarios?forecast_id=xxx
 * Fetch all scenarios for a forecast
 */
export async function GET(request: NextRequest) {
  try {
    // SECURITY: Verify user is authenticated
    const { user, error: authError } = await getAuthenticatedUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const forecastId = searchParams.get('forecast_id')

    if (!forecastId) {
      return NextResponse.json({ error: 'forecast_id is required' }, { status: 400 })
    }

    // Fetch scenarios (use admin client since we verified auth above)
    const { data: scenarios, error } = await supabaseAdmin
      .from('forecast_scenarios')
      .select('*')
      .eq('forecast_id', forecastId)
      .order('created_at', { ascending: true })

    if (error) {
      console.error('Error fetching scenarios:', error)
      return NextResponse.json({ error: 'Failed to fetch scenarios' }, { status: 500 })
    }

    return NextResponse.json({ scenarios: scenarios || [] })

  } catch (error) {
    console.error('Error in GET /api/forecasts/scenarios:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/forecasts/scenarios
 * Create a new scenario
 */
export async function POST(request: NextRequest) {
  try {
    // SECURITY: Verify user is authenticated and use their ID
    const { user, error: authError } = await getAuthenticatedUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const {
      forecast_id,
      // user_id is ignored - we use authenticated user's ID instead
      name,
      description,
      revenue_multiplier = 1.0,
      cogs_multiplier = 1.0,
      opex_multiplier = 1.0,
      scenario_type = 'planning'
    } = body

    if (!forecast_id || !name) {
      return NextResponse.json(
        { error: 'forecast_id and name are required' },
        { status: 400 }
      )
    }

    // SECURITY: Use authenticated user's ID, not the one from request body
    const authenticatedUserId = user.id

    // Create scenario
    const { data: scenario, error } = await supabaseAdmin
      .from('forecast_scenarios')
      .insert({
        forecast_id,
        user_id: authenticatedUserId,  // Use verified user ID
        name,
        description,
        scenario_type,
        revenue_multiplier,
        cogs_multiplier,
        opex_multiplier,
        is_active: false,
        is_baseline: false
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating scenario:', error)
      return NextResponse.json(
        { error: error.message || 'Failed to create scenario' },
        { status: 500 }
      )
    }

    return NextResponse.json({ scenario })

  } catch (error) {
    console.error('Error in POST /api/forecasts/scenarios:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * PATCH /api/forecasts/scenarios
 * Update a scenario (set active, update multipliers, etc.)
 */
export async function PATCH(request: NextRequest) {
  try {
    // SECURITY: Verify user is authenticated
    const { user, error: authError } = await getAuthenticatedUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { scenario_id, ...updates } = body

    if (!scenario_id) {
      return NextResponse.json({ error: 'scenario_id is required' }, { status: 400 })
    }

    // SECURITY: Use authenticated user's ID for the filter
    const authenticatedUserId = user.id

    // Update scenario - only allow updating user's own scenarios
    const { data: scenario, error } = await supabaseAdmin
      .from('forecast_scenarios')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', scenario_id)
      .eq('user_id', authenticatedUserId)  // Use verified user ID
      .select()
      .single()

    if (error) {
      console.error('Error updating scenario:', error)
      return NextResponse.json(
        { error: error.message || 'Failed to update scenario' },
        { status: 500 }
      )
    }

    return NextResponse.json({ scenario })

  } catch (error) {
    console.error('Error in PATCH /api/forecasts/scenarios:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * DELETE /api/forecasts/scenarios?scenario_id=xxx
 * Delete a scenario
 */
export async function DELETE(request: NextRequest) {
  try {
    // SECURITY: Verify user is authenticated
    const { user, error: authError } = await getAuthenticatedUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const scenarioId = searchParams.get('scenario_id')

    if (!scenarioId) {
      return NextResponse.json({ error: 'scenario_id is required' }, { status: 400 })
    }

    // SECURITY: Use authenticated user's ID
    const authenticatedUserId = user.id

    // Check if it's the baseline scenario
    const { data: scenario } = await supabaseAdmin
      .from('forecast_scenarios')
      .select('is_baseline')
      .eq('id', scenarioId)
      .single()

    if (scenario?.is_baseline) {
      return NextResponse.json(
        { error: 'Cannot delete baseline scenario' },
        { status: 400 }
      )
    }

    // Delete scenario - only allow deleting user's own scenarios
    const { error } = await supabaseAdmin
      .from('forecast_scenarios')
      .delete()
      .eq('id', scenarioId)
      .eq('user_id', authenticatedUserId)  // Use verified user ID

    if (error) {
      console.error('Error deleting scenario:', error)
      return NextResponse.json(
        { error: error.message || 'Failed to delete scenario' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })

  } catch (error) {
    console.error('Error in DELETE /api/forecasts/scenarios:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
