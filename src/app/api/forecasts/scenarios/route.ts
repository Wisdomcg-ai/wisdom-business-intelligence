import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { getSupabaseSecretKey } from '@/lib/supabase/keys'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { resolveBusinessProfileIds } from '@/lib/business/resolveBusinessProfileIds'
import * as Sentry from '@sentry/nextjs'
import { z } from 'zod'
import { withSchema } from '@/lib/api/with-schema'

export const dynamic = 'force-dynamic'

// VALID-04 (observe mode): POST creates a scenario; multipliers are numeric.
const ScenariosPostSchema = z
  .object({
    forecast_id: z.string(),
    name: z.string(),
    description: z.string().optional(),
    revenue_multiplier: z.number().optional(),
    cogs_multiplier: z.number().optional(),
    opex_multiplier: z.number().optional(),
    scenario_type: z.string().optional(),
  })
  .passthrough()

// VALID-04 (observe mode): PATCH updates a scenario by id.
const ScenariosPatchSchema = z
  .object({
    scenario_id: z.string(),
  })
  .passthrough()

// Service client for database operations (bypasses RLS)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  getSupabaseSecretKey()
)

// Helper to verify user is authenticated
async function getAuthenticatedUser() {
  const cookieStore = cookies()
  const supabase = createRouteHandlerClient({ cookies: () => cookieStore })
  const { data: { user }, error } = await supabase.auth.getUser()
  return { user, error, supabase }
}

/**
 * SECURITY: Verify the authenticated user can access the business that owns
 * this forecast before reading or writing its scenarios.
 *
 * Returns a 403 NextResponse if access should be denied, or null if allowed.
 * If the forecast row does not exist, returns null (the caller's own
 * not-found / FK handling takes over) — this mirrors the original GET behaviour.
 *
 * The check is done with the USER-scoped client (RLS enforced) against the
 * resolved business id-set, so it works regardless of which id-class was stored
 * on the forecast and cannot be bypassed by passing another tenant's forecast_id.
 */
async function denyIfNoForecastAccess(
  supabase: SupabaseClient,
  userId: string,
  forecastId: string,
): Promise<NextResponse | null> {
  const { data: forecast } = await supabaseAdmin
    .from('financial_forecasts')
    .select('business_id')
    .eq('id', forecastId)
    .maybeSingle()

  if (!forecast) {
    return null
  }

  // Resolve both ID formats so the access check works regardless of which was stored
  const ids = await resolveBusinessProfileIds(supabaseAdmin, forecast.business_id)
  const { data: bizAccess } = await supabase
    .from('businesses')
    .select('id')
    .in('id', ids.all)
    .or(`owner_id.eq.${userId},assigned_coach_id.eq.${userId}`)
    .limit(1)
    .maybeSingle()

  if (!bizAccess) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  return null
}

/**
 * GET /api/forecasts/scenarios?forecast_id=xxx
 * Fetch all scenarios for a forecast
 */
export async function GET(request: NextRequest) {
  try {
    // SECURITY: Verify user is authenticated
    const { user, error: authError, supabase } = await getAuthenticatedUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const forecastId = searchParams.get('forecast_id')

    if (!forecastId) {
      return NextResponse.json({ error: 'forecast_id is required' }, { status: 400 })
    }

    // Verify user owns or has access to the business that owns this forecast
    const denied = await denyIfNoForecastAccess(supabase, user.id, forecastId)
    if (denied) return denied

    // Fetch scenarios (use admin client since we verified auth above)
    const { data: scenarios, error } = await supabaseAdmin
      .from('forecast_scenarios')
      .select('*')
      .eq('forecast_id', forecastId)
      .order('created_at', { ascending: true })

    if (error) {
      Sentry.captureException(error, { tags: { route: 'forecasts/scenarios' }, extra: { context: "Error fetching scenarios" } } as any)
      return NextResponse.json({ error: 'Failed to fetch scenarios' }, { status: 500 })
    }

    return NextResponse.json({ scenarios: scenarios || [] })

  } catch (error) {
    Sentry.captureException(error, { tags: { route: 'forecasts/scenarios' }, extra: { context: "Error in GET /api/forecasts/scenarios" } } as any)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/forecasts/scenarios
 * Create a new scenario
 */
async function postHandler(request: Request) {
  try {
    // SECURITY: Verify user is authenticated and use their ID
    const { user, error: authError, supabase } = await getAuthenticatedUser()
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

    // SECURITY: Verify the caller can access the business that owns this forecast
    // before writing. Without this, any authenticated user could create scenarios
    // against another tenant's forecast_id (cross-tenant write IDOR). Mirrors GET.
    const denied = await denyIfNoForecastAccess(supabase, user.id, forecast_id)
    if (denied) return denied

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
      Sentry.captureException(error, { tags: { route: 'forecasts/scenarios' }, extra: { context: "Error creating scenario" } } as any)
      return NextResponse.json(
        { error: 'Failed to create scenario' },
        { status: 500 }
      )
    }

    return NextResponse.json({ scenario })

  } catch (error) {
    Sentry.captureException(error, { tags: { route: 'forecasts/scenarios' }, extra: { context: "Error in POST /api/forecasts/scenarios" } } as any)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const POST = withSchema('forecasts/scenarios', ScenariosPostSchema, postHandler)

/**
 * PATCH /api/forecasts/scenarios
 * Update a scenario (set active, update multipliers, etc.)
 */
async function patchHandler(request: Request) {
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
      Sentry.captureException(error, { tags: { route: 'forecasts/scenarios' }, extra: { context: "Error updating scenario" } } as any)
      return NextResponse.json(
        { error: 'Failed to update scenario' },
        { status: 500 }
      )
    }

    return NextResponse.json({ scenario })

  } catch (error) {
    Sentry.captureException(error, { tags: { route: 'forecasts/scenarios' }, extra: { context: "Error in PATCH /api/forecasts/scenarios" } } as any)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const PATCH = withSchema('forecasts/scenarios', ScenariosPatchSchema, patchHandler)

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
      Sentry.captureException(error, { tags: { route: 'forecasts/scenarios' }, extra: { context: "Error deleting scenario" } } as any)
      return NextResponse.json(
        { error: 'Failed to delete scenario' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })

  } catch (error) {
    Sentry.captureException(error, { tags: { route: 'forecasts/scenarios' }, extra: { context: "Error in DELETE /api/forecasts/scenarios" } } as any)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
