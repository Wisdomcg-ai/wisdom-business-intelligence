/**
 * Phase 44.2 Plan 44.2-06F Task 3 — production reconciliation verifier.
 *
 * Runs the same 4 automated gate assertions as the 06E test harness, but
 * against LIVE production data (live Supabase + live Xero, read-only
 * fetches). Useful for:
 *   - Post-deploy canary verification ("did we ship cleanly to prod?")
 *   - Periodic reconciliation health check ("is prod still matching Xero?")
 *   - Single-tenant triage ("which gate failed for this client?")
 *
 * Gate logic is imported from src/lib/xero/reconciliation-gates.ts — the
 * same module the 06E test suite uses. One source of truth: green tests +
 * green verify-script = "production matches the reference fixtures."
 *
 * Usage:
 *   npx tsx scripts/verify-production-migration.ts \
 *     --business-id=<uuid> \
 *     --tenant-id=<uuid> \
 *     --balance-date=YYYY-MM-DD \
 *     --fy-end=YYYY-MM-DD \
 *     --fy-start-month-key=YYYY-MM-01 \
 *     [--include-inactive] \
 *     [--allowlist=Account1,Account2]
 *
 * Exit code:
 *   0 — all 4 automated gates pass
 *   1 — at least one gate fails (script names which gate, which delta)
 *   2 — error contacting Xero or Supabase
 *
 * Output:
 *   stdout — human-readable summary per gate
 *   stderr — single line of structured JSON for log aggregation
 */
import { config } from 'dotenv'
import path from 'path'
config({ path: path.resolve(process.cwd(), '.env.local') })

import { createClient } from '@supabase/supabase-js'
import { getValidAccessToken } from '@/lib/xero/token-manager'
import { parsePLSinglePeriod, type ParsedPLRow } from '@/lib/xero/pl-single-period-parser'
import { parseBSSinglePeriod, type ParsedBSRow } from '@/lib/xero/bs-single-period-parser'
import { parseTrialBalance, type ParsedTBRow } from '@/lib/xero/trialbalance-parser'
import {
  assertGate1,
  assertGate2,
  assertGate3,
  assertGate4,
  type Gate1Result,
  type Gate2Result,
  type Gate3Result,
  type Gate4Result,
} from '@/lib/xero/reconciliation-gates'

interface CliArgs {
  businessId: string
  tenantId: string
  balanceDate: string
  fyEnd: string
  fyStartMonthKey: string
  includeInactive?: boolean
  allowlist?: Set<string>
}

function parseArgs(argv: string[]): CliArgs | { help: true } {
  if (argv.includes('--help') || argv.includes('-h')) return { help: true }
  const out: Partial<CliArgs> = {}
  for (const a of argv) {
    if (a.startsWith('--business-id=')) out.businessId = a.slice('--business-id='.length)
    else if (a.startsWith('--tenant-id=')) out.tenantId = a.slice('--tenant-id='.length)
    else if (a.startsWith('--balance-date=')) out.balanceDate = a.slice('--balance-date='.length)
    else if (a.startsWith('--fy-end=')) out.fyEnd = a.slice('--fy-end='.length)
    else if (a.startsWith('--fy-start-month-key=')) out.fyStartMonthKey = a.slice('--fy-start-month-key='.length)
    else if (a === '--include-inactive') out.includeInactive = true
    else if (a.startsWith('--allowlist=')) {
      const list = a.slice('--allowlist='.length).split(',').map((s) => s.trim()).filter(Boolean)
      out.allowlist = new Set(list)
    }
  }
  if (!out.businessId || !out.tenantId || !out.balanceDate || !out.fyEnd || !out.fyStartMonthKey) {
    return { help: true }
  }
  return out as CliArgs
}

function printHelp() {
  console.log(`Usage:
  npx tsx scripts/verify-production-migration.ts \\
    --business-id=<uuid> \\
    --tenant-id=<uuid> \\
    --balance-date=YYYY-MM-DD \\
    --fy-end=YYYY-MM-DD \\
    --fy-start-month-key=YYYY-MM-01 \\
    [--include-inactive] [--allowlist=Account1,Account2]

Required:
  --business-id           business_profiles.id (or businesses.id — dual-ID resolved)
  --tenant-id             xero_connections.tenant_id
  --balance-date          As-of date for BS/TB gates (YYYY-MM-DD; typically a month-end)
  --fy-end                FY-end date for the FY-total PL fetch (YYYY-MM-DD)
  --fy-start-month-key    First month tag of the FY (YYYY-MM-01)

Optional:
  --include-inactive      Allow capture even if xero_connections.is_active=false
  --allowlist=name1,name2 Account names to exclude from Gate 1 drift detection
                          (use for known per-tenant Xero quirks)

Exit code: 0=all gates pass, 1=any gate fails, 2=infrastructure error.
Output:    stdout=human summary, stderr=structured JSON.

Reference invocation for JDS canary (post-44.2-06D deploy):
  npx tsx scripts/verify-production-migration.ts \\
    --business-id=900aa935-ae8c-4913-baf7-169260fa19ef \\
    --tenant-id=0219d3a9-c1be-4fb8-a4d3-0710b3af715a \\
    --balance-date=2026-04-30 \\
    --fy-end=2026-06-30 \\
    --fy-start-month-key=2025-07-01 \\
    --allowlist=Rent
`)
}

function lastDayOfMonth(monthKey: string): string {
  // monthKey = 'YYYY-MM-01'
  const [yStr, mStr] = monthKey.split('-')
  const y = parseInt(yStr!, 10)
  const m = parseInt(mStr!, 10)
  const d = new Date(y, m, 0)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function priorMonthEnd(balanceDate: string): string {
  const [yStr, mStr] = balanceDate.split('-')
  const y = parseInt(yStr!, 10)
  const m = parseInt(mStr!, 10)
  const firstOfThisMonth = new Date(y, m - 1, 1)
  const priorEnd = new Date(firstOfThisMonth.getTime() - 24 * 60 * 60 * 1000)
  const py = priorEnd.getFullYear()
  const pm = priorEnd.getMonth() + 1
  const pd = priorEnd.getDate()
  return `${py}-${String(pm).padStart(2, '0')}-${String(pd).padStart(2, '0')}`
}

/**
 * Enumerate FY YTD month-tags (YYYY-MM-01) from fyStartMonthKey through
 * the calendar month containing today (inclusive). Future months excluded —
 * Xero has no data there.
 */
function fyYtdMonths(fyStartMonthKey: string): string[] {
  const today = new Date()
  const startY = parseInt(fyStartMonthKey.slice(0, 4), 10)
  const startM = parseInt(fyStartMonthKey.slice(5, 7), 10)
  const endY = today.getFullYear()
  const endM = today.getMonth() + 1
  const out: string[] = []
  let y = startY
  let m = startM
  while (y < endY || (y === endY && m <= endM)) {
    out.push(`${y}-${String(m).padStart(2, '0')}-01`)
    m++
    if (m > 12) {
      m = 1
      y++
    }
  }
  return out
}

async function fetchXero(url: string, accessToken: string, tenantId: string): Promise<any> {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'xero-tenant-id': tenantId,
      Accept: 'application/json',
    },
  })
  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Xero ${res.status} on ${url}: ${errText.substring(0, 300)}`)
  }
  return res.json()
}

async function main(): Promise<number> {
  const parsed = parseArgs(process.argv.slice(2))
  if ('help' in parsed) {
    printHelp()
    process.exit(parsed.help && process.argv.length <= 2 ? 0 : 1)
  }
  const { businessId, tenantId, balanceDate, fyEnd, fyStartMonthKey, includeInactive, allowlist } = parsed

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY
  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('[verify] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_KEY in .env.local')
    return 2
  }
  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`[verify] business_id=${businessId} tenant_id=${tenantId} balance_date=${balanceDate}`)
  console.log(`[verify] FY range: ${fyStartMonthKey} → ${fyEnd}`)

  // Resolve xero_connections (dual-ID).
  let connection: any = null
  try {
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
    const { data: connections, error } = await connQuery
    if (error) throw error
    if (!connections || connections.length === 0) {
      console.error(`[verify] No xero_connections for business_id=${businessId} tenant_id=${tenantId}`)
      return 2
    }
    connection = connections[0]
  } catch (err) {
    console.error('[verify] Supabase resolve failed:', err)
    return 2
  }
  console.log(`[verify] connection.id=${connection.id} tenant=${connection.tenant_name}`)

  // Get access token.
  const tokenResult = await getValidAccessToken({ id: connection.id }, supabase as any)
  if (!tokenResult.success || !tokenResult.accessToken) {
    console.error('[verify] Token refresh failed:', tokenResult.error, tokenResult.message)
    return 2
  }
  const accessToken = tokenResult.accessToken

  // ─── Fetch all required reports ─────────────────────────────────────────
  console.log('[verify] Fetching live Xero reports...')
  const months = fyYtdMonths(fyStartMonthKey)
  console.log(`[verify]   ${months.length} single-period PL months: ${months[0]}..${months[months.length - 1]}`)

  let monthlyPLs: ParsedPLRow[][] = []
  let fyTotalPL: ParsedPLRow[] = []
  let bsThis: ParsedBSRow[] = []
  let bsPrior: ParsedBSRow[] = []
  let tb: ParsedTBRow[] = []
  let plMonthAtBalanceDate: ParsedPLRow[] = []

  try {
    // Per-month single-period PL (Gate 1 inputs + Gate 2 input for the
    // month ending at balanceDate).
    for (const monthKey of months) {
      const fromDate = monthKey
      const toDate = lastDayOfMonth(monthKey)
      const url = `https://api.xero.com/api.xro/2.0/Reports/ProfitAndLoss?fromDate=${fromDate}&toDate=${toDate}&standardLayout=false&paymentsOnly=false`
      const json = await fetchXero(url, accessToken, tenantId)
      const rows = parsePLSinglePeriod(json, monthKey, 'accruals', tenantId)
      monthlyPLs.push(rows)
      // Gate 2 needs the month ending at balanceDate.
      if (monthKey === `${balanceDate.slice(0, 7)}-01`) {
        plMonthAtBalanceDate = rows
      }
    }
    // FY-total PL (Gate 1 oracle).
    {
      const url = `https://api.xero.com/api.xro/2.0/Reports/ProfitAndLoss?fromDate=${fyStartMonthKey}&toDate=${fyEnd}&standardLayout=false&paymentsOnly=false`
      const json = await fetchXero(url, accessToken, tenantId)
      fyTotalPL = parsePLSinglePeriod(json, fyEnd, 'accruals', tenantId)
    }
    // BS at balanceDate (Gate 4 input + Gate 2 'this month').
    {
      const url = `https://api.xero.com/api.xro/2.0/Reports/BalanceSheet?date=${balanceDate}&standardLayout=false&paymentsOnly=false`
      const json = await fetchXero(url, accessToken, tenantId)
      bsThis = parseBSSinglePeriod(json, balanceDate, 'accruals', tenantId)
    }
    // BS at prior month-end (Gate 2 'prior month').
    {
      const priorDate = priorMonthEnd(balanceDate)
      const url = `https://api.xero.com/api.xro/2.0/Reports/BalanceSheet?date=${priorDate}&standardLayout=false&paymentsOnly=false`
      const json = await fetchXero(url, accessToken, tenantId)
      bsPrior = parseBSSinglePeriod(json, priorDate, 'accruals', tenantId)
    }
    // TB at balanceDate (Gate 3 input).
    {
      const url = `https://api.xero.com/api.xro/2.0/Reports/TrialBalance?date=${balanceDate}&paymentsOnly=false`
      const json = await fetchXero(url, accessToken, tenantId)
      tb = parseTrialBalance(json)
    }
  } catch (err) {
    console.error('[verify] Xero fetch failed:', err)
    return 2
  }

  // ─── Run gates ──────────────────────────────────────────────────────────
  console.log('[verify] Running 4 automated gates...\n')
  const gate1: Gate1Result = assertGate1(monthlyPLs, fyTotalPL, allowlist ?? new Set())
  const gate2: Gate2Result = assertGate2(plMonthAtBalanceDate, bsThis, bsPrior)
  const gate3: Gate3Result = assertGate3(tb)
  const gate4: Gate4Result = assertGate4(bsThis)

  // ─── Print human-readable summary ────────────────────────────────────────
  const fmt = (n: number) =>
    n.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  console.log(`Gate 1 — Σ(monthly PL) == FY-total PL (per-account)`)
  console.log(`  ${gate1.pass ? '✅ PASS' : '❌ FAIL'} (max drift: $${fmt(Math.abs(gate1.max_delta))})`)
  if (!gate1.pass) {
    for (const d of gate1.drift_accounts.slice(0, 10)) {
      console.log(`    - [${d.account_type}] ${d.account_name}: monthly=$${fmt(d.monthly_sum)} fy=$${fmt(d.fy_total)} Δ=$${fmt(d.delta)}`)
    }
    if (gate1.drift_accounts.length > 10) {
      console.log(`    ... and ${gate1.drift_accounts.length - 10} more`)
    }
  }
  console.log(`\nGate 2 — PL net profit (${balanceDate.slice(0, 7)}) == Δ(CYE+RE) on BS`)
  console.log(`  ${gate2.pass ? '✅ PASS' : '❌ FAIL'} pl=$${fmt(gate2.pl_net_profit)} bsΔ=$${fmt(gate2.bs_earnings_delta)} Δ=$${fmt(gate2.delta)}`)

  console.log(`\nGate 3 — TrialBalance balanced at ${balanceDate}`)
  console.log(`  ${gate3.pass ? '✅ PASS' : '❌ FAIL'} debit=$${fmt(gate3.total_debit)} credit=$${fmt(gate3.total_credit)} Δ=$${fmt(gate3.delta)}`)

  console.log(`\nGate 4 — Net Assets == Equity at ${balanceDate}`)
  console.log(`  ${gate4.pass ? '✅ PASS' : '❌ FAIL'} assets=$${fmt(gate4.assets)} liab=$${fmt(gate4.liabilities)} netAssets=$${fmt(gate4.net_assets)} equity=$${fmt(gate4.equity)} Δ=$${fmt(gate4.delta)}`)

  // ─── Gate 5 manual spot-check candidates ────────────────────────────────
  console.log('\nGate 5 — manual web parity candidates (compare against Xero web PDF):')
  const topRevenue = [...monthlyPLs.flat()]
    .filter((r) => r.account_type === 'revenue')
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 1)[0]
  const topAsset = [...bsThis]
    .filter((r) => r.account_type === 'asset')
    .sort((a, b) => b.balance - a.balance)
    .slice(0, 1)[0]
  const topTBDebit = [...tb].sort((a, b) => b.debit - a.debit).slice(0, 1)[0]
  if (topRevenue) {
    console.log(`  PL — ${topRevenue.account_name}: FY YTD = $${fmt(monthlyPLs.flat().filter((r) => r.account_id === topRevenue.account_id).reduce((s, r) => s + r.amount, 0))}`)
  }
  if (topAsset) {
    console.log(`  BS — ${topAsset.account_name} @ ${balanceDate}: $${fmt(topAsset.balance)}`)
  }
  if (topTBDebit) {
    console.log(`  TB — ${topTBDebit.account_name} @ ${balanceDate}: debit=$${fmt(topTBDebit.debit)} credit=$${fmt(topTBDebit.credit)}`)
  }

  // ─── Structured JSON to stderr ──────────────────────────────────────────
  const structured = {
    business_id: businessId,
    tenant_id: tenantId,
    tenant_name: connection.tenant_name,
    balance_date: balanceDate,
    fy_range: { start: fyStartMonthKey, end: fyEnd, ytd_months: months.length },
    gates: {
      gate1: { pass: gate1.pass, max_delta: gate1.max_delta, drift_count: gate1.drift_accounts.length },
      gate2: { pass: gate2.pass, delta: gate2.delta, pl_net_profit: gate2.pl_net_profit, bs_earnings_delta: gate2.bs_earnings_delta },
      gate3: { pass: gate3.pass, delta: gate3.delta, total_debit: gate3.total_debit, total_credit: gate3.total_credit },
      gate4: { pass: gate4.pass, delta: gate4.delta, assets: gate4.assets, liabilities: gate4.liabilities, net_assets: gate4.net_assets, equity: gate4.equity },
    },
  }
  console.error(JSON.stringify(structured))

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  const allPass = gate1.pass && gate2.pass && gate3.pass && gate4.pass
  if (allPass) {
    console.log(`✅ ALL 4 AUTOMATED GATES PASS for ${connection.tenant_name}`)
    return 0
  } else {
    const failed = [
      !gate1.pass && 'Gate 1',
      !gate2.pass && 'Gate 2',
      !gate3.pass && 'Gate 3',
      !gate4.pass && 'Gate 4',
    ].filter(Boolean)
    console.log(`❌ ${failed.length} of 4 gates FAILED for ${connection.tenant_name}: ${failed.join(', ')}`)
    return 1
  }
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error('[verify] Unhandled error:', err)
    process.exit(2)
  })
