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

function parseAmount(val: string): number {
  if (!val || val.trim() === '') return 0
  const n = parseFloat(val.replace(/,/g, ''))
  return isNaN(n) ? 0 : n
}

/** Last day of a YYYY-MM as YYYY-MM-DD */
function lastDayOfMonth(month: string): string {
  const [y, m] = month.split('-').map(Number)
  const last = new Date(y, m, 0)
  return `${y}-${String(m).padStart(2, '0')}-${String(last.getDate()).padStart(2, '0')}`
}

/** Add N months to YYYY-MM */
function addMonths(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m - 1 + n, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** Diff in months between two YYYY-MM strings (to - from) */
function monthsDiff(from: string, to: string): number {
  const [fy, fm] = from.split('-').map(Number)
  const [ty, tm] = to.split('-').map(Number)
  return (ty - fy) * 12 + (tm - fm)
}

/** Is this row's label a bank account? */
function isBankLabel(label: string, sectionTitle: string): boolean {
  const l = label.toLowerCase()
  const s = sectionTitle.toLowerCase().trim()
  // "Bank" section — every row is a bank account
  if (s === 'bank' || s === 'bank accounts' || s === 'cash at bank') return true
  // In asset sections, match by keyword
  const isAssetSection = s.includes('asset') || s === 'current' || s === 'non-current'
  if (!isAssetSection) return false
  return l.includes('bank') || l.includes('cash') || l.includes('cheque') ||
         l.includes('checking') || l.includes('savings') || l.includes('petty cash') ||
         l.includes('float') || l.includes('stripe') || l.includes('paypal') ||
         l.includes('wise') || l.includes('revolut')
}

/**
 * POST /api/forecast/cashflow/bank-balances
 *
 * Fetches Xero Balance Sheet covering a range of month-ends and returns the
 * total bank balance for each month. Used by the cashflow forecast to
 * reconcile actual-month bank balances against Xero instead of deriving
 * them from P&L + timing assumptions.
 *
 * Body: { business_id, from_month (YYYY-MM), to_month (YYYY-MM) }
 * Returns: { data: { "2025-07": 150000, "2025-08": 165000, ... } }
 */
export async function POST(request: NextRequest) {
  try {
    const authClient = await createRouteHandlerClient()
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { business_id, from_month, to_month } = body

    if (!business_id || !from_month || !to_month) {
      return NextResponse.json({ error: 'business_id, from_month, to_month required' }, { status: 400 })
    }

    const hasAccess = await verifyBusinessAccess(user.id, business_id)
    if (!hasAccess) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    const totalMonths = monthsDiff(from_month, to_month) + 1
    if (totalMonths < 1 || totalMonths > 36) {
      return NextResponse.json({ error: 'Date range must be 1-36 months' }, { status: 400 })
    }

    // Resolve Xero connection (3-step pattern)
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
      return NextResponse.json({ error: 'No active Xero connection' }, { status: 400 })
    }

    const tokenResult = await getValidAccessToken(connection, supabase)
    if (!tokenResult.success) {
      return NextResponse.json({ error: 'Xero connection expired' }, { status: 401 })
    }

    const accessToken = tokenResult.accessToken!
    const tenantId = connection.tenant_id

    // Xero balance sheet: date = most recent month-end, periods = N-1 prior months
    // Returns N columns (one per month)
    const toDate = lastDayOfMonth(to_month)
    const periods = Math.min(totalMonths - 1, 11) // Xero caps periods at ~11

    // For >12 months we need to chunk. For now, cap at the most recent 12 months
    // (the user's actual period is usually <= 12 months anyway).
    const xeroUrl = `https://api.xero.com/api.xro/2.0/Reports/BalanceSheet?date=${toDate}&periods=${periods}&timeframe=MONTH&standardLayout=true`

    const xeroResp = await fetch(xeroUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'xero-tenant-id': tenantId,
        Accept: 'application/json',
      },
    })

    if (!xeroResp.ok) {
      const errText = await xeroResp.text()
      console.error('[BankBalances] Xero API error:', xeroResp.status, errText)
      return NextResponse.json({ error: 'Xero API error' }, { status: 502 })
    }

    const xeroData = await xeroResp.json()
    const report = xeroData?.Reports?.[0]
    if (!report) {
      return NextResponse.json({ error: 'Empty Xero response' }, { status: 502 })
    }

    // Parse the header row to get the date column labels
    // Column 0 is the account name; columns 1..N are period dates
    const headerRow = (report.Rows ?? []).find((r: any) => r.RowType === 'Header')
    const columnMonths: string[] = []
    if (headerRow?.Cells) {
      for (let i = 1; i < headerRow.Cells.length; i++) {
        const raw = headerRow.Cells[i]?.Value ?? ''
        // Xero label looks like "31 Mar 2026" or "31 March 2026"
        const parts = raw.trim().split(' ')
        if (parts.length >= 3) {
          const monthName = parts[1].slice(0, 3).toLowerCase()
          const monthMap: Record<string, number> = {
            jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
            jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
          }
          const m = monthMap[monthName]
          const y = parseInt(parts[parts.length - 1], 10)
          if (m && y) {
            columnMonths.push(`${y}-${String(m).padStart(2, '0')}`)
          } else {
            columnMonths.push('')
          }
        } else {
          columnMonths.push('')
        }
      }
    }

    // Sum bank accounts by column
    const bankByColumn: number[] = new Array(columnMonths.length).fill(0)

    for (const row of (report.Rows ?? [])) {
      if (row.RowType !== 'Section') continue
      const sectionTitle = row.Title ?? ''

      for (const inner of (row.Rows ?? [])) {
        if (inner.RowType === 'SummaryRow') continue
        const cells = inner.Cells ?? []
        const label = cells[0]?.Value ?? ''
        if (!label) continue
        if (!isBankLabel(label, sectionTitle)) continue

        for (let i = 0; i < columnMonths.length; i++) {
          const amount = parseAmount(cells[i + 1]?.Value ?? '')
          bankByColumn[i] += amount
        }
      }
    }

    // Build result map
    const balances: Record<string, number> = {}
    for (let i = 0; i < columnMonths.length; i++) {
      if (columnMonths[i]) {
        balances[columnMonths[i]] = Math.round(bankByColumn[i] * 100) / 100
      }
    }

    return NextResponse.json({ data: balances })
  } catch (err) {
    console.error('[BankBalances] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
