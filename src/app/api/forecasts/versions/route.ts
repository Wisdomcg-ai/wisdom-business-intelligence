import { createRouteHandlerClient } from '@/lib/supabase/server'
import { z } from 'zod'
import { withSchema } from '@/lib/api/with-schema'
import { NextResponse } from 'next/server'
import { resolveBusinessProfileIds } from '@/lib/business/resolveBusinessProfileIds'
import type { WhatIfParameters } from '@/app/finances/forecast/types'
import * as Sentry from '@sentry/nextjs'

export const dynamic = 'force-dynamic'

/**
 * Undo a half-made version: remove the new row and hand the active flag back
 * to the source when this call had taken it. Best effort — its own failures
 * are reported, never thrown over the original error.
 */
async function rollbackVersion(
  supabase: Awaited<ReturnType<typeof createRouteHandlerClient>>,
  newForecastId: string,
  sourceForecastId: string,
  versionType: 'budget' | 'forecast',
) {
  try {
    await supabase.from('forecast_pl_lines').delete().eq('forecast_id', newForecastId)
    await supabase.from('financial_forecasts').delete().eq('id', newForecastId)
    if (versionType === 'forecast') {
      await supabase.from('financial_forecasts').update({ is_active: true }).eq('id', sourceForecastId)
    }
  } catch (err) {
    Sentry.captureException(err, {
      tags: { route: 'forecasts/versions', invariant: 'version_copy_rollback_failed' },
      extra: { newForecastId, sourceForecastId },
    } as any)
  }
}

// VALID-04 (observe mode): POST snapshots a forecast as a named version.
const VersionsPostSchema = z
  .object({
    forecastId: z.string(),
    versionName: z.string(),
    parameters: z.unknown().optional(),
    versionType: z.enum(['budget', 'forecast']).optional(),
  })
  .passthrough()

async function postHandler(request: Request) {
  const supabase = await createRouteHandlerClient()

  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const {
      forecastId,
      versionName,
      parameters,
      versionType = 'forecast'
    }: {
      forecastId: string
      versionName: string
      parameters?: WhatIfParameters
      versionType?: 'budget' | 'forecast'
    } = await request.json()

    // 1. Get current forecast
    const { data: currentForecast, error: forecastError } = await supabase
      .from('financial_forecasts')
      .select('*')
      .eq('id', forecastId)
      .maybeSingle()

    if (forecastError || !currentForecast) {
      return NextResponse.json({ error: 'Forecast not found' }, { status: 404 })
    }

    // 2. Get next version number
    const { data: nextVersionData } = await supabase
      .rpc('get_next_version_number', {
        p_business_id: currentForecast.business_id,
        p_fiscal_year: currentForecast.fiscal_year,
        p_forecast_type: versionType
      })

    const nextVersion = nextVersionData || 1

    // 3. Create new forecast version
    const newForecastData = {
      ...currentForecast,
      id: undefined, // Let database generate new ID
      name: versionName,
      forecast_type: versionType,
      version_number: nextVersion,
      is_active: true,
      is_locked: false,
      parent_forecast_id: forecastId,
      version_notes: parameters
        ? `Created from What-If: Revenue ${parameters.revenueChange}%, COGS ${parameters.cogsChange}pp, OpEx ${parameters.opexChange}%`
        : 'Manual version creation',
      created_at: undefined,
      updated_at: undefined
    }

    // Deactivate any other active forecast for the same (business, FY, type)
    // before inserting the new active row. The partial unique index
    // unique_active_forecast_per_fy enforces single-active and would otherwise
    // reject this insert with 23505.
    if (versionType === 'forecast') {
      await supabase
        .from('financial_forecasts')
        .update({ is_active: false })
        .eq('business_id', currentForecast.business_id)
        .eq('fiscal_year', currentForecast.fiscal_year)
        .eq('forecast_type', 'forecast')
        .eq('is_active', true)
    }

    const { data: newForecast, error: insertError } = await supabase
      .from('financial_forecasts')
      .insert(newForecastData)
      .select()
      .single()

    if (insertError || !newForecast) {
      return NextResponse.json({ error: 'Failed to create forecast version' }, { status: 500 })
    }

    // 4. Copy P&L lines
    //
    // A version without its P&L rows is worse than no version: it becomes the
    // ACTIVE forecast and every consumer reads $0 until someone re-Generates
    // (Urban Road, 7 Sep 2026 — "Save as New Version" produced exactly that,
    // and the failures below were swallowed). Both reads and writes are now
    // checked; a copy that cannot carry its rows is rolled back and reported.
    const { data: plLines, error: plReadError } = await supabase
      .from('forecast_pl_lines')
      .select('*')
      .eq('forecast_id', forecastId)
      .is('deleted_at', null)

    if (plReadError) {
      await rollbackVersion(supabase, newForecast.id, forecastId, versionType)
      Sentry.captureException(plReadError, {
        tags: { route: 'forecasts/versions', invariant: 'version_copy_lines_read_failed' },
        extra: { context: '[forecasts/versions] Could not read source P&L lines', forecastId },
      } as any)
      return NextResponse.json({ error: 'Failed to copy P&L lines to the new version' }, { status: 500 })
    }

    if (plLines && plLines.length > 0) {
      const newPLLines = plLines.map(line => {
        // Identity, audit stamps and soft-delete markers belong to the source row.
        const {
          id: _id, created_at: _c, updated_at: _u, computed_at: _ca,
          deleted_at: _d, deleted_by: _db, created_by: _cb, updated_by: _ub,
          ...copyable
        } = line as Record<string, unknown> & { forecast_months?: Record<string, number>; category?: string }
        void _id; void _c; void _u; void _ca; void _d; void _db; void _cb; void _ub
        let updatedForecastMonths: Record<string, number> = { ...(line.forecast_months || {}) }

        // Apply What-If parameters if provided
        if (parameters) {
          Object.keys(updatedForecastMonths).forEach(monthKey => {
            const currentValue = updatedForecastMonths[monthKey] || 0

            if (line.category === 'Revenue') {
              updatedForecastMonths[monthKey] = currentValue * (1 + parameters.revenueChange / 100)
            } else if (line.category === 'Cost of Sales') {
              updatedForecastMonths[monthKey] = currentValue * (1 + parameters.cogsChange / 100)
            } else if (line.category === 'Operating Expenses') {
              updatedForecastMonths[monthKey] = currentValue * (1 + parameters.opexChange / 100)
            }
          })
        }

        return {
          ...copyable,
          forecast_id: newForecast.id,
          forecast_months: updatedForecastMonths,
          created_by: user.id,
          updated_by: user.id,
        }
      })

      const { error: plInsertError } = await supabase.from('forecast_pl_lines').insert(newPLLines)
      if (plInsertError) {
        await rollbackVersion(supabase, newForecast.id, forecastId, versionType)
        Sentry.captureException(plInsertError, {
          tags: { route: 'forecasts/versions', invariant: 'version_copy_lines_insert_failed' },
          extra: {
            context: '[forecasts/versions] Could not insert copied P&L lines',
            forecastId,
            newForecastId: newForecast.id,
            lineCount: newPLLines.length,
            code: (plInsertError as { code?: string }).code,
          },
        } as any)
        return NextResponse.json(
          { error: `Failed to copy P&L lines to the new version: ${plInsertError.message}` },
          { status: 500 },
        )
      }
    }

    // 5. Copy employees
    const { data: employees } = await supabase
      .from('forecast_employees')
      .select('*')
      .eq('forecast_id', forecastId)

    if (employees && employees.length > 0) {
      const newEmployees = employees.map(emp => ({
        ...emp,
        id: undefined,
        forecast_id: newForecast.id,
        created_at: undefined,
        updated_at: undefined
      }))

      await supabase.from('forecast_employees').insert(newEmployees)
    }

    // 6. Mark old forecast as inactive if creating new active version
    if (versionType === 'forecast') {
      await supabase
        .from('financial_forecasts')
        .update({ is_active: false })
        .eq('id', forecastId)
    }

    return NextResponse.json({
      success: true,
      newForecast
    })

  } catch (error) {
    Sentry.captureException(error, { tags: { route: 'forecasts/versions' }, extra: { context: "Error creating version" } } as any)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const POST = withSchema('forecasts/versions', VersionsPostSchema, postHandler)

// GET endpoint to list all versions
export async function GET(request: Request) {
  const supabase = await createRouteHandlerClient()

  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const businessId = searchParams.get('business_id')
    const fiscalYear = searchParams.get('fiscal_year')

    if (!businessId || !fiscalYear) {
      return NextResponse.json({ error: 'business_id and fiscal_year required' }, { status: 400 })
    }

    // Resolve both business ID formats so we find forecasts stored under either
    const ids = await resolveBusinessProfileIds(supabase, businessId)

    const { data: versions, error } = await supabase
      .from('financial_forecasts')
      .select('*')
      .in('business_id', ids.all)
      .eq('fiscal_year', parseInt(fiscalYear))
      .order('forecast_type', { ascending: true })
      .order('version_number', { ascending: false })

    if (error) {
      Sentry.captureException(error, { tags: { route: 'forecasts/versions' }, extra: { context: "Error fetching versions from Supabase" } } as any)
      return NextResponse.json({ error: 'Failed to fetch versions', details: error.message }, { status: 500 })
    }

    return NextResponse.json({ versions: versions || [] })

  } catch (error) {
    Sentry.captureException(error, { tags: { route: 'forecasts/versions' }, extra: { context: "Error fetching versions" } } as any)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
