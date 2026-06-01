import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getSupabaseSecretKey } from '@/lib/supabase/keys'
import { createRouteHandlerClient } from '@/lib/supabase/server'
import { verifyBusinessAccess } from '@/lib/utils/verify-business-access'
import * as Sentry from '@sentry/nextjs'
import { z } from 'zod'
import { withSchema, withQuerySchema } from '@/lib/api/with-schema'

export const dynamic = 'force-dynamic'

const GetQuerySchema = z
  .object({
    businessId: z.string().optional(),
  })
  .passthrough()

const PostBodySchema = z
  .object({
    businessId: z.string(),
    kpis: z.array(z.unknown()),
  })
  .passthrough()

const DeleteQuerySchema = z
  .object({
    kpiId: z.string().optional(),
    businessId: z.string().optional(),
  })
  .passthrough()

const PatchBodySchema = z
  .object({
    businessId: z.string(),
    kpiId: z.string(),
    currentValue: z.unknown().optional(),
    notes: z.string().optional(),
  })
  .passthrough()

// Initialize Supabase client with service role for admin operations
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = getSupabaseSecretKey()
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

// Access checks use the canonical verifyBusinessAccess from
// @/lib/utils/verify-business-access (owner / assigned coach / active
// business_users member / super_admin, with dual-ID bridging). R16-C34: the
// previous local copy here only checked owner/coach + a business_profiles
// user_id match — it missed active team members and super_admins.

// GET endpoint - Fetch existing KPIs for a business
async function getHandler(request: Request) {
  try {
    // Authentication check
    const supabase = await createRouteHandlerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get businessId from query params
    const { searchParams } = new URL(request.url)
    const businessId = searchParams.get('businessId')

    if (!businessId) {
      return NextResponse.json(
        { error: 'Business ID is required' },
        { status: 400 }
      )
    }

    // Verify user has access to this business
    const hasAccess = await verifyBusinessAccess(user.id, businessId)
    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden - No access to this business' }, { status: 403 })
    }

    // Fetch KPIs from database
    const { data: kpis, error } = await supabaseAdmin
      .from('business_kpis')
      .select('*')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })

    if (error) {
      Sentry.captureException(error, { tags: { route: 'kpis' }, extra: { context: "Error fetching KPIs" } } as any)
      return NextResponse.json(
        { error: 'Failed to fetch KPIs' },
        { status: 500 }
      )
    }

    return NextResponse.json({ 
      success: true,
      kpis: kpis || [],
      count: kpis?.length || 0
    })

  } catch (error) {
    Sentry.captureException(error, { tags: { route: 'kpis' }, extra: { context: "Unexpected error in GET /api/kpis" } } as any)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// POST endpoint - Save or update KPIs for a business
async function postHandler(request: Request) {
  try {
    // Authentication check
    const supabase = await createRouteHandlerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Parse request body
    const body = await request.json()
    const { businessId, kpis } = body

    // Validate input
    if (!businessId) {
      return NextResponse.json(
        { error: 'Business ID is required' },
        { status: 400 }
      )
    }

    // Verify user has access to this business
    const hasAccess = await verifyBusinessAccess(user.id, businessId)
    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden - No access to this business' }, { status: 403 })
    }

    if (!kpis || !Array.isArray(kpis)) {
      return NextResponse.json(
        { error: 'KPIs array is required' },
        { status: 400 }
      )
    }

    // Get current KPI IDs for this business
    const { data: existingKpis } = await supabaseAdmin
      .from('business_kpis')
      .select('kpi_id')
      .eq('business_id', businessId)

    const existingKpiIds = new Set(existingKpis?.map(k => k.kpi_id) || [])
    const newKpiIds = new Set(kpis.map((k: any) => k.kpi_id))

    // Prepare KPIs for upsert (insert or update)
    const kpisToUpsert = kpis.map((kpi: any) => ({
      business_id: businessId,
      kpi_id: kpi.kpi_id,
      name: kpi.name,
      friendly_name: kpi.friendly_name || kpi.name,
      description: kpi.description,
      category: kpi.category,
      frequency: kpi.frequency,
      unit: kpi.unit,
      target_value: kpi.target_benchmark || null,
      why_it_matters: kpi.why_it_matters,
      what_to_do: kpi.what_to_do,
      is_universal: kpi.is_universal || false,
      is_active: true,
      updated_at: new Date().toISOString()
    }))

    // Upsert KPIs (insert new ones, update existing ones)
    const { data: upsertedKpis, error: upsertError } = await supabaseAdmin
      .from('business_kpis')
      .upsert(kpisToUpsert, {
        onConflict: 'business_id,kpi_id',
        ignoreDuplicates: false
      })
      .select()

    if (upsertError) {
      Sentry.captureException(upsertError, { tags: { route: 'kpis' }, extra: { context: "Error upserting KPIs" } } as any)
      return NextResponse.json(
        { error: 'Failed to save KPIs' },
        { status: 500 }
      )
    }

    // Only delete KPIs that were removed (not in new selection)
    const kpisToRemove = [...existingKpiIds].filter(id => !newKpiIds.has(id))
    if (kpisToRemove.length > 0) {
      const { error: deleteError } = await supabaseAdmin
        .from('business_kpis')
        .delete()
        .eq('business_id', businessId)
        .in('kpi_id', kpisToRemove)

      if (deleteError) {
        Sentry.captureException(deleteError, { tags: { route: 'kpis' }, extra: { context: "Error removing deselected KPIs" } } as any)
        // Non-fatal - the new KPIs are already saved
      }
    }

    const insertedKpis = upsertedKpis

    // Log the save action (optional - for tracking)
    await supabaseAdmin
      .from('activity_log')
      .insert({
        business_id: businessId,
        action: 'kpis_updated',
        description: `Updated KPIs - ${kpis.length} metrics selected`,
        created_at: new Date().toISOString()
      })

    return NextResponse.json({ 
      success: true,
      message: `Successfully saved ${kpis.length} KPIs`,
      kpis: insertedKpis,
      count: insertedKpis?.length || 0
    })

  } catch (error) {
    Sentry.captureException(error, { tags: { route: 'kpis' }, extra: { context: "Unexpected error in POST /api/kpis" } } as any)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// DELETE endpoint - Remove a specific KPI
async function deleteHandler(request: Request) {
  try {
    // Authentication check
    const supabase = await createRouteHandlerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get KPI ID from query params
    const { searchParams } = new URL(request.url)
    const kpiId = searchParams.get('kpiId')
    const businessId = searchParams.get('businessId')

    if (!kpiId || !businessId) {
      return NextResponse.json(
        { error: 'KPI ID and Business ID are required' },
        { status: 400 }
      )
    }

    // Verify user has access to this business
    const hasAccess = await verifyBusinessAccess(user.id, businessId)
    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden - No access to this business' }, { status: 403 })
    }

    // Delete the KPI
    const { error } = await supabaseAdmin
      .from('business_kpis')
      .delete()
      .eq('kpi_id', kpiId)
      .eq('business_id', businessId)

    if (error) {
      Sentry.captureException(error, { tags: { route: 'kpis' }, extra: { context: "Error deleting KPI" } } as any)
      return NextResponse.json(
        { error: 'Failed to delete KPI' },
        { status: 500 }
      )
    }

    return NextResponse.json({ 
      success: true,
      message: 'KPI deleted successfully'
    })

  } catch (error) {
    Sentry.captureException(error, { tags: { route: 'kpis' }, extra: { context: "Unexpected error in DELETE /api/kpis" } } as any)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// PATCH endpoint - Update KPI values (for tracking actual performance)
async function patchHandler(request: Request) {
  try {
    // Authentication check
    const supabase = await createRouteHandlerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { businessId, kpiId, currentValue, notes } = body

    if (!businessId || !kpiId) {
      return NextResponse.json(
        { error: 'Business ID and KPI ID are required' },
        { status: 400 }
      )
    }

    // Verify user has access to this business
    const hasAccess = await verifyBusinessAccess(user.id, businessId)
    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden - No access to this business' }, { status: 403 })
    }

    // Update the KPI's current value
    const { data, error } = await supabaseAdmin
      .from('business_kpis')
      .update({
        current_value: currentValue,
        last_updated: new Date().toISOString(),
        notes: notes || null
      })
      .eq('business_id', businessId)
      .eq('kpi_id', kpiId)
      .select()
      .single()

    if (error) {
      Sentry.captureException(error, { tags: { route: 'kpis' }, extra: { context: "Error updating KPI value" } } as any)
      return NextResponse.json(
        { error: 'Failed to update KPI value' },
        { status: 500 }
      )
    }

    // Also save to KPI history for tracking trends
    await supabaseAdmin
      .from('kpi_history')
      .insert({
        business_id: businessId,
        kpi_id: kpiId,
        value: currentValue,
        notes: notes || null,
        recorded_at: new Date().toISOString()
      })

    return NextResponse.json({ 
      success: true,
      message: 'KPI value updated successfully',
      kpi: data
    })

  } catch (error) {
    Sentry.captureException(error, { tags: { route: 'kpis' }, extra: { context: "Unexpected error in PATCH /api/kpis" } } as any)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export const GET = withQuerySchema('kpis', GetQuerySchema, getHandler)
export const POST = withSchema('kpis', PostBodySchema, postHandler)
export const DELETE = withQuerySchema('kpis', DeleteQuerySchema, deleteHandler)
export const PATCH = withSchema('kpis', PatchBodySchema, patchHandler)