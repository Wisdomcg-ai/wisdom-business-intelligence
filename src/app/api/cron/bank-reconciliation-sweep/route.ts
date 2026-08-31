import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withQuerySchema } from '@/lib/api/with-schema'
import { createClient } from '@supabase/supabase-js'
import { getSupabaseSecretKey } from '@/lib/supabase/keys'
import * as Sentry from '@sentry/nextjs'
import { recordHeartbeat } from '@/lib/cron/heartbeat'
import { resolveBusinessProfileIds } from '@/lib/business/resolveBusinessProfileIds'
import { sweepTenant, persistTenantSweep } from '@/lib/reconciliation/sweep'

/**
 * Nightly bank-reconciliation sweep — 19:30 UTC (05:30 AEST), so the CFO
 * production board opens each morning with fresh "items to reconcile" counts,
 * after the 16:00 UTC sync-all-xero pass and before Matt's day starts.
 *
 * Per active tenant: count unreconciled items bucketed by transaction month
 * (Finance API statement lines when the org has consented the finance scopes;
 * Accounting API account transactions otherwise) into reconciliation_snapshots,
 * with the check outcome in reconciliation_checks. Distinct from
 * /api/cron/reconciliation-watch, which watches P&L/BS *ledger* reconciliation
 * drift in sync_jobs — this cron is about the bank reconcile queue.
 *
 * Load: per tenant ≈ 1 token refresh + 1 accounts lookup (cache-first) +
 * 1 call per bank account (or ≤10 fallback pages) — well under the
 * 60/min/tenant limit; fetchXeroWithRateLimit absorbs 429s.
 */
export const dynamic = 'force-dynamic'
export const maxDuration = 800

const CRON_PATH = '/api/cron/bank-reconciliation-sweep'

/** Stop starting new tenants past this point — leave headroom under
 *  maxDuration for the in-flight tenant to finish and the heartbeat to write. */
const TIME_BUDGET_MS = 720_000

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
    errorMessage: 'run started — not yet completed',
  }).catch(() => { /* best-effort marker; never block the run */ })

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    getSupabaseSecretKey(),
  )

  try {
    const { data: conns, error: connError } = await supabaseAdmin
      .from('xero_connections')
      .select('id, tenant_id, business_id')
      .eq('is_active', true)
    if (connError) throw new Error(`connections query failed: ${connError.message}`)

    // Dedupe on tenant_id (defensive — active rows should be unique per tenant).
    const byTenant = new Map<string, { id: string; tenant_id: string; business_id: string }>()
    for (const c of conns ?? []) {
      if (c.tenant_id && !byTenant.has(c.tenant_id)) byTenant.set(c.tenant_id, c)
    }

    // Stalest-check-first, so a budget cut-off starves the freshest check, not
    // the stalest one — same rule as the sync-all-xero rotation. Never-checked
    // tenants sort first.
    const { data: checks, error: checksError } = await supabaseAdmin
      .from('reconciliation_checks')
      .select('tenant_id, checked_at')
    if (checksError) throw new Error(`reconciliation_checks query failed: ${checksError.message}`)
    const lastChecked = new Map<string, string>()
    for (const check of checks ?? []) {
      if (check.tenant_id) lastChecked.set(check.tenant_id, check.checked_at ?? '1970-01-01')
    }
    const tenants = Array.from(byTenant.values()).sort((a, b) => {
      const ca = lastChecked.get(a.tenant_id) ?? '1970-01-01'
      const cb = lastChecked.get(b.tenant_id) ?? '1970-01-01'
      return ca < cb ? -1 : 1
    })

    const canonicalByRawId = new Map<string, string>()
    const results: { tenant_id: string; status: string; source: string; count: number }[] = []
    const skipped: string[] = []
    const allErrors: { tenant_id: string; error: string }[] = []

    for (const conn of tenants) {
      if (Date.now() - startedAt > TIME_BUDGET_MS) {
        // No silent caps: name what was left undone.
        skipped.push(...tenants.slice(tenants.indexOf(conn)).map(t => t.tenant_id))
        break
      }

      // Connection rows carry business_id in EITHER id-space (the #1 recurring
      // incident class) — resolve to canonical businesses.id for the FK.
      let canonicalId = canonicalByRawId.get(conn.business_id)
      if (!canonicalId) {
        const ids = await resolveBusinessProfileIds(supabaseAdmin, conn.business_id)
        canonicalId = ids.businessId
        canonicalByRawId.set(conn.business_id, canonicalId)
      }

      const result = await sweepTenant(supabaseAdmin, conn, canonicalId)
      const persistError = await persistTenantSweep(supabaseAdmin, result)

      results.push({
        tenant_id: conn.tenant_id,
        status: result.status,
        source: result.source,
        count: result.totalCount,
      })
      if (result.status === 'error') {
        allErrors.push({ tenant_id: conn.tenant_id, error: result.error ?? 'unknown' })
      }
      if (persistError) {
        allErrors.push({ tenant_id: conn.tenant_id, error: persistError })
      }
    }

    // ONE aggregated Sentry event per run, only when something went wrong —
    // per-tenant noise stays in the response/heartbeat metadata.
    if (allErrors.length > 0 || skipped.length > 0) {
      Sentry.captureMessage(
        `[Bank Rec Sweep] ${allErrors.length} tenant error(s), ${skipped.length} tenant(s) skipped on time budget`,
        {
          level: 'warning' as any,
          tags: { cron: 'bank-reconciliation-sweep', invariant: 'bank_rec_sweep' },
          extra: { errors: allErrors.slice(0, 30), skipped },
        } as any,
      )
    }

    const okCount = results.filter(r => r.status === 'ok').length
    const status = allErrors.length === 0 && skipped.length === 0
      ? 'success'
      : okCount > 0 ? 'partial' : 'failed'
    await recordHeartbeat({
      cronPath: CRON_PATH,
      status,
      errorMessage: allErrors.length > 0 ? `${allErrors.length} tenant error(s)` : null,
      metadata: {
        tenants: results.length,
        ok: okCount,
        statement_line_tenants: results.filter(r => r.source === 'statement_lines' && r.status === 'ok').length,
        skipped: skipped.length,
        duration_ms: Date.now() - startedAt,
      },
    })

    return NextResponse.json({
      success: true,
      tenants: results.length,
      ok: okCount,
      errors: allErrors.length > 0 ? allErrors : undefined,
      skipped: skipped.length > 0 ? skipped : undefined,
    })
  } catch (error) {
    Sentry.captureException(error, {
      tags: { cron: 'bank-reconciliation-sweep' },
      extra: { context: '[Bank Rec Sweep] run failed' },
    } as any)
    await recordHeartbeat({
      cronPath: CRON_PATH,
      status: 'failed',
      errorMessage: error instanceof Error ? error.message : String(error),
    }).catch(() => { /* heartbeat is best-effort on the failure path */ })
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Bank reconciliation sweep failed' },
      { status: 500 },
    )
  }
}

export const GET = withQuerySchema(
  'cron/bank-reconciliation-sweep',
  z.object({}),
  getHandler as unknown as (request: Request) => Promise<Response>,
)
