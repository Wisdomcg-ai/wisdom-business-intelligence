import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withQuerySchema } from '@/lib/api/with-schema'
import { createClient } from '@supabase/supabase-js'
import { getSupabaseSecretKey } from '@/lib/supabase/keys'
import * as Sentry from '@sentry/nextjs'
import { recordHeartbeat } from '@/lib/cron/heartbeat'
import { resolveBusinessProfileIds } from '@/lib/business/resolveBusinessProfileIds'
import { syncBusinessBSMirror } from '@/lib/xero/bs-mirror-sync'

/**
 * Daily balance-sheet mirror refresh — 03:00 UTC, two hours before the
 * metric-invariants run at 05:00.
 *
 * `xero_balance_sheet_lines` was written ONLY when someone clicked "Sync" in
 * the UI — it was on no cron at all. That meant (a) the daily `bs_equation`
 * invariant was checking data that refreshed on manual clicks, and (b) the
 * PR #373 parser fix sat dormant: verified zero rows written in the four days
 * after it deployed. This cron runs the SAME `syncBusinessBSMirror` the manual
 * route uses, so the two cannot drift, and it runs before the invariants so
 * the check always sees data at most a day old.
 *
 * Load: ~12 tenants × 3 month-end reports = ~36 Xero calls/day, paced at
 * 500ms — negligible against the 60/min/tenant and 5000/day limits.
 */
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const CRON_PATH = '/api/cron/sync-bs-mirror'

/** Stop starting new businesses past this point — leave headroom under
 *  maxDuration for the in-flight tenant to finish and the heartbeat to write. */
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

  // Stamp BEFORE the work. Both completion writes below die with a run killed at
  // maxDuration, and a killed run that left no heartbeat reads as "never
  // scheduled" — the exact misdirection that hid the two-month CRON_SECRET
  // outage. The completion path overwrites this with the real outcome.
  await recordHeartbeat({
    cronPath: CRON_PATH,
    status: 'partial',
    errorMessage: 'run started — not yet completed',
  }).catch(() => { /* best-effort marker; never block the run */ })

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    getSupabaseSecretKey(),
  )

  try {
    // Every business with at least one active connection. Connection rows carry
    // business_id in EITHER id-space (businesses.id or business_profiles.id —
    // the #1 recurring incident class), so resolve each to the canonical
    // businesses.id and dedupe on that before syncing.
    const { data: conns, error: connError } = await supabaseAdmin
      .from('xero_connections')
      .select('business_id, last_synced_at')
      .eq('is_active', true)
    if (connError) throw new Error(`connections query failed: ${connError.message}`)

    const staleness = new Map<string, string>() // raw business_id → oldest last_synced_at
    for (const c of conns ?? []) {
      if (!c.business_id) continue
      const prev = staleness.get(c.business_id)
      const cur = c.last_synced_at ?? '1970-01-01'
      if (!prev || cur < prev) staleness.set(c.business_id, cur)
    }

    // Stalest first, so a budget cut-off starves the freshest mirror, not the
    // stalest one — same rule as the sync-all-xero rotation.
    const rawIds = Array.from(staleness.entries())
      .sort((a, b) => (a[1] < b[1] ? -1 : 1))
      .map(([id]) => id)

    const seenCanonical = new Set<string>()
    const results: { business_id: string; tenants: number; errors: number }[] = []
    const skipped: string[] = []
    const allErrors: { business_id: string; tenant_id: string; error: string }[] = []

    for (const rawId of rawIds) {
      if (Date.now() - startedAt > TIME_BUDGET_MS) {
        // No silent caps: name what was left undone. Stalest-first means the
        // skipped businesses are the ones synced most recently.
        skipped.push(...rawIds.slice(rawIds.indexOf(rawId)))
        break
      }

      const ids = await resolveBusinessProfileIds(supabaseAdmin, rawId)
      if (seenCanonical.has(ids.businessId)) continue
      seenCanonical.add(ids.businessId)

      const { data: connections, error: bizConnError } = await supabaseAdmin
        .from('xero_connections')
        .select('*')
        .in('business_id', ids.all)
        .eq('is_active', true)
      if (bizConnError || !connections || connections.length === 0) {
        if (bizConnError) {
          allErrors.push({ business_id: ids.businessId, tenant_id: 'all', error: bizConnError.message })
        }
        continue
      }

      const result = await syncBusinessBSMirror(supabaseAdmin, ids.businessId, connections)
      results.push({
        business_id: ids.businessId,
        tenants: result.syncedTenantIds.length,
        errors: result.perTenantErrors.length,
      })
      for (const e of result.perTenantErrors) {
        allErrors.push({ business_id: ids.businessId, ...e })
      }
      // A month that failed to fetch was dropped from the stored grid by the
      // delete+insert swap, so the mirror silently shrank. Counted as an error:
      // otherwise a transient 429 on one of three months leaves the run
      // reporting clean success over a balance sheet missing a month.
      for (const m of result.missedMonths) {
        allErrors.push({
          business_id: ids.businessId,
          tenant_id: m.tenant_id,
          error: `month ${m.month} missing from stored mirror (${m.reason})`,
        })
      }
    }

    // ONE aggregated Sentry event per run, only when something went wrong —
    // per-tenant noise stays in the response/heartbeat metadata.
    if (allErrors.length > 0 || skipped.length > 0) {
      Sentry.captureMessage(
        `[BS Mirror Cron] ${allErrors.length} tenant error(s), ${skipped.length} business(es) skipped on time budget`,
        {
          level: 'warning' as any,
          tags: { cron: 'sync-bs-mirror', invariant: 'bs-mirror-refresh' },
          extra: { errors: allErrors.slice(0, 30), skipped },
        } as any,
      )
    }

    const status = allErrors.length === 0 && skipped.length === 0
      ? 'success'
      : results.length > 0 ? 'partial' : 'failed'
    await recordHeartbeat({
      cronPath: CRON_PATH,
      status,
      errorMessage: allErrors.length > 0 ? `${allErrors.length} tenant error(s)` : null,
      metadata: {
        businesses: results.length,
        tenants: results.reduce((s, r) => s + r.tenants, 0),
        skipped: skipped.length,
        duration_ms: Date.now() - startedAt,
      },
    })

    return NextResponse.json({
      success: true,
      businesses: results.length,
      tenants: results.reduce((s, r) => s + r.tenants, 0),
      errors: allErrors.length > 0 ? allErrors : undefined,
      skipped: skipped.length > 0 ? skipped : undefined,
    })
  } catch (error) {
    Sentry.captureException(error, {
      tags: { cron: 'sync-bs-mirror' },
      extra: { context: '[BS Mirror Cron] run failed' },
    } as any)
    await recordHeartbeat({
      cronPath: CRON_PATH,
      status: 'failed',
      errorMessage: error instanceof Error ? error.message : String(error),
    }).catch(() => { /* heartbeat is best-effort on the failure path */ })
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'BS mirror sync failed' },
      { status: 500 },
    )
  }
}

export const GET = withQuerySchema(
  'cron/sync-bs-mirror',
  z.object({}),
  getHandler as unknown as (request: Request) => Promise<Response>,
)
