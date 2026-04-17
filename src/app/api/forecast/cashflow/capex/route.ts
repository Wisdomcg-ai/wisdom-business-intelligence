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

function lastDayOfMonth(month: string): string {
  const [y, m] = month.split('-').map(Number)
  const last = new Date(y, m, 0)
  return `${y}-${String(m).padStart(2, '0')}-${String(last.getDate()).padStart(2, '0')}`
}

function monthsDiff(from: string, to: string): number {
  const [fy, fm] = from.split('-').map(Number)
  const [ty, tm] = to.split('-').map(Number)
  return (ty - fy) * 12 + (tm - fm)
}

/** Identify a Xero balance sheet row as a fixed asset / CapEx candidate */
function isFixedAssetRow(label: string, sectionTitle: string, xeroAccountsByName: Map<string, string>): boolean {
  const accountType = xeroAccountsByName.get(label.toLowerCase())
  if (accountType) {
    return accountType === 'FIXED' || accountType === 'NONCURRENT'
  }
  // Fallback: section-title based heuristic
  const s = sectionTitle.toLowerCase()
  return s.includes('fixed') || s.includes('non-current asset') || s.includes('plant') || s.includes('equipment')
}

/**
 * POST /api/forecast/cashflow/capex
 *
 * Returns monthly CapEx cash outflows derived from Xero balance sheet:
 * positive movement in Fixed Asset accounts from one month to the next.
 *
 * Body: { business_id, from_month (YYYY-MM), to_month (YYYY-MM) }
 * Returns: { data: { "2025-07": 15000, "2025-08": 0, ... } }  (positive = outflow)
 *
 * Note: this captures GROSS movement including accumulated depreciation changes
 * in the net fixed asset balance. For strict CapEx (purchases only), a future
 * refinement can net out depreciation movement. Good-enough-for-now.
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

    // Resolve Xero connection (3-step lookup)
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
      return NextResponse.json({ data: {}, warning: 'No active Xero connection' })
    }

    const tokenResult = await getValidAccessToken(connection, supabase)
    if (!tokenResult.success) {
      return NextResponse.json({ data: {}, warning: 'Xero token expired' })
    }

    const accessToken = tokenResult.accessToken!
    const tenantId = connection.tenant_id

    // Pull the xero_accounts cache to classify rows as fixed assets by type
    const { data: xeroAccts } = await supabase
      .from('xero_accounts')
      .select('account_name, xero_type')
      .eq('business_id', business_id)

    const xeroAccountsByName = new Map<string, string>()
    for (const a of (xeroAccts ?? [])) {
      if (a.account_name && a.xero_type) {
        xeroAccountsByName.set(a.account_name.toLowerCase(), a.xero_type)
      }
    }

    // Fetch balance sheet with monthly periods covering the range
    const toDate = lastDayOfMonth(to_month)
    const periods = Math.min(totalMonths - 1, 11)

    const xeroUrl = `https://api.xero.com/api.xro/2.0/Reports/BalanceSheet?date=${toDate}&periods=${periods}&timeframe=MONTH&standardLayout=true`
    const xeroResp = await fetch(xeroUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'xero-tenant-id': tenantId,
        Accept: 'application/json',
      },
    })

    if (!xeroResp.ok) {
      return NextResponse.json({ data: {}, warning: 'Xero API error' })
    }

    const xeroData = await xeroResp.json()
    const report = xeroData?.Reports?.[0]
    if (!report) return NextResponse.json({ data: {} })

    // Parse column month keys from the header row
    const headerRow = (report.Rows ?? []).find((r: any) => r.RowType === 'Header')
    const columnMonths: string[] = []
    if (headerRow?.Cells) {
      for (let i = 1; i < headerRow.Cells.length; i++) {
        const raw = headerRow.Cells[i]?.Value ?? ''
        const parts = raw.trim().split(' ')
        if (parts.length >= 3) {
          const monthMap: Record<string, number> = {
            jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
            jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
          }
          const m = monthMap[parts[1].slice(0, 3).toLowerCase()]
          const y = parseInt(parts[parts.length - 1], 10)
          columnMonths.push(m && y ? `${y}-${String(m).padStart(2, '0')}` : '')
        } else {
          columnMonths.push('')
        }
      }
    }

    // Sum fixed assets by column
    const fixedByColumn: number[] = new Array(columnMonths.length).fill(0)

    for (const row of (report.Rows ?? [])) {
      if (row.RowType !== 'Section') continue
      const sectionTitle = row.Title ?? ''

      for (const inner of (row.Rows ?? [])) {
        if (inner.RowType === 'SummaryRow') continue
        const cells = inner.Cells ?? []
        const label = cells[0]?.Value ?? ''
        if (!label) continue
        if (!isFixedAssetRow(label, sectionTitle, xeroAccountsByName)) continue

        for (let i = 0; i < columnMonths.length; i++) {
          const amount = parseAmount(cells[i + 1]?.Value ?? '')
          fixedByColumn[i] += amount
        }
      }
    }

    // Xero returns columns in ascending month order. Compute month-over-month
    // movement — positive movement = CapEx outflow.
    const capexByMonth: Record<string, number> = {}
    for (let i = 1; i < columnMonths.length; i++) {
      const mk = columnMonths[i]
      if (!mk) continue
      const diff = fixedByColumn[i] - fixedByColumn[i - 1]
      // Only record positive movements (purchases). Negative movements
      // (depreciation/disposal) are already handled via depreciation add-back.
      if (diff > 0.01) {
        capexByMonth[mk] = Math.round(diff * 100) / 100
      }
    }

    return NextResponse.json({ data: capexByMonth })
  } catch (err) {
    console.error('[CapEx] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
