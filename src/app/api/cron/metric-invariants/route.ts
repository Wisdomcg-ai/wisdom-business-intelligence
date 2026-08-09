import { NextRequest, NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { z } from 'zod'
import { createServiceRoleClient } from '@/lib/supabase/admin'
import { recordHeartbeat } from '@/lib/cron/heartbeat'
import { withQuerySchema } from '@/lib/api/with-schema'

/**
 * Metric invariants — daily plausibility checks over the Xero MIRROR.
 *
 * Every metric defect this platform has produced shares one shape: a number
 * that could not possibly be true, served with a straight face because nothing
 * ever asked "is this plausible?". This cron asks, once a day, entirely from
 * the database — zero Xero API calls. Sync-time reconciliation (reconcilePL +
 * the BS equation gate in the orchestrator) checks data AS IT ARRIVES; this
 * checks what is actually SITTING in the mirror serving reports, which is not
 * the same thing after partial writes, manual fixes, or dual-ID debris.
 *
 * v1 registry — three checks per tenant, deliberately small and correct:
 *   bs_equation        assets − liabilities − equity at the latest month (identity)
 *   bs_uncategorized   Σ|latest-month value| of section-less BS rows (identity)
 *   mirror_freshness   months since the newest P&L month in the mirror (freshness)
 *
 * EVERY check starts at 'watch' severity: recorded, shown in the daily email,
 * never paging. Promotion to warn/critical happens only after the observed
 * history proves a check quiet (the Pulse calibration rule — an uncalibrated
 * dispersion check fired 14 of 19 months). Never clamp a metric; never round
 * a failure away.
 *
 * Auth: fail-closed CRON_SECRET gate.
 */
export const dynamic = 'force-dynamic'
export const maxDuration = 120

const CRON_PATH = '/api/cron/metric-invariants'

/** $0.01 — books balance to the cent; the mirror must too. */
const BS_EQUATION_TOLERANCE = 0.01
/** Matches the R34 Gate-4 rule: uncategorized BS rows must net to nothing. */
const BS_UNCATEGORIZED_TOLERANCE = 0.01
/** Months of P&L content lag tolerated before the mirror reads as stale.
 *  2 = the current (incomplete) month plus one full missed month. */
const FRESHNESS_MAX_MONTHS_BEHIND = 2

interface InvariantRow {
  run_at: string
  check_name: string
  family: 'identity' | 'freshness'
  severity: 'watch' | 'warn' | 'critical'
  subject: string
  observed: number | null
  threshold: number | null
  passed: boolean
  detail: string | null
}

interface MirrorLine {
  tenant_id: string | null
  account_name: string
  account_type: string | null
  section: string | null
  monthly_values: Record<string, number> | null
}

/** Newest 'YYYY-MM'-shaped key across a set of monthly_values maps. */
function newestMonthKey(lines: MirrorLine[]): string | null {
  let newest: string | null = null
  for (const l of lines) {
    for (const k of Object.keys(l.monthly_values ?? {})) {
      if (!/^\d{4}-\d{2}/.test(k)) continue
      if (newest === null || k > newest) newest = k
    }
  }
  return newest
}

function monthsBetween(fromKey: string, to: Date): number {
  const [y, m] = fromKey.split('-').map(Number)
  return (to.getUTCFullYear() - y) * 12 + (to.getUTCMonth() + 1 - m)
}

const round2 = (n: number) => Math.round(n * 100) / 100

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
    const runAt = new Date().toISOString()
    const now = new Date()

    // Explicit error destructure everywhere — supabase-js resolves Postgres
    // errors instead of throwing, and a swallowed query failure here would make
    // "checker broke" indistinguishable from "everything passed".
    const { data: conns, error: connError } = await supabase
      .from('xero_connections')
      .select('tenant_id, tenant_name')
      .eq('is_active', true)
    if (connError) throw new Error(`connections query failed: ${connError.message}`)

    const tenants = Array.from(
      new Map(
        ((conns ?? []) as Array<{ tenant_id: string | null; tenant_name: string | null }>)
          .filter((c) => (c.tenant_id ?? '').trim() !== '')
          .map((c) => [c.tenant_id as string, c.tenant_name ?? (c.tenant_id as string)]),
      ).entries(),
    )

    const { data: bsData, error: bsError } = await supabase
      .from('xero_balance_sheet_lines')
      .select('tenant_id, account_name, account_type, section, monthly_values')
    if (bsError) throw new Error(`balance-sheet query failed: ${bsError.message}`)

    // xero_pl_lines is LONG format (period_month + amount, NO monthly_values
    // column) — selecting monthly_values from it throws and kills the whole run
    // (every check aborts before the tenant loop). The wide_compat VIEW pivots
    // period_month/amount into the monthly_values jsonb the MirrorLine shape
    // expects; the service-role client bypasses RLS so security_invoker is fine.
    const { data: plData, error: plError } = await supabase
      .from('xero_pl_lines_wide_compat')
      .select('tenant_id, account_name, account_type, section, monthly_values')
    if (plError) throw new Error(`P&L query failed: ${plError.message}`)

    const bsByTenant = new Map<string, MirrorLine[]>()
    for (const row of (bsData ?? []) as MirrorLine[]) {
      if (!row.tenant_id) continue
      const list = bsByTenant.get(row.tenant_id) ?? []
      list.push(row)
      bsByTenant.set(row.tenant_id, list)
    }
    const plByTenant = new Map<string, MirrorLine[]>()
    for (const row of (plData ?? []) as MirrorLine[]) {
      if (!row.tenant_id) continue
      const list = plByTenant.get(row.tenant_id) ?? []
      list.push(row)
      plByTenant.set(row.tenant_id, list)
    }

    const rows: InvariantRow[] = []

    for (const [tenantId, tenantName] of tenants) {
      const bs = bsByTenant.get(tenantId) ?? []
      const pl = plByTenant.get(tenantId) ?? []

      // ── bs_equation: assets − liabilities − equity at the latest month ──
      const bsMonth = newestMonthKey(bs)
      if (bsMonth) {
        let assets = 0
        let liabilities = 0
        let equity = 0
        for (const l of bs) {
          const v = Number(l.monthly_values?.[bsMonth] ?? 0)
          if (!Number.isFinite(v)) continue
          if (l.account_type === 'asset') assets += v
          else if (l.account_type === 'liability') liabilities += v
          else if (l.account_type === 'equity') equity += v
        }
        const delta = round2(assets - liabilities - equity)
        rows.push({
          run_at: runAt,
          check_name: 'bs_equation',
          family: 'identity',
          severity: 'watch',
          subject: tenantName,
          observed: Math.abs(delta),
          threshold: BS_EQUATION_TOLERANCE,
          passed: Math.abs(delta) <= BS_EQUATION_TOLERANCE,
          detail: `${bsMonth}: assets ${round2(assets)} − liabilities ${round2(liabilities)} − equity ${round2(equity)} = ${delta}`,
        })

        // ── bs_uncategorized: section-less rows must net to nothing ──
        let uncategorized = 0
        let uncategorizedCount = 0
        for (const l of bs) {
          if ((l.section ?? '').trim() !== '') continue
          const v = Number(l.monthly_values?.[bsMonth] ?? 0)
          if (!Number.isFinite(v) || v === 0) continue
          uncategorized += Math.abs(v)
          uncategorizedCount++
        }
        rows.push({
          run_at: runAt,
          check_name: 'bs_uncategorized',
          family: 'identity',
          severity: 'watch',
          subject: tenantName,
          observed: round2(uncategorized),
          threshold: BS_UNCATEGORIZED_TOLERANCE,
          passed: uncategorized <= BS_UNCATEGORIZED_TOLERANCE,
          detail: uncategorizedCount > 0 ? `${uncategorizedCount} uncategorized row(s) at ${bsMonth}` : null,
        })
      } else {
        rows.push({
          run_at: runAt,
          check_name: 'bs_equation',
          family: 'identity',
          severity: 'watch',
          subject: tenantName,
          observed: null,
          threshold: BS_EQUATION_TOLERANCE,
          passed: false,
          detail: 'no balance-sheet rows in the mirror for this tenant',
        })
      }

      // ── mirror_freshness: months since the newest P&L month ──
      const plMonth = newestMonthKey(pl)
      const monthsBehind = plMonth ? monthsBetween(plMonth, now) : null
      rows.push({
        run_at: runAt,
        check_name: 'mirror_freshness',
        family: 'freshness',
        severity: 'watch',
        subject: tenantName,
        observed: monthsBehind,
        threshold: FRESHNESS_MAX_MONTHS_BEHIND,
        passed: monthsBehind !== null && monthsBehind <= FRESHNESS_MAX_MONTHS_BEHIND,
        detail: plMonth ? `newest P&L month in mirror: ${plMonth}` : 'no P&L rows in the mirror for this tenant',
      })
    }

    // Persist ALL rows — pass and fail. History is what calibration reads.
    if (rows.length > 0) {
      const { error: insertError } = await supabase.from('metric_invariant_runs').insert(rows)
      if (insertError) throw new Error(`persisting invariant rows failed: ${insertError.message}`)
    }

    // Page only warn/critical failures. Everything is 'watch' in v1, so this
    // is deliberately silent until a check earns promotion — but the wiring is
    // live and tested from day one, not bolted on during an incident.
    const failures = rows.filter((r) => !r.passed)
    const paging = failures.filter((r) => r.severity === 'critical' || r.severity === 'warn')
    for (const f of paging) {
      try {
        Sentry.captureMessage(
          `metric invariant FAILED: ${f.check_name} for ${f.subject} — observed ${f.observed} vs threshold ${f.threshold}`,
          {
            level: f.severity === 'critical' ? 'error' : 'warning',
            tags: { invariant: 'metric_invariant_failed', check: f.check_name },
            extra: { subject: f.subject, observed: f.observed, threshold: f.threshold, detail: f.detail },
          } as any,
        )
      } catch { /* Sentry must never break the cron */ }
    }

    await recordHeartbeat({
      cronPath: CRON_PATH,
      status: 'success',
      metadata: {
        checksRun: rows.length,
        tenants: tenants.length,
        failed: failures.length,
        watchOnly: failures.filter((r) => r.severity === 'watch').length,
        paging: paging.length,
      },
    })

    return NextResponse.json({
      success: true,
      checksRun: rows.length,
      failed: failures.length,
      paging: paging.length,
    })
  } catch (err: any) {
    try {
      Sentry.captureException(err, { tags: { invariant: 'cron_metric_invariants' } } as any)
    } catch { /* nothing useful left to do */ }
    await recordHeartbeat({ cronPath: CRON_PATH, status: 'failed', errorMessage: String(err?.message ?? err) })
    return NextResponse.json({ success: false, error: String(err?.message ?? err) }, { status: 500 })
  }
}

export const GET = withQuerySchema(
  'cron/metric-invariants',
  z.object({}),
  getHandler as unknown as (request: Request) => Promise<Response>,
)
