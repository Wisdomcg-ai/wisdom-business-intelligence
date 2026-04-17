import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createRouteHandlerClient } from '@/lib/supabase/server'
import { getValidAccessToken } from '@/lib/xero/token-manager'
import { verifyBusinessAccess } from '@/lib/utils/verify-business-access'
import { resolveBusinessIds } from '@/lib/utils/resolve-business-ids'
import {
  buildCashflowStatement,
  type BalanceSheetSnapshot,
  type StatementClassification,
} from '@/lib/cashflow/statement'

export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

function parseAmount(val: string): number {
  if (!val || val.trim() === '') return 0
  const n = parseFloat(val.replace(/,/g, ''))
  return isNaN(n) ? 0 : n
}

function lastDayOfMonth(month: string): string {
  const [y, m] = month.split('-').map(Number)
  const last = new Date(y, m, 0)
  return `${y}-${String(m).padStart(2, '0')}-${String(last.getDate()).padStart(2, '0')}`
}

function parseXeroMonthLabel(raw: string): string {
  const parts = raw.trim().split(' ')
  if (parts.length < 3) return ''
  const monthMap: Record<string, number> = {
    jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
    jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
  }
  const m = monthMap[parts[1].slice(0, 3).toLowerCase()]
  const y = parseInt(parts[parts.length - 1], 10)
  return (m && y) ? `${y}-${String(m).padStart(2, '0')}` : ''
}

function monthsDiff(from: string, to: string): number {
  const [fy, fm] = from.split('-').map(Number)
  const [ty, tm] = to.split('-').map(Number)
  return (ty - fy) * 12 + (tm - fm)
}

/**
 * GET /api/forecast/cashflow/statement?forecast_id=xxx&from=YYYY-MM&to=YYYY-MM
 *
 * Builds an AASB 107 Cashflow Statement for the period, using:
 * - Xero P&L for net profit + depreciation add-back
 * - Xero balance sheet snapshots at from-1 and to for opening/closing cash
 * - cashflow_statement_classification for the four-list categorisation
 *
 * Returns the full statement structure ready to render.
 */
export async function GET(request: NextRequest) {
  try {
    const authClient = await createRouteHandlerClient()
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const url = new URL(request.url)
    const forecastId = url.searchParams.get('forecast_id')
    const fromMonth = url.searchParams.get('from')  // YYYY-MM
    const toMonth = url.searchParams.get('to')      // YYYY-MM

    if (!forecastId || !fromMonth || !toMonth) {
      return NextResponse.json({ error: 'forecast_id, from, to are required' }, { status: 400 })
    }

    // Resolve forecast + access
    const { data: forecast } = await supabase
      .from('financial_forecasts')
      .select('id, business_id')
      .eq('id', forecastId)
      .maybeSingle()
    if (!forecast) return NextResponse.json({ error: 'Forecast not found' }, { status: 404 })

    const ids = await resolveBusinessIds(supabase, forecast.business_id)
    const hasAccess = await verifyBusinessAccess(user.id, ids.bizId)
    if (!hasAccess) return NextResponse.json({ error: 'Access denied' }, { status: 403 })

    // Load classifications
    const { data: classifications } = await supabase
      .from('cashflow_statement_classification')
      .select('*')
      .eq('forecast_id', forecastId)

    const classList: StatementClassification[] = (classifications ?? []).map(c => ({
      xero_account_id: c.xero_account_id,
      account_code: c.account_code,
      account_name: c.account_name ?? '',
      account_type: c.account_type,
      list_type: c.list_type,
    }))

    // Load Xero actuals totals (P&L net profit + depreciation)
    const { data: xeroLines } = await supabase
      .from('xero_pl_lines')
      .select('account_name, account_type, monthly_values')
      .in('business_id', ids.all)

    const monthsInRange: string[] = []
    {
      const n = monthsDiff(fromMonth, toMonth) + 1
      for (let i = 0; i < n; i++) {
        const [y, m] = fromMonth.split('-').map(Number)
        const d = new Date(y, m - 1 + i, 1)
        monthsInRange.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
      }
    }

    let netProfitTotal = 0
    let depreciationAddback = 0
    for (const line of (xeroLines ?? [])) {
      const mv: Record<string, number> = line.monthly_values ?? {}
      for (const m of monthsInRange) {
        const v = mv[m] ?? 0
        if (line.account_type === 'revenue' || line.account_type === 'other_income') {
          netProfitTotal += v
        } else if (line.account_type === 'cogs' || line.account_type === 'opex' || line.account_type === 'other_expense') {
          netProfitTotal -= Math.abs(v)
          const nameLower = (line.account_name ?? '').toLowerCase()
          if (nameLower.includes('depreciation') || nameLower.includes('amortisation') || nameLower.includes('amortization')) {
            depreciationAddback += Math.abs(v)
          }
        }
      }
    }

    // Load Xero balance sheet with monthly periods to get opening + closing snapshots
    // We need the balance from the month BEFORE `from` (opening) and the `to` month (closing)
    const [fromYear, fromMon] = fromMonth.split('-').map(Number)
    const priorMonth = fromMon === 1 ? `${fromYear - 1}-12` : `${fromYear}-${String(fromMon - 1).padStart(2, '0')}`
    const toDate = lastDayOfMonth(toMonth)
    const totalMonths = monthsDiff(priorMonth, toMonth) + 1
    const periods = Math.max(0, Math.min(totalMonths - 1, 11))

    // Connection
    let connection: any = null
    const { data: c1 } = await supabase.from('xero_connections').select('*').eq('business_id', ids.bizId).eq('is_active', true).maybeSingle()
    if (c1) connection = c1
    if (!connection) {
      const { data: p } = await supabase.from('business_profiles').select('id').eq('business_id', ids.bizId).maybeSingle()
      if (p?.id) {
        const { data: c2 } = await supabase.from('xero_connections').select('*').eq('business_id', p.id).eq('is_active', true).maybeSingle()
        if (c2) connection = c2
      }
    }
    if (!connection) {
      return NextResponse.json({ error: 'No active Xero connection' }, { status: 400 })
    }

    const tokenResult = await getValidAccessToken(connection, supabase)
    if (!tokenResult.success) {
      return NextResponse.json({ error: 'Xero token expired' }, { status: 401 })
    }

    const xeroUrl = `https://api.xero.com/api.xro/2.0/Reports/BalanceSheet?date=${toDate}&periods=${periods}&timeframe=MONTH&standardLayout=true`
    const xeroResp = await fetch(xeroUrl, {
      headers: {
        Authorization: `Bearer ${tokenResult.accessToken}`,
        'xero-tenant-id': connection.tenant_id,
        Accept: 'application/json',
      },
    })

    if (!xeroResp.ok) {
      return NextResponse.json({ error: 'Xero API error' }, { status: 502 })
    }

    const xeroData = await xeroResp.json()
    const report = xeroData?.Reports?.[0]
    if (!report) return NextResponse.json({ error: 'Empty Xero response' }, { status: 502 })

    // Parse header to get column months
    const headerRow = (report.Rows ?? []).find((r: any) => r.RowType === 'Header')
    const columnMonths: string[] = []
    if (headerRow?.Cells) {
      for (let i = 1; i < headerRow.Cells.length; i++) {
        columnMonths.push(parseXeroMonthLabel(headerRow.Cells[i]?.Value ?? ''))
      }
    }

    // Look up xero_accounts cache to map account_name → xero_account_id
    const { data: cachedAccts } = await supabase
      .from('xero_accounts')
      .select('xero_account_id, account_name, xero_type')
      .eq('business_id', ids.bizId)
    const nameToXeroId = new Map<string, string>()
    const nameToXeroType = new Map<string, string>()
    for (const a of (cachedAccts ?? [])) {
      nameToXeroId.set((a.account_name ?? '').toLowerCase(), a.xero_account_id)
      nameToXeroType.set((a.account_name ?? '').toLowerCase(), a.xero_type ?? '')
    }

    // Build balance sheet snapshots per column month.
    // balancesByAccount is keyed by xero_account_id (so it matches classifications)
    // bankTotal is the sum of BANK type accounts
    const snapshots: Record<string, BalanceSheetSnapshot> = {}
    for (const m of columnMonths) {
      if (m) snapshots[m] = { month: m, balancesByAccount: {}, bankTotal: 0 }
    }

    for (const row of (report.Rows ?? [])) {
      if (row.RowType !== 'Section') continue
      for (const inner of (row.Rows ?? [])) {
        if (inner.RowType === 'SummaryRow') continue
        const cells = inner.Cells ?? []
        const label = cells[0]?.Value ?? ''
        if (!label) continue

        const lowerLabel = label.toLowerCase()
        const xeroAccountId = nameToXeroId.get(lowerLabel)
        const xeroType = nameToXeroType.get(lowerLabel)

        for (let i = 0; i < columnMonths.length; i++) {
          const mk = columnMonths[i]
          if (!mk) continue
          const amount = parseAmount(cells[i + 1]?.Value ?? '')
          const snap = snapshots[mk]
          if (!snap) continue

          if (xeroAccountId) {
            snap.balancesByAccount[xeroAccountId] = (snap.balancesByAccount[xeroAccountId] ?? 0) + amount
          }
          if (xeroType === 'BANK') {
            snap.bankTotal += amount
          }
        }
      }
    }

    // Build the statement
    const statement = buildCashflowStatement({
      period: { from: priorMonth, to: toMonth },  // opening from prior month, closing at toMonth
      netProfitTotal,
      depreciationAddback,
      balancesByMonth: snapshots,
      classifications: classList,
    })

    return NextResponse.json({ data: statement })
  } catch (err) {
    console.error('[Cashflow Statement] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
