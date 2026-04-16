import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createRouteHandlerClient } from '@/lib/supabase/server'
import { getValidAccessToken } from '@/lib/xero/token-manager'
import { verifyBusinessAccess } from '@/lib/utils/verify-business-access'
import type { BalanceSheetRow, BalanceSheetData, BalanceSheetCompare } from '@/app/finances/monthly-report/types'

export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

/** Last day of a YYYY-MM month as YYYY-MM-DD */
function lastDayOfMonth(month: string): string {
  const [y, m] = month.split('-').map(Number)
  const last = new Date(y, m, 0)
  return `${y}-${String(m).padStart(2, '0')}-${String(last.getDate()).padStart(2, '0')}`
}

/** Format a Xero date label to "Mar 2026" style */
function formatXeroLabel(raw: string): string {
  // Xero returns e.g. "31 Mar 2026" or "31 March 2026"
  const parts = raw.trim().split(' ')
  if (parts.length >= 3) {
    const month = parts[1].slice(0, 3)
    const year = parts[parts.length - 1]
    return `${month} ${year}`
  }
  return raw
}

/** Parse a Xero numeric string, returning null for empty/non-numeric */
function parseAmount(val: string): number | null {
  if (!val || val.trim() === '') return null
  const n = parseFloat(val.replace(/,/g, ''))
  return isNaN(n) ? null : n
}

/** Compute variance % — null when prior is 0 (display as N/A) */
function variancePct(current: number | null, prior: number | null): number | null {
  if (prior === null || prior === 0) return null
  if (current === null) return null
  return ((current - prior) / Math.abs(prior)) * 100
}

/**
 * Map Xero section titles to Calxa-style singular labels.
 * Calxa uses "Asset", "Liability", "Equity" — not the plural form.
 */
function mapSectionTitle(xeroTitle: string): string {
  const t = xeroTitle.trim()
  if (t === 'Assets') return 'Asset'
  if (t === 'Liabilities') return 'Liability'
  if (t === 'Equity') return 'Equity'
  // Unmapped sections (pass through with "New unmapped" prefix if needed)
  return t
}

/** Map Xero SummaryRow labels to Calxa singular form */
function mapSubtotalLabel(xeroLabel: string): string {
  const t = xeroLabel.trim()
  if (t === 'Total Assets') return 'Total Asset'
  if (t === 'Total Liabilities') return 'Total Liability'
  if (t === 'Total Equity') return 'Total Equity'
  if (t === 'Net Assets') return 'Net Assets'
  return t
}

/**
 * GET /api/Xero/balance-sheet?business_id=&month=YYYY-MM[&compare=yoy|mom]
 *
 * Fetches Xero /Reports/BalanceSheet for the given month and parses it
 * into the Calxa flat-section format with 4 columns:
 *   Current Actuals | Prior Actuals | Variance | % Variance
 */
export async function GET(request: NextRequest) {
  try {
    const authClient = await createRouteHandlerClient()
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const businessId = searchParams.get('business_id')
    const month = searchParams.get('month') // YYYY-MM
    const compare = (searchParams.get('compare') ?? 'yoy') as BalanceSheetCompare

    if (!businessId || !month) {
      return NextResponse.json({ error: 'business_id and month are required' }, { status: 400 })
    }

    const hasAccess = await verifyBusinessAccess(user.id, businessId)
    if (!hasAccess) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Resolve Xero connection (try all ID formats — same pattern as other routes)
    let connection: any = null
    const { data: c1 } = await supabase.from('xero_connections').select('*').eq('business_id', businessId).eq('is_active', true).maybeSingle()
    if (c1) connection = c1
    if (!connection) {
      const { data: p } = await supabase.from('business_profiles').select('id').eq('business_id', businessId).maybeSingle()
      if (p?.id) {
        const { data: c2 } = await supabase.from('xero_connections').select('*').eq('business_id', p.id).eq('is_active', true).maybeSingle()
        if (c2) connection = c2
      }
    }
    if (!connection) {
      const { data: bp } = await supabase.from('business_profiles').select('business_id').eq('id', businessId).maybeSingle()
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
    const reportDate = lastDayOfMonth(month)
    const timeframe = compare === 'mom' ? 'MONTH' : 'YEAR'

    const xeroUrl = `https://api.xero.com/api.xro/2.0/Reports/BalanceSheet?date=${reportDate}&periods=1&timeframe=${timeframe}&standardLayout=true`
    const xeroResp = await fetch(xeroUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'xero-tenant-id': tenantId,
        Accept: 'application/json',
      },
    })

    if (!xeroResp.ok) {
      const errText = await xeroResp.text()
      console.error('[BalanceSheet] Xero API error:', xeroResp.status, errText)
      return NextResponse.json({ error: 'Xero API error', status: xeroResp.status }, { status: 502 })
    }

    const xeroData = await xeroResp.json()
    const report = xeroData?.Reports?.[0]
    if (!report) {
      return NextResponse.json({ error: 'Empty response from Xero' }, { status: 502 })
    }

    // Extract period labels from the Header row
    const headerRow = report.Rows?.find((r: any) => r.RowType === 'Header')
    const currentLabel = headerRow?.Cells?.[1]?.Value
      ? formatXeroLabel(headerRow.Cells[1].Value)
      : month
    const priorLabel = headerRow?.Cells?.[2]?.Value
      ? formatXeroLabel(headerRow.Cells[2].Value)
      : ''

    const rows: BalanceSheetRow[] = []

    for (const row of (report.Rows ?? [])) {
      if (row.RowType === 'Header') continue

      if (row.RowType === 'Section') {
        const sectionLabel = mapSectionTitle(row.Title ?? '')

        // Section header row
        rows.push({
          type: 'section_header',
          label: sectionLabel,
          current: null,
          prior: null,
          variance: null,
          variance_pct: null,
        })

        for (const inner of (row.Rows ?? [])) {
          const cells = inner.Cells ?? []
          const label = cells[0]?.Value ?? ''
          const current = parseAmount(cells[1]?.Value ?? '')
          const prior = parseAmount(cells[2]?.Value ?? '')
          const v = current !== null && prior !== null ? current - prior : null

          if (inner.RowType === 'SummaryRow') {
            rows.push({
              type: 'subtotal',
              label: mapSubtotalLabel(label),
              current,
              prior,
              variance: v,
              variance_pct: variancePct(current, prior),
            })
          } else if (inner.RowType === 'Row') {
            // Skip blank rows Xero sometimes inserts
            if (!label && current === null && prior === null) continue
            rows.push({
              type: 'line_item',
              label,
              current,
              prior,
              variance: v,
              variance_pct: variancePct(current, prior),
            })
          }
        }
      } else if (row.RowType === 'Row') {
        // Standalone rows between sections — Net Assets lives here
        const cells = row.Cells ?? []
        const label = cells[0]?.Value ?? ''
        if (!label) continue
        const current = parseAmount(cells[1]?.Value ?? '')
        const prior = parseAmount(cells[2]?.Value ?? '')
        const v = current !== null && prior !== null ? current - prior : null

        if (label === 'Net Assets') {
          rows.push({
            type: 'net_assets',
            label: 'Net Assets',
            current,
            prior,
            variance: v,
            variance_pct: variancePct(current, prior),
          })
        }
      }
    }

    // Verify the sheet balances: Net Assets row should equal Total Equity
    const netAssetsRow = rows.find(r => r.type === 'net_assets')
    const totalEquityRow = rows.find(r => r.type === 'subtotal' && r.label === 'Total Equity')
    const balances =
      netAssetsRow?.current !== null &&
      totalEquityRow?.current !== null &&
      Math.abs((netAssetsRow?.current ?? 0) - (totalEquityRow?.current ?? 0)) < 0.01

    const result: BalanceSheetData = {
      business_id: businessId,
      report_date: reportDate,
      compare,
      current_label: currentLabel,
      prior_label: priorLabel,
      rows,
      balances: balances ?? false,
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('[BalanceSheet] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
