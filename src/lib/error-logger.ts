'use client'

import { createClient } from '@/lib/supabase/client'

export type ErrorType =
  | 'autosave_failed'
  | 'data_load_failed'
  | 'rls_error'
  | 'network_error'
  | 'validation_error'
  | 'unexpected_error'

interface LogErrorParams {
  errorType: ErrorType
  errorMessage: string
  component: string
  businessId?: string
  metadata?: Record<string, unknown>
}

/**
 * Log a client-side error to the database for monitoring.
 * Non-blocking - errors in logging itself are silently caught.
 */
export async function logError({
  errorType,
  errorMessage,
  component,
  businessId,
  metadata = {}
}: LogErrorParams): Promise<void> {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    await supabase.from('client_error_logs').insert({
      user_id: user?.id || null,
      business_id: businessId || null,
      error_type: errorType,
      error_message: errorMessage.slice(0, 2000),
      component,
      page_url: typeof window !== 'undefined' ? window.location.href : null,
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
      metadata
    })
  } catch {
    // Silent fail - don't let error logging cause more errors
    console.warn('[ErrorLogger] Failed to log error:', errorMessage)
  }
}

/**
 * Log an autosave failure with context.
 */
export async function logSaveError(
  component: string,
  error: string,
  businessId?: string,
  data?: Record<string, unknown>
): Promise<void> {
  await logError({
    errorType: 'autosave_failed',
    errorMessage: error,
    component,
    businessId,
    metadata: {
      timestamp: new Date().toISOString(),
      dataKeys: data ? Object.keys(data) : []
    }
  })
}

/**
 * Log an RLS/permission error.
 */
export async function logRLSError(
  component: string,
  error: string,
  businessId?: string
): Promise<void> {
  await logError({
    errorType: 'rls_error',
    errorMessage: error,
    component,
    businessId
  })
}
