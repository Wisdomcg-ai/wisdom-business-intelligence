/**
 * Phase 69-04 — Cron heartbeat helper.
 *
 * Every cron route under /api/cron/* should call `recordHeartbeat` exactly
 * once per invocation, AFTER the auth gate passes. Both the success path AND
 * the failure path (in the route's outer try/catch) must record a heartbeat
 * so the cron_heartbeats table reflects every real invocation regardless of
 * outcome.
 *
 * Why this exists: Phase 69 root cause (per 69-DIAGNOSIS.md) was that
 * /api/cron/refresh-xero-tokens stopped being invoked by Vercel's scheduler
 * for many consecutive 6-hour ticks. The route's existing Sentry telemetry
 * only captures "what happened when the cron ran" — a cron that NEVER runs
 * produces zero Sentry signal, indistinguishable from a healthy cron that
 * successfully no-ops. cron_heartbeats fills that gap: any query like
 * "any heartbeat for cron_path X in the last 12h?" surfaces missing-cron
 * regressions within hours instead of weeks.
 *
 * Why insert AFTER the auth gate (not before): a wrong CRON_SECRET would
 * flood the table with rows that LOOK like real invocations. We want
 * heartbeat presence to mean "the cron actually ran"; auth failures stay in
 * Vercel access logs where they belong.
 *
 * Failure isolation: this helper is intentionally fail-soft — a heartbeat
 * write failure (DB outage, schema drift) must NEVER abort the cron run
 * itself. The helper catches every error, logs to console + Sentry, and
 * returns. The cron's primary work always takes precedence.
 */

import * as Sentry from '@sentry/nextjs'
import { createServiceRoleClient } from '@/lib/supabase/admin'

export type HeartbeatStatus = 'success' | 'failed' | 'partial'

interface RecordHeartbeatOptions {
  /** The route path, e.g. '/api/cron/refresh-xero-tokens'. Used as the
   *  primary index key for cadence queries. */
  cronPath: string
  /** Final outcome of the cron run. */
  status: HeartbeatStatus
  /** Optional truncated error message when status != 'success'. */
  errorMessage?: string | null
  /** Optional structured payload (counters, durations). Keep <4KB —
   *  Sentry is the right home for verbose diagnostics. */
  metadata?: Record<string, unknown>
}

const MAX_ERROR_MESSAGE_LEN = 2000
const MAX_METADATA_KEYS = 50

/**
 * Insert one row into cron_heartbeats. Fail-soft: returns silently on any
 * error so the cron's main work is never aborted by a telemetry failure.
 */
export async function recordHeartbeat(
  options: RecordHeartbeatOptions,
): Promise<void> {
  const { cronPath, status } = options

  // Sanitize error_message — cap length so a giant stack trace can't blow
  // out a single row size.
  let errorMessage: string | null = null
  if (options.errorMessage != null) {
    const raw = String(options.errorMessage)
    errorMessage =
      raw.length > MAX_ERROR_MESSAGE_LEN
        ? raw.slice(0, MAX_ERROR_MESSAGE_LEN) + '…[truncated]'
        : raw
  }

  // Sanitize metadata — cap key count so a runaway metadata object can't
  // pollute the table. Per-value size is not capped here; cron callers
  // should keep payloads compact.
  let metadata: Record<string, unknown> = {}
  if (options.metadata && typeof options.metadata === 'object') {
    const entries = Object.entries(options.metadata).slice(0, MAX_METADATA_KEYS)
    metadata = Object.fromEntries(entries)
  }

  try {
    const supabase = createServiceRoleClient()
    const { error } = await supabase.from('cron_heartbeats').insert({
      cron_path: cronPath,
      status,
      error_message: errorMessage,
      metadata,
    })
    if (error) {
      // Surface but don't throw — heartbeat is best-effort.
      try {
        Sentry.captureMessage('cron_heartbeat_insert_failed', {
          level: 'warning',
          tags: {
            invariant: 'cron_heartbeat_insert_failed',
            cron_path: cronPath,
            status,
          },
          extra: { error: error.message },
        } as any)
      } catch {
        // Sentry outage on top of DB outage — nothing useful left to do.
      }
      // eslint-disable-next-line no-console
      console.warn(
        `[cron-heartbeat] failed to record ${cronPath} (${status}):`,
        error.message,
      )
    }
  } catch (err: any) {
    // Cron must never die from a telemetry failure. Swallow + warn.
    try {
      Sentry.captureException(err, {
        tags: {
          invariant: 'cron_heartbeat_insert_threw',
          cron_path: cronPath,
          status,
        },
      } as any)
    } catch {
      // ignore
    }
    // eslint-disable-next-line no-console
    console.warn(
      `[cron-heartbeat] insert threw for ${cronPath} (${status}):`,
      err?.message ?? err,
    )
  }
}
