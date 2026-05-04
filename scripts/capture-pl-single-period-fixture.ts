/**
 * Phase 44.2 Plan 44.2-06E — Single-period P&L fixture capture.
 *
 * Captures one calendar month's PL via the Path A query shape (no periods=,
 * no timeframe=) and writes a _meta-wrapped fixture. Required by Gate 1
 * of the reconciliation harness: Σ(N single-period months) == single-period
 * FY-total. By-month captures DO NOT satisfy Gate 1 — they carry the
 * Calxa Q1 documented Xero bug that Path A was built to avoid.
 *
 * Usage:
 *   npx tsx scripts/capture-pl-single-period-fixture.ts \
 *     --business-id=<uuid> \
 *     --tenant-id=<uuid> \
 *     --month=YYYY-MM \
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
  month?: string // 'YYYY-MM' — convenience; expands to month-start..month-end
  fromDate?: string // 'YYYY-MM-DD' — explicit range start (mutually exclusive with --month)
  toDate?: string // 'YYYY-MM-DD' — explicit range end
  label: string
  includeInactive?: boolean
}

function parseArgs(argv: string[]): CliArgs | { help: true } {
  if (argv.includes('--help') || argv.includes('-h')) return { help: true }
  const out: Partial<CliArgs> = {}
  for (const a of argv) {
    if (a.startsWith('--business-id=')) out.businessId = a.slice('--business-id='.length)
    else if (a.startsWith('--tenant-id=')) out.tenantId = a.slice('--tenant-id='.length)
    else if (a.startsWith('--month=')) out.month = a.slice('--month='.length)
    else if (a.startsWith('--from-date=')) out.fromDate = a.slice('--from-date='.length)
    else if (a.startsWith('--to-date=')) out.toDate = a.slice('--to-date='.length)
    else if (a.startsWith('--label=')) out.label = a.slice('--label='.length)
    else if (a === '--include-inactive') out.includeInactive = true
  }
  const hasMonth = !!out.month
  const hasRange = !!out.fromDate && !!out.toDate
  if (!out.businessId || !out.tenantId || !out.label) return { help: true }
  if (!hasMonth && !hasRange) {
    console.error(`[capture-pl-single-period-fixture] Provide either --month=YYYY-MM OR both --from-date=YYYY-MM-DD --to-date=YYYY-MM-DD`)
    return { help: true }
  }
  if (hasMonth && !/^\d{4}-\d{2}$/.test(out.month!)) {
    console.error(`[capture-pl-single-period-fixture] --month must be YYYY-MM, got: ${out.month}`)
    process.exit(1)
  }
  if (hasRange) {
    for (const [k, v] of [['from-date', out.fromDate], ['to-date', out.toDate]] as const) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v!)) {
        console.error(`[capture-pl-single-period-fixture] --${k} must be YYYY-MM-DD, got: ${v}`)
        process.exit(1)
      }
    }
  }
  return out as CliArgs
}

function printHelp() {
  console.log(`Usage:
  npx tsx scripts/capture-pl-single-period-fixture.ts \\
    --business-id=<uuid> --tenant-id=<uuid> --month=YYYY-MM --label=<slug> [--include-inactive]

URL: Reports/ProfitAndLoss?fromDate=YYYY-MM-01&toDate=YYYY-MM-LAST&standardLayout=false&paymentsOnly=false
(no periods=, no timeframe= — Path A query shape, matches sync-orchestrator exactly).

Output: src/__tests__/xero/fixtures/{label}.json with _meta + response.
`)
}

function lastDayOfMonth(month: string): string {
  const [y, m] = month.split('-').map((s) => parseInt(s!, 10))
  // new Date(year, monthIndex+1, 0) gives last day of monthIndex.
  const d = new Date(y!, m!, 0)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2))
  if ('help' in parsed) {
    printHelp()
    process.exit(parsed.help && process.argv.length <= 2 ? 0 : 1)
  }
  const { businessId, tenantId, month, label, includeInactive } = parsed
  // --month is a convenience expanded to month-start..month-end. --from-date /
  // --to-date overrides for arbitrary ranges (used by 06E gate-1 FY-total
  // captures where the FY range is non-AU-FY, e.g. IICT-HK calendar/Apr-Mar).
  const fromDate = parsed.fromDate ?? `${month}-01`
  const toDate = parsed.toDate ?? lastDayOfMonth(month!)

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY
  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('[capture-pl-single-period-fixture] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_KEY in .env.local')
    process.exit(1)
  }
  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  console.log(`[capture-pl-single-period-fixture] business_id=${businessId} tenant_id=${tenantId} month=${month} label=${label}`)

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
    console.error('[capture-pl-single-period-fixture] Failed to load xero_connections:', connErr)
    process.exit(1)
  }
  if (!connections || connections.length === 0) {
    console.error(
      `[capture-pl-single-period-fixture] No xero_connections for business_id=${businessId} tenant_id=${tenantId}`,
    )
    process.exit(1)
  }
  const connection = connections[0]

  const tokenResult = await getValidAccessToken({ id: connection.id }, supabase as any)
  if (!tokenResult.success || !tokenResult.accessToken) {
    console.error('[capture-pl-single-period-fixture] Failed to get access token:', tokenResult.error, tokenResult.message)
    process.exit(1)
  }
  const accessToken = tokenResult.accessToken

  const url = `https://api.xero.com/api.xro/2.0/Reports/ProfitAndLoss?fromDate=${fromDate}&toDate=${toDate}&standardLayout=false&paymentsOnly=false`
  console.log(`[capture-pl-single-period-fixture] GET ${url}`)
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'xero-tenant-id': tenantId,
      Accept: 'application/json',
    },
  })
  if (!res.ok) {
    const errText = await res.text()
    console.error(`[capture-pl-single-period-fixture] Xero PL fetch failed: ${res.status} ${errText.substring(0, 500)}`)
    process.exit(1)
  }
  const responseJson = await res.json()

  const fixtureDir = path.resolve(process.cwd(), 'src/__tests__/xero/fixtures')
  if (!existsSync(fixtureDir)) mkdirSync(fixtureDir, { recursive: true })
  const fixturePath = path.join(fixtureDir, `${label}.json`)
  const fixture = {
    _meta: {
      tenant_name: connection.tenant_name,
      tenant_id: tenantId,
      business_id: businessId,
      period_month: month ?? null,
      from_date: fromDate,
      to_date: toDate,
      captured_at: new Date().toISOString(),
    },
    response: responseJson,
  }
  writeFileSync(fixturePath, JSON.stringify(fixture, null, 2))
  console.log(`[capture-pl-single-period-fixture] Wrote ${fixturePath}`)
}

main().catch((err) => {
  console.error('[capture-pl-single-period-fixture] Unhandled error:', err)
  process.exit(1)
})
