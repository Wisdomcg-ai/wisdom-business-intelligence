/**
 * The Subscription page (and, through it, Contractor Analysis), split where the
 * live Xero crawl ends and the database begins.
 *
 *   crawl     — posted bank transactions and bills, per account and vendor,
 *               plus the chart of accounts. Needs a Xero token, so it lives in
 *               /api/monthly-report/subscription-detail and nowhere else.
 *   assemble  — everything after: per-vendor budgets, budget-only vendors,
 *               the authoritative P&L and forecast totals, the leakage cards.
 *               Database reads only, shared with scripts/preview-pack.ts.
 *
 * The harness cannot crawl (taking a token can refresh it — a write), so it
 * builds a crawl from what the route itself persisted and hands it to the SAME
 * assembler; see crawlFromPersistedVendorActuals for exactly what that loses.
 *
 * The caller supplies the client and is responsible for authorisation.
 */
import * as Sentry from '@sentry/nextjs'
import { createVendorKey } from '@/lib/utils/vendor-normalization'
import { buildFuzzyLookup } from '@/lib/utils/account-matching'
import { resolveBusinessProfileIds } from '@/lib/business/resolveBusinessProfileIds'
import {
  expectedMonthlyBudget,
  classifyLeakage,
  type BudgetRowForVariance,
  type VendorActualForVariance,
} from '@/lib/subscriptions/variance'
import type { SubscriptionDetailData } from '@/app/finances/monthly-report/types'

type Client = any

export interface VendorAccumulation {
  vendor_name: string
  actual: number
  prior_actual: number
  /**
   * Current-month posted lines, so the UI can flag budget-only vendors ("not
   * billed this month") that surface with 0 actual.
   */
  transaction_count: number
}

export interface SubscriptionCrawl {
  /** Xero account code → account name, merged across orgs. */
  accountNames: Map<string, string>
  /** accountCode → vendorKey → accumulation. One entry per requested code. */
  vendorData: Map<string, Map<string, VendorAccumulation>>
  /**
   * Per-tenant current-month vendor totals, for the route's write-through:
   * tenant → vendorKey → { name, amount }. Kept per tenant so multi-org rows
   * land separably in subscription_vendor_actuals.
   */
  tenantMonthActuals: Map<string, Map<string, { name: string; amount: number }>>
  /** Orgs whose current and prior month were read in full. */
  completeTenants: Set<string>
}

export function newSubscriptionCrawl(accountCodes: string[]): SubscriptionCrawl {
  const vendorData = new Map<string, Map<string, VendorAccumulation>>()
  for (const code of accountCodes) vendorData.set(code, new Map())
  return { accountNames: new Map(), vendorData, tenantMonthActuals: new Map(), completeTenants: new Set() }
}

/**
 * One accumulation path for BOTH expense populations, so a vendor reads the
 * same whether the client pays by card or by bill. A line on an account that
 * was not requested is ignored. `vendorKey` defaults to createVendorKey of the
 * name — the crawl's own keying.
 */
export function addSubscriptionLine(
  crawl: SubscriptionCrawl,
  line: { accountCode: string; vendorName: string; vendorKey?: string; amount: number; isCurrent: boolean; tenantId: string },
): void {
  const accountVendors = crawl.vendorData.get(line.accountCode)
  if (!accountVendors) return
  const vendorKey = line.vendorKey ?? createVendorKey(line.vendorName)
  const existing = accountVendors.get(vendorKey)
  if (existing) {
    if (line.isCurrent) {
      existing.actual += line.amount
      existing.transaction_count += 1
    } else {
      existing.prior_actual += line.amount
    }
  } else {
    accountVendors.set(vendorKey, {
      vendor_name: line.vendorName,
      actual: line.isCurrent ? line.amount : 0,
      prior_actual: line.isCurrent ? 0 : line.amount,
      transaction_count: line.isCurrent ? 1 : 0,
    })
  }
  if (line.isCurrent) {
    let perTenant = crawl.tenantMonthActuals.get(line.tenantId)
    if (!perTenant) { perTenant = new Map(); crawl.tenantMonthActuals.set(line.tenantId, perTenant) }
    const cur = perTenant.get(vendorKey)
    if (cur) cur.amount += line.amount
    else perTenant.set(vendorKey, { name: line.vendorName, amount: line.amount })
  }
}

/** What the route answers with no account codes configured, or no Xero connection. */
export function emptySubscriptionDetail(reportMonth: string): SubscriptionDetailData {
  return { accounts: [], grand_total: { prior_month: 0, actual: 0, budget: 0, variance: 0 }, report_month: reportMonth || '' } as SubscriptionDetailData
}

export function priorMonthKeyOf(reportMonth: string): string {
  const [year, monthNum] = reportMonth.split('-').map(Number)
  const priorMonth = monthNum === 1 ? 12 : monthNum - 1
  const priorYear = monthNum === 1 ? year - 1 : year
  return `${priorYear}-${String(priorMonth).padStart(2, '0')}`
}

export interface SubscriptionAssembleInput {
  business_id: string
  report_month: string
  account_codes: string[]
}

export interface SubscriptionAssembleResult {
  data: SubscriptionDetailData
  /** The client's own subscription accounts — the route's write-through guard reads it. */
  configuredSubscriptionCodes: string[]
}

/**
 * Vendor rows: the crawl's posted-document actuals + subscription_budgets.
 * Account subtotals & grand total: the authoritative P&L actual
 * (xero_pl_lines) and forecast budget (forecast_pl_lines), so they match the
 * main report. All vendors appear as named rows — no "Other / Adjustments".
 *
 * Mutates `crawl.vendorData` (budget-only vendors are added as zero rows), as
 * the route always did before the split.
 */
export async function assembleSubscriptionDetail(
  supabase: Client,
  input: SubscriptionAssembleInput,
  crawl: SubscriptionCrawl,
): Promise<SubscriptionAssembleResult> {
  const { business_id, report_month, account_codes } = input
  const priorMonthKey = priorMonthKeyOf(report_month)

  // Fetch per-vendor budgets from subscription_budgets.
  // Need vendor_name + account_codes so we can backfill budget-only vendors
  // into crawl.vendorData (S2 — Phase 71-05): a budgeted vendor with no current-
  // month bank txn should still surface with actual=$0 and a "not billed"
  // badge in the UI, rather than vanishing from the response entirely.
  const budgetMap = new Map<string, number>()
  /**
   * vendor_key → department, straight off the per-vendor budget row. Carried
   * on the response so the Contractor Analysis page needs no second query
   * for the one fact Xero does not hold about a contractor.
   */
  const categoryMap = new Map<string, string | null>()
  type BudgetRow = {
    vendor_name: string
    vendor_key: string
    monthly_budget: number
    account_codes: string[] | null
    /** Department, for the Contractor Analysis rollup. Null for subscriptions. */
    category?: string | null
    frequency: string | null
    renewal_month: number | null
  }
  let budgetRows: BudgetRow[] = []
  try {
    const { data: budgets } = await supabase
      .from('subscription_budgets')
      .select('vendor_name, vendor_key, monthly_budget, account_codes, frequency, renewal_month, category')
      .eq('business_id', business_id)
      .eq('is_active', true)

    budgetRows = (budgets || []) as BudgetRow[]
    for (const b of budgetRows) {
      if (b.vendor_key) categoryMap.set(b.vendor_key, (b.category ?? null) || null)
      // CADENCE-AWARE expected figure, not the smoothed 1/12. The P&L
      // forecast smooths annual subs; the variance view must not — a $12k
      // renewal against a smoothed $1k budget reads as an $11k blowout in
      // its month and phantom savings in the other eleven, which trains
      // people to ignore this report. The renewal month carries the annual
      // amount; the other months expect $0.
      budgetMap.set(
        b.vendor_key,
        expectedMonthlyBudget(
          {
            vendor_key: b.vendor_key,
            vendor_name: b.vendor_name,
            monthly_budget: b.monthly_budget || 0,
            frequency: (b.frequency ?? null) as BudgetRowForVariance['frequency'],
            renewal_month: b.renewal_month,
          },
          report_month,
        ),
      )
    }
  } catch (err) {
    Sentry.captureException(err, { tags: { route: 'monthly-report/subscription-detail' }, extra: { context: "[SubscriptionDetail] Failed to fetch budgets" } } as any)
  }

  // S2 — Backfill budget-only vendors as zero-actual entries so the response
  // surfaces them. Iterates active subscription_budgets rows; for each
  // (account_code ∈ row.account_codes) that is in the requested account_codes
  // set, insert a placeholder if no bank-tx vendor already exists for that key.
  //
  // Keying: prefer the persisted `row.vendor_key` over a fresh
  // `createVendorKey(row.vendor_name)` because the bank-tx side keys by
  // `createVendorKey(extractVendorName(contact, desc))` — and extractVendorName
  // collapses through VENDOR_MAPPINGS (e.g. "Stripe Au" → "Stripe"), which
  // raw createVendorKey on the budget display name would NOT do. The persisted
  // `vendor_key` was originally derived through the same canonical path on save.
  for (const row of budgetRows) {
    const codes = Array.isArray(row.account_codes) ? row.account_codes : []
    for (const code of codes) {
      if (!account_codes.includes(code)) continue
      const accountVendors = crawl.vendorData.get(code)
      if (!accountVendors) continue
      const key = row.vendor_key || createVendorKey(row.vendor_name)
      if (accountVendors.has(key)) continue
      accountVendors.set(key, {
        vendor_name: row.vendor_name,
        actual: 0,
        prior_actual: 0,
        transaction_count: 0,
      })
    }
  }

  // ── Authoritative P&L actuals from xero_pl_lines (matches main report) ──
  const plActuals = new Map<string, number>()
  const plPriorActuals = new Map<string, number>()
  try {
    const accountNames = account_codes
      .map(code => crawl.accountNames.get(code))
      .filter((name): name is string => !!name)

    if (accountNames.length > 0) {
      // xero_pl_lines_wide_compat is business_profiles-space — all 969 rows in
      // prod, none in businesses-space. `business_id` arrives from the request
      // body in businesses-space, so filtering on it directly matched NOTHING
      // for every client: plActuals stayed empty and every account subtotal
      // silently fell through to the vendor-sum fallback below. The forecast
      // read further down already resolves both spaces; this one did not.
      const plIds = await resolveBusinessProfileIds(supabase, business_id)
      const { data: plLines } = await supabase
        .from('xero_pl_lines_wide_compat')
        .select('account_name, monthly_values')
        .in('business_id', plIds.all)
        .in('account_name', accountNames)

      for (const pl of (plLines || [])) {
        const values = pl.monthly_values || {}
        const code = account_codes.find(c => crawl.accountNames.get(c) === pl.account_name)
        if (code) {
          plActuals.set(code, Math.abs(values[report_month] || 0))
          plPriorActuals.set(code, Math.abs(values[priorMonthKey] || 0))
        }
      }
    }
  } catch (err) {
    Sentry.captureException(err, { tags: { route: 'monthly-report/subscription-detail' }, extra: { context: "[SubscriptionDetail] Failed to fetch P&L actuals" } } as any)
  }

  // ── Authoritative budget from forecast_pl_lines (matches main report) ──
  const plBudgets = new Map<string, number>()
  /** The client's own subscription accounts — see the write-through guard. */
  let configuredSubscriptionCodes: string[] = []
  try {
    const { data: settingsRow } = await supabase
      .from('monthly_report_settings')
      .select('budget_forecast_id, subscription_account_codes')
      .eq('business_id', business_id)
      .maybeSingle()

    configuredSubscriptionCodes = Array.isArray(settingsRow?.subscription_account_codes)
      ? (settingsRow!.subscription_account_codes as string[])
      : []

    let forecastId: string | null = settingsRow?.budget_forecast_id || null

    if (!forecastId) {
      // Resolve business_profiles.id from businesses.id
      const ids = await resolveBusinessProfileIds(supabase, business_id)
      const { data: fc } = await supabase
        .from('financial_forecasts')
        .select('id')
        .in('business_id', ids.all)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (fc) { forecastId = fc.id }
    }

    if (forecastId) {
      const { data: budgetPLLines } = await supabase
        .from('forecast_pl_lines')
        .select('id, account_name, forecast_months')
        .eq('forecast_id', forecastId)

      const { data: mappings } = await supabase
        .from('account_mappings')
        .select('xero_account_name, forecast_pl_line_id, forecast_pl_line_name')
        .eq('business_id', business_id)

      if (budgetPLLines && budgetPLLines.length > 0) {
        const budgetById = new Map<string, any>()
        for (const bl of budgetPLLines) budgetById.set(bl.id, bl)
        const findBudgetByName = buildFuzzyLookup(budgetPLLines as { id: string; account_name: string; forecast_months: Record<string, number> | null }[], (bl) => bl.account_name)

        const mappingByXeroName = new Map<string, any>()
        for (const m of (mappings || [])) mappingByXeroName.set(m.xero_account_name, m)

        for (const code of account_codes) {
          const xeroAccountName = crawl.accountNames.get(code)
          if (!xeroAccountName) continue

          const mapping = mappingByXeroName.get(xeroAccountName)
          let budgetLine: any = null

          if (mapping?.forecast_pl_line_id) {
            budgetLine = budgetById.get(mapping.forecast_pl_line_id)
          }
          if (!budgetLine && mapping?.forecast_pl_line_name) {
            budgetLine = findBudgetByName(mapping.forecast_pl_line_name)
          }
          if (!budgetLine) {
            budgetLine = findBudgetByName(xeroAccountName)
          }

          if (budgetLine) {
            const monthBudget = (budgetLine.forecast_months || {})[report_month] || 0
            plBudgets.set(code, Math.abs(monthBudget))
          }
        }
      }
    }
  } catch (err) {
    Sentry.captureException(err, { tags: { route: 'monthly-report/subscription-detail' }, extra: { context: "[SubscriptionDetail] Failed to fetch forecast budgets" } } as any)
  }

  // ── Build response ──
  // Vendor rows: individual bank txn actuals + subscription_budgets
  // Account subtotals & grand total: authoritative P&L / forecast figures
  let grandActual = 0
  let grandBudget = 0
  let grandPriorMonth = 0

  const accounts = account_codes
    .map(code => {
      const accountVendors = crawl.vendorData.get(code)!
      const vendors = Array.from(accountVendors.entries())
        .map(([vendorKey, data]) => {
          const budget = budgetMap.get(vendorKey) || 0
          return {
            vendor_name: data.vendor_name,
            vendor_key: vendorKey,
            prior_month_actual: Math.round(data.prior_actual * 100) / 100,
            actual: Math.round(data.actual * 100) / 100,
            budget: Math.round(budget * 100) / 100,
            variance: Math.round((budget - data.actual) * 100) / 100,
            transaction_count: data.transaction_count,
            category: categoryMap.get(vendorKey) ?? null,
          }
        })
        .sort((a, b) => a.vendor_name.localeCompare(b.vendor_name))

      // Vendor sums (used as fallback if no authoritative source)
      const vendorActualSum = vendors.reduce((s, v) => s + v.actual, 0)
      const vendorPriorSum = vendors.reduce((s, v) => s + v.prior_month_actual, 0)
      const vendorBudgetSum = vendors.reduce((s, v) => s + v.budget, 0)

      // Use authoritative totals for subtotals; fall back to vendor sums
      const totalActual = plActuals.has(code) ? plActuals.get(code)! : vendorActualSum
      const totalPrior = plPriorActuals.has(code) ? plPriorActuals.get(code)! : vendorPriorSum
      const totalBudget = plBudgets.has(code) ? plBudgets.get(code)! : vendorBudgetSum

      grandActual += totalActual
      grandBudget += totalBudget
      grandPriorMonth += totalPrior

      return {
        account_code: code,
        account_name: crawl.accountNames.get(code) || code,
        vendors,
        total_prior_month: Math.round(totalPrior * 100) / 100,
        total_actual: Math.round(totalActual * 100) / 100,
        total_budget: Math.round(totalBudget * 100) / 100,
        total_variance: Math.round((totalBudget - totalActual) * 100) / 100,
      }
    })
    .filter(a => a.vendors.length > 0)

  // ── Phase 3: leakage classification ──
  // Three lines a CFO actually acts on, computed from the same vendor rows
  // the table shows: NEW vendors billing with no budget (the biggest SME
  // leak), monthly vendors billing materially above budget (price creep),
  // and budgeted monthlies that billed NOTHING (possibly cancelled — the
  // inverse leak, an overstated budget masking overspend elsewhere).
  const vendorActualsFlat: VendorActualForVariance[] = []
  {
    const seen = new Map<string, VendorActualForVariance>()
    for (const accountVendors of crawl.vendorData.values()) {
      for (const [vendorKey, v] of accountVendors) {
        const cur = seen.get(vendorKey)
        if (cur) {
          cur.actual += v.actual
          cur.transaction_count += v.transaction_count
        } else {
          seen.set(vendorKey, {
            vendor_key: vendorKey,
            vendor_name: v.vendor_name,
            actual: v.actual,
            transaction_count: v.transaction_count,
          })
        }
      }
    }
    vendorActualsFlat.push(...seen.values())
  }
  const leakage = classifyLeakage(
    vendorActualsFlat,
    budgetRows.map((b) => ({
      vendor_key: b.vendor_key,
      vendor_name: b.vendor_name,
      monthly_budget: b.monthly_budget || 0,
      frequency: (b.frequency ?? null) as BudgetRowForVariance['frequency'],
      renewal_month: b.renewal_month,
    })),
    report_month,
  )

  return {
    data: {
      accounts,
      grand_total: {
        prior_month: Math.round(grandPriorMonth * 100) / 100,
        actual: Math.round(grandActual * 100) / 100,
        budget: Math.round(grandBudget * 100) / 100,
        variance: Math.round((grandBudget - grandActual) * 100) / 100,
      },
      report_month,
      leakage,
    } as SubscriptionDetailData,
    configuredSubscriptionCodes,
  }
}
