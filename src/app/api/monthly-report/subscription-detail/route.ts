import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getValidAccessToken } from '@/lib/xero/token-manager'
import { extractVendorName, createVendorKey } from '@/lib/utils/vendor-normalization'
import { buildFuzzyLookup } from '@/lib/utils/account-matching'
import { resolveBusinessIds } from '@/lib/utils/resolve-business-ids'

export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/** Fetch all pages from a paginated Xero endpoint */
async function fetchAllPages(
  url: string,
  whereClause: string,
  accessToken: string,
  tenantId: string,
  resultKey: string,
): Promise<any[]> {
  const allResults: any[] = []
  let page = 1
  const maxPages = 5 // safety cap

  while (page <= maxPages) {
    const res = await fetch(
      `${url}?where=${encodeURIComponent(whereClause)}&page=${page}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'xero-tenant-id': tenantId,
          'Accept': 'application/json',
        },
      }
    )

    if (res.status === 429) {
      await sleep(10000)
      continue // retry same page
    }

    if (!res.ok) break

    const data = await res.json()
    const items = data[resultKey] || []
    allResults.push(...items)

    // Xero returns 100 per page; fewer means last page
    if (items.length < 100) break

    page++
    await sleep(300)
  }

  return allResults
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
export async function POST(request: NextRequest) {
  try {
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

    const emptyData = { accounts: [], grand_total: { prior_month: 0, actual: 0, budget: 0, variance: 0 }, report_month: report_month || '' }

    // Return empty data if no account codes configured
    if (!account_codes || account_codes.length === 0) {
      return NextResponse.json({ success: true, data: emptyData })
    }

    // Check for Xero connection
    const { data: connection } = await supabase
      .from('xero_connections')
      .select('*')
      .eq('business_id', business_id)
      .eq('is_active', true)
      .maybeSingle()

    if (!connection) {
      return NextResponse.json({ success: true, data: emptyData })
    }

    // Get valid access token
    const tokenResult = await getValidAccessToken({ id: connection.id }, supabase)
    if (!tokenResult.success || !tokenResult.accessToken) {
      return NextResponse.json({ success: true, data: emptyData })
    }

    const accessToken = tokenResult.accessToken
    const tenantId = connection.tenant_id

    // Parse report month for date ranges
    const [year, monthNum] = report_month.split('-').map(Number)
    const nextMonth = monthNum === 12 ? 1 : monthNum + 1
    const nextYear = monthNum === 12 ? year + 1 : year
    const priorMonth = monthNum === 1 ? 12 : monthNum - 1
    const priorYear = monthNum === 1 ? year - 1 : year

    // Fetch Chart of Accounts for code→name lookup
    const accountNameMap = new Map<string, string>()
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
          if (acc.Code && acc.Name) accountNameMap.set(acc.Code, acc.Name)
        }
      }
    } catch (err) {
      console.error('[SubscriptionDetail] Failed to fetch accounts:', err)
    }

    // Vendor totals: accountCode → vendorKey → { vendor_name, actual, prior_actual }
    const vendorData = new Map<string, Map<string, { vendor_name: string; actual: number; prior_actual: number }>>()
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
        if (isCurrent) existing.actual += amount
        else existing.prior_actual += amount
      } else {
        accountVendors.set(vendorKey, {
          vendor_name: vendorName,
          actual: isCurrent ? amount : 0,
          prior_actual: isCurrent ? 0 : amount,
        })
      }
    }

    const priorNextMonth = priorMonth === 12 ? 1 : priorMonth + 1
    const priorNextYear = priorMonth === 12 ? priorYear + 1 : priorYear

    // Process bank transactions into vendor breakdown
    function processBankTxns(txns: any[], isCurrent: boolean) {
      for (const bt of txns) {
        const contactName = bt.Contact?.Name || ''
        for (const li of (bt.LineItems || [])) {
          if (account_codes.includes(li.AccountCode)) {
            const vendorName = extractVendorName(contactName, li.Description || bt.Reference || '')
            const amount = li.LineAmount || 0
            addLineItem(li.AccountCode, vendorName, amount, isCurrent)
          }
        }
      }
    }

    // Fetch CURRENT month bank transactions (all pages)
    try {
      const txns = await fetchAllPages(
        'https://api.xero.com/api.xro/2.0/BankTransactions',
        `Date>=DateTime(${year},${monthNum},1)&&Date<DateTime(${nextYear},${nextMonth},1)&&Type=="SPEND"`,
        accessToken, tenantId, 'BankTransactions'
      )
      processBankTxns(txns, true)
    } catch (err) {
      console.error('[SubscriptionDetail] Failed to fetch current bank txns:', err)
    }

    await sleep(300)

    // Fetch PRIOR month bank transactions (all pages)
    try {
      const txns = await fetchAllPages(
        'https://api.xero.com/api.xro/2.0/BankTransactions',
        `Date>=DateTime(${priorYear},${priorMonth},1)&&Date<DateTime(${priorNextYear},${priorNextMonth},1)&&Type=="SPEND"`,
        accessToken, tenantId, 'BankTransactions'
      )
      processBankTxns(txns, false)
    } catch (err) {
      console.error('[SubscriptionDetail] Failed to fetch prior bank txns:', err)
    }

    // Fetch per-vendor budgets from subscription_budgets
    const budgetMap = new Map<string, number>()
    try {
      const { data: budgets } = await supabase
        .from('subscription_budgets')
        .select('vendor_key, monthly_budget')
        .eq('business_id', business_id)
        .eq('is_active', true)

      for (const b of (budgets || [])) {
        budgetMap.set(b.vendor_key, b.monthly_budget || 0)
      }
    } catch (err) {
      console.error('[SubscriptionDetail] Failed to fetch budgets:', err)
    }

    // ── Authoritative P&L actuals from xero_pl_lines (matches main report) ──
    const plActuals = new Map<string, number>()
    const plPriorActuals = new Map<string, number>()
    const priorMonthKey = `${priorYear}-${String(priorMonth).padStart(2, '0')}`
    try {
      const accountNames = account_codes
        .map(code => accountNameMap.get(code))
        .filter((name): name is string => !!name)

      if (accountNames.length > 0) {
        const { data: plLines } = await supabase
          .from('xero_pl_lines_wide_compat')
          .select('account_name, monthly_values')
          .eq('business_id', business_id)
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
      console.error('[SubscriptionDetail] Failed to fetch P&L actuals:', err)
    }

    // ── Authoritative budget from forecast_pl_lines (matches main report) ──
    const plBudgets = new Map<string, number>()
    try {
      const { data: settingsRow } = await supabase
        .from('monthly_report_settings')
        .select('budget_forecast_id')
        .eq('business_id', business_id)
        .maybeSingle()

      let forecastId: string | null = settingsRow?.budget_forecast_id || null

      if (!forecastId) {
        // Resolve business_profiles.id from businesses.id
        const ids = await resolveBusinessIds(supabase, business_id)
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
      console.error('[SubscriptionDetail] Failed to fetch forecast budgets:', err)
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
      },
    })
  } catch (error) {
    console.error('[SubscriptionDetail] Error:', error)
    return NextResponse.json({ error: 'Failed to load subscription detail' }, { status: 500 })
  }
}
