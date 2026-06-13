import * as Sentry from '@sentry/nextjs'

/**
 * Surface a Supabase/PostgREST error instead of swallowing it.
 *
 * Phase 74 rationale: every confirmed dual-ID write bug was hidden by a discarded
 * error (a `// Don't throw` branch / ignored `error` field). This is the sanctioned
 * replacement — it logs the error (Sentry + console) but NEVER throws, so callers
 * keep their existing control flow while the failure becomes visible.
 *
 *   const { error } = await supabase.from('kpi_actuals').upsert(...)
 *   if (error) surfaceSupabaseError('saveKpiActuals', error)
 */
export function surfaceSupabaseError(context: string, error: unknown): void {
  try {
    Sentry.captureException(error, { tags: { dual_id_surface: context } })
  } catch {
    // logging must never throw
  }
  console.error(`[${context}]`, error)
}
