import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createRouteHandlerClient } from '@/lib/supabase/server'
import { getValidAccessToken } from '@/lib/xero/token-manager'
import { verifyBusinessAccess } from '@/lib/utils/verify-business-access'

export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

/** Parse a Xero numeric string, returning 0 for empty/non-numeric */
function parseAmount(val: string): number {
  if (!val || val.trim() === '') return 0
  const n = parseFloat(val.replace(/,/g, ''))
  return isNaN(n) ? 0 : n
}

/**
 * Classify a balance sheet line item into an opening balance category.
 *
 * Xero balance sheet returns sections at the TOP LEVEL — not nested.
 * Typical section titles include: "Bank", "Current Assets", "Fixed Assets",
 * "Current Liabilities", "Non-Current Liabilities", "Equity" — plus the
 * plural "Assets"/"Liabilities" from some org layouts.
 */
function classifyAccount(label: string, sectionTitle: string): string | null {
  const l = label.toLowerCase()
  const s = sectionTitle.toLowerCase().trim()

  // "Bank" section — every line is a bank account regardless of label
  if (s === 'bank' || s === 'bank accounts' || s === 'cash at bank') {
    return 'bank'
  }

  const isAssetSection =
    s.includes('asset') ||
    s.includes('receivable') ||
    s.includes('inventor') ||
    s.includes('stock') ||
    s === 'current' // some layouts use 'Current' / 'Non-Current' as bare labels
  const isLiabilitySection =
    s.includes('liabilit') ||
    s.includes('payable') ||
    s.includes('creditor')

  // Asset-section items
  if (isAssetSection) {
    if (l.includes('bank') || l.includes('cash') || l.includes('cheque') ||
        l.includes('checking') || l.includes('savings') || l.includes('petty cash') ||
        l.includes('float') || l.includes('stripe') || l.includes('paypal') ||
        l.includes('wise') || l.includes('revolut')) {
      return 'bank'
    }
    if (l.includes('trade debtor') || l.includes('accounts receivable') ||
        l.includes('trade receivable') || l.includes('debtors') ||
        l.includes('a/r') || l === 'receivable' || l === 'receivables') {
      return 'trade_debtors'
    }
    if (l.includes('stock') || l.includes('inventory') || l.includes('inventories')) {
      return 'stock'
    }
  }

  // Liability-section items
  if (isLiabilitySection) {
    if (l.includes('trade creditor') || l.includes('accounts payable') ||
        l.includes('trade payable') || l.includes('creditors') ||
        l.includes('a/p') || l === 'payable' || l === 'payables') {
      return 'trade_creditors'
    }
    if (l.includes('gst') || l.includes('goods and services tax') || l.includes('bas')) {
      return 'gst'
    }
    if (l.includes('payg') && l.includes('withhold')) {
      return 'payg_wh'
    }
    if (l.includes('payg') && (l.includes('instalment') || l.includes('installment'))) {
      return 'payg_instalment'
    }
    if (l.includes('superannuation') || l.includes('super payable') ||
        l.includes('sgc') || l.includes('super guarantee')) {
      return 'super'
    }
  }

  return null
}

/**
 * POST /api/forecast/cashflow/sync-balances
 *
 * Fetches the Xero Balance Sheet at a given date and extracts opening
 * balances for the cashflow forecast: bank, trade debtors, trade creditors,
 * GST, PAYG, super, and stock.
 *
 * Body: { business_id, forecast_id, balance_date (YYYY-MM-DD), save?: boolean }
 */
export async function POST(request: NextRequest) {
  try {
    const authClient = await createRouteHandlerClient()
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { business_id, forecast_id, balance_date, save } = body

    if (!business_id || !balance_date) {
      return NextResponse.json({ error: 'business_id and balance_date are required' }, { status: 400 })
    }

    const hasAccess = await verifyBusinessAccess(user.id, business_id)
    if (!hasAccess) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Resolve Xero connection (3-step lookup pattern)
    let connection: any = null
    const { data: c1 } = await supabase.from('xero_connections').select('*').eq('business_id', business_id).eq('is_active', true).maybeSingle()
    if (c1) connection = c1
    if (!connection) {
      const { data: p } = await supabase.from('business_profiles').select('id').eq('business_id', business_id).maybeSingle()
      if (p?.id) {
        const { data: c2 } = await supabase.from('xero_connections').select('*').eq('business_id', p.id).eq('is_active', true).maybeSingle()
        if (c2) connection = c2
      }
    }
    if (!connection) {
      const { data: bp } = await supabase.from('business_profiles').select('business_id').eq('id', business_id).maybeSingle()
      if (bp?.business_id) {
        const { data: c3 } = await supabase.from('xero_connections').select('*').eq('business_id', bp.business_id).eq('is_active', true).maybeSingle()
        if (c3) connection = c3
      }
    }

    if (!connection) {
      return NextResponse.json({ error: 'No active Xero connection', code: 'NO_CONNECTION' }, { status: 400 })
    }

    const tokenResult = await getValidAccessToken(connection, supabase)
    if (!tokenResult.success) {
      return NextResponse.json({ error: 'Xero connection expired' }, { status: 401 })
    }

    const accessToken = tokenResult.accessToken!
    const tenantId = connection.tenant_id

    // Fetch Xero Balance Sheet at the given date (no comparison needed)
    const xeroUrl = `https://api.xero.com/api.xro/2.0/Reports/BalanceSheet?date=${balance_date}&periods=0&standardLayout=true`
    const xeroResp = await fetch(xeroUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'xero-tenant-id': tenantId,
        Accept: 'application/json',
      },
    })

    if (!xeroResp.ok) {
      const errText = await xeroResp.text()
      console.error('[SyncBalances] Xero API error:', xeroResp.status, errText)
      return NextResponse.json({ error: 'Xero API error' }, { status: 502 })
    }

    const xeroData = await xeroResp.json()
    const report = xeroData?.Reports?.[0]
    if (!report) {
      return NextResponse.json({ error: 'Empty response from Xero' }, { status: 502 })
    }

    // Accumulate balances by category
    const balances: Record<string, number> = {
      bank: 0,
      trade_debtors: 0,
      trade_creditors: 0,
      gst: 0,
      payg_wh: 0,
      payg_instalment: 0,
      super: 0,
      stock: 0,
    }

    // Also collect detected loan accounts
    const detectedLoans: { name: string; balance: number }[] = []

    // Log every classified line so we can audit what's being picked up
    const classificationLog: Array<{ section: string; label: string; amount: number; category: string | null }> = []

    for (const row of (report.Rows ?? [])) {
      if (row.RowType !== 'Section') continue
      const sectionTitle = row.Title ?? ''

      for (const inner of (row.Rows ?? [])) {
        if (inner.RowType === 'SummaryRow') continue
        const cells = inner.Cells ?? []
        const label = cells[0]?.Value ?? ''
        const amount = parseAmount(cells[1]?.Value ?? '')
        if (!label || amount === 0) continue

        const category = classifyAccount(label, sectionTitle)
        classificationLog.push({ section: sectionTitle, label, amount, category })
        if (category) {
          balances[category] += amount
        }

        // Detect loan accounts — check section + label for loan-like wording
        const sL = sectionTitle.toLowerCase()
        const isLiabSection = sL.includes('liabilit') || sL.includes('payable') || sL.includes('creditor')
        if (isLiabSection) {
          const ll = label.toLowerCase()
          if ((ll.includes('loan') || ll.includes('borrowing') || ll.includes('hire purchase') ||
               ll.includes('chattel mortgage') || ll.includes('finance lease')) &&
              !ll.includes('payg') && !ll.includes('gst')) {
            detectedLoans.push({ name: label, balance: Math.abs(amount) })
          }
        }
      }
    }

    console.log('[SyncBalances] Classified lines for business', business_id, 'at', balance_date, ':',
      JSON.stringify(classificationLog, null, 2))
    console.log('[SyncBalances] Final balances:', balances)

    // Try to calculate DSO/DPO from Xero aged receivables/payables
    let dso_days = 30
    let dso_auto_calculated = false
    let dpo_days = 30
    let dpo_auto_calculated = false

    try {
      // Fetch aged receivables summary for DSO estimate
      const arUrl = `https://api.xero.com/api.xro/2.0/Reports/AgedReceivablesByContact?date=${balance_date}`
      const arResp = await fetch(arUrl, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'xero-tenant-id': tenantId,
          Accept: 'application/json',
        },
      })
      if (arResp.ok) {
        const arData = await arResp.json()
        const arReport = arData?.Reports?.[0]
        if (arReport?.Rows) {
          // The last Section row typically has a SummaryRow with aged buckets
          // Cells: [Label, Current, <30, 30-60, 60-90, >90, Total]
          const sections = arReport.Rows.filter((r: any) => r.RowType === 'Section')
          const lastSection = sections[sections.length - 1]
          const summary = lastSection?.Rows?.find((r: any) => r.RowType === 'SummaryRow')
          if (summary?.Cells) {
            const total = parseAmount(summary.Cells[summary.Cells.length - 1]?.Value ?? '')
            const current = parseAmount(summary.Cells[1]?.Value ?? '')
            if (total > 0 && current > 0) {
              // Simple DSO estimate: if most is current (<30 days), DSO ≈ 20-25
              // If spread across aging buckets, weight accordingly
              const pctCurrent = current / total
              dso_days = Math.round(pctCurrent > 0.7 ? 25 : pctCurrent > 0.4 ? 40 : 55)
              dso_auto_calculated = true
            }
          }
        }
      }
    } catch {
      // Non-critical — keep defaults
    }

    try {
      // Fetch aged payables summary for DPO estimate
      const apUrl = `https://api.xero.com/api.xro/2.0/Reports/AgedPayablesByContact?date=${balance_date}`
      const apResp = await fetch(apUrl, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'xero-tenant-id': tenantId,
          Accept: 'application/json',
        },
      })
      if (apResp.ok) {
        const apData = await apResp.json()
        const apReport = apData?.Reports?.[0]
        if (apReport?.Rows) {
          const sections = apReport.Rows.filter((r: any) => r.RowType === 'Section')
          const lastSection = sections[sections.length - 1]
          const summary = lastSection?.Rows?.find((r: any) => r.RowType === 'SummaryRow')
          if (summary?.Cells) {
            const total = parseAmount(summary.Cells[summary.Cells.length - 1]?.Value ?? '')
            const current = parseAmount(summary.Cells[1]?.Value ?? '')
            if (total > 0 && current > 0) {
              const pctCurrent = current / total
              dpo_days = Math.round(pctCurrent > 0.7 ? 20 : pctCurrent > 0.4 ? 35 : 50)
              dpo_auto_calculated = true
            }
          }
        }
      }
    } catch {
      // Non-critical — keep defaults
    }

    const result = {
      opening_bank_balance: Math.round(balances.bank * 100) / 100,
      opening_trade_debtors: Math.round(balances.trade_debtors * 100) / 100,
      opening_trade_creditors: Math.round(Math.abs(balances.trade_creditors) * 100) / 100,
      opening_gst_liability: Math.round(Math.abs(balances.gst) * 100) / 100,
      opening_payg_wh_liability: Math.round(Math.abs(balances.payg_wh) * 100) / 100,
      opening_payg_instalment_liability: Math.round(Math.abs(balances.payg_instalment) * 100) / 100,
      opening_super_liability: Math.round(Math.abs(balances.super) * 100) / 100,
      opening_stock: Math.round(balances.stock * 100) / 100,
      dso_days,
      dso_auto_calculated,
      dpo_days,
      dpo_auto_calculated,
      balance_date,
      last_xero_sync_at: new Date().toISOString(),
      detected_loans: detectedLoans,
      // Include classification audit trail so the UI can show what was picked up
      classification_log: classificationLog,
    }

    // Optionally persist to the forecast's assumptions
    if (save && forecast_id) {
      const { data: forecast } = await supabase
        .from('financial_forecasts')
        .select('assumptions')
        .eq('id', forecast_id)
        .maybeSingle()

      if (forecast) {
        const existing = forecast.assumptions ?? {}
        const existingCashflow = existing.cashflow ?? {}
        const updated = {
          ...existing,
          cashflow: {
            ...existingCashflow,
            ...result,
            // Preserve user-configured values that shouldn't be overwritten by sync
            loans: existingCashflow.loans ?? result.detected_loans?.map((l: any) => ({
              name: l.name,
              balance: l.balance,
              monthly_repayment: 0,
              interest_rate: 0.065,
              is_interest_only: false,
            })) ?? [],
            planned_stock_changes: existingCashflow.planned_stock_changes ?? {},
          },
        }

        await supabase
          .from('financial_forecasts')
          .update({ assumptions: updated })
          .eq('id', forecast_id)
      }
    }

    return NextResponse.json({ data: result })
  } catch (err) {
    console.error('[SyncBalances] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
