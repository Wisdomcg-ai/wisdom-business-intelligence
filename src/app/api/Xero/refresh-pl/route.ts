/**
 * Per-business manual refresh of xero_pl_lines.
 *
 * Mirrors the multi-window fetch + reconciliation logic from sync-all but
 * scoped to a single business and authenticated with the user's session
 * instead of the cron secret. Useful when:
 *   - A coach needs fresh data without waiting for the nightly cron
 *   - We've shipped a sync improvement and want to verify it for one client
 *
 * POST /api/Xero/refresh-pl
 *   Body: { business_id: string }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createRouteHandlerClient } from '@/lib/supabase/server'
import { encrypt, decrypt } from '@/lib/utils/encryption'
import { resolveBusinessIds } from '@/lib/utils/resolve-business-ids'
import { verifyBusinessAccess } from '@/lib/utils/verify-business-access'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
)

const ACCOUNT_TYPE_TO_CATEGORY: Record<string, string> = {
  revenue: 'Revenue',
  cogs: 'Cost of Sales',
  opex: 'Operating Expenses',
  other_income: 'Other Income',
  other_expense: 'Other Expenses',
}

const SUMMARY_ROW_NAMES = new Set([
  'gross profit', 'net profit', 'total income', 'total revenue',
  'total cost of sales', 'total direct costs', 'total operating expenses',
  'total expenses', 'total other income', 'total other expenses', 'operating profit',
])

function mapSectionToType(section: string): string {
  const lower = section.toLowerCase()
  if (lower.includes('other income')) return 'other_income'
  if (lower.includes('other expense')) return 'other_expense'
  if (lower.includes('income') || lower.includes('revenue')) return 'revenue'
  if (lower.includes('cost of') || lower.includes('cogs') || lower.includes('direct')) return 'cogs'
  if (lower.includes('expense') || lower.includes('operating')) return 'opex'
  return 'opex'
}

function parseMonthString(s: string): string | undefined {
  if (!s) return undefined
  try {
    const d = new Date(s)
    if (!isNaN(d.getTime())) {
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    }
  } catch {}
  return undefined
}

async function getValidAccessToken(connection: any): Promise<string | null> {
  const now = new Date()
  const expiry = new Date(connection.expires_at)
  const buffer = new Date(expiry.getTime() - 5 * 60 * 1000)

  const decryptedAccess = decrypt(connection.access_token)
  const decryptedRefresh = decrypt(connection.refresh_token)
  if (buffer > now) return decryptedAccess

  const r = await fetch('https://identity.xero.com/connect/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${Buffer.from(`${process.env.XERO_CLIENT_ID}:${process.env.XERO_CLIENT_SECRET}`).toString('base64')}`,
    },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: decryptedRefresh }),
  })
  if (!r.ok) return null
  const tokens = await r.json()
  const newExpiry = new Date(); newExpiry.setSeconds(newExpiry.getSeconds() + tokens.expires_in)
  await supabase.from('xero_connections').update({
    access_token: encrypt(tokens.access_token),
    refresh_token: encrypt(tokens.refresh_token),
    expires_at: newExpiry.toISOString(),
  }).eq('id', connection.id)
  return tokens.access_token
}

export async function POST(request: NextRequest) {
  try {
    const authClient = await createRouteHandlerClient()
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { business_id } = await request.json()
    if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 })

    const hasAccess = await verifyBusinessAccess(user.id, business_id)
    if (!hasAccess) return NextResponse.json({ error: 'Access denied' }, { status: 403 })

    const ids = await resolveBusinessIds(supabase, business_id)
    const businessIdForFK = ids.bizId

    const { data: connections } = await supabase
      .from('xero_connections')
      .select('*')
      .in('business_id', ids.all)
      .eq('is_active', true)
    if (!connections?.length) return NextResponse.json({ error: 'No active Xero connection' }, { status: 404 })
    const connection = connections[0]

    const accessToken = await getValidAccessToken(connection)
    if (!accessToken) return NextResponse.json({ error: 'Could not refresh Xero token' }, { status: 401 })

    // Chart of Accounts for codes
    const accountCodeLookup = new Map<string, string>()
    try {
      const coaResp = await fetch(
        `https://api.xero.com/api.xro/2.0/Accounts?where=${encodeURIComponent('Type=="REVENUE"||Type=="OTHERINCOME"||Type=="DIRECTCOSTS"||Type=="EXPENSE"||Type=="OVERHEADS"')}`,
        { headers: { 'Authorization': `Bearer ${accessToken}`, 'xero-tenant-id': connection.tenant_id, 'Accept': 'application/json' } },
      )
      if (coaResp.ok) {
        const coaData = await coaResp.json()
        for (const acc of coaData.Accounts || []) {
          if (acc.Name && acc.Code) accountCodeLookup.set(acc.Name, acc.Code)
        }
      }
    } catch {}

    const allAccounts = new Map<string, any>()
    const now = new Date()
    const currentYear = now.getFullYear()
    const currentMonth = now.getMonth() + 1
    const fyStartMonth: number = 7

    const currentFY = currentMonth >= fyStartMonth ? currentYear + 1 : currentYear
    const fyRange = (fy: number) => {
      const startY = fy - 1, startM = fyStartMonth
      const endM = fyStartMonth - 1 || 12
      const endY = fyStartMonth === 1 ? fy - 1 : fy
      const lastDay = new Date(endY, endM, 0).getDate()
      return {
        fromDate: `${startY}-${String(startM).padStart(2, '0')}-01`,
        toDate: `${endY}-${String(endM).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
      }
    }
    const ytdStartY = currentMonth >= fyStartMonth ? currentYear : currentYear - 1
    const ytdLastDay = new Date(currentYear, currentMonth, 0).getDate()
    const windows = [
      { label: `FY${currentFY} YTD`, from: `${ytdStartY}-${String(fyStartMonth).padStart(2, '0')}-01`, to: `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(ytdLastDay).padStart(2, '0')}` },
      { label: `FY${currentFY - 1}`, ...fyRange(currentFY - 1) },
      { label: `FY${currentFY - 2}`, ...fyRange(currentFY - 2) },
    ]

    const parsePLResponse = (report: any) => {
      const rows = report.Rows || []
      const headerRow = rows.find((r: any) => r.RowType === 'Header')
      const cols = headerRow?.Cells?.slice(1)?.map((c: any) => c.Value) || []
      for (const section of rows) {
        if (section.RowType !== 'Section' || !section.Rows) continue
        const sectionTitle = section.Title || 'Other'
        for (const row of section.Rows) {
          if (row.RowType !== 'Row' || !row.Cells) continue
          const accountName = row.Cells[0]?.Value
          if (!accountName || SUMMARY_ROW_NAMES.has(accountName.toLowerCase())) continue
          const existing = allAccounts.get(accountName) || {
            business_id: businessIdForFK,
            account_name: accountName,
            account_code: accountCodeLookup.get(accountName) || null,
            account_type: mapSectionToType(sectionTitle),
            section: sectionTitle,
            monthly_values: {} as Record<string, number>,
            updated_at: new Date().toISOString(),
          }
          for (let i = 1; i < row.Cells.length && i <= cols.length; i++) {
            const monthKey = cols[i - 1]
            const value = parseFloat(row.Cells[i]?.Value || '0')
            if (monthKey && !isNaN(value)) {
              const monthDate = parseMonthString(monthKey)
              if (monthDate) existing.monthly_values[monthDate] = value
            }
          }
          allAccounts.set(accountName, existing)
        }
      }
      return cols.length
    }

    const windowResults: any[] = []
    for (let i = 0; i < windows.length; i++) {
      const w = windows[i]
      if (i > 0) await new Promise(r => setTimeout(r, 300))
      const url = `https://api.xero.com/api.xro/2.0/Reports/ProfitAndLoss?fromDate=${w.from}&toDate=${w.to}&timeframe=MONTH&standardLayout=false&paymentsOnly=false`
      try {
        const resp = await fetch(url, { headers: { 'Authorization': `Bearer ${accessToken}`, 'xero-tenant-id': connection.tenant_id, 'Accept': 'application/json' } })
        if (!resp.ok) {
          windowResults.push({ label: w.label, status: 'failed', code: resp.status })
          continue
        }
        const data = await resp.json()
        const report = data?.Reports?.[0]
        if (!report) {
          windowResults.push({ label: w.label, status: 'no_report' })
          continue
        }
        const cols = parsePLResponse(report)
        windowResults.push({ label: w.label, status: 'ok', months: cols, range: `${w.from} → ${w.to}` })
      } catch (e: any) {
        windowResults.push({ label: w.label, status: 'threw', error: e?.message })
      }
    }

    // Reconciliation
    const verifyPeriods = [
      { from: `${currentYear - 2}-07-01`, to: `${currentYear - 1}-06-30`, label: `FY${currentYear - 1}` },
      { from: `${currentYear - 1}-07-01`, to: `${currentYear}-${String(currentMonth).padStart(2, '0')}-${ytdLastDay}`, label: `FY${currentYear}` },
    ]
    const reconStats = { adjusted: 0, synthesized: 0, totalDiff: 0 }
    for (const period of verifyPeriods) {
      await new Promise(r => setTimeout(r, 300))
      try {
        const r = await fetch(`https://api.xero.com/api.xro/2.0/Reports/ProfitAndLoss?fromDate=${period.from}&toDate=${period.to}&standardLayout=false&paymentsOnly=false`,
          { headers: { 'Authorization': `Bearer ${accessToken}`, 'xero-tenant-id': connection.tenant_id, 'Accept': 'application/json' } })
        if (!r.ok) continue
        const data = await r.json()
        const verifyReport = data?.Reports?.[0]
        if (!verifyReport?.Rows) continue
        for (const section of verifyReport.Rows) {
          if (section.RowType !== 'Section' || !section.Rows) continue
          const sectionTitle = section.Title || 'Other'
          for (const row of section.Rows) {
            if (row.RowType !== 'Row' || !row.Cells) continue
            const accountName = row.Cells[0]?.Value
            if (!accountName || SUMMARY_ROW_NAMES.has(accountName.toLowerCase())) continue
            const auth = parseFloat(row.Cells[1]?.Value || '0')
            if (isNaN(auth)) continue
            const monthKeysInPeriod: string[] = []
            const fyStart = new Date(period.from); const fyEnd = new Date(period.to)
            let cur = new Date(fyStart)
            while (cur <= fyEnd) {
              monthKeysInPeriod.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}`)
              cur.setMonth(cur.getMonth() + 1)
            }
            let acct = allAccounts.get(accountName)
            if (!acct) {
              if (Math.abs(auth) < 0.01) continue
              acct = {
                business_id: businessIdForFK,
                account_name: accountName,
                account_code: accountCodeLookup.get(accountName) || null,
                account_type: mapSectionToType(sectionTitle),
                section: sectionTitle,
                monthly_values: {},
                updated_at: new Date().toISOString(),
              }
              allAccounts.set(accountName, acct)
              reconStats.synthesized++
            }
            let monthlySum = 0
            for (const mk of monthKeysInPeriod) monthlySum += acct.monthly_values[mk] || 0
            const diff = auth - monthlySum
            if (Math.abs(diff) > 0.01 && monthKeysInPeriod.length > 0) {
              const lastMonth = monthKeysInPeriod[monthKeysInPeriod.length - 1]
              acct.monthly_values[lastMonth] = (acct.monthly_values[lastMonth] || 0) + diff
              reconStats.adjusted++
              reconStats.totalDiff += Math.abs(diff)
            }
          }
        }
      } catch {}
    }

    // Filter + dedup + write
    const plLines: any[] = []
    for (const entry of allAccounts.values()) {
      if (Object.keys(entry.monthly_values).length > 0) plLines.push(entry)
    }
    const seen = new Set<string>()
    const dedup: any[] = []
    for (const line of plLines) {
      const key = line.account_code || `name:${line.account_name}`
      if (seen.has(key)) continue
      seen.add(key)
      dedup.push(line)
    }

    const { error: delErr } = await supabase.from('xero_pl_lines').delete().in('business_id', ids.all)
    if (delErr) return NextResponse.json({ error: 'Pre-insert delete failed', details: delErr.message }, { status: 500 })

    const { count } = await supabase.from('xero_pl_lines').select('*', { count: 'exact', head: true }).in('business_id', ids.all)
    if (count && count > 0) {
      const { error: retryErr } = await supabase.from('xero_pl_lines').delete().in('business_id', ids.all)
      if (retryErr) return NextResponse.json({ error: 'Retry delete failed' }, { status: 500 })
    }

    if (dedup.length > 0) {
      const { error: insErr } = await supabase.from('xero_pl_lines').insert(dedup)
      if (insErr) return NextResponse.json({ error: 'Insert failed', details: insErr.message }, { status: 500 })
    }
    await supabase.from('xero_connections').update({ last_synced_at: new Date().toISOString() }).eq('id', connection.id)

    const allMonths = new Set<string>()
    for (const l of dedup) Object.keys(l.monthly_values).forEach(m => allMonths.add(m))
    const sorted = Array.from(allMonths).sort()

    return NextResponse.json({
      success: true,
      tenant_name: connection.tenant_name,
      windows: windowResults,
      reconciliation: reconStats,
      accounts_written: dedup.length,
      months_count: sorted.length,
      months_span: sorted.length > 0 ? `${sorted[0]} → ${sorted[sorted.length - 1]}` : null,
    })
  } catch (error: any) {
    console.error('[Xero refresh-pl] Error:', error)
    return NextResponse.json({ error: 'Internal error', details: error?.message }, { status: 500 })
  }
}
