import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import * as Sentry from '@sentry/nextjs'
import { withQuerySchema } from '@/lib/api/with-schema'
import { createServiceRoleClient } from '@/lib/supabase/admin'
import { recordHeartbeat } from '@/lib/cron/heartbeat'
import { START_MARKER } from '@/lib/cron/watchdog'
import { syncClosedFxMonths } from '@/lib/consolidation/fx-rate-sync'

/**
 * Monthly FX rates — 02:15 UTC on the 1st to 7th of each month (IICT-03).
 *
 * Exchange rates used to exist only when a coach clicked "Sync from OXR". For
 * June–August 2026 nobody did, and IICT Group Limited's HKD was added into AUD
 * one-for-one. This cron stores every closed month an active consolidation
 * needs — the OXR month average (P&L) and the month-end closing rate (balance
 * sheet) — through the same rows and upsert as the button. It refuses partial
 * months and never overwrites a rate a coach entered by hand; see
 * lib/consolidation/fx-rate-sync.ts.
 *
 * Why seven slots, not one: the 1st does the work; the 2nd–7th are free
 * retries (a settled month costs one small fx_rates read and no OXR call), so
 * a transient OXR failure or a capped backfill finishes within the week
 * instead of waiting a month. 02:15 is after OXR's month-end snapshot is final
 * and before metric-invariants reads fx_rates at 05:00.
 */
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const CRON_PATH = '/api/cron/sync-fx-rates'

/** Stop starting new months past this point — a month is ~31 OXR calls, a few seconds. */
const TIME_BUDGET_MS = 240_000

async function getHandler(req: NextRequest) {
  // Fail-closed: reject when CRON_SECRET is unset so a missing secret can never
  // silently reopen this endpoint to unauthenticated callers (`Bearer undefined`).
  const cronSecret = process.env.CRON_SECRET
  const authHeader = req.headers.get('authorization')
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const startedAt = Date.now()

  // Stamp BEFORE the work: a run killed at maxDuration that left no heartbeat
  // reads as "never scheduled" — the misdirection that hid the CRON_SECRET
  // outage. The completion path overwrites this with the real outcome.
  await recordHeartbeat({
    cronPath: CRON_PATH,
    status: 'partial',
    errorMessage: START_MARKER,
  }).catch(() => { /* best-effort marker; never block the run */ })

  try {
    const result = await syncClosedFxMonths(createServiceRoleClient(), {
      appId: process.env.OPENEXCHANGERATES_APP_ID,
      now: new Date(),
      deadlineMs: startedAt + TIME_BUDGET_MS,
    })
    const { errors, skipped } = result

    // ONE aggregated Sentry event per run, only when a month is still missing.
    // A month without a rate is summed untranslated, so failures are 'error';
    // work merely deferred to the next slot is 'warning'.
    if (errors.length > 0 || skipped.length > 0) {
      Sentry.captureMessage(
        `[FX Rates Cron] ${errors.length} month(s) failed, ${skipped.length} month(s) left for the next run`,
        {
          level: errors.length > 0 ? 'error' : 'warning',
          tags: { cron: 'sync-fx-rates', invariant: 'fx_rates_monthly_sync' },
          extra: { errors: errors.slice(0, 30), skipped, synced: result.synced.map((s) => `${s.currency_pair} ${s.month}`) },
        } as any,
      )
    }

    const status = errors.length === 0 && skipped.length === 0
      ? 'success'
      : result.synced.length > 0 || result.retired.length > 0 ? 'partial' : 'failed'
    await recordHeartbeat({
      cronPath: CRON_PATH,
      status,
      errorMessage: errors.length > 0 ? `${errors.length} month(s) failed` : null,
      metadata: {
        pairs: result.pairs.length,
        months_synced: result.synced.length,
        rows_retired: result.retired.length,
        kept_manual: result.kept_manual.length,
        skipped: skipped.length,
        errors: errors.length,
        duration_ms: Date.now() - startedAt,
      },
    })

    return NextResponse.json({
      success: true,
      pairs: result.pairs,
      synced: result.synced,
      retired: result.retired,
      kept_manual: result.kept_manual,
      errors: errors.length > 0 ? errors : undefined,
      skipped: skipped.length > 0 ? skipped : undefined,
    })
  } catch (error) {
    Sentry.captureException(error, {
      tags: { cron: 'sync-fx-rates', invariant: 'fx_rates_monthly_sync' },
      extra: { context: '[FX Rates Cron] run failed' },
    } as any)
    await recordHeartbeat({
      cronPath: CRON_PATH,
      status: 'failed',
      errorMessage: error instanceof Error ? error.message : String(error),
    }).catch(() => { /* heartbeat is best-effort on the failure path */ })
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'FX rate sync failed' },
      { status: 500 },
    )
  }
}

export const GET = withQuerySchema(
  'cron/sync-fx-rates',
  z.object({}),
  getHandler as unknown as (request: Request) => Promise<Response>,
)
