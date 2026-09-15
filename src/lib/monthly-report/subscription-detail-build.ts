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
import { resolveBudget } from '@/lib/budgets/resolve-budget'
import { getFiscalYear, DEFAULT_YEAR_START_MONTH } from '@/lib/utils/fiscal-year-utils'
import { vendorsExceedAccount } from './commentary-money'
import { noBudgetBecause } from '@/app/finances/monthly-report/utils/budget-yardstick'
import {
  expectedMonthlyBudget,
  classifyLeakage,
  type BudgetRowForVariance,
  type VendorActualForVariance,
} from '@/lib/subscriptions/variance'
import type { SubscriptionAccountWindow, SubscriptionDetailData, SubscriptionUnconvertedLine } from '@/app/finances/monthly-report/types'

type Client = any

export interface VendorAccumulation {
  vendor_name: string
  /**
   * The gross document amount, as it has always been quoted: what every
   * client's default page, the leakage cards and the history row read, on the
   * same basis Step 6 seeded the vendor budgets on.
   */
  actual: number
  prior_actual: number
  /**
   * Current-month posted lines, so the UI can flag budget-only vendors ("not
   * billed this month") that surface with 0 actual.
   */
  transaction_count: number
  /**
   * The same months in the P&L's money — net of GST, in the organisation's
   * currency (subscriptionStatementLinesOf). Only a placement that opts in
   * prints these (see subscription-page's `basis`): against the gross vendor
   * budgets every other client's page carries, a net actual reads as a ~10%
   * saving on every Inclusive-billed vendor that nobody made.
   */
  statement_actual: number
  statement_prior_actual: number
  /**
   * Month → amount, gross and statement, for every line that named its month
   * (a caller that asked for a window). Absent otherwise, so the two-month
   * crawl every other page runs accumulates exactly what it always did.
   */
  months?: Record<string, number>
  statement_months?: Record<string, number>
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
  /**
   * accountCode → lines that could not be stated in the organisation's money (a
   * foreign document with no CurrencyRate). They are in no vendor's statement figure (the gross one has them), so
   * the page's Unallocated row carries them and the page says which they were.
   */
  unconverted: Map<string, SubscriptionUnconvertedLine[]>
  /**
   * True when every line carried its statement amount (the route's live
   * crawl). False for the stored history (the harness — see
   * crawlFromPersistedVendorActuals), which holds gross amounts only: its
   * vendor rows carry no `statement` figures, and rows past the P&L account
   * are expected there rather than an invariant breach to report.
   */
  statementAmounts: boolean
}

export function newSubscriptionCrawl(accountCodes: string[]): SubscriptionCrawl {
  const vendorData = new Map<string, Map<string, VendorAccumulation>>()
  for (const code of accountCodes) vendorData.set(code, new Map())
  return { accountNames: new Map(), vendorData, tenantMonthActuals: new Map(), completeTenants: new Set(), unconverted: new Map(), statementAmounts: false }
}

/**
 * One accumulation path for BOTH expense populations, so a vendor reads the
 * same whether the client pays by card or by bill. A line on an account that
 * was not requested is ignored. `vendorKey` defaults to createVendorKey of the
 * name — the crawl's own keying.
 *
 * `amount` is the gross document amount — the default page's figure, the
 * leakage cards' and the stored history's. `statementAmount` is the same line
 * in the P&L's money, for a placement that opts in; absent (the stored
 * history), the gross amount stands in, and the crawl's `statementAmounts`
 * stays false so no row claims a net figure it does not have.
 */
export function addSubscriptionLine(
  crawl: SubscriptionCrawl,
  line: {
    accountCode: string; vendorName: string; vendorKey?: string; amount: number; statementAmount?: number
    isCurrent: boolean; tenantId: string
    /** The line's month, for a caller that asked for a window. */
    month?: string
    /**
     * A month older than the month before: it is in `months` and nowhere else —
     * not the prior month's figure, and not this month's history row.
     */
    windowOnly?: boolean
  },
): void {
  const accountVendors = crawl.vendorData.get(line.accountCode)
  if (!accountVendors) return
  const vendorKey = line.vendorKey ?? createVendorKey(line.vendorName)
  const stated = line.statementAmount ?? line.amount
  let existing = accountVendors.get(vendorKey)
  if (line.windowOnly) {
    if (!line.month) return
    if (!existing) {
      // Paid in June and not since is still a contractor on a page that prints June.
      existing = { vendor_name: line.vendorName, actual: 0, prior_actual: 0, transaction_count: 0, statement_actual: 0, statement_prior_actual: 0 }
      accountVendors.set(vendorKey, existing)
    }
    addToMonth(existing, line.month, line.amount, stated)
    return
  }
  if (existing) {
    if (line.isCurrent) {
      existing.actual += line.amount
      existing.statement_actual += stated
      existing.transaction_count += 1
    } else {
      existing.prior_actual += line.amount
      existing.statement_prior_actual += stated
    }
  } else {
    accountVendors.set(vendorKey, {
      vendor_name: line.vendorName,
      actual: line.isCurrent ? line.amount : 0,
      prior_actual: line.isCurrent ? 0 : line.amount,
      transaction_count: line.isCurrent ? 1 : 0,
      statement_actual: line.isCurrent ? stated : 0,
      statement_prior_actual: line.isCurrent ? 0 : stated,
    })
  }
  if (line.month) addToMonth(accountVendors.get(vendorKey)!, line.month, line.amount, stated)
  if (line.isCurrent) {
    let perTenant = crawl.tenantMonthActuals.get(line.tenantId)
    if (!perTenant) { perTenant = new Map(); crawl.tenantMonthActuals.set(line.tenantId, perTenant) }
    const cur = perTenant.get(vendorKey)
    if (cur) cur.amount += line.amount
    else perTenant.set(vendorKey, { name: line.vendorName, amount: line.amount })
  }
}

function addToMonth(v: VendorAccumulation, month: string, amount: number, stated: number): void {
  v.months = v.months ?? {}
  v.statement_months = v.statement_months ?? {}
  v.months[month] = (v.months[month] ?? 0) + amount
  v.statement_months[month] = (v.statement_months[month] ?? 0) + stated
}

/** A line the crawl could not state in the organisation's currency. */
export function addUnconvertedLine(crawl: SubscriptionCrawl, accountCode: string, line: SubscriptionUnconvertedLine): void {
  if (!crawl.vendorData.has(accountCode)) return
  const list = crawl.unconverted.get(accountCode) ?? []
  list.push(line)
  crawl.unconverted.set(accountCode, list)
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

/** One row of xero_pl_lines_wide_compat, as the account totals read it. */
export interface SubscriptionPlRow {
  tenant_id: string | null
  account_id?: string | null
  account_code?: string | null
  account_type?: string | null
  section?: string | null
  account_name: string
  monthly_values: Record<string, number> | null
}

/**
 * The page's account totals — this month, last month and the window — from
 * the P&L mirror, keyed by the configured account code.
 */
export function sumSubscriptionPlActuals(
  plLines: readonly SubscriptionPlRow[],
  opts: {
    accountCodes: readonly string[]
    accountNames: ReadonlyMap<string, string>
    reportMonth: string
    priorMonth: string
    windowMonths: readonly string[]
  },
): { actuals: Map<string, number>; priorActuals: Map<string, number>; windowActuals: Map<string, Record<string, number>> } {
  const { accountCodes, accountNames, reportMonth, priorMonth, windowMonths } = opts
  const actuals = new Map<string, number>()
  const priorActuals = new Map<string, number>()
  const windowActuals = new Map<string, Record<string, number>>()
  // The view is one row per LEDGER row: org × account_id × code × section.
  // A business with two orgs on the account (Dragon Roofing: 485
  // Subscriptions in both) has a row per org, and an org carries a row per
  // superseded account_id too — Dragon + Easy Hail have 62 stale mirror rows,
  // same name, nothing in 2026. Kept per org with `set`, whichever row came
  // back last won, so the total depended on read order (DRG-34): Easy Hail's
  // stale 0 read after its live 1,786 dropped August to 4,729.08.
  //
  // So each org's rows are SUMMED — a superseded row adds only the months it
  // holds — then made absolute per org and added across orgs. The key leaves
  // out business_id only, so a row read once per id-space is counted once.
  // Orgs in different currencies are summed as the vendor rows are; the
  // response's statement_unavailable is what says so.
  const perTenant = new Map<string, Map<string, Map<string, Record<string, number>>>>()
  for (const pl of plLines) {
    const code = accountCodes.find(c => accountNames.get(c) === pl.account_name)
    if (!code) continue
    const byTenant = perTenant.get(code) ?? new Map<string, Map<string, Record<string, number>>>()
    const tenant = pl.tenant_id ?? ''
    const ledgerRows = byTenant.get(tenant) ?? new Map<string, Record<string, number>>()
    const ledgerKey = [pl.account_id, pl.account_code, pl.account_type, pl.section].map(v => v ?? '').join('|')
    ledgerRows.set(ledgerKey, pl.monthly_values || {})
    byTenant.set(tenant, ledgerRows)
    perTenant.set(code, byTenant)
  }
  for (const [code, byTenant] of perTenant) {
    let actual = 0
    let prior = 0
    const window: Record<string, number> = {}
    for (const ledgerRows of byTenant.values()) {
      const month = (m: string) => Math.abs([...ledgerRows.values()].reduce((sum, values) => sum + (values[m] || 0), 0))
      actual += month(reportMonth)
      prior += month(priorMonth)
      for (const m of windowMonths) window[m] = (window[m] ?? 0) + month(m)
    }
    actuals.set(code, Math.round(actual * 100) / 100)
    priorActuals.set(code, Math.round(prior * 100) / 100)
    if (windowMonths.length > 0) {
      for (const m of windowMonths) window[m] = Math.round(window[m] * 100) / 100
      windowActuals.set(code, window)
    }
  }
  return { actuals, priorActuals, windowActuals }
}

export interface SubscriptionAssembleInput {
  business_id: string
  report_month: string
  account_codes: string[]
  /**
   * Months to report each account and vendor across (contractor-page windowMonthKeys), for a
   * page that prints more than this month and last. Empty or absent: no
   * `window` on the answer, and no extra read — the page every client has.
   */
  window_months?: string[]
}

export interface SubscriptionAssembleResult {
  data: SubscriptionDetailData
  /** The client's own subscription accounts — the route's write-through guard reads it. */
  configuredSubscriptionCodes: string[]
}

/**
 * Vendor rows: the crawl's posted-document actuals + subscription_budgets.
 * Account subtotals & grand total: the authoritative P&L actual
 * (xero_pl_lines) and the budget the statement pages use — the approved budget
 * for a budget-store client, the forecast otherwise — so they match the main
 * report. All vendors appear as named rows; what the rows do not account for is
 * left to the page (its Unallocated row), not hidden in an "Other" vendor.
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
  const windowMonths = input.window_months ?? []

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

    // Only the rows budgeted on an account this page asked for. The crawl reads
    // those accounts and no others, so a row on any other account can never
    // meet an actual here: Urban Road's 15 monthly contractor rows on 61400
    // ($30,081 a month) would each read as a subscription "lapsed, still
    // budgeted" on a page that asked for 63700, and a vendor budgeted on both
    // would lend this page the other account's figure. A row that records no
    // account cannot be said to be elsewhere, so it stays, as it always has.
    budgetRows = ((budgets || []) as BudgetRow[]).filter((b) =>
      !Array.isArray(b.account_codes) || b.account_codes.length === 0 || b.account_codes.some((c) => account_codes.includes(c)))
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
        statement_actual: 0,
        statement_prior_actual: 0,
      })
    }
  }

  // ── Authoritative P&L actuals from xero_pl_lines (matches main report) ──
  const plActuals = new Map<string, number>()
  const plPriorActuals = new Map<string, number>()
  /** code → month → the ledger's figure, over the window (when one was asked for). */
  const plWindowActuals = new Map<string, Record<string, number>>()
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
        .select('tenant_id, account_id, account_code, account_type, section, account_name, monthly_values')
        .in('business_id', plIds.all)
        .in('account_name', accountNames)

      const totals = sumSubscriptionPlActuals(plLines || [], {
        accountCodes: account_codes,
        accountNames: crawl.accountNames,
        reportMonth: report_month,
        priorMonth: priorMonthKey,
        windowMonths,
      })
      for (const [code, v] of totals.actuals) plActuals.set(code, v)
      for (const [code, v] of totals.priorActuals) plPriorActuals.set(code, v)
      for (const [code, v] of totals.windowActuals) plWindowActuals.set(code, v)
    }
  } catch (err) {
    Sentry.captureException(err, { tags: { route: 'monthly-report/subscription-detail' }, extra: { context: "[SubscriptionDetail] Failed to fetch P&L actuals" } } as any)
  }

  /** code → the matched forecast line's months, kept for the window (readForecastBudgets). */
  const forecastWindowMonths = new Map<string, Record<string, number>>()
  /**
   * The forecast line's budget per account, as this page has always read it:
   * the settings' pinned forecast, else the newest active one, matched through
   * account_mappings then by name. A code with no line is absent.
   */
  const readForecastBudgets = async (pinnedForecastId: string | null): Promise<Map<string, number>> => {
    const found = new Map<string, number>()
    forecastWindowMonths.clear()
    let forecastId = pinnedForecastId
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
            found.set(code, Math.abs(monthBudget))
            if (windowMonths.length > 0) forecastWindowMonths.set(code, budgetLine.forecast_months || {})
          }
        }
      }
    }
    return found
  }

  // ── Authoritative budget: the yardstick the statement pages use ──
  const plBudgets = new Map<string, number>()
  /**
   * A budget-store client only: the forecast budget this page read before the
   * store (see readForecastBudgets), which the standard layout still prints
   * unless its placement asks for the approved budget. Empty for everyone else,
   * whose total budget already is that figure.
   */
  const preBudgetStoreBudgets = new Map<string, number>()
  /** Where each account's total budget came from, for the page to name. */
  const budgetSources = new Map<string, 'approved_budget' | 'forecast' | 'none'>()
  /** Why a budget-store account has no budget this month, in words (source 'none'). */
  let budgetAbsent: string | undefined
  /** The client's own subscription accounts — see the write-through guard. */
  let configuredSubscriptionCodes: string[] = []
  /** Known once the settings row is read; the catch below needs it. */
  let onBudgetStore = false
  try {
    const { data: settingsRow } = await supabase
      .from('monthly_report_settings')
      .select('budget_forecast_id, subscription_account_codes, budget_source')
      .eq('business_id', business_id)
      .maybeSingle()

    configuredSubscriptionCodes = Array.isArray(settingsRow?.subscription_account_codes)
      ? (settingsRow!.subscription_account_codes as string[])
      : []

    // A client on the budget store is held to its approved budget on every
    // statement page, and this page read forecast_pl_lines regardless. Urban
    // Road's IT Costs Software has no forecast line at all, so the TOTAL budget
    // fell through to the vendor-budget sum ($14,253, Step 6's gross run-rates)
    // four pages after the P&L page printed $13,697 approved for the same
    // account and month. Read POSITIVELY, as wages-detail-load does: a business
    // with no settings row is not on the store. The forecast read is the one it
    // always was, so every forecast-basis client reads exactly what it did.
    onBudgetStore = settingsRow?.budget_source === 'budget_version'

    const pinnedForecastId: string | null = settingsRow?.budget_forecast_id || null

    if (onBudgetStore) {
      // What the standard page printed for this client before the store, kept
      // beside the approved figure so no page moves unasked. Its own catch: a
      // forecast that cannot be read leaves the vendor-budget sum, as the page
      // did then, and must not cost the approved figure read next.
      try {
        for (const [code, budget] of await readForecastBudgets(pinnedForecastId)) preBudgetStoreBudgets.set(code, budget)
      } catch (err) {
        Sentry.captureException(err, { tags: { route: 'monthly-report/subscription-detail' }, extra: { context: "[SubscriptionDetail] Failed to fetch the pre-budget-store forecast budgets" } } as any)
      }

      const ids = await resolveBusinessProfileIds(supabase, business_id)
      let yearStartMonth = DEFAULT_YEAR_START_MONTH
      if (ids.profileId) {
        const { data: profile } = await supabase
          .from('business_profiles')
          .select('fiscal_year_start')
          .eq('id', ids.profileId)
          .maybeSingle()
        if (profile?.fiscal_year_start) yearStartMonth = Number(profile.fiscal_year_start)
      }
      const [y, m] = report_month.split('-').map(Number)
      const fiscalYear = getFiscalYear(new Date(y, m - 1, 1), yearStartMonth)
      const resolved = await resolveBudget(supabase, {
        businessId: ids.businessId,
        profileId: ids.profileId,
        fiscalYear,
        reportMonth: report_month,
        months: [report_month],
        budgetSource: 'budget_version',
        pin: { budgetForecastId: null },
      })
      if (resolved.source === 'budget_version') {
        // On the account CODE — the one key both sides spell the same (see
        // ResolvedBudgetLine.account_code) — then the name for a line without one.
        for (const code of account_codes) {
          const name = (crawl.accountNames.get(code) ?? '').trim().toLowerCase()
          const line = resolved.lines.find((l) => (l.account_code ?? '').trim() === code)
            ?? (name ? resolved.lines.find((l) => !l.account_code && l.account_name.trim().toLowerCase() === name) : undefined)
          // An account the approved budget does not carry, or a month it leaves
          // blank, was budgeted nothing: Xero omits a blank cell, it does not
          // hold an unknown one.
          plBudgets.set(code, Math.abs(line?.forecast_months?.[report_month] ?? 0))
          budgetSources.set(code, 'approved_budget')
        }
      } else {
        // No budget in force. FAIL-CLOSED, as resolveBudget is for the
        // statement pages: they print this account with no budget, and a
        // vendor-budget sum here would have the two pages disagree in exactly
        // the case this branch exists for. Nothing, with the resolver's reason,
        // which both layouts print.
        budgetAbsent = noBudgetBecause(resolved.noBudgetReason, fiscalYear)
        for (const code of account_codes) {
          plBudgets.set(code, 0)
          budgetSources.set(code, 'none')
        }
      }
    } else {
      for (const [code, budget] of await readForecastBudgets(pinnedForecastId)) {
        plBudgets.set(code, budget)
        budgetSources.set(code, 'forecast')
      }
    }
  } catch (err) {
    Sentry.captureException(err, { tags: { route: 'monthly-report/subscription-detail' }, extra: { context: "[SubscriptionDetail] Failed to fetch forecast budgets" } } as any)
    // A budget-store client whose approved budget could not be read has no
    // budget this page can vouch for. Left empty, plBudgets would hand the
    // TOTAL the vendor-budget sum, and the sheet would say the account "has no
    // budget line of its own" — neither of which anybody checked.
    if (onBudgetStore) {
      budgetAbsent = 'the approved budget could not be read'
      for (const code of account_codes) {
        if (budgetSources.has(code)) continue
        plBudgets.set(code, 0)
        budgetSources.set(code, 'none')
      }
    }
  }

  // ── The budget over the window ──
  // Month by month on the same yardstick as total_budget. Null is no budget for
  // that month, with the reason — a window reaches back across a year end, and
  // an approved budget is locked per fiscal year: Urban Road's August page
  // prints June 2026 (FY2026), for which it has none. A $0 there would be the
  // whole June spend printed as an overrun against a budget nobody set.
  const windowBudgets = new Map<string, { budget: Record<string, number | null>; absent: Record<string, string> }>()
  if (windowMonths.length > 0) {
    for (const code of account_codes) windowBudgets.set(code, { budget: {}, absent: {} })
    const setNone = (months: readonly string[], reason: string) => {
      for (const code of account_codes) {
        const w = windowBudgets.get(code)!
        for (const m of months) { w.budget[m] = null; w.absent[m] = reason }
      }
    }
    try {
      if (onBudgetStore) {
        const ids = await resolveBusinessProfileIds(supabase, business_id)
        let yearStartMonth = DEFAULT_YEAR_START_MONTH
        if (ids.profileId) {
          const { data: profile } = await supabase
            .from('business_profiles')
            .select('fiscal_year_start')
            .eq('id', ids.profileId)
            .maybeSingle()
          if (profile?.fiscal_year_start) yearStartMonth = Number(profile.fiscal_year_start)
        }
        // One resolution per fiscal year the window touches, each anchored on
        // that year's last window month: which version governs a month is
        // decided inside its own year.
        const byYear = new Map<number, string[]>()
        for (const m of windowMonths) {
          const [y, mo] = m.split('-').map(Number)
          const fy = getFiscalYear(new Date(y, mo - 1, 1), yearStartMonth)
          byYear.set(fy, [...(byYear.get(fy) ?? []), m])
        }
        for (const [fiscalYear, months] of byYear) {
          const resolved = await resolveBudget(supabase, {
            businessId: ids.businessId,
            profileId: ids.profileId,
            fiscalYear,
            reportMonth: months[months.length - 1],
            months,
            budgetSource: 'budget_version',
            pin: { budgetForecastId: null },
          })
          if (resolved.source !== 'budget_version') {
            setNone(months, noBudgetBecause(resolved.noBudgetReason, fiscalYear))
            continue
          }
          for (const code of account_codes) {
            const name = (crawl.accountNames.get(code) ?? '').trim().toLowerCase()
            const line = resolved.lines.find((l) => (l.account_code ?? '').trim() === code)
              ?? (name ? resolved.lines.find((l) => !l.account_code && l.account_name.trim().toLowerCase() === name) : undefined)
            const w = windowBudgets.get(code)!
            // As total_budget: Xero omits a blank cell, so a month the approved
            // budget leaves blank was budgeted $0.
            for (const m of months) w.budget[m] = Math.abs(line?.forecast_months?.[m] ?? 0)
          }
        }
      } else {
        for (const code of account_codes) {
          const w = windowBudgets.get(code)!
          const months = forecastWindowMonths.get(code)
          for (const m of windowMonths) {
            // A forecast carries its own fiscal year only. A month outside it
            // was not budgeted at nothing; this forecast does not speak to it.
            const value = months?.[m]
            if (typeof value === 'number') {
              w.budget[m] = Math.abs(value)
            } else {
              w.budget[m] = null
              w.absent[m] = months ? 'the forecast does not cover this month' : 'this account has no forecast line'
            }
          }
        }
      }
    } catch (err) {
      Sentry.captureException(err, { tags: { route: 'monthly-report/subscription-detail' }, extra: { context: "[SubscriptionDetail] Failed to read the window's budgets" } } as any)
      setNone(windowMonths, onBudgetStore ? 'the approved budget could not be read' : 'the forecast budget could not be read')
    }
  }

  /** Every window month, 0 where nothing was posted, rounded to the cent. */
  const monthsOf = (months: Record<string, number> | undefined): Record<string, number> =>
    Object.fromEntries(windowMonths.map((m) => [m, Math.round((months?.[m] ?? 0) * 100) / 100]))

  // ── Build response ──
  // Vendor rows: individual bank txn actuals + subscription_budgets
  // Account subtotals & grand total: authoritative P&L / budget figures
  let grandActual = 0
  let grandBudget = 0
  let grandPriorMonth = 0
  let grandPreBudgetStoreBudget = 0

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
            ...(windowMonths.length > 0 ? { months: monthsOf(data.months) } : {}),
            // Additive: the default fields above are the gross figures every
            // client's page has always printed.
            ...(crawl.statementAmounts
              ? {
                  statement: {
                    prior_month_actual: Math.round(data.statement_prior_actual * 100) / 100,
                    actual: Math.round(data.statement_actual * 100) / 100,
                    variance: Math.round((budget - data.statement_actual) * 100) / 100,
                    ...(windowMonths.length > 0 ? { months: monthsOf(data.statement_months) } : {}),
                  },
                }
              : {}),
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
      const preBudgetStoreBudget = preBudgetStoreBudgets.has(code) ? preBudgetStoreBudgets.get(code)! : vendorBudgetSum

      grandActual += totalActual
      grandBudget += totalBudget
      grandPriorMonth += totalPrior
      grandPreBudgetStoreBudget += preBudgetStoreBudget

      // Vendor rows that add to MORE than the ledger posted are not a rounding
      // difference or a journal — they are rows in the wrong money or on the
      // wrong account, and the page cannot print them as though they footed.
      // Less is normal (a journal is not a bill). The page prints the gap
      // either way; this is the record that it happened.
      // On the statement basis only: gross rows run past a net ledger by the
      // GST, by design.
      const vendorStatementSum = vendors.reduce((s, v) => s + (v.statement?.actual ?? 0), 0)
      if (crawl.statementAmounts && plActuals.has(code) && vendorsExceedAccount(vendorStatementSum, totalActual)) {
        Sentry.captureMessage('[SubscriptionDetail] vendor rows exceed the P&L account', {
          level: 'warning' as any,
          tags: { route: 'monthly-report/subscription-detail', invariant: 'subscription-vendors-exceed-account' },
          extra: { business_id, report_month, account_code: code, vendor_sum: vendorStatementSum, account_actual: totalActual },
        } as any)
      }

      const unconverted = crawl.unconverted.get(code) ?? []
      // The ledger month by month, as total_actual is; the vendor rows only
      // when the ledger has no row for the account, and then it says so.
      const ledgerWindow = plWindowActuals.get(code)
      const windowBudget = windowBudgets.get(code)
      const window: SubscriptionAccountWindow | undefined = windowMonths.length > 0
        ? {
            months: [...windowMonths],
            actual: ledgerWindow ?? Object.fromEntries(windowMonths.map((m) => [m, Math.round(vendors.reduce((t, v) => t + (v.months?.[m] ?? 0), 0) * 100) / 100])),
            actual_source: ledgerWindow ? 'ledger' : 'vendor_sum',
            budget: windowBudget?.budget ?? {},
            ...(windowBudget && Object.keys(windowBudget.absent).length > 0 ? { budget_absent: windowBudget.absent } : {}),
          }
        : undefined
      return {
        account_code: code,
        account_name: crawl.accountNames.get(code) || code,
        vendors,
        total_prior_month: Math.round(totalPrior * 100) / 100,
        total_actual: Math.round(totalActual * 100) / 100,
        total_budget: Math.round(totalBudget * 100) / 100,
        total_variance: Math.round((totalBudget - totalActual) * 100) / 100,
        total_budget_source: budgetSources.get(code) ?? 'vendor_sum',
        ...(budgetSources.get(code) === 'none' && budgetAbsent ? { total_budget_absent: budgetAbsent } : {}),
        ...(onBudgetStore
          ? {
              pre_budget_store_total: {
                budget: Math.round(preBudgetStoreBudget * 100) / 100,
                variance: Math.round((preBudgetStoreBudget - totalActual) * 100) / 100,
                source: preBudgetStoreBudgets.has(code) ? 'forecast' as const : 'vendor_sum' as const,
              },
            }
          : {}),
        ...(unconverted.length > 0 ? { unconverted } : {}),
        ...(window ? { window } : {}),
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
        // The gross actual: the budgets below were seeded gross (see VendorAccumulation).
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
      ...(onBudgetStore ? { pre_budget_store_grand_budget: Math.round(grandPreBudgetStoreBudget * 100) / 100 } : {}),
    } as SubscriptionDetailData,
    configuredSubscriptionCodes,
  }
}
