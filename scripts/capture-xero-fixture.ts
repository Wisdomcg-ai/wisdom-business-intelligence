/**
 * Phase 44 — Wave 0 fixture capture utility (created by plan 44-01).
 *
 * One-shot Xero P&L fixture recorder. For a given (business_id, fiscal_year),
 * captures TWO raw Xero responses to disk:
 *
 *   1. Profit & Loss BY MONTH (12 single-month columns) — the canonical
 *      D-05 query: `fromDate = base month start`, `toDate = base month end`,
 *      `periods = 11`, `timeframe = MONTH`. Returns 12 single-month columns
 *      ending in the base month. (Avoids the rolling-totals trap from 5d0c792.)
 *
 *   2. Profit & Loss SINGLE PERIOD (one column = the FY total) — the D-08
 *      reconciler oracle: `fromDate = FY start`, `toDate = FY end`. No
 *      `periods`, no `timeframe`. Sum-of-monthly-columns from (1) MUST equal
 *      this single column per account (tolerance $0.01).
 *
 * Both responses are written to `src/__tests__/xero/fixtures/{label}.json`
 * and `src/__tests__/xero/fixtures/{label}-reconciler.json` respectively.
 * Tests in `src/__tests__/xero/*` import these fixtures directly.
 *
 * Per RESEARCH.md (private repo + auto-memory single-remote): we do NOT
 * sanitize tenant IDs or dollar amounts. Fixtures stay verbatim.
 *
 * Usage:
 *   npx tsx scripts/capture-xero-fixture.ts --business-id=<uuid> --fy=2026 --label=envisage-fy26
 */
import { config } from 'dotenv'
import path from 'path'
config({ path: path.resolve(process.cwd(), '.env.local') })

import { createClient } from '@supabase/supabase-js'
import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { getValidAccessToken } from '@/lib/xero/token-manager'
import {
  generateFiscalMonthKeys,
  getCurrentFiscalYear,
  getFiscalYearStartDate,
  getFiscalYearEndDate,
  DEFAULT_YEAR_START_MONTH,
} from '@/lib/utils/fiscal-year-utils'

interface CliArgs {
  businessId: string
  fy: number
  label: string
  combinedOutput?: string
  includeInactive?: boolean
  tenantId?: string
}

function parseArgs(argv: string[]): CliArgs | { help: true } {
  if (argv.includes('--help') || argv.includes('-h')) return { help: true }
  const out: Partial<CliArgs> = {}
  for (const a of argv) {
    if (a.startsWith('--business-id=')) out.businessId = a.slice('--business-id='.length)
    else if (a.startsWith('--fy=')) out.fy = parseInt(a.slice('--fy='.length), 10)
    else if (a.startsWith('--label=')) out.label = a.slice('--label='.length)
    else if (a.startsWith('--combined-output=')) out.combinedOutput = a.slice('--combined-output='.length)
    else if (a === '--include-inactive') out.includeInactive = true
    else if (a.startsWith('--tenant-id=')) out.tenantId = a.slice('--tenant-id='.length)
  }
  if (!out.businessId || !out.fy || !out.label) {
    return { help: true }
  }
  return out as CliArgs
}

function printHelp() {
  console.log(`Usage:
  npx tsx scripts/capture-xero-fixture.ts --business-id=<uuid> --fy=<2026> --label=<slug> [options]

Required:
  --business-id  Supabase businesses.id OR business_profiles.id UUID
  --fy           Fiscal year to capture (e.g. 2026 = Jul 2025 – Jun 2026)
  --label        Filename slug (e.g. envisage-fy26 → envisage-fy26.json + envisage-fy26-reconciler.json)

Optional:
  --combined-output=<slug>   Also write src/__tests__/xero/fixtures/<slug>.json
                              with both queries wrapped in a single fixture
                              (Phase 44.2-01 D-44.2-07 contract).
  --include-inactive          Allow capture even if xero_connections.is_active=false.
                              Useful for diagnostic captures when the orchestrator
                              has flipped the connection inactive between runs.
  --tenant-id=<uuid>          Disambiguate when a business has multiple connections
                              (consolidated entities). Selects only the matching
                              xero_connections.tenant_id.

Output:
  src/__tests__/xero/fixtures/{label}.json            Raw Xero P&L by Month response
  src/__tests__/xero/fixtures/{label}-reconciler.json Raw Xero single-period FY total
  src/__tests__/xero/fixtures/{combined-output}.json  Combined FY+by-month wrapper (if --combined-output)

Notes:
  - Uses the FIRST active xero_connections row for the business (or any row when --include-inactive).
  - For the by-month report, the base month is:
      * Current FY → first day of current calendar month, last day of current month
      * Other FYs  → the LAST month of that FY (FY end month)
    Combined with periods=11, this returns 12 single-month columns (D-05 canonical).
  - Multi-org capture is a follow-up; this utility records ONE tenant per run.
`)
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2))
  if ('help' in parsed) {
    printHelp()
    process.exit(parsed.help && process.argv.length <= 2 ? 0 : 1)
  }

  const { businessId, fy, label, combinedOutput, includeInactive, tenantId: tenantIdFilter } = parsed

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY
  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('[capture-xero-fixture] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_KEY in .env.local')
    process.exit(1)
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  console.log(`[capture-xero-fixture] business_id=${businessId} FY=${fy} label=${label}`)
  if (combinedOutput) console.log(`[capture-xero-fixture] combined-output=${combinedOutput}`)
  if (includeInactive) console.log('[capture-xero-fixture] --include-inactive: connection is_active filter relaxed')
  if (tenantIdFilter) console.log(`[capture-xero-fixture] --tenant-id=${tenantIdFilter}`)

  // 1. Look up xero_connections for this business.
  // xero_connections.business_id can reference businesses.id OR business_profiles.id
  // (dual-ID system). Resolve both possibilities. The reverse lookup (when caller
  // passes a profile.id) is also handled by checking business_profiles.id directly.
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
    .order('updated_at', { ascending: false })
  if (!includeInactive) connQuery = connQuery.eq('is_active', true)
  if (tenantIdFilter) connQuery = connQuery.eq('tenant_id', tenantIdFilter)
  const { data: connections, error: connErr } = await connQuery
  if (connErr) {
    console.error('[capture-xero-fixture] Failed to load xero_connections:', connErr)
    process.exit(1)
  }
  if (!connections || connections.length === 0) {
    console.error(
      `[capture-xero-fixture] No xero_connections for business_id=${businessId} (active=${!includeInactive ? 'true' : 'any'}${tenantIdFilter ? `, tenant_id=${tenantIdFilter}` : ''})`
    )
    process.exit(1)
  }
  const connection = connections[0]
  console.log(`[capture-xero-fixture] Using connection.id=${connection.id} tenant=${connection.tenant_name} is_active=${connection.is_active} (of ${connections.length} matching)`)

  // 2. Get a valid access token via the canonical helper.
  const tokenResult = await getValidAccessToken({ id: connection.id }, supabase as any)
  if (!tokenResult.success || !tokenResult.accessToken) {
    console.error('[capture-xero-fixture] Failed to get access token:', tokenResult.error, tokenResult.message)
    process.exit(1)
  }
  const accessToken = tokenResult.accessToken
  const tenantId = connection.tenant_id as string

  // 3. Compute base-month and FY-range dates (D-05 canonical query shape).
  const yearStartMonth = DEFAULT_YEAR_START_MONTH // 7 = AU FY (Jul-Jun)
  const fyStart = getFiscalYearStartDate(fy, yearStartMonth)
  const fyEnd = getFiscalYearEndDate(fy, yearStartMonth)
  const fyMonthKeys = generateFiscalMonthKeys(fy, yearStartMonth)
  const currentFY = getCurrentFiscalYear(yearStartMonth)

  // Base month rule:
  //   - Current FY  → first/last day of CURRENT calendar month (capture YTD)
  //   - Other FYs   → first/last day of the FY end month (e.g. Jun 2026 for FY26)
  const today = new Date()
  let baseMonthStart: Date
  let baseMonthEnd: Date
  if (fy === currentFY) {
    baseMonthStart = new Date(today.getFullYear(), today.getMonth(), 1)
    baseMonthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0)
  } else {
    // Use FY end month (last month of the FY)
    baseMonthStart = new Date(fyEnd.getFullYear(), fyEnd.getMonth(), 1)
    baseMonthEnd = new Date(fyEnd.getFullYear(), fyEnd.getMonth() + 1, 0)
  }

  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

  const baseFrom = fmt(baseMonthStart)
  const baseTo = fmt(baseMonthEnd)
  const fyStartStr = fmt(fyStart)
  const fyEndStr = fmt(fyEnd)

  console.log(`[capture-xero-fixture] FY range: ${fyStartStr} → ${fyEndStr}`)
  console.log(`[capture-xero-fixture] Base month for by-month query: ${baseFrom} → ${baseTo}`)

  // 4. Fetch P&L by Month (12 single-month columns).
  // Canonical D-05 URL shape: fromDate=baseMonthStart&toDate=baseMonthEnd&periods=11&timeframe=MONTH
  const byMonthUrl = `https://api.xero.com/api.xro/2.0/Reports/ProfitAndLoss?fromDate=${baseFrom}&toDate=${baseTo}&periods=11&timeframe=MONTH&standardLayout=false&paymentsOnly=false`
  console.log(`[capture-xero-fixture] GET ${byMonthUrl}`)
  const byMonthRes = await fetch(byMonthUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'xero-tenant-id': tenantId,
      Accept: 'application/json',
    },
  })
  if (!byMonthRes.ok) {
    const errText = await byMonthRes.text()
    console.error(`[capture-xero-fixture] Xero by-month fetch failed: ${byMonthRes.status} ${errText.substring(0, 500)}`)
    process.exit(1)
  }
  const byMonthJson = await byMonthRes.json()

  // 5. Fetch single-period FY total (D-08 reconciler oracle).
  // No `periods`, no `timeframe` → returns one aggregate column for fyStart..fyEnd.
  const reconcilerUrl = `https://api.xero.com/api.xro/2.0/Reports/ProfitAndLoss?fromDate=${fyStartStr}&toDate=${fyEndStr}&standardLayout=false&paymentsOnly=false`
  console.log(`[capture-xero-fixture] GET ${reconcilerUrl}`)
  // Polite delay to stay clear of Xero rate limits.
  await new Promise(r => setTimeout(r, 300))
  const reconcilerRes = await fetch(reconcilerUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'xero-tenant-id': tenantId,
      Accept: 'application/json',
    },
  })
  if (!reconcilerRes.ok) {
    const errText = await reconcilerRes.text()
    console.error(`[capture-xero-fixture] Xero reconciler fetch failed: ${reconcilerRes.status} ${errText.substring(0, 500)}`)
    process.exit(1)
  }
  const reconcilerJson = await reconcilerRes.json()

  // 6. Write fixtures to src/__tests__/xero/fixtures/.
  const fixtureDir = path.resolve(process.cwd(), 'src/__tests__/xero/fixtures')
  if (!existsSync(fixtureDir)) {
    mkdirSync(fixtureDir, { recursive: true })
  }
  const byMonthPath = path.join(fixtureDir, `${label}.json`)
  const reconcilerPath = path.join(fixtureDir, `${label}-reconciler.json`)
  writeFileSync(byMonthPath, JSON.stringify(byMonthJson, null, 2))
  writeFileSync(reconcilerPath, JSON.stringify(reconcilerJson, null, 2))

  console.log(`[capture-xero-fixture] Wrote ${byMonthPath}`)
  console.log(`[capture-xero-fixture] Wrote ${reconcilerPath}`)

  // 6b. Optional combined fixture (Phase 44.2-01, D-44.2-07).
  // A single file wraps both queries with audit metadata so reconciliation
  // tests can assert FY-total == sum-of-monthly-columns from one fixture.
  if (combinedOutput) {
    const combined = {
      label,
      business_id: businessId,
      tenant_id: tenantId,
      tenant_name: connection.tenant_name,
      fiscal_year: fy,
      captured_at: new Date().toISOString(),
      fy_query: {
        url: reconcilerUrl,
        params: {
          fromDate: fyStartStr,
          toDate: fyEndStr,
          standardLayout: 'false',
          paymentsOnly: 'false',
        },
        response: reconcilerJson,
      },
      by_month_query: {
        url: byMonthUrl,
        params: {
          fromDate: baseFrom,
          toDate: baseTo,
          periods: 11,
          timeframe: 'MONTH',
          standardLayout: 'false',
          paymentsOnly: 'false',
        },
        response: byMonthJson,
      },
      // Current state per 44.2-CONTEXT.md: JDS reconciler reports 66 mismatched
      // accounts ($359,779 total). Flip to 'ok' once Phase 44.2 fixes ship.
      expected_reconciliation: 'mismatch' as const,
    }
    const combinedPath = path.join(fixtureDir, `${combinedOutput}.json`)
    writeFileSync(combinedPath, JSON.stringify(combined, null, 2))
    console.log(`[capture-xero-fixture] Wrote ${combinedPath}`)
  }

  // 7. Print summary so the user can paste expected values into test assertions.
  const byMonthReport = byMonthJson?.Reports?.[0]
  const reconcilerReport = reconcilerJson?.Reports?.[0]
  const byMonthRows = byMonthReport?.Rows ?? []
  const reconcilerRows = reconcilerReport?.Rows ?? []

  // Walk the header row to extract period bounds (first/last column captions).
  const headerCells = (byMonthReport?.Rows ?? []).find((r: any) => r.RowType === 'Header')?.Cells ?? []
  const firstPeriod = headerCells[1]?.Value ?? '(unknown)'
  const lastPeriod = headerCells[headerCells.length - 1]?.Value ?? '(unknown)'

  // Reconciler — single period total. Header gives the column caption; last
  // SummaryRow row in `Net Profit` section is the canonical total.
  const reconcilerHeader = reconcilerRows.find((r: any) => r.RowType === 'Header')?.Cells ?? []
  const reconcilerPeriod = reconcilerHeader[1]?.Value ?? '(unknown)'

  console.log('')
  console.log('=== CAPTURE SUMMARY ===')
  console.log(`Label:                ${label}`)
  console.log(`Business ID:          ${businessId}`)
  console.log(`Tenant:               ${connection.tenant_name} (${tenantId})`)
  console.log(`Fiscal Year:          ${fy} (${fyStartStr} → ${fyEndStr})`)
  console.log('')
  console.log('--- By-Month Report ---')
  console.log(`Top-level row count:  ${byMonthRows.length}`)
  console.log(`Header columns:       ${headerCells.length} (${headerCells.length - 1} period columns + 1 label)`)
  console.log(`First period:         ${firstPeriod}`)
  console.log(`Last period:          ${lastPeriod}`)
  console.log(`Path:                 ${byMonthPath}`)
  console.log('')
  console.log('--- Reconciler (single-period FY total) ---')
  console.log(`Top-level row count:  ${reconcilerRows.length}`)
  console.log(`Period column:        ${reconcilerPeriod}`)
  console.log(`Path:                 ${reconcilerPath}`)
  console.log('')
  console.log(`FY month-key range:   ${fyMonthKeys[0]} ... ${fyMonthKeys[fyMonthKeys.length - 1]}`)
  console.log('')
  console.log('Capture complete. Use the printed counts as test assertions in plan 44-03.')
}

main().catch(err => {
  console.error('[capture-xero-fixture] Unhandled error:', err)
  process.exit(1)
})
