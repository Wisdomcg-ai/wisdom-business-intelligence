import { createRouteHandlerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { withQuerySchema } from '@/lib/api/with-schema'
import { z } from 'zod'
import * as Sentry from '@sentry/nextjs'

export const dynamic = 'force-dynamic'

const GetQuerySchema = z
  .object({
    forecast_id: z.string().optional(),
    action: z.string().optional(),
    user_id: z.string().optional(),
    date_range: z.string().optional(),
  })
  .passthrough()

async function getHandler(request: Request) {
  const supabase = await createRouteHandlerClient()

  try {
    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Parse query parameters
    const { searchParams } = new URL(request.url)
    const forecastId = searchParams.get('forecast_id')
    const action = searchParams.get('action')
    const userId = searchParams.get('user_id')
    const dateRange = searchParams.get('date_range')

    if (!forecastId) {
      return NextResponse.json(
        { error: 'forecast_id is required' },
        { status: 400 }
      )
    }

    // Verify user has access to this forecast
    const { data: forecast, error: forecastError } = await supabase
      .from('financial_forecasts')
      .select('id, business_id')
      .eq('id', forecastId)
      .single()

    if (forecastError || !forecast) {
      return NextResponse.json(
        { error: 'Forecast not found or access denied' },
        { status: 404 }
      )
    }

    // Build audit log query (no user join - just get raw data)
    let query = supabase
      .from('forecast_audit_log')
      .select('*')
      .eq('forecast_id', forecastId)
      .order('created_at', { ascending: false })

    // Apply filters
    if (action && action !== 'all') {
      query = query.eq('action', action)
    }

    if (userId && userId !== 'all') {
      query = query.eq('user_id', userId)
    }

    // Date range filter
    if (dateRange && dateRange !== 'all') {
      const now = new Date()
      let startDate: Date

      switch (dateRange) {
        case 'today':
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate())
          break
        case 'week':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
          break
        case 'month':
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
          break
        default:
          startDate = new Date(0)
      }

      query = query.gte('created_at', startDate.toISOString())
    }

    // Execute query with limit
    const { data: logs, error: logsError } = await query.limit(100)

    if (logsError) {
      Sentry.captureException(logsError, { tags: { route: 'forecasts/audit-log' }, extra: { context: "[Audit Log API] Error fetching audit logs" } } as any)
      Sentry.captureException(logsError, { tags: { route: 'forecasts/audit-log' }, extra: { context: '[Audit Log API] Error details', logsError } } as any)
      return NextResponse.json(
        { error: 'Failed to fetch audit logs', details: logsError.message },
        { status: 500 }
      )
    }

    // Return logs with basic formatting
    const transformedLogs = logs?.map(log => ({
      ...log,
      user_email: 'User' // Simplified - can enhance later with actual user lookup
    })) || []

    return NextResponse.json({
      logs: transformedLogs,
      count: transformedLogs.length
    })

  } catch (error) {
    Sentry.captureException(error, { tags: { route: 'forecasts/audit-log' }, extra: { context: "[Audit Log API] Unexpected error in audit-log API" } } as any)
    Sentry.captureException(error, { tags: { route: 'forecasts/audit-log' }, extra: { context: '[Audit Log API] Error stack', stack: error instanceof Error ? error.stack : 'No stack trace' } } as any)
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export const GET = withQuerySchema(
  'forecasts/audit-log',
  GetQuerySchema,
  getHandler
)
