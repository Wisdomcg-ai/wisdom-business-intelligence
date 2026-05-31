import { NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase/server'
import { z } from 'zod'
import { withQuerySchema } from '@/lib/api/with-schema'

// Health check takes no body or query — permissive observe-mode schema.
const QuerySchema = z.object({}).passthrough()

/**
 * Health check endpoint for monitoring
 * GET /api/health
 *
 * Returns system health status including:
 * - Overall status (healthy/degraded/unhealthy)
 * - Database connectivity
 * - Timestamp
 * - Version info
 */
async function getHandler() {
  const startTime = Date.now()
  const checks: Record<string, { status: 'ok' | 'error'; latency?: number; error?: string }> = {}

  // Check database connectivity
  try {
    const dbStart = Date.now()
    const supabase = await createRouteHandlerClient()

    // Simple query to test connectivity
    const { error } = await supabase.from('businesses').select('id').limit(1)

    if (error) {
      checks.database = { status: 'error', error: error.message }
    } else {
      checks.database = { status: 'ok', latency: Date.now() - dbStart }
    }
  } catch (error) {
    checks.database = {
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown database error'
    }
  }

  // Determine overall status
  const hasErrors = Object.values(checks).some(check => check.status === 'error')
  const status = hasErrors ? 'degraded' : 'healthy'

  // Build response
  const response = {
    status,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    checks,
    responseTime: Date.now() - startTime
  }

  // Return appropriate status code
  const statusCode = status === 'healthy' ? 200 : 503

  return NextResponse.json(response, { status: statusCode })
}

export const GET = withQuerySchema('health', QuerySchema, getHandler)
