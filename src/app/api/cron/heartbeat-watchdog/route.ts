import { NextRequest, NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { z } from 'zod'
import { createServiceRoleClient } from '@/lib/supabase/admin'
import { recordHeartbeat } from '@/lib/cron/heartbeat'
import { withQuerySchema } from '@/lib/api/with-schema'
import { MONITORED_CRONS, evaluateCronHealth, type HeartbeatSnapshot } from '@/lib/cron/watchdog'

/**
 * Heartbeat watchdog — the monitor nobody had.
 *
 * Reads cron_heartbeats and fires a Sentry alert for any monitored cron that
 * hasn't logged a completed heartbeat within its expected cadence
 * (missing/stale) or whose last run failed. This is exactly what would have
 * caught the two-month CRON_SECRET outage in its first window: every cron was
 * 401-ing before its heartbeat write, the table went quiet, and nothing was
 * reading it.
 *
 * Start-marker heartbeats ("run started — not yet completed") are excluded
 * from the snapshot: they prove a run began, not that it finished, and reading
 * one as the latest outcome is how a watchdog pages "degraded" about a
 * perfectly healthy chaining cron mid-run.
 *
 * The watchdog can't watch itself (a dead cron reports nothing). Sentry Cron
 * Monitors (external check-ins) are the intended backstop for the watchdog.
 *
 * Auth: fail-closed CRON_SECRET gate. Fail-soft: a query error records a
 * 'failed' heartbeat and returns 500 rather than throwing.
 */
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const CRON_PATH = '/api/cron/heartbeat-watchdog'

const START_MARKER = 'run started — not yet completed'

async function getHandler(req: NextRequest) {
  // Fail-closed: reject when CRON_SECRET is unset so a missing secret can never
  // silently reopen this endpoint to unauthenticated callers (`Bearer undefined`).
  const cronSecret = process.env.CRON_SECRET
  const authHeader = req.headers.get('authorization')
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = createServiceRoleClient()

    // Newest COMPLETED heartbeat per monitored cron (one tiny indexed query
    // each). Start-markers are filtered out in JS — the marker text contains
    // spaces and an em dash, which PostgREST .or() filter syntax handles
    // badly. 10 rows is ample: markers and completions interleave, and a cron
    // whose last 10 rows are ALL start-markers is being killed on every run —
    // for which "no completed heartbeat" (→ missing/stale) is the right read.
    const latest: Record<string, HeartbeatSnapshot> = {}
    await Promise.all(
      MONITORED_CRONS.map(async (m) => {
        const { data } = await supabase
          .from('cron_heartbeats')
          .select('ran_at, status, error_message')
          .eq('cron_path', m.path)
          .order('ran_at', { ascending: false })
          .limit(10)
        const row = ((data ?? []) as Array<{ ran_at: string; status: string; error_message: string | null }>)
          .find((r) => r.error_message !== START_MARKER)
        latest[m.path] = { ranAtMs: row ? Date.parse(row.ran_at) : null, status: row?.status ?? null }
      }),
    )

    const alerts = evaluateCronHealth(MONITORED_CRONS, latest, Date.now())

    for (const a of alerts) {
      // One Sentry issue per (cron_path, reason) — repeat firings group together,
      // so a stale cron is one actionable issue, not one per watchdog tick.
      Sentry.captureMessage(`Cron ${a.reason}: ${a.label}`, {
        level: 'error',
        tags: { invariant: 'cron_watchdog_alert', cron_path: a.path, reason: a.reason },
        extra: { label: a.label, reason: a.reason, ageHours: a.ageHours == null ? null : Math.round(a.ageHours * 10) / 10 },
      } as any)
    }

    await recordHeartbeat({
      cronPath: CRON_PATH,
      status: 'success',
      metadata: {
        checked: MONITORED_CRONS.length,
        alerts: alerts.length,
        stale: alerts.filter((a) => a.reason !== 'failed').map((a) => a.path),
        failed: alerts.filter((a) => a.reason === 'failed').map((a) => a.path),
      },
    })

    return NextResponse.json({ success: true, checked: MONITORED_CRONS.length, alerts })
  } catch (err: any) {
    try {
      Sentry.captureException(err, { tags: { invariant: 'cron_heartbeat_watchdog' } } as any)
    } catch {
      /* Sentry outage on top of the failure — nothing useful left to do. */
    }
    await recordHeartbeat({ cronPath: CRON_PATH, status: 'failed', errorMessage: String(err?.message ?? err) })
    return NextResponse.json({ success: false, error: String(err?.message ?? err) }, { status: 500 })
  }
}

export const GET = withQuerySchema(
  'cron/heartbeat-watchdog',
  z.object({}),
  getHandler as unknown as (request: Request) => Promise<Response>,
)
