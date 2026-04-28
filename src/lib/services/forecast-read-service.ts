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
 */

import * as Sentry from '@sentry/nextjs'
import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveBusinessIds } from '@/lib/utils/resolve-business-ids'

export type AccountType =
  | 'revenue'
  | 'cogs'
  | 'opex'
  | 'other_income'
  | 'other_expense'

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
  fiscal_year: number
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
      .select('id, business_id, fiscal_year, is_active, updated_at')
      .eq('id', forecastId)
      .maybeSingle()

    if (fError || !forecast) {
      throw new Error(`[ForecastReadService] Forecast ${forecastId} not found`)
    }

    // 2. Resolve dual IDs at the API boundary (Phase 21+ pattern).
    const ids = await resolveBusinessIds(this.supabase, forecast.business_id)

    // 3. Load forecast_pl_lines + xero_pl_lines in parallel.
    const [plLinesRes, xeroRowsRes] = await Promise.all([
      this.supabase
        .from('forecast_pl_lines')
        .select('account_code, account_name, category, forecast_months, computed_at')
        .eq('forecast_id', forecastId),
      this.supabase
        .from('xero_pl_lines')
        .select('account_code, account_name, account_type, period_month, amount, tenant_id, fiscal_year')
        .in('business_id', ids.all)
        .eq('fiscal_year', forecast.fiscal_year),
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
    this.assertComputedAtIsFresh(assumptionsUpdatedAt, computedAt, forecastId)

    // 5. Aggregate xero_pl_lines from long → wide shape (D-09).
    const xeroRows: RawXeroRow[] = (xeroRowsRes.data ?? []) as RawXeroRow[]
    const rows = this.aggregateXeroRows(xeroRows)

    // 6. Coverage from the aggregated wide shape.
    const coverage = this.computeCoverage(rows)
    this.assertCoverageNonNegative(coverage, forecastId)

    const forecastRows: ForecastRow[] = forecastRowsRaw.map((r) => ({
      account_code: r.account_code,
      account_name: r.account_name,
      category: r.category,
      forecast_months: (r.forecast_months ?? {}) as Record<string, number>,
    }))

    return {
      forecast_id: forecastId,
      business_id: forecast.business_id as string,
      fiscal_year: forecast.fiscal_year as number,
      rows,
      forecast_rows: forecastRows,
      coverage,
      computed_at: computedAt,
      assumptions_updated_at: assumptionsUpdatedAt,
    }
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
   * Long → wide aggregation. Group by account_code (with account_name fallback
   * for null codes), then sum amount per period_month across all tenants.
   */
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
  ): void {
    if (!assumptionsUpdatedAt) return
    if (!computedAt || new Date(computedAt) < new Date(assumptionsUpdatedAt)) {
      const err = new Error(
        `[ForecastReadService] INVARIANT VIOLATED: forecast_pl_lines.computed_at (${computedAt}) ` +
          `is older than financial_forecasts.updated_at (${assumptionsUpdatedAt}) ` +
          `for forecast=${forecastId}. POST /api/forecast/${forecastId}/recompute to remediate.`,
      )
      Sentry.captureException(err, {
        tags: { invariant: 'forecast_freshness', forecast_id: forecastId },
      })
      throw err
    }
  }

  private assertCoverageNonNegative(coverage: CoverageRecord, forecastId: string): void {
    if (coverage.months_covered < 0) {
      const err = new Error(
        `[ForecastReadService] INVARIANT VIOLATED: coverage.months_covered=${coverage.months_covered} ` +
          `for forecast=${forecastId}`,
      )
      Sentry.captureException(err, {
        tags: { invariant: 'coverage_non_negative', forecast_id: forecastId },
      })
      throw err
    }
  }
}

export function createForecastReadService(supabase: SupabaseClient): ForecastReadService {
  return new ForecastReadService(supabase)
}
