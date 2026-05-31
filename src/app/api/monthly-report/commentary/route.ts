import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getSupabaseSecretKey } from '@/lib/supabase/keys'
import { createRouteHandlerClient } from '@/lib/supabase/server'
import { getValidAccessToken } from '@/lib/xero/token-manager'
import { extractVendorInfo, createVendorKey } from '@/lib/utils/vendor-normalization'
import { revertReportIfApproved } from '@/lib/reports/revert-report'
import * as Sentry from '@sentry/nextjs'
import { requireSectionPermission } from '@/lib/permissions/requireSectionPermission'
import { enforceSectionPermission } from '@/lib/permissions/sectionPermissionConfig'

export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  getSupabaseSecretKey()
)

interface ExpenseOverBudgetLine {
  account_name: string
  xero_account_name: string
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

interface TriggerLineInput {
  account_name: string
  xero_account_name: string
}

interface VendorTransaction {
  date: string
  vendor: string
  context: string | null
  amount: number
  type: 'invoice' | 'bank'
}

interface VendorSummary {
  vendor: string
  amount: number
  transactions: VendorTransaction[]
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Fetch all pages of a paginated Xero endpoint.
 * Xero returns up to 100 items per page; if exactly 100 are returned, there may be more.
 */
async function fetchAllXeroPages(
  url: string,
  headers: Record<string, string>,
  dataKey: string,
  maxPages = 10
): Promise<any[]> {
  const all: any[] = []
  let page = 1

  while (page <= maxPages) {
    const separator = url.includes('?') ? '&' : '?'
    const res = await fetch(`${url}${separator}page=${page}`, { headers })

    if (res.status === 429) {
      Sentry.captureMessage(`[Commentary] Rate limited on ${dataKey} page ${page}, waiting 10s...`, 'warning' as any)
      await sleep(10000)
      continue // retry same page
    }

    if (!res.ok) {
      Sentry.captureMessage(`[Commentary] ${dataKey} page ${page} returned ${res.status}`, 'error' as any)
      break
    }

    const data = await res.json()
    const items = data[dataKey] || []
    all.push(...items)

    // Xero pagination: if fewer than 100 items, we've reached the last page
    if (items.length < 100) break

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
export async function POST(request: NextRequest) {
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
      trigger_reasons = {},
    } = body as {
      business_id: string
      report_month: string
      expense_lines: ExpenseOverBudgetLine[]
      revenue_lines?: TriggerLineInput[]
      favourable_expense_lines?: TriggerLineInput[]
      bs_lines?: TriggerLineInput[]
      trigger_reasons?: Record<string, TriggerReason>
    }

    if (!business_id || !report_month || !expense_lines) {
      return NextResponse.json(
        { error: 'business_id, report_month, and expense_lines are required' },
        { status: 400 }
      )
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
    for (const l of expense_lines) addReason(l.account_name, 'expense_over_budget_dollar')
    for (const l of revenue_lines) addReason(l.account_name, 'revenue_under_budget_dollar')
    for (const l of favourable_expense_lines) addReason(l.account_name, 'expense_favourable_significant')
    for (const l of bs_lines) addReason(l.account_name, 'bs_movement_dollar')

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

    if (allLines.length === 0) {
      return NextResponse.json({ success: true, commentary: {} })
    }

    // Check for Xero connection
    const { data: connection } = await supabase
      .from('xero_connections')
      .select('*')
      .eq('business_id', business_id)
      .eq('is_active', true)
      .maybeSingle()

    if (!connection) {
      return NextResponse.json({ success: true, commentary: {} })
    }

    // Get valid access token
    const tokenResult = await getValidAccessToken({ id: connection.id }, supabase)
    if (!tokenResult.success || !tokenResult.accessToken) {
      return NextResponse.json({ success: true, commentary: {} })
    }

    const accessToken = tokenResult.accessToken
    const tenantId = connection.tenant_id
    const xeroHeaders = {
      'Authorization': `Bearer ${accessToken}`,
      'xero-tenant-id': tenantId,
      'Accept': 'application/json',
    }

    // Build account name → code lookup from xero_pl_lines (already synced from Xero)
    // This is more reliable than fetching Chart of Accounts again, and the data is already local
    const accountNameToCode = new Map<string, string>()
    try {
      const { data: plLines } = await supabase
        .from('xero_pl_lines_wide_compat')
        .select('account_name, account_code')
        .eq('business_id', business_id)

      if (plLines) {
        for (const line of plLines) {
          if (line.account_name && line.account_code) {
            accountNameToCode.set(line.account_name.toLowerCase(), line.account_code)
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
    // (handles cases where user has manually mapped accounts)
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
            if (!accountNameToCode.has(m.xero_account_name.toLowerCase())) {
              accountNameToCode.set(m.xero_account_name.toLowerCase(), m.xero_account_code)
            }
          }
        }
      }
    } catch {
      // Non-fatal — mappings are supplementary
    }

    // Parse report month for date range
    const [year, monthNum] = report_month.split('-').map(Number)
    const nextMonth = monthNum === 12 ? 1 : monthNum + 1
    const nextYear = monthNum === 12 ? year + 1 : year
    const whereClause = `Date>=DateTime(${year},${monthNum},1)&&Date<DateTime(${nextYear},${nextMonth},1)`

    // Fetch ALL pages of Invoices and BankTransactions for the month
    const [invoices, bankTransactions] = await Promise.all([
      fetchAllXeroPages(
        `https://api.xero.com/api.xro/2.0/Invoices?where=${encodeURIComponent(whereClause)}`,
        xeroHeaders,
        'Invoices'
      ),
      fetchAllXeroPages(
        `https://api.xero.com/api.xro/2.0/BankTransactions?where=${encodeURIComponent(whereClause)}`,
        xeroHeaders,
        'BankTransactions'
      ),
    ])

    if (process.env.NODE_ENV !== 'production') {
      console.log(`[Commentary] Fetched ${invoices.length} invoices, ${bankTransactions.length} bank transactions for ${report_month}`)
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
      coach_note: string
      is_edited: boolean
      detail_tab_ref?: 'subscriptions' | 'wages' | null
      trigger_reason?: TriggerReason
    }> = {}

    for (const line of allLines) {
      const xeroName = line.xero_account_name || line.account_name
      const accountCode = accountNameToCode.get(xeroName.toLowerCase())
      const trigger_reason = reasonByAccount.get(line.account_name)

      // Determine detail tab cross-reference
      let detail_tab_ref: 'subscriptions' | 'wages' | null = null
      if (accountCode && subscriptionAccountCodes.includes(accountCode)) {
        detail_tab_ref = 'subscriptions'
      } else if (wagesAccountNames.includes(xeroName.toLowerCase())) {
        detail_tab_ref = 'wages'
      }

      if (!accountCode) {
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

      // Collect all transactions for this account and group by vendor.
      // B2 (Phase 71-01): key by createVendorKey(vendor) so a budgeted vendor
      // ("Stripe Au") matches an extracted Xero vendor ("STRIPE AU"). Preserve
      // the human display name on first insert for UI rendering.
      const vendorData = new Map<string, { display_name: string; total: number; transactions: VendorTransaction[] }>()

      function addToVendor(vendor: string, txn: VendorTransaction) {
        const key = createVendorKey(vendor)
        const existing = vendorData.get(key)
        if (existing) {
          existing.total += txn.amount
          existing.transactions.push(txn)
        } else {
          vendorData.set(key, { display_name: vendor, total: txn.amount, transactions: [txn] })
        }
      }

      for (const inv of invoices) {
        const contactName = inv.Contact?.Name || ''
        const invDate = inv.Date ? inv.Date.replace('/Date(', '').replace(')/', '').split('+')[0] : ''
        const dateStr = invDate ? new Date(parseInt(invDate)).toISOString().split('T')[0] : ''
        for (const li of (inv.LineItems || [])) {
          if (li.AccountCode === accountCode) {
            const info = extractVendorInfo(contactName, li.Description || '')
            const amount = Math.abs(li.LineAmount || 0)
            addToVendor(info.vendor, {
              date: dateStr,
              vendor: info.vendor,
              context: info.context,
              amount,
              type: 'invoice',
            })
          }
        }
      }

      for (const bt of bankTransactions) {
        const contactName = bt.Contact?.Name || ''
        const btDate = bt.Date ? bt.Date.replace('/Date(', '').replace(')/', '').split('+')[0] : ''
        const dateStr = btDate ? new Date(parseInt(btDate)).toISOString().split('T')[0] : ''
        for (const li of (bt.LineItems || [])) {
          if (li.AccountCode === accountCode) {
            const info = extractVendorInfo(contactName, li.Description || bt.Reference || '')
            const amount = Math.abs(li.LineAmount || 0)
            addToVendor(info.vendor, {
              date: dateStr,
              vendor: info.vendor,
              context: info.context,
              amount,
              type: 'bank',
            })
          }
        }
      }

      // Sort by amount descending. Map key is the normalized vendor key (B2);
      // the human-readable display_name is used in the response payload.
      const sorted = Array.from(vendorData.values())
        .map(data => ({
          vendor: data.display_name,
          amount: Math.round(data.total),
          transactions: data.transactions.sort((a, b) => b.amount - a.amount),
        }))
        .sort((a, b) => b.amount - a.amount)

      // Group small vendors (< $100) as "Others"
      const OTHERS_THRESHOLD = 100
      const significant: VendorSummary[] = []
      let othersTotal = 0
      let othersTransactions: VendorTransaction[] = []

      for (const entry of sorted) {
        if (entry.amount >= OTHERS_THRESHOLD) {
          significant.push(entry)
        } else {
          othersTotal += entry.amount
          othersTransactions.push(...entry.transactions)
        }
      }

      if (othersTotal > 0) {
        significant.push({ vendor: 'Others', amount: othersTotal, transactions: othersTransactions })
      }

      commentary[line.account_name] = {
        vendor_summary: significant,
        coach_note: '',
        is_edited: false,
        detail_tab_ref,
        trigger_reason,
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

    return NextResponse.json({ success: true, commentary })

  } catch (error) {
    Sentry.captureException(error, { tags: { route: 'monthly-report/commentary' }, extra: { context: "[Commentary] Error" } } as any)
    return NextResponse.json({ error: 'Failed to generate commentary' }, { status: 500 })
  }
}
