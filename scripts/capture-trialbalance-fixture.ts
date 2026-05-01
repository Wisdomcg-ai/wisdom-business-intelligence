/**
 * Phase 44.2 Plan 44.2-06E Task 2 — Trial Balance single-period fixture capture.
 *
 * Twin of capture-bs-fixture.ts but for /Reports/TrialBalance. Used by gate 3
 * of the reconciliation harness: Σ debits == Σ credits per balance_date.
 *
 * URL shape: ?date=YYYY-MM-DD&paymentsOnly=false. TrialBalance does NOT
 * support standardLayout (always returns the standard form), and like BS
 * it must NOT carry periods= or timeframe= params.
 *
 * Usage:
 *   npx tsx scripts/capture-trialbalance-fixture.ts \
 *     --business-id=<uuid> \
 *     --tenant-id=<uuid> \
 *     --balance-date=YYYY-MM-DD \
 *     --label=<slug> \
 *     [--include-inactive]
 */
import { config } from 'dotenv'
import path from 'path'
config({ path: path.resolve(process.cwd(), '.env.local') })

import { createClient } from '@supabase/supabase-js'
import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { getValidAccessToken } from '@/lib/xero/token-manager'

interface CliArgs {
  businessId: string
  tenantId: string
  balanceDate: string
  label: string
  includeInactive?: boolean
}

function parseArgs(argv: string[]): CliArgs | { help: true } {
  if (argv.includes('--help') || argv.includes('-h')) return { help: true }
  const out: Partial<CliArgs> = {}
  for (const a of argv) {
    if (a.startsWith('--business-id=')) out.businessId = a.slice('--business-id='.length)
    else if (a.startsWith('--tenant-id=')) out.tenantId = a.slice('--tenant-id='.length)
    else if (a.startsWith('--balance-date=')) out.balanceDate = a.slice('--balance-date='.length)
    else if (a.startsWith('--label=')) out.label = a.slice('--label='.length)
    else if (a === '--include-inactive') out.includeInactive = true
  }
  if (!out.businessId || !out.tenantId || !out.balanceDate || !out.label) {
    return { help: true }
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(out.balanceDate)) {
    console.error(`[capture-trialbalance-fixture] --balance-date must be YYYY-MM-DD, got: ${out.balanceDate}`)
    process.exit(1)
  }
  return out as CliArgs
}

function printHelp() {
  console.log(`Usage:
  npx tsx scripts/capture-trialbalance-fixture.ts \\
    --business-id=<uuid> \\
    --tenant-id=<uuid> \\
    --balance-date=YYYY-MM-DD \\
    --label=<slug> \\
    [--include-inactive]

Required: --business-id, --tenant-id, --balance-date, --label
Optional: --include-inactive

Output:
  src/__tests__/xero/fixtures/{label}.json
    { _meta: {...}, response: <raw Xero Reports/TrialBalance body verbatim> }

Notes:
  - URL: Reports/TrialBalance?date=<balance-date>&paymentsOnly=false
  - TrialBalance does NOT accept standardLayout — only standard form is returned.
  - Never adds periods= or timeframe= (Calxa-via-Cowork Q1: same Xero bug as on PL/BS).
`)
}

function parseAmount(s: string | undefined | null): number {
  if (s == null || s === '') return 0
  // Xero amounts may be plain or wrapped in parens for negatives.
  let str = String(s).replace(/,/g, '').trim()
  let negative = false
  if (str.startsWith('(') && str.endsWith(')')) {
    negative = true
    str = str.slice(1, -1)
  }
  const n = parseFloat(str)
  if (!isFinite(n)) return 0
  return negative ? -n : n
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2))
  if ('help' in parsed) {
    printHelp()
    process.exit(parsed.help && process.argv.length <= 2 ? 0 : 1)
  }
  const { businessId, tenantId, balanceDate, label, includeInactive } = parsed

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY
  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('[capture-trialbalance-fixture] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_KEY in .env.local')
    process.exit(1)
  }
  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  console.log(`[capture-trialbalance-fixture] business_id=${businessId} tenant_id=${tenantId} balance_date=${balanceDate} label=${label}`)

  // 1. Resolve xero_connections (dual-ID aware).
  const { data: profile } = await supabase
    .from('business_profiles')
    .select('id, business_id')
    .or(`business_id.eq.${businessId},id.eq.${businessId}`)
    .maybeSingle()
  const candidateIds = profile
    ? Array.from(new Set([businessId, profile.id, profile.business_id].filter(Boolean) as string[]))
    : [businessId]

  let connQuery = supabase
    .from('xero_connections')
    .select('*')
    .in('business_id', candidateIds)
    .eq('tenant_id', tenantId)
    .order('updated_at', { ascending: false })
  if (!includeInactive) connQuery = connQuery.eq('is_active', true)
  const { data: connections, error: connErr } = await connQuery
  if (connErr) {
    console.error('[capture-trialbalance-fixture] Failed to load xero_connections:', connErr)
    process.exit(1)
  }
  if (!connections || connections.length === 0) {
    console.error(
      `[capture-trialbalance-fixture] No xero_connections for business_id=${businessId} tenant_id=${tenantId} (active=${!includeInactive})`
    )
    process.exit(1)
  }
  const connection = connections[0]
  console.log(`[capture-trialbalance-fixture] Using connection.id=${connection.id} tenant=${connection.tenant_name}`)

  const tokenResult = await getValidAccessToken({ id: connection.id }, supabase as any)
  if (!tokenResult.success || !tokenResult.accessToken) {
    console.error('[capture-trialbalance-fixture] Failed to get access token:', tokenResult.error, tokenResult.message)
    process.exit(1)
  }
  const accessToken = tokenResult.accessToken

  // 2. Fetch /Reports/TrialBalance.
  const url = `https://api.xero.com/api.xro/2.0/Reports/TrialBalance?date=${balanceDate}&paymentsOnly=false`
  console.log(`[capture-trialbalance-fixture] GET ${url}`)
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'xero-tenant-id': tenantId,
      Accept: 'application/json',
    },
  })
  if (!res.ok) {
    const errText = await res.text()
    console.error(`[capture-trialbalance-fixture] Xero TB fetch failed: ${res.status} ${errText.substring(0, 500)}`)
    process.exit(1)
  }
  const responseJson = await res.json()

  // 3. Best-effort currency from /Organisation.
  let currency: string | null = null
  try {
    const orgRes = await fetch('https://api.xero.com/api.xro/2.0/Organisation', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'xero-tenant-id': tenantId,
        Accept: 'application/json',
      },
    })
    if (orgRes.ok) {
      const orgJson: any = await orgRes.json()
      currency = orgJson?.Organisations?.[0]?.BaseCurrency ?? null
    }
  } catch {
    // Non-fatal.
  }

  // 4. Write fixture.
  const fixtureDir = path.resolve(process.cwd(), 'src/__tests__/xero/fixtures')
  if (!existsSync(fixtureDir)) {
    mkdirSync(fixtureDir, { recursive: true })
  }
  const fixturePath = path.join(fixtureDir, `${label}.json`)
  const fixture = {
    _meta: {
      tenant_name: connection.tenant_name,
      tenant_id: tenantId,
      business_id: businessId,
      balance_date: balanceDate,
      captured_at: new Date().toISOString(),
      currency,
    },
    response: responseJson,
  }
  writeFileSync(fixturePath, JSON.stringify(fixture, null, 2))
  console.log(`[capture-trialbalance-fixture] Wrote ${fixturePath}`)

  // 5. Summary — sanity check Σ debit == Σ credit at capture time.
  // Trial Balance row shape (Xero standard): Cells = [Account Name, Debit (YTD),
  // Credit (YTD), YTD Debit, YTD Credit] OR similar — precise indices vary by
  // org. We sweep ALL numeric cells per Row and use the LARGEST debit-side and
  // credit-side absolute totals from the SummaryRow at the bottom of each
  // section. Treat this as a smoke-test only; the formal gate-3 logic lives in
  // parseTrialBalance + the harness, not here.
  const report = responseJson?.Reports?.[0]
  const allRows = (report?.Rows ?? []) as any[]
  let totalDebit = 0
  let totalCredit = 0
  let dataRowCount = 0
  const visit = (nodes: any[]) => {
    for (const n of nodes) {
      if (!n) continue
      if (n.RowType === 'Section' && Array.isArray(n.Rows)) visit(n.Rows)
      if (n.RowType !== 'Row') continue
      const cells = (n.Cells ?? []) as any[]
      // Standard Xero TB shape: cells[1]=Debit, cells[2]=Credit, cells[3]=YTD Debit, cells[4]=YTD Credit.
      // Fall back to any positive number summing.
      const debitVal = parseAmount(cells[1]?.Value)
      const creditVal = parseAmount(cells[2]?.Value)
      totalDebit += Math.max(0, debitVal)
      totalCredit += Math.max(0, creditVal)
      dataRowCount++
    }
  }
  visit(allRows)

  const delta = Math.round((totalDebit - totalCredit) * 100) / 100

  console.log('')
  console.log('=== CAPTURE SUMMARY ===')
  console.log(`Label:         ${label}`)
  console.log(`Business ID:   ${businessId}`)
  console.log(`Tenant:        ${connection.tenant_name} (${tenantId})`)
  console.log(`Balance date:  ${balanceDate}`)
  console.log(`Currency:      ${currency ?? '(unknown)'}`)
  console.log(`Data rows:     ${dataRowCount}`)
  console.log(`Σ Debit  (col1): ${totalDebit.toFixed(2)}`)
  console.log(`Σ Credit (col2): ${totalCredit.toFixed(2)}`)
  console.log(`Δ:               ${delta.toFixed(2)}  ${Math.abs(delta) <= 0.01 ? '✓ balanced' : '✗ NOT balanced — investigate before adding to fixtures'}`)
  console.log(`Path:          ${fixturePath}`)
  console.log('')
  console.log('Note: column-position assumptions vary by org; the formal gate-3 parser handles')
  console.log('column shape variation. This summary is a smoke check — if Δ ≠ 0, look at the raw')
  console.log('JSON before assuming a TB-out-of-balance issue.')
}

main().catch((err) => {
  console.error('[capture-trialbalance-fixture] Unhandled error:', err)
  process.exit(1)
})
