/**
 * Phase 44.2 Plan 44.2-10 (re-scoped) — continuous reconciliation watch.
 *
 * The original plan called for a daily cron that re-fetches Xero P&L for
 * every (business_id, tenant_id) pair to run the reconciler from scratch.
 * After 06D + 06F shipped, that approach is duplicative and burns Xero
 * API quota:
 *   - 06D's orchestrator already runs Net Assets == Equity per BS sync
 *     and writes reconciliation drift to sync_jobs.reconciliation.bs.
 *   - 06B's orchestrator runs P&L per-account reconciliation per sync and
 *     writes to sync_jobs.reconciliation.pl.discrepant_accounts.
 *
 * RE-SCOPED behavior: query sync_jobs for any tenant in the last 24h
 * whose latest sync_jobs.reconciliation has unbalanced_dates or
 * discrepant_accounts. Tag Sentry per drift event. Zero extra Xero calls.
 * Coverage: ALL active tenants (not just the 3 reference tenants the
 * original plan would have hit through re-fetching).
 *
 * Schedule: 18 UTC (04:00 AEST) — 2 hours after sync-all-xero finishes.
 * Auth: CRON_SECRET bearer token (Vercel cron pattern).
 */
import { NextRequest, NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { createServiceRoleClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

interface DriftEvent {
  business_id: string
  tenant_id: string
  job_id: string
  status: string
  started_at: string
  pl_discrepant: number
  bs_unbalanced_dates: string[]
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = createServiceRoleClient()
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

    // Pull every sync_jobs row from the last 24h. Filter in code rather than
    // SQL so we don't depend on jsonb-path query support; the volume is
    // bounded (≤18 tenants × ≤1 sync/day = ≤18 rows typically).
    const { data: rows, error } = await supabase
      .from('sync_jobs')
      .select('id, business_id, tenant_id, status, started_at, reconciliation')
      .gte('started_at', since)
      .order('started_at', { ascending: false })

    if (error) {
      Sentry.captureException(error, {
        tags: { invariant: 'cron_reconciliation_watch', phase: 'sync_jobs_query' },
      } as any)
      return NextResponse.json({ error: 'sync_jobs query failed' }, { status: 500 })
    }

    const drift: DriftEvent[] = []
    for (const row of (rows ?? []) as any[]) {
      const recon = row.reconciliation ?? {}
      // Post-06D shape: pl + bs sub-objects. Pre-06D shape: flat.
      const plDisc = (recon.pl?.discrepant_accounts?.length ?? recon.discrepant_accounts?.length ?? 0) as number
      const bsUnbalanced = (recon.bs?.unbalanced_dates ?? []) as Array<{ balance_date: string }>
      if (plDisc === 0 && bsUnbalanced.length === 0) continue

      const event: DriftEvent = {
        business_id: row.business_id,
        tenant_id: row.tenant_id,
        job_id: row.id,
        status: row.status,
        started_at: row.started_at,
        pl_discrepant: plDisc,
        bs_unbalanced_dates: bsUnbalanced.map((d) => d.balance_date).filter(Boolean),
      }
      drift.push(event)

      try {
        Sentry.captureMessage('continuous_reconciliation_drift', {
          level: 'warning',
          tags: {
            invariant: 'continuous_reconciliation_drift',
            business_id: row.business_id,
            tenant_id: row.tenant_id,
            job_id: row.id,
          },
          extra: event,
        } as any)
      } catch {
        // Sentry failure must not abort the cron.
      }
    }

    return NextResponse.json({
      success: true,
      since,
      sync_jobs_scanned: rows?.length ?? 0,
      drift_count: drift.length,
      drift,
    })
  } catch (err: any) {
    Sentry.captureException(err, {
      tags: { invariant: 'cron_reconciliation_watch' },
    } as any)
    return NextResponse.json({ error: String(err?.message ?? err) }, { status: 500 })
  }
}
