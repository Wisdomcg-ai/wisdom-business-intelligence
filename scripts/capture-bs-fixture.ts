/**
 * Phase 44.2 Plan 44.2-06E Task 1 — Balance Sheet single-period fixture capture.
 *
 * BS twin of capture-xero-fixture.ts. One CLI invocation captures the raw
 * Reports/BalanceSheet response for a single (tenant, balance_date) and writes
 * it to src/__tests__/xero/fixtures/{label}.json with a _meta wrapper.
 *
 * Why _meta wrapper: the 06E reconciliation gate harness reads `_meta` to
 * parameterize the test (tenant_name, currency, balance_date) and `response`
 * to feed parseBSSinglePeriod. Mirrors the structure 06E expects in
 * src/__tests__/integration/xero-reconciliation-gates.test.ts.
 *
 * URL shape mirrors syncBalanceSheetForTenant exactly so fixtures match what
 * production fetches: ?date=YYYY-MM-DD&standardLayout=false&paymentsOnly=false.
 * NEVER includes periods= or timeframe= (those trigger the same documented
 * Xero bug as on PL).
 *
 * Usage:
 *   npx tsx scripts/capture-bs-fixture.ts \
 *     --business-id=<uuid> \
 *     --tenant-id=<uuid> \
 *     --balance-date=YYYY-MM-DD \
 *     --label=<slug> \
 *     [--include-inactive]
 *
 * Idempotent: re-running overwrites the fixture (operator confirms before
 * re-capture so we don't accidentally drift baselines).
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
    console.error(`[capture-bs-fixture] --balance-date must be YYYY-MM-DD, got: ${out.balanceDate}`)
    process.exit(1)
  }
  return out as CliArgs
}

function printHelp() {
  console.log(`Usage:
  npx tsx scripts/capture-bs-fixture.ts \\
    --business-id=<uuid> \\
    --tenant-id=<uuid> \\
    --balance-date=YYYY-MM-DD \\
    --label=<slug> \\
    [--include-inactive]

Required:
  --business-id   Supabase businesses.id OR business_profiles.id UUID
  --tenant-id     xero_connections.tenant_id (disambiguates multi-tenant orgs)
  --balance-date  As-of date for the BS (YYYY-MM-DD; typically last day of month)
  --label         Filename slug (e.g. jds-bs-2026-04-30 → fixtures/jds-bs-2026-04-30.json)

Optional:
  --include-inactive   Allow capture even if xero_connections.is_active=false.

Output:
  src/__tests__/xero/fixtures/{label}.json
    {
      "_meta": { tenant_name, tenant_id, business_id, balance_date,
                 captured_at, currency },
      "response": <raw Xero Reports/BalanceSheet body verbatim>
    }

Notes:
  - URL shape: Reports/BalanceSheet?date=<balance-date>&standardLayout=false&paymentsOnly=false
  - Never adds periods= or timeframe= (Calxa-via-Cowork Q1: same Xero bug as on PL).
  - Operator must confirm before re-capturing — fixtures are baselines.
`)
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
    console.error('[capture-bs-fixture] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_KEY in .env.local')
    process.exit(1)
  }
  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  console.log(`[capture-bs-fixture] business_id=${businessId} tenant_id=${tenantId} balance_date=${balanceDate} label=${label}`)

  // 1. Resolve xero_connections row (dual-ID aware: businesses.id OR business_profiles.id).
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
    console.error('[capture-bs-fixture] Failed to load xero_connections:', connErr)
    process.exit(1)
  }
  if (!connections || connections.length === 0) {
    console.error(
      `[capture-bs-fixture] No xero_connections for business_id=${businessId} tenant_id=${tenantId} (active=${!includeInactive})`
    )
    process.exit(1)
  }
  const connection = connections[0]
  console.log(`[capture-bs-fixture] Using connection.id=${connection.id} tenant=${connection.tenant_name}`)

  // 2. Get a valid access token.
  const tokenResult = await getValidAccessToken({ id: connection.id }, supabase as any)
  if (!tokenResult.success || !tokenResult.accessToken) {
    console.error('[capture-bs-fixture] Failed to get access token:', tokenResult.error, tokenResult.message)
    process.exit(1)
  }
  const accessToken = tokenResult.accessToken

  // 3. Fetch Reports/BalanceSheet for the balance_date — single-period only.
  const url = `https://api.xero.com/api.xro/2.0/Reports/BalanceSheet?date=${balanceDate}&standardLayout=false&paymentsOnly=false`
  console.log(`[capture-bs-fixture] GET ${url}`)
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'xero-tenant-id': tenantId,
      Accept: 'application/json',
    },
  })
  if (!res.ok) {
    const errText = await res.text()
    console.error(`[capture-bs-fixture] Xero BS fetch failed: ${res.status} ${errText.substring(0, 500)}`)
    process.exit(1)
  }
  const responseJson = await res.json()

  // 4. Best-effort currency lookup from /Organisation. Non-fatal if it fails —
  // currency only feeds the _meta header and isn't load-bearing for tests.
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

  // 5. Write fixture with _meta + response wrapper.
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
  console.log(`[capture-bs-fixture] Wrote ${fixturePath}`)

  // 6. Print summary so the operator can eyeball before adding to fixtures git.
  const report = responseJson?.Reports?.[0]
  const topRows = (report?.Rows ?? []) as any[]

  // Walk top-level Sections, capture title + count of Row children + sub-totals
  // from any SummaryRow. This gives a quick "did we get sensible-shaped data"
  // view without parsing further — the actual classification belongs to
  // parseBSSinglePeriod, run later by the gate harness.
  const sectionSummaries: Array<{ title: string; rows: number; summary: string | null }> = []
  for (const node of topRows) {
    if (node?.RowType !== 'Section') continue
    const title = (node?.Title ?? '').trim() || '(untitled)'
    const childRows = (node?.Rows ?? []) as any[]
    const dataRows = childRows.filter((r) => r?.RowType === 'Row').length
    const summaryRow = childRows.find((r) => r?.RowType === 'SummaryRow')
    const summaryVal = summaryRow?.Cells?.[1]?.Value ?? null
    sectionSummaries.push({ title, rows: dataRows, summary: summaryVal })
  }

  console.log('')
  console.log('=== CAPTURE SUMMARY ===')
  console.log(`Label:         ${label}`)
  console.log(`Business ID:   ${businessId}`)
  console.log(`Tenant:        ${connection.tenant_name} (${tenantId})`)
  console.log(`Balance date:  ${balanceDate}`)
  console.log(`Currency:      ${currency ?? '(unknown)'}`)
  console.log(`Top sections:  ${sectionSummaries.length}`)
  for (const s of sectionSummaries) {
    console.log(`  - ${s.title.padEnd(28)} rows=${s.rows} summary=${s.summary ?? '∅'}`)
  }
  console.log(`Path:          ${fixturePath}`)
  console.log('')
  console.log('Capture complete. Eyeball the section list above, then `git add` the fixture.')
}

main().catch((err) => {
  console.error('[capture-bs-fixture] Unhandled error:', err)
  process.exit(1)
})
