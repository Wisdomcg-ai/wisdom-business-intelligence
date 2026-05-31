/**
 * ForecastReadService — Phase 44 D-13 / D-18.
 *
 * Single canonical read API for forecast + Xero PL data. Wraps the long-format
 * `xero_pl_lines` storage (Wave 2/5) and aggregates per-tenant rows into wide-shaped
 * DTOs for UI consumers. Per D-09 the long-format storage is hidden behind this
 * service — wizard / monthly report / cashflow / future client portal all see the
 * same wide shape.
 *
 * Asserts the D-18 runtime invariants on every read:
 *   - forecast_pl_lines.computed_at >= financial_forecasts.updated_at
 *     (assumptions live on financial_forecasts.assumptions JSONB; freshness is
 *     tracked by financial_forecasts.updated_at — see 44-06-SUMMARY.md "Important
 *     deviation" for why there is no `forecast_assumptions` table).
 *   - coverage.months_covered >= 0
 *
 * Violations throw a structured Error AND tag Sentry, matching the Phase 39
 * runtime-invariant pattern (see src/lib/business/resolveBusinessId.ts:54-67).
 *
 * Plan 44-07 (atomic save wiring) was abandoned and rolled back; the schema +
 * RPC from Wave 6 are still live, so the freshness invariant remains correct
 * for any forecast saved via the RPC path. Legacy serial-save rows may have
 * computed_at < financial_forecasts.updated_at and will throw — Wave 9
 * consumers must handle this surface (see 44-08-SUMMARY.md).
 *
 * Phase 44.1 D-44.1-08: invariants are gated by env var FORECAST_INVARIANTS_STRICT.
 * Default = false. Violations log to Sentry with tag `invariant_violation_logged`
 * and the service returns the row. Set to 'true' after 24-48h clean Sentry soak.
 */

import * as Sentry from '@sentry/nextjs'
import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveBusinessProfileIds } from '@/lib/business/resolveBusinessProfileIds'
// Phase 67-03 — FX engine wiring for multi-currency consolidated businesses.
import { needsFxConsolidation } from '@/lib/utils/needs-fx-consolidation'
import { buildConsolidation } from '@/lib/consolidation/engine'
import { loadFxRates, translatePLAtMonthlyAverage } from '@/lib/consolidation/fx'
import {
  generateFiscalMonthKeys,
  DEFAULT_YEAR_START_MONTH,
} from '@/lib/utils/fiscal-year-utils'

/**
 * Phase 44.1 D-44.1-08 — soft-fail invariant gate.
 *
 * Default = false (any value other than the literal string 'true'). When false,
 * invariant violations log to Sentry with tag `invariant_violation_logged` and
 * the service RETURNS the row anyway. When true, current strict behavior:
 * throw + Sentry tag `invariant`. The flip is operator-driven via Vercel env
 * vars (D-44.1-11 — 24-48h clean Sentry soak window before strict-on).
 */
const STRICT_INVARIANTS = process.env.FORECAST_INVARIANTS_STRICT === 'true'

/**
 * Dedupe key for `forecast_freshness` soft-fail captures.
 *
 * Why: GET /api/Xero/pl-summary fires on every page load. A single forecast
 * stuck with stale (or null) computed_at would otherwise spam Sentry hundreds
 * of times for the same condition. We capture once per (forecastId,
 * assumptions_updated_at) within a warm function instance; when assumptions
 * change, the key changes and we re-log the new violation.
 */
const freshnessViolationSeen = new Set<string>()

export type AccountType =
  | 'revenue'
  | 'cogs'
  | 'opex'
  | 'other_income'
  | 'other_expense'

/**
 * D-44.2-03 — quality tier for a (business_id, tenant_id) pair, rolled
 * up to business level via WORST-OF semantics across tenants (D-44.2-04).
 *
 * Severity order (high → low):
 *   failed > partial > no_sync > stale > verified
 *
 * The 44.2-09 banner dispatches on this enum. UI consumers MUST honor it
 * (faded-with-overlay when not 'verified' per CONTEXT.md UX decision).
 */
export type DataQuality = 'verified' | 'partial' | 'failed' | 'no_sync' | 'stale'

export interface PerTenantQuality {
  tenant_id: string
  data_quality: DataQuality
  /** sync_jobs.started_at of the latest row, or null when no syncs ever ran. */
  last_sync_at: string | null
  /** sync_jobs.status of the latest row, or null when no syncs ever ran. */
  last_sync_status: string | null
  /**
   * Total reconciler-flagged accounts across pl + bs sub-objects of the
   * latest sync_jobs.reconciliation. Surfaces as the per-tenant detail in
   * the 44.2-09 drawer.
   */
  discrepancy_count: number
}

/**
 * Severity rank for worst-of-tenants rollup (D-44.2-04). Higher number = worse.
 * Exported so 44.2-09 banner / drawer code can sort per-tenant lists.
 */
export const QUALITY_RANK: Record<DataQuality, number> = {
  verified: 0,
  stale: 1,
  no_sync: 2,
  partial: 3,
  failed: 4,
}

export interface MonthlyCompositeRow {
  account_code: string | null
  account_name: string
  account_type: AccountType
  /** Keys are 'YYYY-MM'. Sums across all tenants for the business. */
  monthly_values: Record<string, number>
}

export interface ForecastRow {
  account_code: string | null
  account_name: string
  category: string
  /** Keys are 'YYYY-MM'. Pass-through from forecast_pl_lines.forecast_months. */
  forecast_months: Record<string, number>
}

export interface CoverageRecord {
  months_covered: number
  first_period: string | null
  last_period: string | null
  /** 12 for single-FY view; callers can override via context. */
  expected_months: number
}

export interface MonthlyComposite {
  forecast_id: string
  business_id: string
  fiscal_year: number
  rows: MonthlyCompositeRow[]
  forecast_rows: ForecastRow[]
  coverage: CoverageRecord
  /** Earliest computed_at across forecast_pl_lines rows (oldest derivation). */
  computed_at: string | null
  /** financial_forecasts.updated_at — the assumptions freshness timestamp. */
  assumptions_updated_at: string | null
  /**
   * D-44.2-03 — read-path quality gate. Worst-of-tenants rollup across
   * every active xero_connections row for this business.
   */
  data_quality: DataQuality
  /** D-44.2-04 — per-tenant breakdown for the 44.2-09 drawer. */
  per_tenant_quality: PerTenantQuality[]
}

export interface CategorySubtotals {
  revenue: number
  cogs: number
  gross_profit: number
  opex: number
  net_profit: number
  other_income: number
  other_expense: number
}

export interface CashflowProjection {
  forecast_id: string
  /** Keys are 'YYYY-MM'. Sum of forecast_months with sign per category. */
  monthly_net: Record<string, number>
}

interface RawXeroRow {
  account_code: string | null
  account_name: string
  account_type: string
  period_month: string // 'YYYY-MM-DD'
  amount: number | string
  tenant_id: string
}

interface RawForecastRow {
  account_code: string | null
  account_name: string
  category: string
  forecast_months: Record<string, number> | null
  computed_at: string | null
}

const REVENUE_LIKE_CATEGORIES = new Set(['revenue', 'other_income'])

export class ForecastReadService {
  constructor(private supabase: SupabaseClient) {}

  /**
   * D-13 — wide-shaped DTO for wizard / monthly report.
   * D-09 — aggregates long-format xero_pl_lines per (account, period_month) across tenants.
   * D-14 — financial_forecasts is filtered by forecast_id (active-forecast contract enforced upstream).
   * D-18 — asserts computed_at freshness + non-negative coverage.
   */
  async getMonthlyComposite(forecastId: string): Promise<MonthlyComposite> {
    // 1. Load forecast row (filters by id; the unique_active_forecast_per_fy
    //    partial index guarantees active-forecast uniqueness at write time).
    const { data: forecast, error: fError } = await this.supabase
      .from('financial_forecasts')
      .select('id, business_id, fiscal_year, is_active, is_completed, updated_at')
      .eq('id', forecastId)
      .maybeSingle()

    if (fError || !forecast) {
      throw new Error(`[ForecastReadService] Forecast ${forecastId} not found`)
    }

    // 2. Resolve dual IDs at the API boundary (Phase 21+ pattern).
    const ids = await resolveBusinessProfileIds(this.supabase, forecast.business_id)

    // Phase 67-03 — multi-currency consolidation gate. Mirrors the gate in
    // historical-pl-summary.ts (Phase 67-02). When any active included tenant
    // has a non-AUD functional_currency, route the xero-row aggregation
    // through the consolidation engine (FX-translated via fx_rates) instead
    // of the direct xero_pl_lines fetch. Single-tenant / all-AUD remain on
    // the existing fast path — bit-identical. Emergency rollback:
    // FORECAST_FX_VIA_ENGINE_DISABLE=true.
    const fxEngineEnabled = process.env.FORECAST_FX_VIA_ENGINE_DISABLE !== 'true'
    const useFxEngine =
      fxEngineEnabled && (await needsFxConsolidation(this.supabase, ids.businessId))

    // 3. Load forecast_pl_lines + xero rows in parallel. Forecast rows always
    //    come from the direct table (the wizard saves in AUD); xero rows
    //    come from the engine in the multi-currency branch or the direct
    //    paginated read otherwise.
    //
    // xero_pl_lines is long-format (per Wave 2/5 migration); it has no
    // `fiscal_year` column — period_month is the time dimension. We do NOT
    // filter by date here — consumers (getHistoricalSummary's aggregatePeriod)
    // need to look back to the BASELINE fiscal year, which in planning-season
    // mode is currentFY-1 (up to 3 fiscal years before forecast.fiscal_year).
    //
    // Pagination is REQUIRED for the direct path: PostgREST/Supabase JS client
    // caps a single SELECT at 1000 rows by default. Multi-year tenants
    // (e.g. JDS has ~1830 rows over 22 months) silently truncate without
    // pagination, dropping COGS/OpEx accounts that fall after the first page
    // and producing zeroed-out aggregates that don't reconcile to Xero.
    const [plLinesRes, rowsFromXero] = await Promise.all([
      this.supabase
        .from('forecast_pl_lines')
        .select('account_code, account_name, category, forecast_months, computed_at')
        .eq('forecast_id', forecastId),
      useFxEngine
        ? this.loadXeroRowsViaFxEngine(ids.businessId, forecast.fiscal_year as number)
        : this.fetchAllXeroRows(ids.all).then((raw) => this.aggregateXeroRows(raw)),
    ])

    const assumptionsUpdatedAt: string | null = (forecast.updated_at as string) ?? null

    const forecastRowsRaw: RawForecastRow[] = (plLinesRes.data ?? []) as RawForecastRow[]

    // computed_at = MIN across forecast_pl_lines rows (oldest derivation wins —
    // any single stale row breaks the invariant).
    const computedAt: string | null = forecastRowsRaw.reduce<string | null>((min, r) => {
      if (!r.computed_at) return min
      if (!min) return r.computed_at
      return new Date(r.computed_at) < new Date(min) ? r.computed_at : min
    }, null)

    // 4. D-18 freshness invariant.
    this.assertComputedAtIsFresh(
      assumptionsUpdatedAt,
      computedAt,
      forecastId,
      forecast.is_completed === true,
    )

    // 5. xero rows already in wide MonthlyCompositeRow shape (either from FX
    //    engine projection or from the direct path's aggregateXeroRows).
    const rows = rowsFromXero

    // 6. Coverage from the aggregated wide shape.
    const coverage = this.computeCoverage(rows)
    this.assertCoverageNonNegative(coverage, forecastId)

    const forecastRows: ForecastRow[] = forecastRowsRaw.map((r) => ({
      account_code: r.account_code,
      account_name: r.account_name,
      category: r.category,
      forecast_months: (r.forecast_months ?? {}) as Record<string, number>,
    }))

    // 7. D-44.2-03 — quality gate (per-tenant + worst-of business).
    //    Reads sync_jobs LATEST per (business_id, tenant_id) using the
    //    sync_jobs_business_tenant_started_idx index from 44.2-02. Adds 1+N
    //    queries (xero_connections + 1 per tenant) — small per-call cost
    //    that gives every consumer the trustworthiness signal for free.
    const quality = await this.computeDataQuality(ids.all)

    return {
      forecast_id: forecastId,
      business_id: forecast.business_id as string,
      fiscal_year: forecast.fiscal_year as number,
      rows,
      forecast_rows: forecastRows,
      coverage,
      computed_at: computedAt,
      assumptions_updated_at: assumptionsUpdatedAt,
      data_quality: quality.data_quality,
      per_tenant_quality: quality.per_tenant_quality,
    }
  }

  /**
   * D-44.2-03 / D-44.2-04 — per-tenant data_quality, rolled up to business
   * level via worst-of severity. Public wrapper around the private helper
   * so consumers without a forecast (cashflow xero-actuals fallback,
   * coach dashboard aggregation) can still get the quality signal.
   *
   * Args: businessIds — already resolved via resolveBusinessProfileIds at the
   * caller boundary (avoids duplicate dual-ID resolution).
   */
  public async getDataQualityForBusiness(
    businessIds: string[],
  ): Promise<{ data_quality: DataQuality; per_tenant_quality: PerTenantQuality[] }> {
    return this.computeDataQuality(businessIds)
  }

  /**
   * D-44.2-03 / D-44.2-04 — read sync_jobs LATEST per (business_id,
   * tenant_id) for every active connection, then roll up to business level
   * via worst-of severity (failed > partial > no_sync > stale > verified).
   *
   * Returns 'no_sync' when the business has no active xero_connections at
   * all — neither "verified" nor "failed" is honest in that case (there's
   * nothing to verify against and nothing has failed; there's just no data).
   */
  private async computeDataQuality(
    businessIds: string[],
  ): Promise<{ data_quality: DataQuality; per_tenant_quality: PerTenantQuality[] }> {
    // 1. Active tenants for this business. Going through xero_connections
    //    rather than sync_jobs catches tenants that have never synced —
    //    those should report 'no_sync', not be silently absent.
    const { data: connections } = await this.supabase
      .from('xero_connections')
      .select('tenant_id, business_id')
      .in('business_id', businessIds)
      .eq('is_active', true)

    const tenants = new Set<string>()
    for (const c of (connections ?? []) as Array<{ tenant_id: string | null }>) {
      if (c.tenant_id) tenants.add(c.tenant_id)
    }

    // 2. Per-tenant: latest sync_jobs row → DataQuality.
    const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000 // 24h
    const now = Date.now()
    const perTenant: PerTenantQuality[] = []

    for (const tenantId of tenants) {
      const { data: latest } = await this.supabase
        .from('sync_jobs')
        .select('status, started_at, finished_at, reconciliation')
        .in('business_id', businessIds)
        .eq('tenant_id', tenantId)
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      let quality: DataQuality
      let lastSyncAt: string | null = null
      let lastSyncStatus: string | null = null
      let discrepancyCount = 0

      if (!latest) {
        quality = 'no_sync'
      } else {
        lastSyncAt = ((latest as any).started_at ?? null) as string | null
        lastSyncStatus = ((latest as any).status ?? null) as string | null
        // Post-06D the reconciliation jsonb has pl + bs sub-objects; legacy
        // pre-06D rows have flat discrepant_accounts. Sum both shapes so
        // existing rows still surface.
        const recon = (latest as any).reconciliation ?? {}
        const plDisc = (recon.pl?.discrepant_accounts?.length ?? 0) as number
        const bsUnbalanced = (recon.bs?.unbalanced_dates?.length ?? 0) as number
        const legacyDisc = (recon.discrepant_accounts?.length ?? 0) as number
        // Prefer the new shape when present, fall back to legacy field.
        discrepancyCount = plDisc + bsUnbalanced + (plDisc + bsUnbalanced > 0 ? 0 : legacyDisc)

        const status = lastSyncStatus
        if (status === 'success') {
          const ageMs = lastSyncAt ? now - new Date(lastSyncAt).getTime() : Infinity
          quality = ageMs > STALE_THRESHOLD_MS ? 'stale' : 'verified'
        } else if (status === 'partial') {
          quality = 'partial'
        } else if (status === 'error') {
          quality = 'failed'
        } else {
          // 'running' or unknown — no completed result to trust.
          quality = 'no_sync'
        }
      }

      perTenant.push({
        tenant_id: tenantId,
        data_quality: quality,
        last_sync_at: lastSyncAt,
        last_sync_status: lastSyncStatus,
        discrepancy_count: discrepancyCount,
      })
    }

    // 3. Worst-of severity → business-level.
    let business: DataQuality = perTenant.length === 0 ? 'no_sync' : 'verified'
    for (const t of perTenant) {
      if (QUALITY_RANK[t.data_quality] > QUALITY_RANK[business]) {
        business = t.data_quality
      }
    }

    return { data_quality: business, per_tenant_quality: perTenant }
  }

  /**
   * Single-month subtotals — Revenue / COGS / GP / OpEx / Net Profit
   * (+ Other Income / Other Expense for completeness).
   */
  async getCategorySubtotalsForMonth(
    forecastId: string,
    month: string, // 'YYYY-MM'
  ): Promise<CategorySubtotals> {
    const composite = await this.getMonthlyComposite(forecastId)
    const sumByType = (type: AccountType) =>
      composite.rows
        .filter((r) => r.account_type === type)
        .reduce((s, r) => s + (r.monthly_values[month] ?? 0), 0)

    const revenue = sumByType('revenue')
    const cogs = sumByType('cogs')
    const opex = sumByType('opex')
    const other_income = sumByType('other_income')
    const other_expense = sumByType('other_expense')

    return {
      revenue,
      cogs,
      gross_profit: revenue - cogs,
      opex,
      net_profit: revenue - cogs - opex + other_income - other_expense,
      other_income,
      other_expense,
    }
  }

  /**
   * Monthly cash projection rolled up from forecast_pl_lines.
   * Revenue + Other Income are positive; COGS, OpEx, Other Expense are negative.
   */
  async getCashflowProjection(forecastId: string): Promise<CashflowProjection> {
    const composite = await this.getMonthlyComposite(forecastId)
    const monthly_net: Record<string, number> = {}
    for (const fRow of composite.forecast_rows) {
      const cat = (fRow.category ?? '').toLowerCase()
      const sign = REVENUE_LIKE_CATEGORIES.has(cat) ? +1 : -1
      for (const [m, v] of Object.entries(fRow.forecast_months ?? {})) {
        monthly_net[m] = (monthly_net[m] ?? 0) + sign * Number(v)
      }
    }
    return { forecast_id: forecastId, monthly_net }
  }

  // ────────────────────────────────────────────────────────────────────────
  // Internal helpers
  // ────────────────────────────────────────────────────────────────────────

  /**
   * Paginated fetch of xero_pl_lines for all resolved business IDs.
   *
   * Supabase/PostgREST caps a single SELECT at 1000 rows. Without pagination,
   * multi-year tenants silently truncate — see Phase 44.1 hotfix
   * (2026-04-29) and the Step 2 reconciliation gap diagnosed via JDS (1830
   * rows total, 1000-row cap was dropping ~$5.3M COGS + $3.8M OpEx).
   */
  private async fetchAllXeroRows(businessIds: string[]): Promise<RawXeroRow[]> {
    const all: RawXeroRow[] = []
    const pageSize = 1000
    let from = 0
    while (true) {
      const { data, error } = await this.supabase
        .from('xero_pl_lines')
        .select('account_code, account_name, account_type, period_month, amount, tenant_id')
        .in('business_id', businessIds)
        .range(from, from + pageSize - 1)
      if (error) throw error
      if (!data || data.length === 0) break
      all.push(...(data as RawXeroRow[]))
      if (data.length < pageSize) break
      from += pageSize
    }
    return all
  }

  /**
   * Long → wide aggregation. Group by account_code (with account_name fallback
   * for null codes), then sum amount per period_month across all tenants.
   */
  /**
   * Phase 67-03 — FX-aware projection. Routes through the consolidation engine
   * for businesses with at least one non-AUD tenant. Two engine calls (prior
   * FY + current FY) cover the lookback window that aggregatePeriod() consumers
   * need; results are merged by (account_type, account_name) into the
   * MonthlyCompositeRow shape the rest of this service produces.
   *
   * Trade-off: the engine output does not surface per-line account_code (it
   * groups by alignment key). Downstream consumers that key on account_code
   * will see null in the multi-currency branch. None of the wizard's Step 2 /
   * Step 3 aggregations depend on account_code, but future consumers should
   * be aware.
   */
  private async loadXeroRowsViaFxEngine(
    businessId: string,
    fiscalYear: number,
  ): Promise<MonthlyCompositeRow[]> {
    const yearStartMonth = DEFAULT_YEAR_START_MONTH
    // Phase 67 follow-up — 36-month window (baseline + prior + current) so
    // planning-season baselines (fiscalYear-2 per calculateForecastPeriods)
    // are covered. A 24-month window skipped the baseline → consumer's
    // aggregatePeriod found no months and returned empty.
    const currentFyMonths = generateFiscalMonthKeys(fiscalYear, yearStartMonth)
    const priorFyMonths = generateFiscalMonthKeys(fiscalYear - 1, yearStartMonth)
    const baselineFyMonths = generateFiscalMonthKeys(fiscalYear - 2, yearStartMonth)
    const allMonths = [...baselineFyMonths, ...priorFyMonths, ...currentFyMonths]

    const translate = async (
      tenant: { functional_currency: string },
      lines: import('@/lib/consolidation/types').XeroPLLineLike[],
    ) => {
      const pair = `${tenant.functional_currency}/AUD`
      const rates = await loadFxRates(
        this.supabase as unknown as Parameters<typeof loadFxRates>[0],
        pair,
        'monthly_average',
        allMonths,
      )
      const { translated, missing } = translatePLAtMonthlyAverage(lines, rates)
      const ratesUsed: Record<string, number> = {}
      for (const [m, r] of rates.entries()) {
        ratesUsed[`${pair}::${m}`] = r
      }
      return { translated, missing, ratesUsed }
    }

    const [currentRep, priorRep, baselineRep] = await Promise.all([
      buildConsolidation(this.supabase, {
        businessId,
        reportMonth: currentFyMonths[currentFyMonths.length - 1],
        fiscalYear,
        fyMonths: currentFyMonths,
        translate,
      }),
      buildConsolidation(this.supabase, {
        businessId,
        reportMonth: priorFyMonths[priorFyMonths.length - 1],
        fiscalYear: fiscalYear - 1,
        fyMonths: priorFyMonths,
        translate,
      }),
      buildConsolidation(this.supabase, {
        businessId,
        reportMonth: baselineFyMonths[baselineFyMonths.length - 1],
        fiscalYear: fiscalYear - 2,
        fyMonths: baselineFyMonths,
        translate,
      }),
    ])

    // Merge consolidated lines from all three reports — same (account_type,
    // account_name) key, monthly_values unioned across the 36 months.
    const lineMap = new Map<string, MonthlyCompositeRow>()
    const ingest = (lines: { account_type: string; account_name: string; monthly_values: Record<string, number> }[]) => {
      for (const l of lines) {
        const key = `${l.account_type}::${l.account_name}`
        const existing = lineMap.get(key)
        if (existing) {
          Object.assign(existing.monthly_values, l.monthly_values)
        } else {
          lineMap.set(key, {
            account_code: null, // engine drops code; see helper doc above
            account_name: l.account_name,
            account_type: this.normalizeAccountType(l.account_type),
            monthly_values: { ...l.monthly_values },
          })
        }
      }
    }
    ingest(baselineRep.consolidated.lines)
    ingest(priorRep.consolidated.lines)
    ingest(currentRep.consolidated.lines)
    return Array.from(lineMap.values())
  }

  private aggregateXeroRows(xeroRows: ReadonlyArray<RawXeroRow>): MonthlyCompositeRow[] {
    const grouped = new Map<string, MonthlyCompositeRow>()
    for (const row of xeroRows) {
      const key = row.account_code ?? `NAME:${row.account_name}`
      let agg = grouped.get(key)
      if (!agg) {
        agg = {
          account_code: row.account_code,
          account_name: row.account_name,
          account_type: this.normalizeAccountType(row.account_type),
          monthly_values: {},
        }
        grouped.set(key, agg)
      }
      // 'YYYY-MM-DD' → 'YYYY-MM'
      const monthKey = (row.period_month ?? '').slice(0, 7)
      if (!monthKey) continue
      const amt = Number(row.amount)
      agg.monthly_values[monthKey] = (agg.monthly_values[monthKey] ?? 0) + (Number.isFinite(amt) ? amt : 0)
    }
    return [...grouped.values()]
  }

  private normalizeAccountType(raw: string | null | undefined): AccountType {
    switch (raw) {
      case 'revenue':
      case 'cogs':
      case 'opex':
      case 'other_income':
      case 'other_expense':
        return raw
      default:
        return 'opex'
    }
  }

  private computeCoverage(rows: ReadonlyArray<MonthlyCompositeRow>): CoverageRecord {
    const allMonths = new Set<string>()
    for (const r of rows) {
      for (const m of Object.keys(r.monthly_values)) allMonths.add(m)
    }
    const sorted = [...allMonths].sort()
    return {
      months_covered: sorted.length,
      first_period: sorted[0] ?? null,
      last_period: sorted.at(-1) ?? null,
      expected_months: 12,
    }
  }

  // ────────────────────────────────────────────────────────────────────────
  // D-18 invariant assertions
  // ────────────────────────────────────────────────────────────────────────

  private assertComputedAtIsFresh(
    assumptionsUpdatedAt: string | null,
    computedAt: string | null,
    forecastId: string,
    isCompleted: boolean,
  ): void {
    // Incomplete forecasts (wizard never finished) legitimately have no
    // forecast_pl_lines — the freshness invariant does not apply until the
    // forecast is actually built.
    if (!isCompleted) return
    if (!assumptionsUpdatedAt) return
    if (computedAt && new Date(computedAt) >= new Date(assumptionsUpdatedAt)) return

    const message =
      `[ForecastReadService] INVARIANT VIOLATED: forecast_pl_lines.computed_at (${computedAt}) ` +
      `is older than financial_forecasts.updated_at (${assumptionsUpdatedAt}) ` +
      `for forecast=${forecastId}. POST /api/forecast/${forecastId}/recompute to remediate.`

    const deltaSeconds =
      computedAt && assumptionsUpdatedAt
        ? Math.round(
            (new Date(assumptionsUpdatedAt).getTime() - new Date(computedAt).getTime()) / 1000,
          )
        : null

    if (STRICT_INVARIANTS) {
      const err = new Error(message)
      Sentry.captureException(err, {
        tags: { invariant: 'forecast_freshness', forecast_id: forecastId },
      })
      throw err
    } else {
      // Soft-fail: log + breadcrumb, then fall through to return the row.
      Sentry.addBreadcrumb({
        category: 'invariant',
        level: 'warning',
        message: 'forecast_freshness violation (logging-only)',
        data: {
          forecast_id: forecastId,
          computed_at: computedAt,
          assumptions_updated_at: assumptionsUpdatedAt,
          delta_seconds: deltaSeconds,
        },
      })
      const dedupeKey = `${forecastId}|${assumptionsUpdatedAt}`
      if (!freshnessViolationSeen.has(dedupeKey)) {
        freshnessViolationSeen.add(dedupeKey)
        Sentry.captureMessage('forecast_freshness violation (logging-only)', {
          level: 'warning',
          tags: { invariant_violation_logged: 'forecast_freshness', forecast_id: forecastId },
          extra: {
            delta_seconds: deltaSeconds,
            computed_at: computedAt,
            assumptions_updated_at: assumptionsUpdatedAt,
          },
        })
      }
    }
  }

  private assertCoverageNonNegative(coverage: CoverageRecord, forecastId: string): void {
    if (coverage.months_covered >= 0) return

    const message =
      `[ForecastReadService] INVARIANT VIOLATED: coverage.months_covered=${coverage.months_covered} ` +
      `for forecast=${forecastId}`

    if (STRICT_INVARIANTS) {
      const err = new Error(message)
      Sentry.captureException(err, {
        tags: { invariant: 'coverage_non_negative', forecast_id: forecastId },
      })
      throw err
    } else {
      Sentry.addBreadcrumb({
        category: 'invariant',
        level: 'warning',
        message: 'coverage_non_negative violation (logging-only)',
        data: { forecast_id: forecastId, months_covered: coverage.months_covered },
      })
      Sentry.captureMessage('coverage_non_negative violation (logging-only)', {
        level: 'warning',
        tags: { invariant_violation_logged: 'coverage_non_negative', forecast_id: forecastId },
        extra: { months_covered: coverage.months_covered },
      })
    }
  }
}

export function createForecastReadService(supabase: SupabaseClient): ForecastReadService {
  return new ForecastReadService(supabase)
}

/**
 * D-44.2-04 — aggregate data_quality across multiple businesses for the
 * coach dashboard. Returns the WORST quality across all businesses + a
 * per-business breakdown for the compact-aggregate banner variant in
 * 44.2-09.
 *
 * Resolves dual IDs at this boundary so callers (the dashboard) can pass
 * raw business_ids straight from their own list.
 */
export async function aggregateDataQualityAcrossBusinesses(
  supabase: SupabaseClient,
  businessIds: string[],
): Promise<{
  worst: DataQuality
  affectedCount: number
  totalCount: number
  perBusiness: Array<{ business_id: string; quality: DataQuality }>
}> {
  const service = createForecastReadService(supabase)
  const perBusiness = await Promise.all(
    businessIds.map(async (bid) => {
      const ids = await resolveBusinessProfileIds(supabase, bid)
      const result = await service.getDataQualityForBusiness(ids.all)
      return { business_id: bid, quality: result.data_quality }
    }),
  )
  const worst = perBusiness.reduce<DataQuality>(
    (acc, b) => (QUALITY_RANK[b.quality] > QUALITY_RANK[acc] ? b.quality : acc),
    'verified',
  )
  const affectedCount = perBusiness.filter((b) => b.quality !== 'verified').length
  return { worst, affectedCount, totalCount: perBusiness.length, perBusiness }
}
