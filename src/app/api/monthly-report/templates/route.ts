import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

/**
 * GET /api/monthly-report/templates?business_id=xxx
 * List all templates for this business, ordered by name.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const businessId = searchParams.get('business_id')

    if (!businessId) {
      return NextResponse.json({ error: 'business_id is required' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('report_templates')
      .select('*')
      .eq('business_id', businessId)
      .order('name')

    if (error) {
      console.error('[Templates] GET error:', error)
      return NextResponse.json({ error: 'Failed to fetch templates' }, { status: 500 })
    }

    return NextResponse.json({ templates: data || [] })
  } catch (err) {
    console.error('[Templates] GET exception:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/monthly-report/templates
 * Create a new template. If is_default=true, clears the existing default first.
 *
 * Body: { business_id, name, is_default, sections, column_settings, budget_forecast_id?,
 *         subscription_account_codes?, wages_account_names? }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      business_id,
      name,
      is_default = false,
      sections,
      column_settings,
      budget_forecast_id = null,
      subscription_account_codes = [],
      wages_account_names = [],
    } = body

    if (!business_id || !name || !sections || !column_settings) {
      return NextResponse.json(
        { error: 'business_id, name, sections, and column_settings are required' },
        { status: 400 }
      )
    }

    // If this template is the new default, clear the existing default first
    if (is_default) {
      await supabase
        .from('report_templates')
        .update({ is_default: false })
        .eq('business_id', business_id)
        .eq('is_default', true)
    }

    const { data, error } = await supabase
      .from('report_templates')
      .insert({
        business_id,
        name: name.trim(),
        is_default,
        sections,
        column_settings,
        budget_forecast_id: budget_forecast_id || null,
        subscription_account_codes,
        wages_account_names,
      })
      .select()
      .single()

    if (error) {
      console.error('[Templates] POST error:', error)
      return NextResponse.json({ error: 'Failed to create template' }, { status: 500 })
    }

    return NextResponse.json({ template: data })
  } catch (err) {
    console.error('[Templates] POST exception:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * PUT /api/monthly-report/templates
 * Update an existing template (rename, change settings, set/unset default).
 *
 * Body: { id, business_id, ...fields_to_update }
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, business_id, ...fields } = body

    if (!id || !business_id) {
      return NextResponse.json({ error: 'id and business_id are required' }, { status: 400 })
    }

    // Verify this template belongs to this business
    const { data: existing } = await supabase
      .from('report_templates')
      .select('id')
      .eq('id', id)
      .eq('business_id', business_id)
      .single()

    if (!existing) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    }

    // If setting as default, clear the existing default first
    if (fields.is_default === true) {
      await supabase
        .from('report_templates')
        .update({ is_default: false })
        .eq('business_id', business_id)
        .eq('is_default', true)
        .neq('id', id)
    }

    const updateData: Record<string, unknown> = {}
    const allowed = ['name', 'is_default', 'sections', 'column_settings', 'budget_forecast_id', 'subscription_account_codes', 'wages_account_names']
    for (const key of allowed) {
      if (key in fields) {
        updateData[key] = fields[key]
      }
    }
    if (updateData['name']) {
      updateData['name'] = (updateData['name'] as string).trim()
    }

    const { data, error } = await supabase
      .from('report_templates')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('[Templates] PUT error:', error)
      return NextResponse.json({ error: 'Failed to update template' }, { status: 500 })
    }

    return NextResponse.json({ template: data })
  } catch (err) {
    console.error('[Templates] PUT exception:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * DELETE /api/monthly-report/templates?id=xxx&business_id=xxx
 * Delete a template. Does not affect any business settings that referenced it.
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    const businessId = searchParams.get('business_id')

    if (!id || !businessId) {
      return NextResponse.json({ error: 'id and business_id are required' }, { status: 400 })
    }

    const { error } = await supabase
      .from('report_templates')
      .delete()
      .eq('id', id)
      .eq('business_id', businessId)

    if (error) {
      console.error('[Templates] DELETE error:', error)
      return NextResponse.json({ error: 'Failed to delete template' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[Templates] DELETE exception:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
