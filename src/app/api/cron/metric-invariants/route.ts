import { NextRequest, NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { z } from 'zod'
import { createServiceRoleClient } from '@/lib/supabase/admin'
import { recordHeartbeat } from '@/lib/cron/heartbeat'
import { withQuerySchema } from '@/lib/api/with-schema'
import { checkSummaryParity } from '@/lib/forecast/summary-parity'
import { generateFiscalMonthKeys, DEFAULT_YEAR_START_MONTH } from '@/lib/utils/fiscal-year-utils'

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
/** Dollars of difference tolerated between an approved summary and its stored P&L.
 *  The materialiser rounds each line to cents, so a many-line forecast accumulates
 *  sub-dollar drift that is arithmetic, not error. $1 is comfortably above it and
 *  far below anything a coach would notice. */
const FORECAST_PARITY_TOLERANCE = 1

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

    // `xero_pl_lines` is LONG format (one row per account per period_month); the
    // wide `monthly_values` shape this checker reads exists only on the compat
    // view. Querying the table directly made every run fail with "column
    // xero_pl_lines.monthly_values does not exist" — so this cron has never
    // written a single row since it shipped, and the failure was only visible in
    // cron_heartbeats. The balance-sheet table above IS natively wide, which is
    // why only the P&L half was broken.
    //
    // basis='accruals' is required, not cosmetic: without it a future cash-basis
    // sync would return a second row per account and silently double every P&L
    // figure the invariants check.
    const { data: plData, error: plError } = await supabase
      .from('xero_pl_lines_wide_compat')
      .select('tenant_id, account_name, account_type, section, monthly_values')
      .eq('basis', 'accruals')
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

        // A month with NO data satisfies the equation trivially — 0 − 0 − 0 = 0 —
        // and would be recorded as a pass. A monitoring check that reports success
        // for absent data is worse than no check: it converts "we are not syncing
        // this tenant" into "this tenant is healthy". Distinguish the two.
        //
        // This is not hypothetical. Dragon Roofing has no balance-sheet rows at
        // all before June 2026, and those empty months read as passes — which is
        // what made the imbalance in its populated months look like a regression
        // that "started in June" rather than the standing condition it is.
        const grossMagnitude = bs.reduce((sum, l) => {
          const v = Number(l.monthly_values?.[bsMonth] ?? 0)
          return Number.isFinite(v) ? sum + Math.abs(v) : sum
        }, 0)
        const hasData = grossMagnitude > 0

        rows.push({
          run_at: runAt,
          check_name: 'bs_equation',
          family: 'identity',
          severity: 'watch',
          subject: tenantName,
          observed: hasData ? Math.abs(delta) : null,
          threshold: BS_EQUATION_TOLERANCE,
          passed: hasData && Math.abs(delta) <= BS_EQUATION_TOLERANCE,
          detail: hasData
            ? `${bsMonth}: assets ${round2(assets)} − liabilities ${round2(liabilities)} − equity ${round2(equity)} = ${delta}`
            : `${bsMonth}: no balance-sheet values for this tenant — cannot verify the equation`,
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

    // ── fx_rate_coverage ────────────────────────────────────────────────────
    //
    // FX-01 (26 Aug 2026). FX rates are entered MANUALLY by design (fx.ts
    // module doc, decision of 2026-04-18: no cron, no scraper). That design
    // has one failure mode: nobody remembers. Rates stopped on 2026-05-25 and
    // for three months IICT Group's HKD entity was summed into AUD at 1:1 —
    // ~5.3x overstated revenue on the /cfo dashboard, with nothing anywhere
    // saying so. fx.ts correctly refuses to fabricate a rate and reports the
    // gap; every consumer simply dropped the report.
    //
    // This check is the backstop the manual-entry design always needed: for
    // every ACTIVE non-AUD tenant that has P&L data in a month, assert an
    // fx_rates monthly_average row exists for that month. Anything > 0 means a
    // client's consolidated numbers are currently wrong by the FX factor.
    try {
      const { data: fxTenants } = await supabase
        .from('xero_connections')
        .select('tenant_id, tenant_name, functional_currency')
        .eq('is_active', true)
        .not('functional_currency', 'is', null)
        .neq('functional_currency', 'AUD')

      for (const t of fxTenants ?? []) {
        const pair = `${t.functional_currency}/AUD`

        // Months this tenant actually has P&L data for (last 12 months).
        const { data: plMonths } = await supabase
          .from('xero_pl_lines')
          .select('period_month')
          .eq('tenant_id', t.tenant_id)
          .is('deleted_at', null)
          .gte('period_month', new Date(Date.now() - 365 * 86400_000).toISOString().slice(0, 10))

        const monthsWithData = Array.from(
          new Set((plMonths ?? []).map((r) => String(r.period_month).slice(0, 7))),
        ).sort()

        const { data: fxRows } = await supabase
          .from('fx_rates')
          .select('period')
          .eq('currency_pair', pair)
          .eq('rate_type', 'monthly_average')

        const monthsWithRate = new Set(
          (fxRows ?? []).map((r) => String(r.period).slice(0, 7)),
        )
        const uncovered = monthsWithData.filter((m) => !monthsWithRate.has(m))

        rows.push({
          run_at: runAt,
          check_name: 'fx_rate_coverage',
          family: 'identity',
          severity: 'watch',
          subject: `${t.tenant_name ?? t.tenant_id} (${pair})`,
          observed: uncovered.length,
          threshold: 0,
          passed: uncovered.length === 0,
          detail: uncovered.length
            ? `months with P&L but NO ${pair} monthly_average rate: ${uncovered.join(', ')} — these values are summed UNTRANSLATED`
            : `all ${monthsWithData.length} months with P&L have a ${pair} rate`,
        })
      }
    } catch (err) {
      Sentry.captureException(err, {
        tags: { route: 'cron/metric-invariants', invariant: 'fx_rate_coverage' },
      } as any)
    }

    // ── forecast_summary_parity ─────────────────────────────────────────────
    //
    // Does each live forecast's STORED P&L still equal the summary the coach
    // approved? The Generate route checks this at publish time, but that only
    // covers forecasts published from now on — a budget that drifted months ago
    // stays wrong and invisible until someone regenerates it. This is the sweep
    // that finds the ones already broken.
    //
    // Subject is the business name, so a coach reading the daily email sees WHO
    // is affected rather than a forecast UUID. Watch severity per the house rule.
    {
      const { data: forecasts, error: fcError } = await supabase
        .from('financial_forecasts')
        .select('id, fiscal_year, wizard_state, business_id, business_profiles(business_name)')
        .eq('is_active', true)
      if (fcError) throw new Error(`forecast query failed: ${fcError.message}`)

      const live = ((forecasts ?? []) as any[]).filter(f => f.wizard_state && f.wizard_state.year1)

      for (const fc of live) {
        const name =
          (Array.isArray(fc.business_profiles) ? fc.business_profiles[0]?.business_name : fc.business_profiles?.business_name) ||
          fc.business_id ||
          fc.id

        const { data: lines, error: lineError } = await supabase
          .from('forecast_pl_lines')
          .select('category, forecast_months')
          .eq('forecast_id', fc.id)
        if (lineError) throw new Error(`forecast line query failed: ${lineError.message}`)

        const parity = checkSummaryParity(
          fc.wizard_state.year1,
          (lines ?? []) as { category?: string | null; forecast_months?: Record<string, number> | null }[],
          generateFiscalMonthKeys(fc.fiscal_year, DEFAULT_YEAR_START_MONTH),
          FORECAST_PARITY_TOLERANCE,
        )

        rows.push({
          run_at: runAt,
          check_name: 'forecast_summary_parity',
          family: 'identity',
          severity: 'watch',
          subject: `${name} FY${fc.fiscal_year}`,
          observed: parity.netProfit.difference,
          threshold: FORECAST_PARITY_TOLERANCE,
          passed: parity.matches,
          detail: parity.matches
            ? `stored P&L matches the approved summary across ${parity.monthsCovered} months`
            : parity.divergences
                .map(d => `${d.bucket}: approved ${d.approved} vs stored ${d.stored}`)
                .join('; '),
        })
      }
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
