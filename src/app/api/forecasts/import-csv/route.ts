import { NextRequest, NextResponse } from 'next/server'
import { createServerComponentClient } from '@/lib/supabase/server'
import type { PLLine } from '@/app/finances/forecast/types'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerComponentClient()

    // Check authentication
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { forecastId, lines } = body as {
      forecastId: string
      lines: PLLine[]
    }

    if (!forecastId || !lines || !Array.isArray(lines)) {
      return NextResponse.json(
        { error: 'Missing required fields: forecastId, lines' },
        { status: 400 }
      )
    }

    // Verify user owns this forecast
    const { data: forecast, error: forecastError } = await supabase
      .from('financial_forecasts')
      .select('id, user_id')
      .eq('id', forecastId)
      .single()

    if (forecastError || !forecast) {
      return NextResponse.json({ error: 'Forecast not found' }, { status: 404 })
    }

    if (forecast.user_id !== user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // Delete existing lines for this forecast (clean slate for CSV import)
    const { error: deleteError } = await supabase
      .from('forecast_pl_lines')
      .delete()
      .eq('forecast_id', forecastId)

    if (deleteError) {
      console.error('[CSV Import] Error deleting existing lines:', deleteError)
      return NextResponse.json(
        { error: 'Failed to clear existing data' },
        { status: 500 }
      )
    }

    // Insert new lines (remove id field to let database generate new ones)
    const linesToInsert = lines.map((line, index) => {
      const { id, ...lineWithoutId } = line
      return {
        ...lineWithoutId,
        forecast_id: forecastId,
        sort_order: line.sort_order ?? index
      }
    })

    const { error: insertError } = await supabase
      .from('forecast_pl_lines')
      .insert(linesToInsert)

    if (insertError) {
      console.error('[CSV Import] Error inserting lines:', insertError)
      return NextResponse.json(
        { error: 'Failed to import data' },
        { status: 500 }
      )
    }

    console.log(`[CSV Import] Successfully imported ${lines.length} lines for forecast ${forecastId}`)

    return NextResponse.json({
      success: true,
      linesImported: lines.length
    })
  } catch (error) {
    console.error('[CSV Import] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
