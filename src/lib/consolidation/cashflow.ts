/**
 * Multi-Tenant Consolidated Cashflow Forecast — Phase 34, Iteration 34.2.
 *
 * Aggregates per-tenant cashflow forecasts produced by `src/lib/cashflow/engine.ts`
 * into a single combined 12-month forecast for a consolidation-parent business.
 *
 * POST-PIVOT ADAPTATION (see 34-CONTEXT.md + autonomous_mode brief):
 * The plan was written pre-pivot when each "member" had its own forecast. In
 * the pivoted tenant-model, a business has ONE active `financial_forecasts`
 * umbrella covering all its tenants. Pure per-tenant forecasts would require
 * schema changes that this iteration deliberately avoids.
 *
 * Pragmatic approach this module implements:
 *
 *   1. Business has one active forecast → load it + its PL lines + payroll +
 *      assumptions + planned spends + cashflow settings once.
 *   2. For each tenant, we invoke `generateCashflowForecast` with the SAME
 *      forecast baseline, BUT with a TENANT-SPECIFIC opening bank balance
 *      sourced from that tenant's `xero_balance_sheet_lines` (bank / asset
 *      accounts at fyStartDate). This is the key insight of the plan's KEY
 *      MATH note: opening balance is threaded PER-TENANT.
 *   3. Per-tenant engine output is mapped into the simplified
 *      `ConsolidatedCashflowMonth` shape (month, cash_in, cash_out,
 *      net_movement, opening_balance, closing_balance).
 *   4. `combineMemberForecasts` sums openings + per-month movements and
 *      re-threads the consolidated running balance. It does NOT reset any
 *      tenant's balance; the combine is strictly a sum-then-rethread pass.
 *
 * This intentionally duplicates the forecast baseline across tenants for
 * `cash_in / cash_out / net_movement` — a known simplification documented in
 * SUMMARY.md. A future plan can split the forecast per-tenant when `forecast_pl_lines`
 * grows a `tenant_id` column. Opening balance threading (the PDF-match-critical
 * math) works correctly today because bank balances ARE per-tenant on the BS.
 *
 * Reuse discipline: DOES NOT modify `src/lib/cashflow/engine.ts`. Orchestrates it.
 */

import { resolveBusinessProfileIds } from '@/lib/business/resolveBusinessProfileIds'
import {
  generateCashflowForecast,
  getDefaultCashflowAssumptions,
} from '@/lib/cashflow/engine'
import type {
  CashflowAssumptions,
  CashflowForecastData,
  FinancialForecast,
  PayrollSummary,
  PLLine,
} from '@/app/finances/forecast/types'
import { loadBusinessContext } from './engine'
import { loadClosingSpotRate } from './fx'
import type {
  ConsolidationBusiness,
  ConsolidationTenant,
  XeroPLLineLike,
} from './types'

/** A simplified cashflow row used by the consolidated 12-month table. */
export interface ConsolidatedCashflowMonth {
  month: string
  cash_in: number
  cash_out: number
  net_movement: number
  opening_balance: number
  closing_balance: number
}

/** Per-tenant cashflow column in the consolidated output. */
export interface ConsolidatedCashflowTenant {
  connection_id: string
  tenant_id: string
  business_id: string
  display_name: string
  display_order: number
  functional_currency: string
  months: ConsolidatedCashflowMonth[]
  /** In this org's functional currency — the consolidated total translates it. */
  opening_balance: number
  closing_balance: number
  /** True when the bank balance could not be read at all (not the same as $0). */
  opening_unknown?: boolean
}

/** Full consolidated cashflow response shape. */
export interface ConsolidatedCashflowReport {
  business: ConsolidationBusiness
  fiscalYear: number
  fyStartDate: string
  byTenant: ConsolidatedCashflowTenant[]
  consolidated: {
    months: ConsolidatedCashflowMonth[]
    opening_balance: number
    closing_balance: number
  }
  fx_context: {
    rates_used: Record<string, number>
    missing_rates: Array<{ currency_pair: string; period: string }>
  }
  diagnostics: {
    tenants_loaded: number
    forecast_available: boolean
    processing_ms: number
    /**
     * Human-readable flag documenting the pragmatic choice described in the
     * module header. Consumers can surface this in the UI so users understand
     * the forecast baseline is shared across tenants.
     */
    notes: string[]
  }
}

export interface BuildConsolidatedCashflowOpts {
  businessId: string
  fiscalYear: number
  fyMonths: readonly string[]
  /** 'YYYY-MM-DD' — first day of FY; used to source per-tenant opening balance. */
  fyStartDate: string
}

// ────────────────────────────────────────────────────────────────────────────
// Per-tenant opening balance loader
// ────────────────────────────────────────────────────────────────────────────

/** Month-end before the FY starts — the date an opening balance is as of ('YYYY-MM-DD'). */
export function priorMonthEndDate(fyStartDate: string): string {
  const [y, m] = fyStartDate.split('-').map(Number)
  // Day 0 of the FY-start month is the last day of the month before it.
  const end = new Date(y, m - 1, 0)
  const mm = String(end.getMonth() + 1).padStart(2, '0')
  const dd = String(end.getDate()).padStart(2, '0')
  return `${end.getFullYear()}-${mm}-${dd}`
}

/**
 * Read tenant-specific opening bank balance from `xero_balance_sheet_lines`.
 *
 * Strategy: sum asset-type rows where the account name looks like a bank
 * account ('bank', 'cash', 'current account', 'savings') using the month-prior
 * closing balance as the FY-start opening. Returns 0 when there is no data
 * (engine treats 0 opening as a valid input), and `null` when the read itself
 * failed — F2 (22 Sep 2026): a failed read was indistinguishable from a
 * genuinely empty bank, so an org's cash silently became $0 in the total.
 *
 * The figure is in the TENANT's functional currency; the caller translates it.
 */
async function loadTenantOpeningBankBalance(
  supabase: any,
  tenant: ConsolidationTenant,
  fyStartDate: string,
): Promise<number | null> {
  // Month-end prior to FY start = opening balance for FY start
  const [y, m] = fyStartDate.split('-').map(Number)
  const prior = new Date(y, m - 2, 1)  // previous month
  const priorMonthKey = `${prior.getFullYear()}-${String(prior.getMonth() + 1).padStart(2, '0')}`

  const ids = await resolveBusinessProfileIds(supabase, tenant.business_id)

  const { data, error } = await supabase
    .from('xero_balance_sheet_lines')
    .select('business_id, tenant_id, account_name, account_type, monthly_values')
    .in('business_id', ids.all)
    .eq('tenant_id', tenant.tenant_id)
    .eq('account_type', 'asset')

  if (error || !data) return null

  const BANK_KEYWORDS = ['bank', 'cash', 'current account', 'savings', 'cheque']
  let balance = 0
  for (const row of data as any[]) {
    const name = String(row.account_name ?? '').toLowerCase()
    const isBank = BANK_KEYWORDS.some((kw) => name.includes(kw))
    if (!isBank) continue
    const monthlyValues = row.monthly_values ?? {}
    // Prefer the prior month's closing balance; fall back to FY-start month
    // if prior is absent (e.g. business started mid-year).
    const priorValue = monthlyValues[priorMonthKey]
    const fyStartKey = fyStartDate.slice(0, 7)
    const fyStartValue = monthlyValues[fyStartKey]
    balance += Number(priorValue ?? fyStartValue ?? 0)
  }
  return balance
}


/**
 * The consolidated opening bank balance, in the presentation currency (F2).
 *
 * Every org's bank balance is in ITS functional currency. They were summed
 * as-is: IICT Group Limited's HK$1.83m counted as A$1.83m, overstating group
 * cash by roughly A$1.5m, while fx_context was hard-coded empty so nothing
 * said so. Each foreign balance is translated at the closing-spot rate for the
 * day it is as of (the day before the FY starts), exactly as the consolidated
 * balance sheet does.
 *
 * Never guesses: an org whose rate is missing, or whose balance could not be
 * read, is LEFT OUT of the total and named in `notes` / `missing_rates`, rather
 * than counted as though it were already in the presentation currency.
 */
export async function consolidatedOpeningBalance(
  tenants: Array<{
    display_name: string
    functional_currency: string
    opening_balance: number
    opening_unknown?: boolean
  }>,
  presentationCurrency: string,
  openingAsOf: string,
  loadRate: (currencyPair: string, asOf: string) => Promise<number | null>,
): Promise<{
  total: number
  rates_used: Record<string, number>
  missing_rates: Array<{ currency_pair: string; period: string }>
  notes: string[]
}> {
  const presentation = (presentationCurrency || 'AUD').toUpperCase()
  const rates_used: Record<string, number> = {}
  const missing_rates: Array<{ currency_pair: string; period: string }> = []
  const notes: string[] = []
  let total = 0

  for (const tenant of tenants) {
    if (tenant.opening_unknown) {
      notes.push(
        `${tenant.display_name}: bank balance could not be read, so it is not in the ` +
          `consolidated opening balance — the total is understated.`,
      )
      continue
    }
    const currency = (tenant.functional_currency || presentation).toUpperCase()
    if (currency === presentation) {
      total += tenant.opening_balance
      continue
    }
    const pair = `${currency}/${presentation}`
    let rate: number | null = null
    try {
      rate = await loadRate(pair, openingAsOf)
    } catch {
      rate = null
    }
    if (rate === null || !Number.isFinite(rate) || rate <= 0) {
      missing_rates.push({ currency_pair: pair, period: openingAsOf })
      notes.push(
        `${tenant.display_name}: no ${pair} closing rate for ${openingAsOf}, so its opening ` +
          `bank balance is left out of the consolidated total rather than counted as ${presentation}.`,
      )
      continue
    }
    rates_used[`${pair}::${openingAsOf}`] = rate
    total += tenant.opening_balance * rate
  }

  return { total, rates_used, missing_rates, notes }
}

// ────────────────────────────────────────────────────────────────────────────
// Baseline forecast loader (shared across tenants)
// ────────────────────────────────────────────────────────────────────────────

interface BusinessCashflowBaseline {
  forecast: FinancialForecast
  plLines: PLLine[]
  payrollSummary: PayrollSummary | null
  assumptions: CashflowAssumptions
  plannedSpends: any[]
  settings: any
  xeroAccounts: any[]
}

async function loadBusinessBaseline(
  supabase: any,
  businessId: string,
): Promise<BusinessCashflowBaseline | null> {
  const ids = await resolveBusinessProfileIds(supabase, businessId)

  // 1. Active forecast for the business. Prefer the business-level forecast
  //    (tenant_id IS NULL) as the consolidation baseline; fall back to whichever
  //    tenant-scoped forecast is most recent if no business-level forecast exists.
  //    Per-tenant cashflow breakdown is TODO — today we combine a single
  //    baseline with per-tenant opening bank balances via loadTenantOpeningBankBalance.
  const { data: nullTenantForecast } = await supabase
    .from('financial_forecasts')
    .select('*')
    .in('business_id', ids.all)
    .eq('is_active', true)
    .is('tenant_id', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  let forecast = nullTenantForecast
  if (!forecast) {
    // Fallback: any active forecast (most recent) — for per-tenant-mode businesses
    const { data: anyForecast } = await supabase
      .from('financial_forecasts')
      .select('*')
      .in('business_id', ids.all)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    forecast = anyForecast
  }
  if (!forecast) return null

  // 2. Forecast P&L lines
  const { data: plLinesData } = await supabase
    .from('forecast_pl_lines')
    .select('*')
    .eq('forecast_id', forecast.id)
  const plLines: PLLine[] = (plLinesData ?? []) as any

  // 3. Payroll summary (optional)
  const { data: payrollData } = await supabase
    .from('forecast_payroll_summary')
    .select('*')
    .eq('forecast_id', forecast.id)
    .maybeSingle()
  const payrollSummary: PayrollSummary | null = (payrollData ?? null) as any

  // 4. Cashflow assumptions — stored on financial_forecasts.assumptions.cashflow
  // (confirmed via src/app/api/forecast/cashflow/assumptions/route.ts)
  const defaults = getDefaultCashflowAssumptions()
  const savedAssumptions = (forecast as any).assumptions?.cashflow ?? {}
  const assumptions: CashflowAssumptions = {
    ...defaults,
    ...savedAssumptions,
    loans: savedAssumptions.loans || [],
    planned_stock_changes: savedAssumptions.planned_stock_changes || {},
  }

  // 5. Planned spends — stored on financial_forecasts.assumptions.plannedSpends
  // (confirmed via src/app/finances/forecast/components/wizard-v4/useForecastWizard.ts)
  const plannedSpends: any[] = (forecast as any).assumptions?.plannedSpends ?? []

  // 6. Calxa-standard settings (Phase 28.2) — optional
  const { data: settings } = await supabase
    .from('cashflow_settings')
    .select('*')
    .eq('forecast_id', forecast.id)
    .maybeSingle()

  // 7. Xero accounts lookup (Phase 28.2) — used for explicit-account depreciation resolution
  const { data: xeroAccounts } = await supabase
    .from('xero_accounts')
    .select('*')
    .in('business_id', ids.all)

  return {
    forecast: forecast as any,
    plLines,
    payrollSummary,
    assumptions,
    plannedSpends,
    settings: settings ?? null,
    xeroAccounts: (xeroAccounts ?? []) as any,
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Engine output normaliser
// ────────────────────────────────────────────────────────────────────────────

/**
 * Map the cashflow engine's rich output into the simplified month shape this
 * module exposes. The engine returns many per-month fields (income_lines,
 * cogs_lines, expense_groups, asset_lines, liability_lines…); the consolidated
 * view only shows the aggregate cash_in / cash_out / net / open / close. The
 * engine's `cash_inflows` + `other_inflows` contribute to cash_in; the engine's
 * `cash_outflows` plus any negative asset/liability movements contribute to
 * cash_out. net = cash_in - cash_out by construction.
 */
function normaliseEngineOutput(
  engine: CashflowForecastData,
  fyMonths: readonly string[],
): ConsolidatedCashflowMonth[] {
  const byMonth = new Map<string, ConsolidatedCashflowMonth>()
  for (const m of engine.months ?? []) {
    // Positive movements (asset disposal, liability increase) feed cash_in;
    // negative movements (asset purchase, liability repayment) feed cash_out.
    const assetInflow = Math.max(0, m.movement_in_assets ?? 0)
    const assetOutflow = Math.max(0, -(m.movement_in_assets ?? 0))
    const liabInflow = Math.max(0, m.movement_in_liabilities ?? 0)
    const liabOutflow = Math.max(0, -(m.movement_in_liabilities ?? 0))

    const cashIn =
      (m.cash_inflows ?? 0) + (m.other_inflows ?? 0) + assetInflow + liabInflow
    const cashOut = (m.cash_outflows ?? 0) + assetOutflow + liabOutflow
    const netMovement = m.net_movement ?? cashIn - cashOut

    byMonth.set(m.month, {
      month: m.month,
      cash_in: cashIn,
      cash_out: cashOut,
      net_movement: netMovement,
      opening_balance: m.bank_at_beginning ?? 0,
      closing_balance: m.bank_at_end ?? 0,
    })
  }

  // Align to requested 12-month window (fills gaps with zero-rows).
  return fyMonths.map((mk) => {
    const found = byMonth.get(mk)
    if (found) return found
    return {
      month: mk,
      cash_in: 0,
      cash_out: 0,
      net_movement: 0,
      opening_balance: 0,
      closing_balance: 0,
    }
  })
}

// ────────────────────────────────────────────────────────────────────────────
// Pure combine helper (unit-tested)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Combine per-tenant forecasts into a single consolidated 12-month series.
 *
 * INPUTS: each tenant's pre-threaded 12-month series + its starting opening
 * balance. The tenant's `months[].opening_balance / closing_balance` are NOT
 * consulted by this function — only `net_movement`, `cash_in`, `cash_out`.
 * That preserves per-tenant running-balance semantics in the `byTenant` view
 * AND ensures the consolidated running balance is recomputed from scratch
 * (combined opening + combined monthly net, threaded).
 *
 * GUARANTEES:
 *   1. Opening balance = Σ tenants' opening balances
 *   2. Each month's combined net = Σ tenants' net_movement for that month
 *   3. Consolidated closing[i] == consolidated opening[i+1] (threading)
 *   4. Inputs are not mutated
 *   5. Empty members array returns a zero-filled 12-month shell
 */
export function combineMemberForecasts(
  members: Array<{
    opening_balance: number
    closing_balance?: number
    months: ConsolidatedCashflowMonth[]
  }>,
  fyMonths: readonly string[],
): { opening_balance: number; closing_balance: number; months: ConsolidatedCashflowMonth[] } {
  // Initialise 12-month accumulator
  const combinedMonths: ConsolidatedCashflowMonth[] = fyMonths.map((mk) => ({
    month: mk,
    cash_in: 0,
    cash_out: 0,
    net_movement: 0,
    opening_balance: 0,
    closing_balance: 0,
  }))

  // Sum opening balances + per-month movements across tenants.
  let combinedOpening = 0
  for (const member of members) {
    combinedOpening += member.opening_balance
    for (const mm of member.months) {
      const idx = combinedMonths.findIndex((c) => c.month === mm.month)
      if (idx === -1) continue
      combinedMonths[idx].cash_in += mm.cash_in
      combinedMonths[idx].cash_out += mm.cash_out
      combinedMonths[idx].net_movement += mm.net_movement
    }
  }

  // Thread combined running balance: open[0] = combinedOpening;
  // close[i] = open[i] + net[i]; open[i+1] = close[i].
  let running = combinedOpening
  for (const cm of combinedMonths) {
    cm.opening_balance = running
    cm.closing_balance = running + cm.net_movement
    running = cm.closing_balance
  }

  return {
    opening_balance: combinedOpening,
    closing_balance: running,
    months: combinedMonths,
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Main entry point
// ────────────────────────────────────────────────────────────────────────────

export async function buildConsolidatedCashflow(
  supabase: any,
  opts: BuildConsolidatedCashflowOpts,
): Promise<ConsolidatedCashflowReport> {
  const startedAt = Date.now()

  // 1. Load business + tenants (reuse P&L engine helper)
  const { business, tenants } = await loadBusinessContext(supabase, opts.businessId)

  // 2. Load shared forecast baseline (single umbrella per business)
  const baseline = await loadBusinessBaseline(supabase, opts.businessId)
  const notes: string[] = []
  if (!baseline) {
    notes.push(
      'No active forecast found for this business — cashflow shows zero movements. ' +
        'Create a forecast under Finances → Forecast to populate.',
    )
  } else {
    notes.push(
      'Consolidated cashflow uses the business-level forecast baseline ' +
        '(P&L, payroll, assumptions, planned spends) across all tenants. ' +
        'Opening bank balance is threaded per-tenant from xero_balance_sheet_lines. ' +
        'A future iteration may split forecast inputs per-tenant once ' +
        'forecast_pl_lines grows a tenant_id column.',
    )
  }

  // 3. Per-tenant: load opening balance, invoke engine with tenant-specific
  // opening_bank_balance override, normalise output into the simplified shape.
  const byTenant: ConsolidatedCashflowTenant[] = await Promise.all(
    tenants.map(async (tenant) => {
      let tenantMonths: ConsolidatedCashflowMonth[]
      let tenantOpening = 0
      let openingUnknown = false

      if (baseline) {
        const loaded = await loadTenantOpeningBankBalance(
          supabase,
          tenant,
          opts.fyStartDate,
        )
        openingUnknown = loaded === null
        tenantOpening = loaded ?? 0

        // Override the assumption's opening_bank_balance with the tenant-
        // specific value. All other assumptions are shared.
        const tenantAssumptions: CashflowAssumptions = {
          ...baseline.assumptions,
          opening_bank_balance: tenantOpening,
        }

        const engineOutput = generateCashflowForecast(
          baseline.plLines,
          baseline.payrollSummary,
          tenantAssumptions,
          baseline.forecast,
          baseline.plannedSpends,
          {
            settings: baseline.settings,
            xeroAccounts: baseline.xeroAccounts,
            // capexByMonth: not loaded per-tenant — would require /api/forecast/cashflow/capex
            // call. Deferred: the engine treats undefined as empty, which is the correct
            // fallback until a tenant-scoped capex query exists.
          },
        )
        tenantMonths = normaliseEngineOutput(engineOutput, opts.fyMonths)
      } else {
        // No forecast → zero-filled 12-month series with 0 opening
        tenantMonths = opts.fyMonths.map((mk) => ({
          month: mk,
          cash_in: 0,
          cash_out: 0,
          net_movement: 0,
          opening_balance: 0,
          closing_balance: 0,
        }))
      }

      // Thread per-tenant running balance from tenantOpening.
      // (The engine already does this, but `normaliseEngineOutput` preserves
      // its outputs verbatim. If the engine's output was empty or misaligned,
      // we re-thread defensively.)
      let running = tenantOpening
      const threadedMonths = tenantMonths.map((tm) => {
        // Prefer the engine's bank_at_beginning/bank_at_end when they are
        // non-zero — they represent the engine's cumulative state including
        // opening balance. When the engine gave us a zero row (out of range
        // or no forecast), fall back to running balance.
        const open = tm.opening_balance || running
        const close = tm.closing_balance || open + tm.net_movement
        running = close
        return { ...tm, opening_balance: open, closing_balance: close }
      })
      const tenantClosing = running

      return {
        connection_id: tenant.connection_id,
        tenant_id: tenant.tenant_id,
        business_id: tenant.business_id,
        display_name: tenant.display_name,
        display_order: tenant.display_order,
        functional_currency: tenant.functional_currency,
        months: threadedMonths,
        opening_balance: tenantOpening,
        closing_balance: tenantClosing,
        opening_unknown: openingUnknown,
      }
    }),
  )

  // 4. Combine.
  //
  // NFM-01 (26 Aug 2026) — THE MULTIPLICATION BUG. `loadBusinessBaseline`
  // returns ONE business-wide forecast (there is a single umbrella forecast per
  // business; forecast_pl_lines has no tenant_id). Step 3 runs that same
  // baseline once PER TENANT, varying only `opening_bank_balance`, so every
  // tenant's cash_in/cash_out/net_movement series is bit-identical. Summing
  // those series across tenants therefore multiplied every cash movement by the
  // tenant count: Dragon Roofing (2 orgs) showed ~$19.9M of consolidated
  // receipts against a ~$9.9M baseline — exactly 2x — plus a closing balance
  // inflated by a whole extra year of net movement. A coach reading that would
  // give a client a cash-runway number that is double reality.
  //
  // Opening balances ARE genuinely per-tenant (real bank balances from the BS
  // mirror), so they still sum. The MOVEMENTS come from the single business-wide
  // baseline and must be counted ONCE. Feeding one synthetic member — the summed
  // opening plus one copy of the movement series — gives the correct total and
  // reuses the same threading logic.
  const businessWideMonths: ConsolidatedCashflowMonth[] =
    byTenant.length > 0
      ? byTenant[0].months
      : opts.fyMonths.map((mk) => ({
          month: mk,
          cash_in: 0,
          cash_out: 0,
          net_movement: 0,
          opening_balance: 0,
          closing_balance: 0,
        }))

  // F2 (22 Sep 2026): see consolidatedOpeningBalance — foreign bank balances
  // used to be summed into AUD one-for-one.
  const presentation = (business.presentation_currency || 'AUD').toUpperCase()
  const openingAsOf = priorMonthEndDate(opts.fyStartDate)
  const opening = await consolidatedOpeningBalance(
    byTenant,
    presentation,
    openingAsOf,
    (pair, asOf) => loadClosingSpotRate(supabase, pair, asOf),
  )
  const { rates_used, missing_rates } = opening
  const summedOpening = opening.total
  notes.push(...opening.notes)

  const combined = combineMemberForecasts(
    [{ opening_balance: summedOpening, months: businessWideMonths }],
    opts.fyMonths,
  )

  if (baseline && tenants.length > 1) {
    notes.push(
      `Cash movements are counted ONCE from the business-wide forecast, not summed ` +
        `across the ${tenants.length} connected organisations — the forecast is not ` +
        `tenant-scoped, so each organisation's row below repeats the same movement ` +
        `series. Only the opening balances differ per organisation.`,
    )
  }

  // Opening balances are translated above; the cash MOVEMENTS come from the one
  // business-wide forecast baseline (see step 4), already in the presentation currency.
  const fx_context = { rates_used, missing_rates }

  return {
    business,
    fiscalYear: opts.fiscalYear,
    fyStartDate: opts.fyStartDate,
    byTenant,
    consolidated: {
      months: combined.months,
      opening_balance: combined.opening_balance,
      closing_balance: combined.closing_balance,
    },
    fx_context,
    diagnostics: {
      tenants_loaded: tenants.length,
      forecast_available: baseline !== null,
      processing_ms: Date.now() - startedAt,
      notes,
    },
  }
}
