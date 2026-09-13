import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getSupabaseSecretKey } from '@/lib/supabase/keys'
import { createRouteHandlerClient } from '@/lib/supabase/server'
import { verifyBusinessAccess } from '@/lib/utils/verify-business-access'
import { getValidAccessToken } from '@/lib/xero/token-manager'
import { extractVendorName, createVendorKey } from '@/lib/utils/vendor-normalization'
import {
  commentaryBankTransactionsUrl,
  commentaryInvoicesUrl,
} from '@/lib/monthly-report/commentary-documents'
import { subscriptionLinesOf } from '@/lib/subscriptions/posted-subscription-lines'
import { buildFuzzyLookup } from '@/lib/utils/account-matching'
import { resolveBusinessProfileIds } from '@/lib/business/resolveBusinessProfileIds'
import { resolveXeroConnections } from '@/lib/business/resolveXeroBusinessId'
import {
  expectedMonthlyBudget,
  classifyLeakage,
  type BudgetRowForVariance,
  type VendorActualForVariance,
} from '@/lib/subscriptions/variance'
import * as Sentry from '@sentry/nextjs'
import { requireSectionPermission } from '@/lib/permissions/requireSectionPermission'
import { enforceSectionPermission } from '@/lib/permissions/sectionPermissionConfig'
import { z } from 'zod'
import { withSchema } from '@/lib/api/with-schema'

export const dynamic = 'force-dynamic'

/** Thrown to leave the write-through block without reporting a failure. */
class SkipWriteThrough extends Error {}

// VALID-05a (observe mode): POST returns subscription detail lines for a report month.
const SubscriptionDetailPostSchema = z.object({
  business_id: z.string(),
  report_month: z.string(),
  account_codes: z.array(z.string()).optional(),
})

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  getSupabaseSecretKey()
)

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

const XERO_PAGE_CAP = 10
const MAX_RATE_LIMIT_RETRIES = 3

/**
 * Fetch all pages from a paginated Xero endpoint, and say whether that was
 * all of them.
 *
 * `complete` is false when a page failed, the rate limit never cleared, or the
 * page cap was reached with a full page. The vendor rows are still returned —
 * a partial table is better than none — but the write-through will not delete
 * history on the strength of a list it knows is short. This used to stop at
 * five pages and on any error without a word, and a 429 retried forever.
 */
async function fetchAllPages(
  url: string,
  accessToken: string,
  tenantId: string,
  resultKey: string,
  ctx: { tenantId: string; month: string; label: string },
): Promise<{ items: any[]; complete: boolean }> {
  const items: any[] = []
  let page = 1
  let rateLimitRetries = 0

  while (page <= XERO_PAGE_CAP) {
    const res = await fetch(
      `${url}${url.includes('?') ? '&' : '?'}page=${page}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'xero-tenant-id': tenantId,
          'Accept': 'application/json',
        },
      }
    )

    if (res.status === 429) {
      if (rateLimitRetries >= MAX_RATE_LIMIT_RETRIES) {
        Sentry.captureMessage(`[SubscriptionDetail] ${ctx.label} still rate limited after ${MAX_RATE_LIMIT_RETRIES} retries`, {
          level: 'warning',
          tags: { route: 'monthly-report/subscription-detail', invariant: 'subscription_xero_rate_limit' },
          extra: { tenantId: ctx.tenantId, month: ctx.month, page, fetched: items.length },
        } as any)
        return { items, complete: false }
      }
      rateLimitRetries++
      await sleep(10000)
      continue // retry same page
    }
    rateLimitRetries = 0

    if (!res.ok) return { items, complete: false }

    const data = await res.json()
    const pageItems = data[resultKey] || []
    items.push(...pageItems)

    // Xero returns 100 per page; fewer means last page
    if (pageItems.length < 100) return { items, complete: true }

    if (page === XERO_PAGE_CAP) {
      Sentry.captureMessage(`[SubscriptionDetail] ${ctx.label} reached the ${XERO_PAGE_CAP}-page cap`, {
        level: 'warning',
        tags: { route: 'monthly-report/subscription-detail', invariant: 'subscription_xero_page_cap' },
        extra: { tenantId: ctx.tenantId, month: ctx.month },
      } as any)
      return { items, complete: false }
    }

    page++
    await sleep(300)
  }

  return { items, complete: false }
}

/**
 * POST /api/monthly-report/subscription-detail
 * Returns vendor-level breakdown of subscription expenses for a single month,
 * grouped by account code.
 *
 * Vendor rows: actuals from bank transactions, budgets from subscription_budgets.
 * Account subtotals & grand total: use authoritative P&L actual (xero_pl_lines)
 * and forecast budget (forecast_pl_lines) so they match the main report.
 * All vendors appear as named rows — no "Other / Adjustments" row.
 */
async function postHandler(request: Request) {
  try {
    // Phase 65-02: introduce user auth so requireSectionPermission has a userId.
    // The module-level service-role `supabase` continues to be used for data fetching below.
    const authClient = await createRouteHandlerClient()
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { business_id, report_month, account_codes } = body as {
      business_id: string
      report_month: string
      account_codes: string[]
    }

    if (!business_id || !report_month) {
      return NextResponse.json(
        { error: 'business_id and report_month are required' },
        { status: 400 }
      )
    }

    // Phase 65: section-permission gate (LOG_ONLY by default, ENFORCE via env var)
    const _sectionVerdict = await requireSectionPermission(
      authClient,          // auth-bound client; NEVER pass a service-role client here
      user.id,
      business_id,
      'finances',
    )
    const _sectionBlocked = enforceSectionPermission(
      _sectionVerdict,
      'finances',
      'api/monthly-report/subscription-detail',
      user.id,
      business_id,
    )
    if (_sectionBlocked) return _sectionBlocked

    // R29 (SEC-N2): hard authorization gate. The section-permission check above
    // is LOG_ONLY by default, so it does not block cross-tenant access on its
    // own. The module-level Supabase client is service-role and bypasses RLS,
    // making this the only durable tenant-isolation enforcement on this route.
    const _hasAccess = await verifyBusinessAccess(user.id, business_id)
    if (!_hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const emptyData = { accounts: [], grand_total: { prior_month: 0, actual: 0, budget: 0, variance: 0 }, report_month: report_month || '' }

    // Return empty data if no account codes configured
    if (!account_codes || account_codes.length === 0) {
      return NextResponse.json({ success: true, data: emptyData })
    }

    // ALL active connections — .maybeSingle() here silently reported ONE org's
    // subscriptions for multi-org businesses (Dragon has two orgs, IICT three),
    // the exact fraction-of-the-truth failure the wizard's crawl was cured of.
    const { connections } = await resolveXeroConnections(supabase, business_id)
    if (!connections || connections.length === 0) {
      return NextResponse.json({ success: true, data: emptyData })
    }

    // Parse report month for date ranges
    const [year, monthNum] = report_month.split('-').map(Number)
    const priorMonth = monthNum === 1 ? 12 : monthNum - 1
    const priorYear = monthNum === 1 ? year - 1 : year
    const priorMonthKey = `${priorYear}-${String(priorMonth).padStart(2, '0')}`

    // Posted documents only (#516's rule, shared). A malformed month has no
    // range to ask Xero for.
    const currentBankUrl = commentaryBankTransactionsUrl(report_month)
    const priorBankUrl = commentaryBankTransactionsUrl(priorMonthKey)
    const currentBillsUrl = commentaryInvoicesUrl(report_month, 'ACCPAY')
    const priorBillsUrl = commentaryInvoicesUrl(priorMonthKey, 'ACCPAY')
    if (!currentBankUrl || !priorBankUrl || !currentBillsUrl || !priorBillsUrl) {
      return NextResponse.json({ error: 'report_month must be YYYY-MM' }, { status: 400 })
    }

    const accountNameMap = new Map<string, string>()

    // Vendor totals: accountCode → vendorKey → { vendor_name, actual, prior_actual, transaction_count }
    // transaction_count tracks current-month bank-tx lines so the UI can flag
    // budget-only vendors ("not billed this month") that surface with 0 actual.
    const vendorData = new Map<
      string,
      Map<string, { vendor_name: string; actual: number; prior_actual: number; transaction_count: number }>
    >()
    for (const code of account_codes) {
      vendorData.set(code, new Map())
    }

    // Helper to accumulate a transaction line into vendorData
    function addLineItem(accountCode: string, vendorName: string, amount: number, isCurrent: boolean) {
      const accountVendors = vendorData.get(accountCode)
      if (!accountVendors) return
      const vendorKey = createVendorKey(vendorName)
      const existing = accountVendors.get(vendorKey)
      if (existing) {
        if (isCurrent) {
          existing.actual += amount
          existing.transaction_count += 1
        } else {
          existing.prior_actual += amount
        }
      } else {
        accountVendors.set(vendorKey, {
          vendor_name: vendorName,
          actual: isCurrent ? amount : 0,
          prior_actual: isCurrent ? 0 : amount,
          transaction_count: isCurrent ? 1 : 0,
        })
      }
    }

    // Per-tenant current-month vendor totals for the phase-2 write-through:
    // tenant → vendorKey → { name, amount }. Kept per-tenant so multi-org rows
    // land separably in subscription_vendor_actuals.
    const tenantMonthActuals = new Map<string, Map<string, { name: string; amount: number }>>()

    // One accumulation path for BOTH expense populations, so a vendor reads the
    // same whether the client pays by card or by bill.
    function accumulateLine(
      accountCode: string,
      vendorName: string,
      amount: number,
      isCurrent: boolean,
      txnTenantId: string,
    ) {
      addLineItem(accountCode, vendorName, amount, isCurrent)
      if (isCurrent) {
        const key = createVendorKey(vendorName)
        let perTenant = tenantMonthActuals.get(txnTenantId)
        if (!perTenant) { perTenant = new Map(); tenantMonthActuals.set(txnTenantId, perTenant) }
        const cur = perTenant.get(key)
        if (cur) cur.amount += amount
        else perTenant.set(key, { name: vendorName, amount })
      }
    }

    // Posted lines only, signed by document type — see posted-subscription-lines.ts.
    // transaction_count counts every posted line, a refund included: a refund
    // is evidence the vendor is still active this month, not an absence.
    const requestedCodes = new Set(account_codes)

    // Process bank transactions into vendor breakdown
    function processBankTxns(txns: any[], isCurrent: boolean, txnTenantId: string) {
      for (const bt of txns) {
        for (const line of subscriptionLinesOf(bt, 'bank', requestedCodes)) {
          const vendorName = extractVendorName(line.contactName, line.description)
          accumulateLine(line.accountCode, vendorName, line.amount, isCurrent, txnTenantId)
        }
      }
    }

    // Supplier bills (ACCPAY invoices). Paying a bill creates a Payment in
    // Xero, NOT a SPEND bank transaction, so bills and spend-money are DISJOINT
    // expense populations — the wizard's crawl sums both and reconciles against
    // the P&L, which is the proof there is no double count. This route only
    // read bank transactions, so every bill-paid subscription showed $0 actual
    // and landed in "budgeted, not billed" as a false positive — the gap that
    // made that card a question list instead of a conclusion list.
    // Vendor naming mirrors the wizard exactly (extractVendorName over contact
    // + line description) so a vendor keys identically on both paths.
    function processInvoices(invoices: any[], isCurrent: boolean, txnTenantId: string) {
      let sawLineItems = false
      for (const inv of invoices) {
        if ((inv.LineItems || []).length > 0) sawLineItems = true
        for (const line of subscriptionLinesOf(inv, 'invoice', requestedCodes)) {
          const vendorName = extractVendorName(line.contactName, line.description)
          accumulateLine(line.accountCode, vendorName, line.amount, isCurrent, txnTenantId)
        }
      }
      // Xero includes LineItems on paged Invoices responses (same contract the
      // bank-txn fetch relies on). If that ever stops holding, bills would
      // silently vanish from the report again — fail loud instead.
      if (invoices.length > 0 && !sawLineItems) {
        Sentry.captureMessage(
          '[SubscriptionDetail] paged Invoices response carried NO line items — bills missing from vendor actuals',
          { level: 'warning' as any, tags: { invariant: 'subscription-bills-lineitems' }, extra: { tenantId: txnTenantId, invoices: invoices.length } } as any,
        )
      }
    }

    /** Orgs whose current and prior month were read in full — see the write-through. */
    const completeTenants = new Set<string>()

    // Crawl EVERY active org: COA (merged code→name lookup) + current and prior
    // month bank transactions. One dead org's token must not blank the others.
    for (const connection of connections) {
      const tokenResult = await getValidAccessToken({ id: connection.id }, supabase)
      if (!tokenResult.success || !tokenResult.accessToken) {
        Sentry.captureMessage(
          `[SubscriptionDetail] token unavailable for tenant ${connection.tenant_id} — org skipped, totals partial`,
          { level: 'warning' as any, tags: { route: 'monthly-report/subscription-detail' } } as any,
        )
        continue
      }
      const accessToken = tokenResult.accessToken
      const tenantId = connection.tenant_id

      try {
        const coaRes = await fetch('https://api.xero.com/api.xro/2.0/Accounts', {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'xero-tenant-id': tenantId,
            'Accept': 'application/json',
          },
        })
        if (coaRes.ok) {
          const coaData = await coaRes.json()
          for (const acc of (coaData.Accounts || [])) {
            if (acc.Code && acc.Name && !accountNameMap.has(acc.Code)) accountNameMap.set(acc.Code, acc.Name)
          }
        }
      } catch (err) {
        Sentry.captureException(err, { tags: { route: 'monthly-report/subscription-detail' }, extra: { context: "[SubscriptionDetail] Failed to fetch accounts", tenantId } } as any)
      }

      // Every fetch must finish, whole, before this org's crawl counts as a
      // complete picture of the month — the write-through only deletes stale
      // history for an org whose picture is complete.
      let crawlComplete = true

      // Bank transactions for both months: posted only, and EVERY type. The
      // old `Type=="SPEND"` filter threw away money received — Issuu's Feb 2026
      // refund, and one half of Reena Rosales's cancelling pair in Aug 2026.
      try {
        const txns = await fetchAllPages(
          currentBankUrl, accessToken, tenantId, 'BankTransactions',
          { tenantId, month: report_month, label: 'BankTransactions (current month)' },
        )
        if (!txns.complete) crawlComplete = false
        processBankTxns(txns.items, true, tenantId)
      } catch (err) {
        crawlComplete = false
        Sentry.captureException(err, { tags: { route: 'monthly-report/subscription-detail' }, extra: { context: "[SubscriptionDetail] Failed to fetch current bank txns", tenantId } } as any)
      }

      await sleep(300)

      try {
        const txns = await fetchAllPages(
          priorBankUrl, accessToken, tenantId, 'BankTransactions',
          { tenantId, month: priorMonthKey, label: 'BankTransactions (prior month)' },
        )
        if (!txns.complete) crawlComplete = false
        processBankTxns(txns.items, false, tenantId)
      } catch (err) {
        crawlComplete = false
        Sentry.captureException(err, { tags: { route: 'monthly-report/subscription-detail' }, extra: { context: "[SubscriptionDetail] Failed to fetch prior bank txns", tenantId } } as any)
      }

      await sleep(300)

      // Supplier bills for both months, AUTHORISED and PAID only. This used to
      // send no status at all, on the belief that "Xero excludes DELETED and
      // VOIDED by default". It does not: the same request put a DRAFT and a
      // VOIDED Team Global Express bill into Urban Road's August 2026
      // commentary (#516). subscriptionLinesOf re-checks each document anyway.
      try {
        const bills = await fetchAllPages(
          currentBillsUrl, accessToken, tenantId, 'Invoices',
          { tenantId, month: report_month, label: 'Invoices (current month)' },
        )
        if (!bills.complete) crawlComplete = false
        processInvoices(bills.items, true, tenantId)
      } catch (err) {
        crawlComplete = false
        Sentry.captureException(err, { tags: { route: 'monthly-report/subscription-detail' }, extra: { context: "[SubscriptionDetail] Failed to fetch current bills", tenantId } } as any)
      }

      await sleep(300)

      try {
        const bills = await fetchAllPages(
          priorBillsUrl, accessToken, tenantId, 'Invoices',
          { tenantId, month: priorMonthKey, label: 'Invoices (prior month)' },
        )
        if (!bills.complete) crawlComplete = false
        processInvoices(bills.items, false, tenantId)
      } catch (err) {
        crawlComplete = false
        Sentry.captureException(err, { tags: { route: 'monthly-report/subscription-detail' }, extra: { context: "[SubscriptionDetail] Failed to fetch prior bills", tenantId } } as any)
      }

      if (crawlComplete) completeTenants.add(tenantId)

      await sleep(300)
    }

    // Fetch per-vendor budgets from subscription_budgets.
    // Need vendor_name + account_codes so we can backfill budget-only vendors
    // into vendorData (S2 — Phase 71-05): a budgeted vendor with no current-
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
        const accountVendors = vendorData.get(code)
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
        .map(code => accountNameMap.get(code))
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
          const code = account_codes.find(c => accountNameMap.get(c) === pl.account_name)
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
          const findBudgetByName = buildFuzzyLookup(budgetPLLines, (bl) => bl.account_name)

          const mappingByXeroName = new Map<string, any>()
          for (const m of (mappings || [])) mappingByXeroName.set(m.xero_account_name, m)

          for (const code of account_codes) {
            const xeroAccountName = accountNameMap.get(code)
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
        const accountVendors = vendorData.get(code)!
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
          account_name: accountNameMap.get(code) || code,
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
      for (const accountVendors of vendorData.values()) {
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

    // ── Phase 2 write-through: persist this month's vendor actuals ──
    // The wizard's analyze crawl bulk-writes history; viewing a report keeps
    // the viewed month fresh. Failure never blocks the response, but is never
    // silent either (house rule: invariant-tagged capture on swallowed writes).
    //
    // ONLY for the client's own subscription accounts. This route takes its
    // account codes from the caller, and the Contractor Analysis page calls it
    // with the contractor account (Urban Road: 61400). subscription_vendor_actuals
    // has no account dimension — it keys on (business, tenant, vendor, month) —
    // so writing a contractor through it would file sixteen contractors as
    // subscription history, and next month's leakage report would announce
    // every one of them as a new unbudgeted vendor. A caller asking about
    // accounts this client has not nominated as subscriptions gets its answer
    // and writes nothing.
    const subscriptionCodes = new Set(configuredSubscriptionCodes)
    const isSubscriptionScope =
      subscriptionCodes.size > 0 && account_codes.every((c) => subscriptionCodes.has(c))
    try {
      if (!isSubscriptionScope) throw new SkipWriteThrough()
      const ids = await resolveBusinessProfileIds(supabase, business_id)
      const rows: { business_id: string; tenant_id: string; vendor_key: string; vendor_name: string; month: string; amount: number; source: string; updated_at: string }[] = []
      for (const [tenantId, vendorsOfTenant] of tenantMonthActuals) {
        for (const [vendorKey, v] of vendorsOfTenant) {
          rows.push({
            business_id: ids.businessId,
            tenant_id: tenantId,
            vendor_key: vendorKey,
            vendor_name: v.name,
            month: report_month,
            amount: Math.round(v.amount * 100) / 100,
            source: 'report',
            updated_at: new Date().toISOString(),
          })
        }
      }
      if (rows.length > 0) {
        const { error: persistError } = await supabase
          .from('subscription_vendor_actuals')
          .upsert(rows, { onConflict: 'business_id,tenant_id,vendor_key,month' })
        if (persistError) {
          Sentry.captureMessage(
            `[SubscriptionDetail] vendor-actuals write-through failed: ${persistError.message}`,
            { level: 'warning' as any, tags: { invariant: 'subscription-actuals-persist' }, extra: { business_id, report_month, rows: rows.length } } as any,
          )
          throw new SkipWriteThrough()
        }
      }

      // An upsert never deletes. A vendor that is no longer in this month's
      // posted documents — a bill since voided, a spend since deleted, or a row
      // written before the posted-only rule — kept its old amount forever.
      // Urban Road 2026-08 still holds avocadoblvd $6,500 (written 11 Sep
      // 07:22), a USD marketing bill on 64610 that is not a subscription at
      // all, and it inflates that month's history by that much.
      //
      // So, per org, delete this month's rows for vendors the crawl did not
      // emit — but only when the crawl can vouch for the whole month: every
      // page of every fetch arrived (completeTenants), and the caller asked for
      // EVERY configured subscription account. A caller asking about 63700
      // alone never saw 63706's vendors, and must not delete them.
      //
      // And only this page's own ('report') rows. The wizard's Step 6 analyses
      // whatever accounts the operator picks, which in prod is wider than the
      // report settings for two businesses (eight extra codes each); its rows
      // for this month may be vendors this page never looks for, and Step 6
      // does not prune them either — its history is only ever added to.
      const coversEverySubscriptionCode = configuredSubscriptionCodes.every((c) => requestedCodes.has(c))
      if (!coversEverySubscriptionCode) throw new SkipWriteThrough()
      for (const tenantId of completeTenants) {
        const emitted = tenantMonthActuals.get(tenantId) ?? new Map()
        const { data: existing, error: readError } = await supabase
          .from('subscription_vendor_actuals')
          .select('id, vendor_key')
          .eq('business_id', ids.businessId)
          .eq('tenant_id', tenantId)
          .eq('month', report_month)
          .eq('source', 'report')
        if (readError) {
          Sentry.captureMessage(
            `[SubscriptionDetail] stale vendor-actuals read failed: ${readError.message}`,
            { level: 'warning' as any, tags: { invariant: 'subscription-actuals-persist' }, extra: { business_id, report_month, tenantId } } as any,
          )
          continue
        }
        const staleIds = ((existing || []) as { id: string; vendor_key: string }[])
          .filter((r) => !emitted.has(r.vendor_key))
          .map((r) => r.id)
        if (staleIds.length === 0) continue
        const { error: deleteError } = await supabase
          .from('subscription_vendor_actuals')
          .delete()
          .in('id', staleIds)
        if (deleteError) {
          Sentry.captureMessage(
            `[SubscriptionDetail] stale vendor-actuals delete failed: ${deleteError.message}`,
            { level: 'warning' as any, tags: { invariant: 'subscription-actuals-persist' }, extra: { business_id, report_month, tenantId, stale: staleIds.length } } as any,
          )
        }
      }
    } catch (persistErr) {
      // Not an error — this caller is outside the subscription scope by design,
      // or the failure that stopped the block has already been reported.
      if (!(persistErr instanceof SkipWriteThrough)) {
        Sentry.captureException(persistErr, {
          tags: { invariant: 'subscription-actuals-persist' },
          extra: { context: '[SubscriptionDetail] write-through threw', business_id, report_month },
        } as any)
      }
    }

    return NextResponse.json({
      success: true,
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
      },
    })
  } catch (error) {
    Sentry.captureException(error, { tags: { route: 'monthly-report/subscription-detail' }, extra: { context: "[SubscriptionDetail] Error" } } as any)
    return NextResponse.json({ error: 'Failed to load subscription detail' }, { status: 500 })
  }
}

export const POST = withSchema('monthly-report/subscription-detail', SubscriptionDetailPostSchema, postHandler)
