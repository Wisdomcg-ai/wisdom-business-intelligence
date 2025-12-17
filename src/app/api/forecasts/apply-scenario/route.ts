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

    const { forecastId, parameters }: { forecastId: string; parameters: WhatIfParameters } = await request.json()

    // First verify user has access to this forecast via business ownership
    const { data: forecast, error: forecastError } = await supabase
      .from('financial_forecasts')
      .select('id, business_id, businesses!inner(owner_id, assigned_coach_id)')
      .eq('id', forecastId)
      .single()

    if (forecastError || !forecast) {
      return NextResponse.json({ error: 'Forecast not found' }, { status: 404 })
    }

    // Type-safe access to the joined business data
    const business = forecast.businesses as unknown as { owner_id: string; assigned_coach_id: string | null }
    if (business.owner_id !== user.id && business.assigned_coach_id !== user.id) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Get current P&L lines
    const { data: plLines, error: plError } = await supabase
      .from('forecast_pl_lines')
      .select('*')
      .eq('forecast_id', forecastId)

    if (plError || !plLines) {
      return NextResponse.json({ error: 'Failed to fetch P&L lines' }, { status: 500 })
    }

    // Calculate new values based on parameters
    const updatedLines = plLines.map(line => {
      const updatedForecastMonths = { ...line.forecast_months }

      Object.keys(updatedForecastMonths).forEach(monthKey => {
        const currentValue = updatedForecastMonths[monthKey] || 0

        if (line.category === 'Revenue') {
          updatedForecastMonths[monthKey] = currentValue * (1 + parameters.revenueChange / 100)
        } else if (line.category === 'Cost of Sales') {
          // Apply COGS percentage change
          updatedForecastMonths[monthKey] = currentValue * (1 + parameters.cogsChange / 100)
        } else if (line.category === 'Operating Expenses') {
          updatedForecastMonths[monthKey] = currentValue * (1 + parameters.opexChange / 100)
        }
      })

      return {
        ...line,
        forecast_months: updatedForecastMonths
      }
    })

    // Update all P&L lines
    const updatePromises = updatedLines.map(line =>
      supabase
        .from('forecast_pl_lines')
        .update({ forecast_months: line.forecast_months })
        .eq('id', line.id)
    )

    await Promise.all(updatePromises)

    return NextResponse.json({
      success: true,
      updatedLines
    })

  } catch (error) {
    console.error('Error applying scenario:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
