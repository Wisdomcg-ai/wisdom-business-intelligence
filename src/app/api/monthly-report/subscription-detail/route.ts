import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getSupabaseSecretKey } from '@/lib/supabase/keys'
import { createRouteHandlerClient } from '@/lib/supabase/server'
import { verifyBusinessAccess } from '@/lib/utils/verify-business-access'
import { getValidAccessToken } from '@/lib/xero/token-manager'
import { extractVendorName } from '@/lib/utils/vendor-normalization'
import {
  commentaryBankTransactionsUrl,
  commentaryInvoicesUrl,
} from '@/lib/monthly-report/commentary-documents'
import { subscriptionLinesOf } from '@/lib/subscriptions/posted-subscription-lines'
import { resolveBusinessProfileIds } from '@/lib/business/resolveBusinessProfileIds'
import { resolveXeroConnections } from '@/lib/business/resolveXeroBusinessId'
import {
  addSubscriptionLine,
  assembleSubscriptionDetail,
  emptySubscriptionDetail,
  newSubscriptionCrawl,
  priorMonthKeyOf,
} from '@/lib/monthly-report/subscription-detail-build'
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

    const emptyData = emptySubscriptionDetail(report_month)

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

    const priorMonthKey = priorMonthKeyOf(report_month)

    // Posted documents only (#516's rule, shared). A malformed month has no
    // range to ask Xero for.
    const currentBankUrl = commentaryBankTransactionsUrl(report_month)
    const priorBankUrl = commentaryBankTransactionsUrl(priorMonthKey)
    const currentBillsUrl = commentaryInvoicesUrl(report_month, 'ACCPAY')
    const priorBillsUrl = commentaryInvoicesUrl(priorMonthKey, 'ACCPAY')
    if (!currentBankUrl || !priorBankUrl || !currentBillsUrl || !priorBillsUrl) {
      return NextResponse.json({ error: 'report_month must be YYYY-MM' }, { status: 400 })
    }

    // The crawl's accumulators live in lib/monthly-report/subscription-detail-build,
    // with the assembly that follows the crawl — shared with scripts/preview-pack.ts.
    const crawl = newSubscriptionCrawl(account_codes)
    const accountNameMap = crawl.accountNames
    const completeTenants = crawl.completeTenants
    const tenantMonthActuals = crawl.tenantMonthActuals

    // Posted lines only, signed by document type — see posted-subscription-lines.ts.
    // transaction_count counts every posted line, a refund included: a refund
    // is evidence the vendor is still active this month, not an absence.
    const requestedCodes = new Set(account_codes)

    // Process bank transactions into vendor breakdown
    function processBankTxns(txns: any[], isCurrent: boolean, txnTenantId: string) {
      for (const bt of txns) {
        for (const line of subscriptionLinesOf(bt, 'bank', requestedCodes)) {
          const vendorName = extractVendorName(line.contactName, line.description)
          addSubscriptionLine(crawl, { accountCode: line.accountCode, vendorName, amount: line.amount, isCurrent, tenantId: txnTenantId })
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
          addSubscriptionLine(crawl, { accountCode: line.accountCode, vendorName, amount: line.amount, isCurrent, tenantId: txnTenantId })
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

    const { data, configuredSubscriptionCodes } = await assembleSubscriptionDetail(
      supabase,
      { business_id, report_month, account_codes },
      crawl,
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

    return NextResponse.json({ success: true, data })
  } catch (error) {
    Sentry.captureException(error, { tags: { route: 'monthly-report/subscription-detail' }, extra: { context: "[SubscriptionDetail] Error" } } as any)
    return NextResponse.json({ error: 'Failed to load subscription detail' }, { status: 500 })
  }
}

export const POST = withSchema('monthly-report/subscription-detail', SubscriptionDetailPostSchema, postHandler)
