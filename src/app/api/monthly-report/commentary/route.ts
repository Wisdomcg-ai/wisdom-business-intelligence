import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getValidAccessToken } from '@/lib/xero/token-manager'
import { extractVendorName } from '@/lib/utils/vendor-normalization'

export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

interface ExpenseOverBudgetLine {
  account_name: string
  xero_account_name: string
}

interface VendorSummary {
  vendor: string
  amount: number
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
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

    // Fetch Chart of Accounts to build name→code lookup
    const accountNameToCode = new Map<string, string>()
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
          if (acc.Name && acc.Code) {
            accountNameToCode.set(acc.Name.toLowerCase(), acc.Code)
          }
        }
      }
    } catch (err) {
      console.error('[Commentary] Failed to fetch Chart of Accounts:', err)
    }

    // Parse report month for date range
    const [year, monthNum] = report_month.split('-').map(Number)
    const nextMonth = monthNum === 12 ? 1 : monthNum + 1
    const nextYear = monthNum === 12 ? year + 1 : year

    // Fetch Invoices for the month
    let invoices: any[] = []
    try {
      const whereClause = `Date>=DateTime(${year},${monthNum},1)&&Date<DateTime(${nextYear},${nextMonth},1)`
      const invoiceRes = await fetch(
        `https://api.xero.com/api.xro/2.0/Invoices?where=${encodeURIComponent(whereClause)}&page=1`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'xero-tenant-id': tenantId,
            'Accept': 'application/json',
          },
        }
      )

      if (invoiceRes.status === 429) {
        await sleep(10000)
      } else if (invoiceRes.ok) {
        const invoiceData = await invoiceRes.json()
        invoices = invoiceData.Invoices || []
      }
    } catch (err) {
      console.error('[Commentary] Failed to fetch invoices:', err)
    }

    await sleep(500)

    // Fetch BankTransactions for the month
    let bankTransactions: any[] = []
    try {
      const whereClause = `Date>=DateTime(${year},${monthNum},1)&&Date<DateTime(${nextYear},${nextMonth},1)`
      const btRes = await fetch(
        `https://api.xero.com/api.xro/2.0/BankTransactions?where=${encodeURIComponent(whereClause)}&page=1`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'xero-tenant-id': tenantId,
            'Accept': 'application/json',
          },
        }
      )

      if (btRes.status === 429) {
        await sleep(10000)
      } else if (btRes.ok) {
        const btData = await btRes.json()
        bankTransactions = btData.BankTransactions || []
      }
    } catch (err) {
      console.error('[Commentary] Failed to fetch bank transactions:', err)
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
      const vendorTotals = new Map<string, number>()

      for (const inv of invoices) {
        const contactName = inv.Contact?.Name || ''
        for (const li of (inv.LineItems || [])) {
          if (li.AccountCode === accountCode) {
            const vendor = extractVendorName(contactName, li.Description || '')
            const amount = Math.abs(li.LineAmount || 0)
            vendorTotals.set(vendor, (vendorTotals.get(vendor) || 0) + amount)
          }
        }
      }

      for (const bt of bankTransactions) {
        const contactName = bt.Contact?.Name || ''
        for (const li of (bt.LineItems || [])) {
          if (li.AccountCode === accountCode) {
            const vendor = extractVendorName(contactName, li.Description || bt.Reference || '')
            const amount = Math.abs(li.LineAmount || 0)
            vendorTotals.set(vendor, (vendorTotals.get(vendor) || 0) + amount)
          }
        }
      }

      // Sort by amount descending
      const sorted = Array.from(vendorTotals.entries())
        .map(([vendor, amount]) => ({ vendor, amount: Math.round(amount) }))
        .sort((a, b) => b.amount - a.amount)

      // Group small vendors (< $100) as "Others"
      const OTHERS_THRESHOLD = 100
      const significant: VendorSummary[] = []
      let othersTotal = 0

      for (const entry of sorted) {
        if (entry.amount >= OTHERS_THRESHOLD) {
          significant.push(entry)
        } else {
          othersTotal += entry.amount
        }
      }

      if (othersTotal > 0) {
        significant.push({ vendor: 'Others', amount: othersTotal })
      }

      commentary[line.account_name] = {
        vendor_summary: significant,
        coach_note: '',
        is_edited: false,
        detail_tab_ref,
      }
    }

    return NextResponse.json({ success: true, commentary })

  } catch (error) {
    console.error('[Commentary] Error:', error)
    return NextResponse.json({ error: 'Failed to generate commentary' }, { status: 500 })
  }
}
