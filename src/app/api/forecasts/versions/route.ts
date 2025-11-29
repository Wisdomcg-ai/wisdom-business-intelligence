import { createRouteHandlerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { WhatIfParameters } from '@/app/finances/forecast/types'

export async function POST(request: Request) {
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
      .single()

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

    const { data: newForecast, error: insertError } = await supabase
      .from('financial_forecasts')
      .insert(newForecastData)
      .select()
      .single()

    if (insertError || !newForecast) {
      return NextResponse.json({ error: 'Failed to create forecast version' }, { status: 500 })
    }

    // 4. Copy P&L lines
    const { data: plLines } = await supabase
      .from('forecast_pl_lines')
      .select('*')
      .eq('forecast_id', forecastId)

    if (plLines && plLines.length > 0) {
      const newPLLines = plLines.map(line => {
        let updatedForecastMonths = { ...line.forecast_months }

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
          ...line,
          id: undefined,
          forecast_id: newForecast.id,
          forecast_months: updatedForecastMonths,
          created_at: undefined,
          updated_at: undefined
        }
      })

      await supabase.from('forecast_pl_lines').insert(newPLLines)
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
    console.error('Error creating version:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

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

    const { data: versions, error } = await supabase
      .from('financial_forecasts')
      .select('*')
      .eq('business_id', businessId)
      .eq('fiscal_year', parseInt(fiscalYear))
      .order('forecast_type', { ascending: true })
      .order('version_number', { ascending: false })

    if (error) {
      console.error('Error fetching versions from Supabase:', error)
      return NextResponse.json({ error: 'Failed to fetch versions', details: error.message }, { status: 500 })
    }

    return NextResponse.json({ versions: versions || [] })

  } catch (error) {
    console.error('Error fetching versions:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
