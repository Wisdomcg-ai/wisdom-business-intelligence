import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getValidAccessToken } from '@/lib/xero/token-manager'
import { fetchBalanceSheet } from '@/lib/xero/balance-sheet'

export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

/**
 * POST /api/forecast/cashflow/sync-balances
 *
 * Fetches Xero Balance Sheet at a given date and extracts opening balances
 * for the cashflow forecast. Auto-calculates DSO and DPO from BS + P&L data.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { business_id, forecast_id, balance_date, save } = body as {
      business_id: string
      forecast_id: string
      balance_date: string
      save?: boolean
    }

    if (!business_id || !forecast_id || !balance_date) {
      return NextResponse.json(
        { error: 'business_id, forecast_id, and balance_date are required' },
        { status: 400 }
      )
    }

    // Get Xero connection
    const { data: connection } = await supabase
      .from('xero_connections')
      .select('*')
      .eq('business_id', business_id)
      .eq('is_active', true)
      .maybeSingle()

    if (!connection) {
      return NextResponse.json({ error: 'No active Xero connection' }, { status: 400 })
    }

    const tokenResult = await getValidAccessToken({ id: connection.id }, supabase)
    if (!tokenResult.success || !tokenResult.accessToken) {
      return NextResponse.json({ error: 'Failed to get Xero access token' }, { status: 401 })
    }

    const accessToken = tokenResult.accessToken
    const tenantId = connection.tenant_id

    // Fetch Balance Sheet
    const bs = await fetchBalanceSheet(accessToken, tenantId, balance_date)
    if (!bs) {
      return NextResponse.json({ error: 'Failed to fetch Balance Sheet from Xero' }, { status: 500 })
    }

    // Extract balances by classification
    let bankBalance = 0
    let tradeDebtors = 0
    let tradeCreditors = 0
    let gstLiability = 0
    let paygWHLiability = 0
    let superLiability = 0
    let stock = 0
    const detectedLoans: { name: string; balance: number }[] = []

    for (const [name, acc] of bs) {
      switch (acc.class) {
        case 'cash':
          bankBalance += acc.value
          break
        case 'receivable':
          tradeDebtors += acc.value
          break
        case 'payable':
          // Separate GST and PAYG from trade creditors
          const lower = name.toLowerCase()
          if (lower.includes('gst')) {
            gstLiability += Math.abs(acc.value)
          } else if (lower.includes('payg') && (lower.includes('withhold') || lower.includes('payroll'))) {
            paygWHLiability += Math.abs(acc.value)
          } else {
            tradeCreditors += Math.abs(acc.value)
          }
          break
        case 'stock':
          stock += acc.value
          break
        case 'super_payable':
          superLiability += Math.abs(acc.value)
          break
        case 'payg_wh':
          paygWHLiability += Math.abs(acc.value)
          break
        case 'loan':
          detectedLoans.push({ name, balance: Math.abs(acc.value) })
          break
      }
    }

    // Auto-calculate DSO and DPO from P&L data
    let dsoDays = 30
    let dpoDays = 30
    let dsoAutoCalculated = false
    let dpoAutoCalculated = false

    try {
      const { data: plLines } = await supabase
        .from('xero_pl_lines')
        .select('category, monthly_values')
        .eq('business_id', business_id)

      if (plLines && plLines.length > 0) {
        let totalRevenue = 0
        let totalCOGS = 0
        let monthCount = 0

        for (const line of plLines) {
          const values = line.monthly_values || {}
          const months = Object.keys(values)
          if (months.length > monthCount) monthCount = months.length

          for (const val of Object.values(values) as number[]) {
            if (line.category === 'Revenue' || line.category === 'Other Income') {
              totalRevenue += val
            } else if (line.category === 'Cost of Sales') {
              totalCOGS += Math.abs(val)
            }
          }
        }

        // Annualize based on months of data
        if (monthCount > 0 && totalRevenue > 0) {
          const annualizedRevenue = (totalRevenue / monthCount) * 12
          dsoDays = Math.round((tradeDebtors / annualizedRevenue) * 365)
          dsoDays = Math.max(0, Math.min(dsoDays, 120)) // Clamp to reasonable range
          dsoAutoCalculated = true
        }

        if (monthCount > 0 && totalCOGS > 0) {
          const annualizedCOGS = (totalCOGS / monthCount) * 12
          dpoDays = Math.round((tradeCreditors / annualizedCOGS) * 365)
          dpoDays = Math.max(0, Math.min(dpoDays, 120)) // Clamp to reasonable range
          dpoAutoCalculated = true
        }
      }
    } catch (err) {
      console.error('[SyncBalances] Error calculating DSO/DPO:', err)
    }

    const extractedData = {
      opening_bank_balance: Math.round(bankBalance * 100) / 100,
      opening_trade_debtors: Math.round(tradeDebtors * 100) / 100,
      opening_trade_creditors: Math.round(tradeCreditors * 100) / 100,
      opening_gst_liability: Math.round(gstLiability * 100) / 100,
      opening_payg_wh_liability: Math.round(paygWHLiability * 100) / 100,
      opening_payg_instalment_liability: 0,
      opening_super_liability: Math.round(superLiability * 100) / 100,
      opening_stock: Math.round(stock * 100) / 100,
      dso_days: dsoDays,
      dso_auto_calculated: dsoAutoCalculated,
      dpo_days: dpoDays,
      dpo_auto_calculated: dpoAutoCalculated,
      balance_date,
      last_xero_sync_at: new Date().toISOString(),
      detected_loans: detectedLoans,
    }

    // Optionally save to cashflow_assumptions table
    if (save) {
      const { data: existing } = await supabase
        .from('cashflow_assumptions')
        .select('id')
        .eq('forecast_id', forecast_id)
        .maybeSingle()

      const saveData = {
        ...extractedData,
        loans: detectedLoans.map(l => ({
          name: l.name,
          balance: l.balance,
          monthly_repayment: 0,
          interest_rate: 0.065,
          is_interest_only: false,
        })),
      }
      // Remove detected_loans from save data (not a DB column)
      const { detected_loans: _, ...dbData } = saveData as any

      if (existing) {
        await supabase
          .from('cashflow_assumptions')
          .update({ ...dbData, updated_at: new Date().toISOString() })
          .eq('id', existing.id)
      } else {
        await supabase
          .from('cashflow_assumptions')
          .insert({ forecast_id, business_id, ...dbData })
      }
    }

    return NextResponse.json({ success: true, data: extractedData })
  } catch (error) {
    console.error('[SyncBalances] Error:', error)
    return NextResponse.json({ error: 'Failed to sync balances from Xero' }, { status: 500 })
  }
}
