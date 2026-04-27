/**
 * One-shot: re-sync Envisage's Xero P&L using the new multi-window logic.
 * Mirrors src/app/api/Xero/sync-all/route.ts syncConnection() but scoped to
 * Envisage's active connection. Use this to verify the new sync works
 * without waiting for the 2am cron.
 */
import { config } from 'dotenv'
import path from 'path'
config({ path: path.resolve(process.cwd(), '.env.local') })
import { createClient } from '@supabase/supabase-js'
import { encrypt, decrypt } from '../src/lib/utils/encryption'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

const ENVISAGE_BIZ_ID = '8c8c63b2-bdc4-4115-9375-8d0fd89acc00'
const ENVISAGE_PROFILE_ID = 'fa0a80e8-e58e-40aa-b34a-8db667d4b221'

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
  const m = s.match(/^([A-Za-z]+)-?(\d{2,4})$/) || s.match(/^(\d{1,2}) ([A-Za-z]+) (\d{4})$/) || s.match(/^([A-Za-z]+) (\d{4})$/)
  if (m) {
    const monthMap: Record<string, string> = {
      jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
      jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
    }
    let monthName = '', year = ''
    if (m[3]) { monthName = m[2].toLowerCase(); year = m[3] }
    else if (m[2]) { monthName = m[1].toLowerCase(); year = m[2] }
    const month = monthMap[monthName.substring(0, 3)]
    if (month && year) {
      const fullYear = year.length === 2 ? `20${year}` : year
      return `${fullYear}-${month}`
    }
  }
  // Try direct parse like "Apr 2025"
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
  const bufferTime = new Date(expiry.getTime() - 5 * 60 * 1000)

  const decryptedAccessToken = decrypt(connection.access_token)
  const decryptedRefreshToken = decrypt(connection.refresh_token)

  if (bufferTime > now) return decryptedAccessToken

  console.log(`Refreshing token for ${connection.tenant_name}`)
  const r = await fetch('https://identity.xero.com/connect/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${Buffer.from(`${process.env.XERO_CLIENT_ID}:${process.env.XERO_CLIENT_SECRET}`).toString('base64')}`,
    },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: decryptedRefreshToken }),
  })

  if (!r.ok) {
    console.error('Token refresh failed', r.status, await r.text())
    return null
  }
  const tokens = await r.json()
  const newExpiry = new Date(); newExpiry.setSeconds(newExpiry.getSeconds() + tokens.expires_in)
  await supabase.from('xero_connections').update({
    access_token: encrypt(tokens.access_token),
    refresh_token: encrypt(tokens.refresh_token),
    expires_at: newExpiry.toISOString(),
  }).eq('id', connection.id)
  return tokens.access_token
}

async function main() {
  // Get active connection for Envisage (try both IDs)
  const { data: conns } = await supabase
    .from('xero_connections')
    .select('*')
    .in('business_id', [ENVISAGE_BIZ_ID, ENVISAGE_PROFILE_ID])
    .eq('is_active', true)
  if (!conns?.length) { console.error('No active Xero connection for Envisage'); process.exit(1) }
  const connection = conns[0]
  console.log(`Found active connection: ${connection.tenant_name} (id=${connection.id.substring(0,8)})`)

  const accessToken = await getValidAccessToken(connection)
  if (!accessToken) { console.error('Could not get valid access token'); process.exit(1) }
  console.log('Access token OK')

  // Chart of Accounts for codes
  const accountCodeLookup = new Map<string, string>()
  const coaResp = await fetch(
    `https://api.xero.com/api.xro/2.0/Accounts?where=${encodeURIComponent('Type=="REVENUE"||Type=="OTHERINCOME"||Type=="DIRECTCOSTS"||Type=="EXPENSE"||Type=="OVERHEADS"')}`,
    { headers: { 'Authorization': `Bearer ${accessToken}`, 'xero-tenant-id': connection.tenant_id, 'Accept': 'application/json' } },
  )
  if (coaResp.ok) {
    const coaData = await coaResp.json()
    for (const acc of coaData.Accounts || []) {
      if (acc.Name && acc.Code) accountCodeLookup.set(acc.Name, acc.Code)
    }
    console.log(`Loaded ${accountCodeLookup.size} account codes from Xero CoA`)
  }

  // Multi-window fetch
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

  const businessId = ENVISAGE_BIZ_ID
  const tenantName = connection.tenant_name

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
          business_id: businessId,
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

  for (let i = 0; i < windows.length; i++) {
    const w = windows[i]
    if (i > 0) await new Promise(r => setTimeout(r, 300))
    const url = `https://api.xero.com/api.xro/2.0/Reports/ProfitAndLoss?fromDate=${w.from}&toDate=${w.to}&timeframe=MONTH&standardLayout=false&paymentsOnly=false`
    const resp = await fetch(url, { headers: { 'Authorization': `Bearer ${accessToken}`, 'xero-tenant-id': connection.tenant_id, 'Accept': 'application/json' } })
    if (!resp.ok) {
      console.error(`${w.label} FAILED (${resp.status})`)
      continue
    }
    const data = await resp.json()
    const report = data?.Reports?.[0]
    if (!report) { console.warn(`${w.label}: no report`); continue }
    const cols = parsePLResponse(report)
    console.log(`${w.label} (${w.from} → ${w.to}): ${cols} month columns`)
  }

  // Reconciliation
  console.log('\n--- Reconciliation pass ---')
  const verifyPeriods = [
    { from: `${currentYear - 2}-07-01`, to: `${currentYear - 1}-06-30`, label: `FY${currentYear - 1}` },
    { from: `${currentYear - 1}-07-01`, to: `${currentYear}-${String(currentMonth).padStart(2, '0')}-${ytdLastDay}`, label: `FY${currentYear}` },
  ]

  let adjusted = 0, synthesized = 0, totalDiff = 0
  for (const period of verifyPeriods) {
    await new Promise(r => setTimeout(r, 300))
    const verifyUrl = `https://api.xero.com/api.xro/2.0/Reports/ProfitAndLoss?fromDate=${period.from}&toDate=${period.to}&standardLayout=false&paymentsOnly=false`
    const r = await fetch(verifyUrl, { headers: { 'Authorization': `Bearer ${accessToken}`, 'xero-tenant-id': connection.tenant_id, 'Accept': 'application/json' } })
    if (!r.ok) { console.warn(`${period.label} verify failed`); continue }
    const verifyData = await r.json()
    const verifyReport = verifyData?.Reports?.[0]
    if (!verifyReport?.Rows) continue

    for (const section of verifyReport.Rows) {
      if (section.RowType !== 'Section' || !section.Rows) continue
      const sectionTitle = section.Title || 'Other'
      for (const row of section.Rows) {
        if (row.RowType !== 'Row' || !row.Cells) continue
        const accountName = row.Cells[0]?.Value
        if (!accountName || SUMMARY_ROW_NAMES.has(accountName.toLowerCase())) continue
        const authoritativeTotal = parseFloat(row.Cells[1]?.Value || '0')
        if (isNaN(authoritativeTotal)) continue

        const fyStart = new Date(period.from), fyEnd = new Date(period.to)
        const monthKeysInPeriod: string[] = []
        let cur = new Date(fyStart)
        while (cur <= fyEnd) {
          monthKeysInPeriod.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}`)
          cur.setMonth(cur.getMonth() + 1)
        }

        let account = allAccounts.get(accountName)
        if (!account) {
          if (Math.abs(authoritativeTotal) < 0.01) continue
          account = {
            business_id: businessId,
            account_name: accountName,
            account_code: accountCodeLookup.get(accountName) || null,
            account_type: mapSectionToType(sectionTitle),
            section: sectionTitle,
            monthly_values: {},
            updated_at: new Date().toISOString(),
          }
          allAccounts.set(accountName, account)
          synthesized++
          console.warn(`  ${period.label}: synthesized "${accountName}" ($${authoritativeTotal})`)
        }

        let monthlySum = 0
        for (const mk of monthKeysInPeriod) monthlySum += account.monthly_values[mk] || 0
        const diff = authoritativeTotal - monthlySum
        if (Math.abs(diff) > 0.01 && monthKeysInPeriod.length > 0) {
          const lastMonth = monthKeysInPeriod[monthKeysInPeriod.length - 1]
          account.monthly_values[lastMonth] = (account.monthly_values[lastMonth] || 0) + diff
          adjusted++
          totalDiff += Math.abs(diff)
          if (Math.abs(diff) > 100) {
            console.warn(`  ${period.label}: "${accountName}" diff $${diff.toFixed(2)} → ${lastMonth}`)
          }
        }
      }
    }
  }
  console.log(`Reconciliation: ${adjusted} adjusted, ${synthesized} synthesized, total diff $${totalDiff.toFixed(2)}`)

  // Filter accounts with data + dedup
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
  console.log(`\n${dedup.length} accounts to write (from ${allAccounts.size} parsed, ${plLines.length} with data)`)

  const allMonths = new Set<string>()
  for (const l of dedup) Object.keys(l.monthly_values).forEach(m => allMonths.add(m))
  const sorted = Array.from(allMonths).sort()
  console.log(`Month coverage: ${sorted[0]} → ${sorted[sorted.length-1]} (${sorted.length} months)`)

  // Confirm before writing
  if (process.argv.includes('--write')) {
    console.log('\nWriting to xero_pl_lines...')
    const { error: delErr } = await supabase.from('xero_pl_lines').delete().in('business_id', [ENVISAGE_BIZ_ID, ENVISAGE_PROFILE_ID])
    if (delErr) { console.error('Delete failed:', delErr); process.exit(1) }

    const { count } = await supabase.from('xero_pl_lines').select('*', { count: 'exact', head: true }).in('business_id', [ENVISAGE_BIZ_ID, ENVISAGE_PROFILE_ID])
    if (count && count > 0) { console.error(`${count} rows still exist after delete — aborting`); process.exit(1) }

    const { error: insErr } = await supabase.from('xero_pl_lines').insert(dedup)
    if (insErr) { console.error('Insert failed:', insErr); process.exit(1) }

    await supabase.from('xero_connections').update({ last_synced_at: new Date().toISOString() }).eq('id', connection.id)
    console.log(`✓ Wrote ${dedup.length} rows. last_synced_at updated.`)
  } else {
    console.log('\n(dry-run — pass --write to actually update xero_pl_lines)')
  }
}
main().catch(e => { console.error(e); process.exit(1) })
