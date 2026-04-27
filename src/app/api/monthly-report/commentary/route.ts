import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getValidAccessToken } from '@/lib/xero/token-manager'
import { extractVendorInfo } from '@/lib/utils/vendor-normalization'
import { revertReportIfApproved } from '@/lib/reports/revert-report'

export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

interface ExpenseOverBudgetLine {
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
      console.warn(`[Commentary] Rate limited on ${dataKey} page ${page}, waiting 10s...`)
      await sleep(10000)
      continue // retry same page
    }

    if (!res.ok) {
      console.error(`[Commentary] ${dataKey} page ${page} returned ${res.status}`)
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
    const body = await request.json()
    const { business_id, report_month, expense_lines } = body as {
      business_id: string
      report_month: string
      expense_lines: ExpenseOverBudgetLine[]
    }

    if (!business_id || !report_month || !expense_lines) {
      return NextResponse.json(
        { error: 'business_id, report_month, and expense_lines are required' },
        { status: 400 }
      )
    }

    if (expense_lines.length === 0) {
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
        .from('xero_pl_lines')
        .select('account_name, account_code')
        .eq('business_id', business_id)

      if (plLines) {
        for (const line of plLines) {
          if (line.account_name && line.account_code) {
            accountNameToCode.set(line.account_name.toLowerCase(), line.account_code)
          }
        }
      }
      console.log(`[Commentary] Loaded ${accountNameToCode.size} account codes from xero_pl_lines`)
    } catch (err) {
      console.error('[Commentary] Failed to load account codes from xero_pl_lines:', err)
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

    console.log(`[Commentary] Fetched ${invoices.length} invoices, ${bankTransactions.length} bank transactions for ${report_month}`)

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

    // Build commentary for each expense line over budget
    const commentary: Record<string, {
      vendor_summary: VendorSummary[]
      coach_note: string
      is_edited: boolean
      detail_tab_ref?: 'subscriptions' | 'wages' | null
    }> = {}

    for (const line of expense_lines) {
      const xeroName = line.xero_account_name || line.account_name
      const accountCode = accountNameToCode.get(xeroName.toLowerCase())

      // Determine detail tab cross-reference
      let detail_tab_ref: 'subscriptions' | 'wages' | null = null
      if (accountCode && subscriptionAccountCodes.includes(accountCode)) {
        detail_tab_ref = 'subscriptions'
      } else if (wagesAccountNames.includes(xeroName.toLowerCase())) {
        detail_tab_ref = 'wages'
      }

      if (!accountCode) {
        // No account code — still include with empty vendor summary so coach can add notes
        commentary[line.account_name] = {
          vendor_summary: [],
          coach_note: '',
          is_edited: false,
          detail_tab_ref,
        }
        continue
      }

      // Collect all transactions for this account and group by vendor
      const vendorData = new Map<string, { total: number; transactions: VendorTransaction[] }>()

      function addToVendor(vendor: string, txn: VendorTransaction) {
        const existing = vendorData.get(vendor) || { total: 0, transactions: [] }
        existing.total += txn.amount
        existing.transactions.push(txn)
        vendorData.set(vendor, existing)
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

      // Sort by amount descending
      const sorted = Array.from(vendorData.entries())
        .map(([vendor, data]) => ({
          vendor,
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
      }
    }

    // Phase 35 D-16: Silently revert an approved or sent report to draft after a coach edit.
    // Preserves snapshot_data (D-18) so the client's already-sent email link keeps working.
    // period_month is `${report_month}-01` (cfo_report_status uses date, monthly_report uses YYYY-MM).
    try {
      const periodMonth = `${report_month}-01`
      const result = await revertReportIfApproved(supabase, business_id, periodMonth)
      console.log('[monthly-report/commentary] revert', { business_id, periodMonth, ...result })
    } catch (revertErr) {
      // Do not fail the save if revert tracking fails — log and continue.
      console.error('[monthly-report/commentary] revertReportIfApproved failed:', revertErr)
    }

    return NextResponse.json({ success: true, commentary })

  } catch (error) {
    console.error('[Commentary] Error:', error)
    return NextResponse.json({ error: 'Failed to generate commentary' }, { status: 500 })
  }
}
