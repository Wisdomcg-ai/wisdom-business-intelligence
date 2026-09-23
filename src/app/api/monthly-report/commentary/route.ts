import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getSupabaseSecretKey } from '@/lib/supabase/keys'
import { createRouteHandlerClient } from '@/lib/supabase/server'
import { verifyBusinessAccess } from '@/lib/utils/verify-business-access'
import { resolveBusinessProfileIds } from '@/lib/business/resolveBusinessProfileIds'
import { getValidAccessToken } from '@/lib/xero/token-manager'
import { resolveXeroConnections } from '@/lib/business/resolveXeroBusinessId'
import { createTenantCallPacer, systemClock, type TenantCallPacer } from '@/lib/xero/tenant-call-pacer'
import { inDisplayOrder, listNames } from '@/lib/monthly-report/organisation-order'
import { describeMissingRates, type MissingRate } from '@/lib/monthly-report/consolidated-fx'
import { loadFxRates } from '@/lib/consolidation/fx'
import { revertReportIfApproved } from '@/lib/reports/revert-report'
import * as Sentry from '@sentry/nextjs'
import {
  collectAccountTransactions,
  commentaryBankTransactionsUrl,
  commentaryCreditNotesUrl,
  commentaryInvoicesUrl,
  creditNoteTypesFor,
  invoiceTypesFor,
  summariseVendors,
  type AccountSide,
  type VendorSummary,
} from '@/lib/monthly-report/commentary-documents'
import { buildRatioClause, pickDenominator, type RatioContext } from '@/lib/monthly-report/commentary-clause'
import { buildDraftNote } from '@/lib/monthly-report/commentary-draft'
import { requireSectionPermission } from '@/lib/permissions/requireSectionPermission'
import { enforceSectionPermission } from '@/lib/permissions/sectionPermissionConfig'
import { z } from 'zod'
import { withSchema } from '@/lib/api/with-schema'

// VALID-05a (observe mode): POST persists report commentary / over-budget line sets.
const CommentaryPostSchema = z.object({
  business_id: z.string(),
  report_month: z.string(),
  expense_lines: z.array(z.any()),
  revenue_lines: z.array(z.any()).optional(),
  favourable_expense_lines: z.array(z.any()).optional(),
  bs_lines: z.array(z.any()).optional(),
  activity_lines: z.array(z.any()).optional(),
  trigger_reasons: z.record(z.string(), z.any()).optional(),
  /**
   * The denominators for the ratio clause, lifted off the generated report so
   * the commentary's percentage is a share of the same income the statement
   * above it prints. Optional: a caller that omits it gets supplier lists with
   * no clause, which is what this route did before.
   */
  ratio_context: z.any().optional(),
})

export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  getSupabaseSecretKey()
)

interface ExpenseOverBudgetLine {
  account_name: string
  xero_account_name: string
  /** The figures the statement prints — see TriggerLine's note on why these travel. */
  actual?: number
  budget?: number | null
}

// Phase 71-04 (S1): expanded trigger types — see utils/commentary-triggers.ts.
// Kept as a string union here (not imported) so the route stays decoupled from
// the UI utils tree.
type TriggerReason =
  | 'expense_over_budget_dollar'
  | 'revenue_under_budget_dollar'
  | 'revenue_under_budget_percent'
  | 'expense_favourable_significant'
  | 'bs_movement_dollar'
  | 'bs_movement_percent'
  | 'account_activity'

interface TriggerLineInput {
  account_name: string
  xero_account_name: string
  /** The figures the statement prints — see TriggerLine's note on why these travel. */
  actual?: number
  budget?: number | null
}

function sleep(ms: number): Promise<void> {
  return systemClock.sleep(ms)
}

/** The currency every figure the commentary quotes is stated in. */
const PRESENTATION_CURRENCY = 'AUD'

const upperCurrency = (c: unknown): string => String(c ?? '').trim().toUpperCase()
const nameKey = (name: string) => name.toLowerCase().trim()

/** One organisation's month of posted documents, ready to be read per account. */
interface OrgDocuments {
  connection: any
  orgName: string
  invoices: any[]
  bankTransactions: any[]
  creditNotes: any[]
}

/**
 * Fetch all pages of a paginated Xero endpoint.
 * Xero returns up to 100 items per page; if exactly 100 are returned, there may be more.
 *
 * The page cap is a hard stop, and reaching it used to be silent: the loop
 * simply ran out and the caller quoted suppliers from whatever had arrived.
 * Before the Invoices fetch was scoped to bills, Urban Road's 1,142 sales
 * invoices in November 2025 filled all ten pages on their own and every bill
 * behind them was dropped. A truncated list is now reported, once, with the
 * tenant and month on it.
 */
async function fetchAllXeroPages(
  url: string,
  headers: Record<string, string>,
  dataKey: string,
  context: { tenantId: string; reportMonth: string; label?: string },
  /**
   * The organisation's pacer: four pagers run at once here, a page every
   * 300ms, and the commentary now does that to every organisation of a
   * consolidation in turn. Every call goes through it so no organisation is
   * sent more than Xero allows in a minute (tenant-call-pacer).
   */
  pacer: TenantCallPacer,
  maxPages = 10
): Promise<any[]> {
  const all: any[] = []
  let page = 1
  // A 429 used to retry the same page forever. Harmless-looking with one fetch,
  // but this route now runs up to four concurrently (ACCPAY, ACCREC, bank
  // transactions, credit notes) against Xero's 60-calls-a-minute and
  // 5-concurrent limits, and an unbounded loop there holds the request open
  // until the function is killed — with nothing on the page to say the
  // commentary never finished.
  const MAX_RATE_LIMIT_RETRIES = 3
  let rateLimitRetries = 0

  while (page <= maxPages) {
    const separator = url.includes('?') ? '&' : '?'
    const res = await pacer.run(() => fetch(`${url}${separator}page=${page}`, { headers }))

    if (res.status === 429) {
      if (rateLimitRetries >= MAX_RATE_LIMIT_RETRIES) {
        Sentry.captureMessage(`[Commentary] ${context.label ?? dataKey} still rate limited after ${MAX_RATE_LIMIT_RETRIES} retries; supplier detail is truncated`, {
          level: 'warning',
          tags: { route: 'monthly-report/commentary', invariant: 'commentary_xero_rate_limit' },
          extra: { dataKey: context.label ?? dataKey, page, fetched: all.length, tenantId: context.tenantId, reportMonth: context.reportMonth },
        } as any)
        break
      }
      rateLimitRetries++
      Sentry.captureMessage(`[Commentary] Rate limited on ${dataKey} page ${page}, waiting 10s...`, 'warning' as any)
      await sleep(10000)
      continue // retry same page
    }
    rateLimitRetries = 0

    if (!res.ok) {
      Sentry.captureMessage(`[Commentary] ${dataKey} page ${page} returned ${res.status}`, 'error' as any)
      break
    }

    const data = await res.json()
    const items = data[dataKey] || []
    all.push(...items)

    // Xero pagination: if fewer than 100 items, we've reached the last page
    if (items.length < 100) break

    if (page === maxPages) {
      // A full last page at the cap: there is almost certainly more, and it is
      // not being read. The supplier lists built from this fetch will under-
      // quote — and silently lose any credit that sat past the cap.
      Sentry.captureMessage(`[Commentary] ${context.label ?? dataKey} reached the ${maxPages}-page cap; supplier detail is truncated`, {
        level: 'warning',
        tags: { route: 'monthly-report/commentary', invariant: 'commentary_xero_page_cap' },
        extra: { dataKey: context.label ?? dataKey, maxPages, fetched: all.length, tenantId: context.tenantId, reportMonth: context.reportMonth },
      } as any)
      break
    }

    page++
    // Brief pause between pages to stay under rate limits
    await sleep(300)
  }

  return all
}

/**
 * POST /api/monthly-report/commentary
 * Generate vendor-grouped transaction summaries for expense accounts over budget.
 * Only processes expense lines where actual > budget.
 * Format: "Vendor ($amount), Vendor ($amount), Others ($amount)"
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
    // Phase 71-04 (S1): expanded payload — the page now sends 4 separate
    // line-set arrays plus an optional `trigger_reasons` map (accountName →
    // TriggerReason). Pre-71-04 callers only send `expense_lines`; the other
    // arrays default to [] for backward compat.
    const {
      business_id,
      report_month,
      expense_lines,
      revenue_lines = [],
      favourable_expense_lines = [],
      bs_lines = [],
      // Accounts that triggered nothing but moved, sent only for a pack whose
      // commentary lists every account in a section (commentary-placement).
      activity_lines = [],
      trigger_reasons = {},
      ratio_context = null,
    } = body as {
      business_id: string
      report_month: string
      expense_lines: ExpenseOverBudgetLine[]
      revenue_lines?: TriggerLineInput[]
      favourable_expense_lines?: TriggerLineInput[]
      bs_lines?: TriggerLineInput[]
      activity_lines?: TriggerLineInput[]
      trigger_reasons?: Record<string, TriggerReason>
      ratio_context?: RatioContext | null
    }

    if (!business_id || !report_month || !expense_lines) {
      return NextResponse.json(
        { error: 'business_id, report_month, and expense_lines are required' },
        { status: 400 }
      )
    }
    // Every Xero request below is built from this month. A malformed one used
    // to reach Xero as `DateTime(NaN,NaN,1)`, come back empty, and be reported
    // as a month with no suppliers in it.
    if (!commentaryBankTransactionsUrl(report_month)) {
      return NextResponse.json({ error: 'report_month must be YYYY-MM' }, { status: 400 })
    }

    // Build the unified processing set + per-account trigger_reason resolver.
    // Priority on conflict (rare — accounts don't typically span buckets):
    // expense_over > revenue > favourable > bs. Within each bucket, an
    // explicit entry in `trigger_reasons` (from the page-side collector) wins
    // over the bucket's default; this lets the page differentiate
    // `revenue_under_budget_dollar` vs `revenue_under_budget_percent` for the
    // same account_name.
    const reasonByAccount = new Map<string, TriggerReason>()
    const addReason = (accountName: string, bucketDefault: TriggerReason) => {
      if (reasonByAccount.has(accountName)) return // first wins
      const explicit = trigger_reasons[accountName]
      reasonByAccount.set(accountName, explicit ?? bucketDefault)
    }
    // The side of the statement each account is read from, which decides the
    // sign of every document under it — a refund received reduces an expense
    // and a refund paid out reduces income. Same first-wins priority as the
    // reason, so an account's sign and its trigger always come from one bucket.
    const sideByAccount = new Map<string, AccountSide>()
    const addSide = (accountName: string, side: AccountSide) => {
      if (!sideByAccount.has(accountName)) sideByAccount.set(accountName, side)
    }
    for (const l of expense_lines) { addReason(l.account_name, 'expense_over_budget_dollar'); addSide(l.account_name, 'expense') }
    for (const l of revenue_lines) { addReason(l.account_name, 'revenue_under_budget_dollar'); addSide(l.account_name, 'revenue') }
    for (const l of favourable_expense_lines) { addReason(l.account_name, 'expense_favourable_significant'); addSide(l.account_name, 'expense') }
    for (const l of bs_lines) { addReason(l.account_name, 'bs_movement_dollar'); addSide(l.account_name, 'balance_sheet') }
    for (const l of activity_lines) { addReason(l.account_name, 'account_activity'); addSide(l.account_name, 'expense') }

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
      'api/monthly-report/commentary',
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

    // Phase 71-04 (S1): the unified processing set is { expense_lines ∪
    // revenue_lines ∪ favourable_expense_lines ∪ bs_lines } deduped by
    // account_name (expense bucket wins on duplicate). If ALL four buckets
    // are empty there's nothing to comment on.
    const seen = new Set<string>()
    const allLines: TriggerLineInput[] = []
    const pushUnique = (l: TriggerLineInput) => {
      if (seen.has(l.account_name)) return
      seen.add(l.account_name)
      allLines.push(l)
    }
    for (const l of expense_lines) pushUnique(l)
    for (const l of revenue_lines) pushUnique(l)
    for (const l of favourable_expense_lines) pushUnique(l)
    for (const l of bs_lines) pushUnique(l)
    for (const l of activity_lines) pushUnique(l)

    if (allLines.length === 0) {
      // A real answer: we looked, and nothing crosses a threshold this month.
      // `checked: true` is what lets the client CLEAR last month's rows rather
      // than leave them standing. See the three bail-outs below for the other
      // kind of empty.
      return NextResponse.json({ success: true, commentary: {}, checked: true })
    }

    // EVERY active organisation, oldest decision first.
    //
    // This took the newest active connection by created_at and read that one
    // organisation's documents. Dragon's two connections and IICT's three each
    // share a created_at to the microsecond, so which organisation explained a
    // consolidated figure was a coin toss — and whichever won, the suppliers of
    // the others were missing from an account that holds their spend (DRG-19,
    // IICT-29). Calxa's bullets cover every organisation: "Legal expenses |
    // Simpson Quinn ($2,931)" is Dragon's $1,459 and Easy Hail's $1,472.
    const ids = await resolveBusinessProfileIds(supabase, business_id)
    const { connections: activeConnections } = await resolveXeroConnections(supabase, business_id)
    const orgs = inDisplayOrder((activeConnections ?? []) as { id: string; display_order?: number | null }[]) as any[]

    if (orgs.length === 0) {
      // NOT an answer — we could not look. `checked: false` keeps the client
      // from reading "no Xero connection" as "nothing is over budget".
      return NextResponse.json({ success: true, commentary: {}, checked: false })
    }

    const multiOrg = orgs.length > 1
    const orgNameOf = (c: any): string => c.tenant_name || c.display_name || c.tenant_id

    // The prior month, for the fallback comparator ("… against 8.9% in June").
    // One read of the wide mirror carries every account's whole year, so this
    // costs a single query rather than one per account. Actuals only — no
    // budget is involved, so there is nothing here that could disagree with the
    // report's own resolved figures.
    const priorMonth = (() => {
      const [y, m] = report_month.split('-').map(Number)
      if (!y || !m) return null
      const d = new Date(Date.UTC(y, m - 2, 1))
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
    })()
    const priorMonthLabel = priorMonth
      ? new Date(`${priorMonth}-01T00:00:00Z`).toLocaleString('en-AU', { month: 'long', timeZone: 'UTC' })
      : null

    // A consolidation states its figures in AUD, so an organisation that keeps
    // its books in another currency has its documents translated at the month's
    // average rate — the rate its P&L was translated at — before a supplier is
    // quoted beside an AUD line (IICT-29, SKILL.md:72). A single-organisation
    // business is not translated: its report is in its own currency.
    const monthsNeeded = [report_month, ...(priorMonth ? [priorMonth] : [])]
    const ratesByCurrency = new Map<string, Map<string, number>>()
    if (multiOrg) {
      const currencies = [...new Set(orgs.map((c) => upperCurrency(c.functional_currency)).filter((c) => c && c !== PRESENTATION_CURRENCY))]
      for (const currency of currencies) {
        try {
          ratesByCurrency.set(currency, await loadFxRates(supabase as never, `${currency}/${PRESENTATION_CURRENCY}`, 'monthly_average', monthsNeeded))
        } catch (err) {
          // A rate we could not read is a rate we do not have: the organisation
          // is left out below and said so, never summed one-for-one.
          Sentry.captureException(err, { tags: { route: 'monthly-report/commentary', invariant: 'commentary_fx_rates_unreadable' } } as any)
          ratesByCurrency.set(currency, new Map())
        }
      }
    }
    /** The factor one organisation's figures are multiplied by, or null when the month has no rate. */
    const rateFor = (connection: any, month: string): number | null => {
      const currency = upperCurrency(connection.functional_currency)
      if (!multiOrg || !currency || currency === PRESENTATION_CURRENCY) return 1
      return ratesByCurrency.get(currency)?.get(month) ?? null
    }

    const priorActuals = new Map<string, number>()
    let priorIncomeActual: number | null = null
    if (priorMonth) {
      const priorRates = new Map<string, number | null>(orgs.map((c) => [c.tenant_id, rateFor(c, priorMonth)]))
      // A prior month one organisation cannot be translated into is not a
      // comparator: the clause goes without rather than compare this month's
      // whole business with last month's part of it.
      const priorComparable = [...priorRates.values()].every((r) => r !== null)
      const query = supabase
        .from('xero_pl_lines_wide_compat')
        .select('tenant_id, account_name, account_type, monthly_values')
      const { data: wideRows } = multiOrg
        ? await query.in('tenant_id', orgs.map((c) => c.tenant_id))
        : await query.eq('tenant_id', orgs[0].tenant_id)
      let incomeSum = 0
      let sawIncome = false
      if (priorComparable) {
        for (const row of (wideRows ?? []) as { tenant_id?: string; account_name: string; account_type: string; monthly_values: Record<string, number> }[]) {
          const rate = (row.tenant_id ? priorRates.get(row.tenant_id) : 1) ?? 1
          const v = Number(row.monthly_values?.[priorMonth] ?? 0) * rate
          if (!Number.isFinite(v)) continue
          priorActuals.set(row.account_name, (priorActuals.get(row.account_name) ?? 0) + v)
          if (row.account_type === 'revenue') { incomeSum += v; sawIncome = true }
        }
      }
      // Null, not 0: a month we hold no revenue for cannot be a denominator,
      // and 0 would make every prior-month ratio infinite or refused silently.
      priorIncomeActual = sawIncome ? incomeSum : null
    }

    // Build account name → code lookup from xero_pl_lines (already synced from Xero)
    // This is more reliable than fetching Chart of Accounts again, and the data is already local
    //
    // PER ORGANISATION for a consolidation. A code is an organisation's own:
    // Dragon's Virtual Contractors is 2300 and Easy Hail's is 508, while 402 is
    // Dragon's Bad Debts expense and Easy Hail's Marketing — 26 of the 74 codes
    // they share name different accounts. One map across both would quote one
    // organisation's bills under the other's account.
    const accountNameToCode = new Map<string, string>()
    const codesByTenant = new Map<string, Map<string, string>>()
    try {
      // Phase D (CFO-only clients): xero_pl_lines_wide_compat is keyed
      // business_profiles-space; the old bare `.eq('business_id',
      // business_id)` (businesses-space) matched ZERO rows for every client
      // whose two ids differ — the vendor code lookup was always empty.
      const { data: plLines } = await supabase
        .from('xero_pl_lines_wide_compat')
        .select('tenant_id, account_name, account_code')
        .in('business_id', ids.all)

      if (plLines) {
        for (const line of plLines) {
          if (!line.account_name || !line.account_code) continue
          accountNameToCode.set(nameKey(line.account_name), line.account_code)
          if (line.tenant_id) {
            const forTenant = codesByTenant.get(line.tenant_id) ?? new Map<string, string>()
            forTenant.set(nameKey(line.account_name), line.account_code)
            codesByTenant.set(line.tenant_id, forTenant)
          }
        }
      }
      if (process.env.NODE_ENV !== 'production') {
        console.log(`[Commentary] Loaded ${accountNameToCode.size} account codes from xero_pl_lines`)
      }
    } catch (err) {
      Sentry.captureException(err, { tags: { route: 'monthly-report/commentary' }, extra: { context: "[Commentary] Failed to load account codes from xero_pl_lines" } } as any)
    }

    // Also check account_mappings for any mapped xero_account_code
    // (handles cases where user has manually mapped accounts).
    //
    // Single-organisation only: a mapping row carries no tenant, so for a
    // consolidation there is no organisation whose code it is, and trying it in
    // every one is the shared-code trap above.
    if (!multiOrg) {
      try {
        const { data: mappings } = await supabase
          .from('account_mappings')
          .select('xero_account_name, xero_account_code')
          .eq('business_id', business_id)
          .not('xero_account_code', 'is', null)

        if (mappings) {
          for (const m of mappings) {
            if (m.xero_account_name && m.xero_account_code) {
              // Don't overwrite codes from xero_pl_lines — they're more authoritative
              if (!accountNameToCode.has(nameKey(m.xero_account_name))) {
                accountNameToCode.set(nameKey(m.xero_account_name), m.xero_account_code)
              }
            }
          }
        }
      } catch {
        // Non-fatal — mappings are supplementary
      }
    }

    /** The code this organisation posts an account under, or undefined. */
    const codeIn = (connection: any, xeroName: string): string | undefined =>
      multiOrg ? codesByTenant.get(connection.tenant_id)?.get(nameKey(xeroName)) : accountNameToCode.get(nameKey(xeroName))

    // Posted documents for the month, and only the invoice types the commented
    // accounts can use — see commentary-documents.ts for the two Urban Road
    // August lists (Freight, Contractors) that each ran ~$800 over their
    // account on drafts, voids and a refund signed as spend.
    //
    // And the month's posted credit notes, which this route never fetched:
    // Urban Road's August Rolled Prints list stood $957.03 over its account
    // because the customer credits that reduced it in the ledger were not in
    // the list. Same pager, so the same 429 cap and page-cap invariant apply,
    // labelled CreditNotes in Sentry.
    const bankUrl = commentaryBankTransactionsUrl(report_month)!
    const sides = [...sideByAccount.values()]
    const invoiceTypes = invoiceTypesFor(sides)
    const creditNotesUrl = commentaryCreditNotesUrl(report_month, creditNoteTypesFor(sides))

    // One organisation at a time: sibling connections share a refresh token, so
    // two token refreshes at once can invalidate each other, and Xero's limits
    // are per organisation anyway.
    const read: OrgDocuments[] = []
    /** Organisations whose documents are not in the lists below, and why. */
    const unreadOrgs: string[] = []
    const untranslatedOrgs: string[] = []
    const missingRates: MissingRate[] = []

    for (const connection of orgs) {
      const orgName = orgNameOf(connection)
      const tokenResult = await getValidAccessToken({ id: connection.id }, supabase)
      if (!tokenResult.success || !tokenResult.accessToken) {
        // Token refresh failed — we could not look at this organisation.
        unreadOrgs.push(orgName)
        continue
      }
      const currency = upperCurrency(connection.functional_currency)
      if (rateFor(connection, report_month) === null) {
        // Its figures are in another currency and the month has no rate: a
        // supplier of its would be quoted as dollars it is not (IICT-05).
        untranslatedOrgs.push(orgName)
        missingRates.push({ currency_pair: `${currency}/${PRESENTATION_CURRENCY}`, period: report_month })
        continue
      }
      const xeroHeaders = {
        'Authorization': `Bearer ${tokenResult.accessToken}`,
        'xero-tenant-id': connection.tenant_id,
        'Accept': 'application/json',
      }
      const pageContext = { tenantId: connection.tenant_id, reportMonth: report_month }
      const pacer = createTenantCallPacer({ clock: systemClock })

      const [invoicePages, bankTransactions, creditNotes] = await Promise.all([
        Promise.all(invoiceTypes.map(type =>
          fetchAllXeroPages(commentaryInvoicesUrl(report_month, type)!, xeroHeaders, 'Invoices', { ...pageContext, label: `Invoices (${type})` }, pacer)
        )),
        fetchAllXeroPages(bankUrl, xeroHeaders, 'BankTransactions', pageContext, pacer),
        creditNotesUrl
          ? fetchAllXeroPages(creditNotesUrl, xeroHeaders, 'CreditNotes', { ...pageContext, label: 'CreditNotes' }, pacer)
          : Promise.resolve([]),
      ])
      read.push({ connection, orgName, invoices: invoicePages.flat(), bankTransactions, creditNotes })

      if (process.env.NODE_ENV !== 'production') {
        console.log(`[Commentary] ${orgName}: ${invoicePages.flat().length} invoices, ${bankTransactions.length} bank transactions, ${creditNotes.length} credit notes for ${report_month}`)
      }
    }

    if (read.length === 0) {
      // Nothing was read anywhere — could not look, as a failed token always was.
      return NextResponse.json({ success: true, commentary: {}, checked: false })
    }

    // Coach-only, on every drafted line: a list that is missing an
    // organisation's suppliers under-quotes its account, and the coach is the
    // one who can tell whether that matters.
    const orgWarnings: string[] = []
    if (unreadOrgs.length > 0) {
      orgWarnings.push(`Suppliers from ${listNames(unreadOrgs)} are not included: Xero could not be read for ${unreadOrgs.length === 1 ? 'it' : 'them'}.`)
    }
    if (untranslatedOrgs.length > 0) {
      orgWarnings.push(`Suppliers from ${listNames(untranslatedOrgs)} are not included: ${describeMissingRates(missingRates)}.`)
    }

    // Load settings for detail tab cross-references
    let subscriptionAccountCodes: string[] = []
    let wagesAccountNames: string[] = []
    try {
      const { data: settingsRow } = await supabase
        .from('monthly_report_settings')
        .select('subscription_account_codes, wages_account_names')
        .eq('business_id', business_id)
        .maybeSingle()
      subscriptionAccountCodes = settingsRow?.subscription_account_codes || []
      wagesAccountNames = (settingsRow?.wages_account_names || []).map((n: string) => n.toLowerCase())
    } catch {
      // Settings not available — no cross-references
    }

    // Build commentary for each line (Phase 71-04 S1: iterates the unified
    // set, not just expense_lines). Each row carries `trigger_reason` from
    // the reasonByAccount resolver built up-front.
    const commentary: Record<string, {
      vendor_summary: VendorSummary[]
      /** The coach's prose. Never written by the generator. */
      coach_note: string
      is_edited: boolean
      detail_tab_ref?: 'subscriptions' | 'wages' | null
      trigger_reason?: TriggerReason
      /** The generated facts. Rebuilt every run; safe to overwrite. */
      draft_note?: string
      /** draft_note's supplier list and ratio clause, apart — see VarianceCommentaryEntry. */
      draft_facts?: string
      draft_clause?: string | null
      /** Coach-only: an unconvertible document, or a list that oversums. */
      draft_warnings?: string[]
    }> = {}

    for (const line of allLines) {
      const xeroName = line.xero_account_name || line.account_name
      // The account in each organisation that was read: its own code there.
      const inEachOrg = read.map((org) => ({ org, code: codeIn(org.connection, xeroName) })).filter((o) => !!o.code)
      const trigger_reason = reasonByAccount.get(line.account_name)

      // Determine detail tab cross-reference
      let detail_tab_ref: 'subscriptions' | 'wages' | null = null
      if (inEachOrg.some((o) => subscriptionAccountCodes.includes(o.code!))) {
        detail_tab_ref = 'subscriptions'
      } else if (wagesAccountNames.includes(xeroName.toLowerCase())) {
        detail_tab_ref = 'wages'
      }

      if (inEachOrg.length === 0) {
        // No account code (or BS line / revenue line without Xero P&L
        // membership) — still include with empty vendor summary so coach
        // can add notes. trigger_reason makes the row meaningful to the UI.
        commentary[line.account_name] = {
          vendor_summary: [],
          coach_note: '',
          is_edited: false,
          detail_tab_ref,
          trigger_reason,
        }
        continue
      }

      // Posted lines only, signed for the account's side, grouped by vendor
      // with the small ones rolled into "Others". A subscription account names
      // the product ("Google Workspace", as its subscription page does); every
      // other account names the company that billed it ("Google" on ad spend).
      //
      // Every organisation's documents for the account, merged BY NAME: a
      // supplier billing two organisations is one row, in the presentation
      // currency, so the list sums to the line above it (DRG-19, IICT-29).
      const side = sideByAccount.get(line.account_name) ?? 'expense'
      const significant: VendorSummary[] = summariseVendors(inEachOrg.flatMap(({ org, code }) => {
        const transactions = collectAccountTransactions({
          accountCode: code!,
          side,
          invoices: org.invoices,
          bankTransactions: org.bankTransactions,
          creditNotes: org.creditNotes,
          // The organisation's OWN currency: a document is converted into it at
          // the document's own rate, then the organisation into the report's.
          baseCurrency: org.connection.functional_currency ?? null,
          vendorNames: detail_tab_ref === 'subscriptions' ? 'product' : 'company',
        })
        const rate = rateFor(org.connection, report_month) ?? 1
        return rate === 1
          ? transactions
          // A line the document itself could not state in the organisation's
          // currency stays unconverted and out of every total, as it was.
          : transactions.map((t) => (t.converted === false ? t : { ...t, amount: t.amount * rate }))
      }))

      // The draft: facts only, rebuilt from scratch every run.
      //
      // It goes in its own field and never touches `coach_note`. That split is
      // what makes regenerating safe — facts that recompute cannot go stale,
      // and prose that is never overwritten cannot be lost. Urban Road's August
      // pack would otherwise have carried an over-budget flag on Wages against
      // a budget it is within 35 cents of, because the stored commentary
      // predated a budget-source switch.
      const ctx = ratio_context as RatioContext | null
      const accountActual = typeof line.actual === 'number' ? line.actual : null
      let draft_note = ''
      let draft_facts = ''
      let draft_clause: string | null = null
      let draft_warnings: string[] = []

      if (accountActual !== null) {
        const denom = ctx
          ? pickDenominator(line.account_name, ctx.revenueLines ?? [], {
              actual: ctx.incomeActual,
              budget: ctx.incomeBudget,
            })
          : null

        const clause = denom
          ? buildRatioClause({
              accountActual,
              accountBudget: typeof line.budget === 'number' ? line.budget : null,
              denominatorActual: denom.actual,
              denominatorBudget: denom.budget,
              priorAccountActual: priorActuals.get(line.xero_account_name ?? line.account_name) ?? null,
              priorDenominatorActual: priorIncomeActual,
              denominatorLabel: denom.label,
              priorMonthLabel,
            })
          : null

        const draft = buildDraftNote({
          accountName: line.account_name,
          vendors: significant.map(v => ({
            vendor: v.vendor,
            amount: v.amount,
            converted: v.converted,
            sourceCurrency: v.sourceCurrency,
          })),
          accountActual,
          clause,
        })
        draft_note = draft.body
        draft_facts = draft.facts
        draft_clause = draft.clause
        draft_warnings = draft.warnings
      }
      // An organisation that was not read, or could not be translated, is
      // missing from this list whether or not it was drafted.
      draft_warnings = [...draft_warnings, ...orgWarnings]

      commentary[line.account_name] = {
        vendor_summary: significant,
        coach_note: '',
        is_edited: false,
        detail_tab_ref,
        trigger_reason,
        draft_note,
        draft_facts,
        draft_clause,
        draft_warnings,
      }
    }

    // Phase 35 D-16: Silently revert an approved or sent report to draft after a coach edit.
    // Preserves snapshot_data (D-18) so the client's already-sent email link keeps working.
    // period_month is `${report_month}-01` (cfo_report_status uses date, monthly_report uses YYYY-MM).
    try {
      const periodMonth = `${report_month}-01`
      const result = await revertReportIfApproved(supabase, business_id, periodMonth)
      if (process.env.NODE_ENV !== 'production') {
        console.log('[monthly-report/commentary] revert', { business_id, periodMonth, ...result })
      }
    } catch (revertErr) {
      // Do not fail the save if revert tracking fails — log and continue.
      Sentry.captureException(revertErr, { tags: { route: 'monthly-report/commentary' }, extra: { context: "[monthly-report/commentary] revertReportIfApproved failed" } } as any)
    }

    return NextResponse.json({ success: true, commentary, checked: true })

  } catch (error) {
    Sentry.captureException(error, { tags: { route: 'monthly-report/commentary' }, extra: { context: "[Commentary] Error" } } as any)
    return NextResponse.json({ error: 'Failed to generate commentary' }, { status: 500 })
  }
}

export const POST = withSchema('monthly-report/commentary', CommentaryPostSchema, postHandler)
