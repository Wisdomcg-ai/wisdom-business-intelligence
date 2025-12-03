import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

// Initialize Supabase client
// Make sure your environment variables are set in .env.local
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceKey)

// GET endpoint - Fetch existing KPIs for a business
export async function GET(request: NextRequest) {
  try {
    // Get businessId from query params
    const { searchParams } = new URL(request.url)
    const businessId = searchParams.get('businessId')

    if (!businessId) {
      return NextResponse.json(
        { error: 'Business ID is required' },
        { status: 400 }
      )
    }

    // Fetch KPIs from database
    const { data: kpis, error } = await supabase
      .from('business_kpis')
      .select('*')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching KPIs:', error)
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
    console.error('Unexpected error in GET /api/kpis:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// POST endpoint - Save or update KPIs for a business
export async function POST(request: NextRequest) {
  try {
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

    if (!kpis || !Array.isArray(kpis)) {
      return NextResponse.json(
        { error: 'KPIs array is required' },
        { status: 400 }
      )
    }

    // Get current KPI IDs for this business
    const { data: existingKpis } = await supabase
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
    const { data: upsertedKpis, error: upsertError } = await supabase
      .from('business_kpis')
      .upsert(kpisToUpsert, {
        onConflict: 'business_id,kpi_id',
        ignoreDuplicates: false
      })
      .select()

    if (upsertError) {
      console.error('Error upserting KPIs:', upsertError)
      return NextResponse.json(
        { error: 'Failed to save KPIs', details: upsertError.message },
        { status: 500 }
      )
    }

    // Only delete KPIs that were removed (not in new selection)
    const kpisToRemove = [...existingKpiIds].filter(id => !newKpiIds.has(id))
    if (kpisToRemove.length > 0) {
      const { error: deleteError } = await supabase
        .from('business_kpis')
        .delete()
        .eq('business_id', businessId)
        .in('kpi_id', kpisToRemove)

      if (deleteError) {
        console.error('Error removing deselected KPIs:', deleteError)
        // Non-fatal - the new KPIs are already saved
      }
    }

    const insertedKpis = upsertedKpis

    // Log the save action (optional - for tracking)
    await supabase
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
    console.error('Unexpected error in POST /api/kpis:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// DELETE endpoint - Remove a specific KPI
export async function DELETE(request: NextRequest) {
  try {
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

    // Delete the KPI
    const { error } = await supabase
      .from('business_kpis')
      .delete()
      .eq('kpi_id', kpiId)
      .eq('business_id', businessId)

    if (error) {
      console.error('Error deleting KPI:', error)
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
    console.error('Unexpected error in DELETE /api/kpis:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// PATCH endpoint - Update KPI values (for tracking actual performance)
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { businessId, kpiId, currentValue, notes } = body

    if (!businessId || !kpiId) {
      return NextResponse.json(
        { error: 'Business ID and KPI ID are required' },
        { status: 400 }
      )
    }

    // Update the KPI's current value
    const { data, error } = await supabase
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
      console.error('Error updating KPI value:', error)
      return NextResponse.json(
        { error: 'Failed to update KPI value' },
        { status: 500 }
      )
    }

    // Also save to KPI history for tracking trends
    await supabase
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
    console.error('Unexpected error in PATCH /api/kpis:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}