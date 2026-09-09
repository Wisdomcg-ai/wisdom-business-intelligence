/**
 * One-shot operator harness for POST /api/budgets/import.
 *
 * It exists because the import has no UI action yet and the fleet needs its
 * budgets in before the next monthly pack. It calls the SAME helpers the route
 * calls and writes the SAME rows — no second classification path, no second
 * definition of what a budget version is. When the settings-panel button lands
 * this file should be deleted.
 *
 * Dry run (default) reads Xero and prints the reconciliation without writing:
 *   npx tsx scripts/import-xero-budget-oneshot.ts --business <uuid> --tenant <uuid> --fy 2027
 *
 * Apply:
 *   npx tsx scripts/import-xero-budget-oneshot.ts --business <uuid> --tenant <uuid> --fy 2027 --apply
 *
 * Optional: --budget <xeroBudgetId>   pick a specific Xero budget (default: the
 *                                     sole OVERALL budget, or fail if ambiguous)
 *           --effective-from YYYY-MM  override the prospective start month
 *           --label "Overall Budget"
 *           --expect-month YYYY-MM    print that month's subtotals for tie-out
 */
import { config } from 'dotenv'
import path from 'path'
config({ path: path.resolve(process.cwd(), '.env.local') })

import { createClient } from '@supabase/supabase-js'
import { getSupabaseSecretKey } from '@/lib/supabase/keys'
import { getValidAccessToken } from '@/lib/xero/token-manager'
import { listXeroBudgets, getXeroBudget, BudgetsScopeMissingError } from '@/lib/xero/budgets'
import { loadAccountsCatalog, loadAccountActuals } from '@/lib/services/xero-budget-seed-data'
import { buildBudgetFromXero, defaultEffectiveFrom } from '@/lib/budgets/import-xero-budget'
import { generateFiscalMonthKeys, DEFAULT_YEAR_START_MONTH } from '@/lib/utils/fiscal-year-utils'

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}
const APPLY = process.argv.includes('--apply')

const businessId = arg('business')
const tenantId = arg('tenant')
const fiscalYear = Number(arg('fy'))
const budgetIdArg = arg('budget')
const effectiveFromArg = arg('effective-from')
const labelArg = arg('label')
const expectMonth = arg('expect-month')

if (!businessId || !tenantId || !Number.isFinite(fiscalYear)) {
  console.error('Usage: --business <uuid> --tenant <uuid> --fy <year> [--verify | --lock | --apply | --emit-sql <path>]')
  process.exit(1)
}
// process.exit does not narrow for tsc; restate the invariant as typed consts.
const BUSINESS_ID: string = businessId
const TENANT_ID: string = tenantId

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, getSupabaseSecretKey())

/**
 * --verify / --lock: work on the version that is ALREADY there.
 *
 * Re-running the import is not the way to finish a half-done one. The route has
 * no idempotency key (it reads max(version_number) and inserts N+1), and two
 * versions sharing an effective_from make `tied.length > 1` in
 * resolveInForceVersion — which returns multiple_versions_in_force for the whole
 * fiscal year. The budget column then disappears from every month, and the
 * settings dropdown (disabled unless exactly one version exists) locks you out
 * of switching back. So: verify, then lock. Never import alongside.
 */
async function verifyAndMaybeLock(doLock: boolean) {
  const { data: versions, error } = await admin
    .from('budget_versions')
    .select('id, label, version_number, effective_from, locked_at, months_covered, first_period, last_period, currency, xero_updated_at')
    .eq('business_id', BUSINESS_ID)
    .eq('fiscal_year', fiscalYear)
    .order('version_number', { ascending: true })

  if (error) { console.error(`Could not read budget_versions: ${error.message}`); process.exit(1) }
  if (!versions || versions.length === 0) { console.error('No budget version exists for this business/FY. Run the import (no --verify/--lock).'); process.exit(1) }

  console.log(`\n=== BUDGET VERSIONS (${versions.length}) ===`)
  for (const v of versions) {
    console.log(`  v${v.version_number}  ${v.id}  effective ${v.effective_from}  ${v.months_covered}/12  ${v.locked_at ? 'LOCKED' : 'unlocked'}  ${v.label}`)
  }
  if (versions.length > 1) {
    console.error(`\nMORE THAN ONE VERSION. If two share an effective_from the resolver returns multiple_versions_in_force`)
    console.error(`and the budget column vanishes for the whole year. Delete the surplus row (budget_lines cascades) before locking.`)
    process.exit(1)
  }

  const v = versions[0]
  const { data: lines, error: linesErr } = await admin
    .from('budget_lines')
    .select('month, category, amount')
    .eq('budget_version_id', v.id)
  if (linesErr) { console.error(`Could not read budget_lines: ${linesErr.message}`); process.exit(1) }

  const rows = (lines ?? []) as Array<{ month: string; category: string | null; amount: number }>
  const byMonth = new Map<string, Map<string, number>>()
  for (const r of rows) {
    const cat = r.category ?? '(unclassified)'
    if (!byMonth.has(r.month)) byMonth.set(r.month, new Map())
    const m = byMonth.get(r.month)!
    m.set(cat, (m.get(cat) ?? 0) + Number(r.amount))
  }
  const cats = ['Revenue', 'Cost of Sales', 'Operating Expenses', 'Other Income', 'Other Expenses', '(unclassified)']
  console.log(`\n=== STORED LINES: ${rows.length} across ${byMonth.size} months ===`)
  console.log(['month'.padEnd(8), 'rows'.padStart(6), ...cats.map((c) => c.slice(0, 12).padStart(14))].join(''))
  for (const month of Array.from(byMonth.keys()).sort()) {
    const m = byMonth.get(month)!
    const n = rows.filter((r) => r.month === month).length
    console.log([month.padEnd(8), String(n).padStart(6), ...cats.map((c) => money(m.get(c) ?? 0).padStart(14))].join(''))
  }
  const nullCat = rows.filter((r) => r.category == null).length
  console.log(`\n  unclassified rows: ${nullCat}${nullCat ? '  <-- these render as Operating Expenses' : ''}`)

  if (expectMonth) {
    const m = byMonth.get(expectMonth)
    if (!m) { console.error(`\n${expectMonth} HAS NO BUDGET ROWS — the report month would show no budget.`); process.exit(1) }
    console.log(`\n=== ${expectMonth} ===`)
    for (const c of cats) if (m.get(c)) console.log(`  ${c.padEnd(20)} ${money(m.get(c)!).padStart(12)}`)
  }

  if (!doLock) {
    console.log(`\nVERIFY ONLY — nothing changed. Re-run with --lock once the numbers above are right.`)
    return
  }
  if (v.locked_at) { console.log(`\nAlready locked at ${v.locked_at}. Nothing to do.`); return }

  const { error: lockErr } = await admin
    .from('budget_versions')
    .update({ locked_at: new Date().toISOString() })
    .eq('id', v.id)
    .is('locked_at', null)
  if (lockErr) { console.error(`Lock failed: ${lockErr.message}`); process.exit(1) }
  console.log(`\nLOCKED v${v.version_number} (${v.id}).`)
  console.log(`It is still not the report's budget — set monthly_report_settings.budget_source = 'budget_version' to switch this client over.`)
}

function money(n: number): string {
  return n.toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

async function main() {
  // ── The connection must belong to this business ──────────────────────────
  const { data: connection } = await admin
    .from('xero_connections')
    .select('*')
    .eq('business_id', BUSINESS_ID)
    .eq('tenant_id', TENANT_ID)
    .eq('is_active', true)
    .maybeSingle()

  if (!connection) {
    console.error(`No active Xero connection for business ${businessId} / tenant ${tenantId}`)
    process.exit(1)
  }
  console.log(`Org: ${connection.tenant_name} (${connection.functional_currency ?? 'currency unset'})`)

  const token = await getValidAccessToken(connection, admin)
  if (!token.success || !token.accessToken) {
    console.error(`Could not reach Xero: ${token.error} — ${token.message}`)
    process.exit(1)
  }
  const auth = { accessToken: token.accessToken, tenantId: TENANT_ID }

  // ── Pick the budget ──────────────────────────────────────────────────────
  let budgetId = budgetIdArg
  if (!budgetId) {
    let summaries
    try {
      summaries = await listXeroBudgets(auth)
    } catch (err) {
      if (err instanceof BudgetsScopeMissingError) {
        console.error('This org has not granted accounting.budgets.read — reconnect Xero first.')
        process.exit(1)
      }
      throw err
    }
    console.log(`\nXero budgets on this org (${summaries.length}):`)
    for (const s of summaries) console.log(`  ${s.budgetId}  ${s.type.padEnd(8)}  ${s.name}`)
    const overall = summaries.filter((s) => s.type === 'OVERALL')
    if (overall.length !== 1) {
      console.error(`\nExpected exactly one OVERALL budget, found ${overall.length}. Pass --budget <id>.`)
      process.exit(1)
    }
    budgetId = overall[0].budgetId
    console.log(`\nUsing OVERALL budget: ${overall[0].name} (${budgetId})`)
  }

  // ── Fetch the WHOLE fiscal year, elapsed months included ─────────────────
  const fyMonthKeys = generateFiscalMonthKeys(fiscalYear, DEFAULT_YEAR_START_MONTH)
  console.log(`Fiscal window: ${fyMonthKeys[0]} .. ${fyMonthKeys[fyMonthKeys.length - 1]}`)

  const budget = await getXeroBudget(auth, budgetId!, {
    from: fyMonthKeys[0],
    to: fyMonthKeys[fyMonthKeys.length - 1],
  })
  if (!budget) {
    console.error('Budget not found in Xero')
    process.exit(1)
  }

  const [catalog, actuals] = await Promise.all([
    loadAccountsCatalog(admin, TENANT_ID),
    loadAccountActuals(admin, TENANT_ID),
  ])

  const built = buildBudgetFromXero({ budgetLines: budget.lines, catalog, actuals, fyMonthKeys })

  if (built.lines.length === 0) {
    console.error('That Xero budget has no amounts inside this fiscal year')
    process.exit(1)
  }

  // ── Reconciliation, before anything is written ───────────────────────────
  console.log(`\n=== XERO BUDGET ===`)
  console.log(`  id:        ${budget.budgetId}`)
  console.log(`  name:      ${budget.name}`)
  console.log(`  type:      ${budget.type}`)
  console.log(`  updatedAt: ${budget.updatedAt ?? '(not reported)'}`)

  console.log(`\n=== BUILT ===`)
  console.log(`lines: ${built.lines.length}   monthsCovered: ${built.monthsCovered}/12   ${built.firstPeriod} .. ${built.lastPeriod}`)
  if (built.unclassified.length) {
    console.log(`\nUNCLASSIFIED (${built.unclassified.length}) — these store category null and the report will read them as Operating Expenses:`)
    for (const u of built.unclassified) console.log(`  ${u.accountCode} ${u.accountName}`)
  }
  if (built.warnings.length) {
    console.log(`\nWARNINGS:`)
    for (const w of built.warnings) console.log(`  ${w}`)
  }
  if (built.zeroBudgetAccounts.length) {
    console.log(`\nZERO-BUDGET ACCOUNTS (${built.zeroBudgetAccounts.length}) — budgeted nowhere in the FY`)
  }

  const byMonth = new Map<string, Map<string, number>>()
  for (const l of built.lines) {
    const cat = l.category ?? '(unclassified)'
    if (!byMonth.has(l.month)) byMonth.set(l.month, new Map())
    const m = byMonth.get(l.month)!
    m.set(cat, (m.get(cat) ?? 0) + l.amount)
  }
  const cats = ['Revenue', 'Cost of Sales', 'Operating Expenses', 'Other Income', 'Other Expenses', '(unclassified)']
  console.log(`\n=== MONTHLY SUBTOTALS ===`)
  console.log(['month'.padEnd(8), ...cats.map((c) => c.slice(0, 12).padStart(14))].join(''))
  const annual = new Map<string, number>()
  for (const month of fyMonthKeys) {
    const m = byMonth.get(month)
    if (!m) { console.log(`${month.padEnd(8)}${'— no budget rows —'.padStart(14)}`); continue }
    for (const c of cats) annual.set(c, (annual.get(c) ?? 0) + (m.get(c) ?? 0))
    console.log([month.padEnd(8), ...cats.map((c) => money(m.get(c) ?? 0).padStart(14))].join(''))
  }
  console.log(['ANNUAL'.padEnd(8), ...cats.map((c) => money(annual.get(c) ?? 0).padStart(14))].join(''))

  if (expectMonth) {
    const m = byMonth.get(expectMonth)
    const rev = m?.get('Revenue') ?? 0
    const cogs = m?.get('Cost of Sales') ?? 0
    const opex = m?.get('Operating Expenses') ?? 0
    console.log(`\n=== ${expectMonth} TIE-OUT ===`)
    console.log(`  Revenue        ${money(rev).padStart(12)}`)
    console.log(`  Cost of Sales  ${money(cogs).padStart(12)}`)
    console.log(`  Operating Exp  ${money(opex).padStart(12)}`)
    console.log(`  Net profit     ${money(rev - cogs - opex).padStart(12)}`)
  }

  // ── Does the BUDGET bucket every account the same way the ACTUAL does? ───
  // A variance is only meaningful when both sides land in the same subtotal.
  // The budget is classified here from the xero_accounts catalog; the actuals
  // were classified by the P&L sync. Where those two disagree, the account's
  // budget and its actual sit in different sections of the statement.
  const actualType = new Map<string, string>()
  const actualName = new Map<string, string>()
  for (const a of actuals as Array<{ accountCode: string; accountName: string; accountType: string | null }>) {
    if (a.accountCode) {
      actualType.set(String(a.accountCode), a.accountType ?? '(null)')
      actualName.set(String(a.accountCode), a.accountName)
    }
  }
  const budgetType = new Map<string, { type: string | null; name: string; annual: number }>()
  for (const l of built.lines) {
    const cur = budgetType.get(l.account_code) ?? { type: l.account_type, name: l.account_name, annual: 0 }
    cur.annual += l.amount
    budgetType.set(l.account_code, cur)
  }
  const mismatches: Array<{ code: string; name: string; budget: string; actual: string; annual: number }> = []
  const notInActuals: Array<{ code: string; name: string; annual: number }> = []
  for (const [code, b] of budgetType) {
    const a = actualType.get(code)
    if (a === undefined) { notInActuals.push({ code, name: b.name, annual: b.annual }); continue }
    if ((b.type ?? '') !== a) {
      mismatches.push({ code, name: b.name, budget: b.type ?? '(null)', actual: a, annual: b.annual })
    }
  }
  console.log(`\n=== BUDGET vs ACTUAL BUCKETING ===`)
  if (mismatches.length === 0) {
    console.log('  every budgeted account buckets the same on both sides')
  } else {
    console.log(`  ${mismatches.length} account(s) bucket DIFFERENTLY — budget and actual land in different subtotals:`)
    mismatches.sort((x, y) => Math.abs(y.annual) - Math.abs(x.annual))
    for (const m of mismatches) {
      console.log(`    ${m.code.padEnd(10)} ${m.name.slice(0, 34).padEnd(36)} budget=${m.budget.padEnd(14)} actual=${m.actual.padEnd(14)} FY ${money(m.annual).padStart(12)}`)
    }
  }
  if (notInActuals.length) {
    console.log(`\n  ${notInActuals.length} budgeted account(s) with NO actuals row this year (never posted to):`)
    notInActuals.sort((x, y) => Math.abs(y.annual) - Math.abs(x.annual))
    for (const n of notInActuals) console.log(`    ${n.code.padEnd(10)} ${n.name.slice(0, 40).padEnd(42)} FY ${money(n.annual).padStart(12)}`)
  }

  console.log(`\n=== ANNUAL BUDGET BY ACCOUNT ===`)
  const perAccount = Array.from(budgetType.entries())
    .map(([code, b]) => ({ code, name: b.name, type: b.type ?? '(null)', annual: b.annual }))
    .sort((a, b) => (a.type === b.type ? Math.abs(b.annual) - Math.abs(a.annual) : String(a.type).localeCompare(String(b.type))))
  for (const a of perAccount) {
    console.log(`  ${String(a.type).padEnd(14)} ${a.code.padEnd(10)} ${a.name.slice(0, 38).padEnd(40)} ${money(a.annual).padStart(12)}`)
  }

  // ── --emit-sql: hand the exact rows to a permissioned SQL path ───────────
  const emitSql = arg('emit-sql')
  if (emitSql) {
    const { data: finalisedE } = await admin
      .from('monthly_report_snapshots')
      .select('report_month')
      .eq('business_id', BUSINESS_ID)
      .eq('fiscal_year', fiscalYear)
      .neq('status', 'draft')
    const effE =
      effectiveFromArg ??
      defaultEffectiveFrom(fyMonthKeys, (finalisedE ?? []).map((r: { report_month: string }) => r.report_month))
    const { data: existingE } = await admin
      .from('budget_versions')
      .select('version_number')
      .eq('business_id', BUSINESS_ID)
      .eq('tenant_id', TENANT_ID)
      .eq('fiscal_year', fiscalYear)
      .order('version_number', { ascending: false })
      .limit(1)
      .maybeSingle()
    const vNum = (existingE?.version_number ?? 0) + 1
    const q = (v: string | null) => (v == null ? 'null' : `'${v.replace(/'/g, "''")}'`)
    // Compact: a 60-odd row account dimension + one (code, month, amount) cell
    // per non-zero budget cell. Same rows the route would write.
    const accounts = new Map<string, { name: string; category: string | null; type: string | null }>()
    for (const l of built.lines) {
      if (!accounts.has(l.account_code)) {
        accounts.set(l.account_code, { name: l.account_name, category: l.category, type: l.account_type as string | null })
      }
    }
    const out: string[] = []
    out.push('begin;')
    out.push(`with v as (
  insert into budget_versions (business_id, tenant_id, fiscal_year, source, xero_budget_id, xero_budget_type,
    xero_updated_at, currency, label, version_number, effective_from, locked_at, imported_by,
    months_covered, first_period, last_period, notes)
  values (${q(BUSINESS_ID)}, ${q(TENANT_ID)}, ${fiscalYear}, 'xero', ${q(budget.budgetId)}, ${q(budget.type)},
    ${q(budget.updatedAt ?? null)}, ${q(connection.functional_currency ?? null)}, ${q(labelArg || budget.name || 'Xero budget')},
    ${vNum}, ${q(effE)}, null, null, ${built.monthsCovered}, ${q(built.firstPeriod)}, ${q(built.lastPeriod)},
    'Xero Budgets API import')
  returning id
), acct(code, name, category, atype) as (values`)
    out.push(Array.from(accounts.entries())
      .map(([code, a]) => `  (${q(code)},${q(a.name)},${q(a.category)},${q(a.type)})`).join(',\n'))
    out.push(`), cell(code, month, amount) as (values`)
    out.push(built.lines.map((l) => `(${q(l.account_code)},${q(l.month)},${l.amount})`).join(','))
    out.push(`)
insert into budget_lines (budget_version_id, business_id, tenant_id, account_code, account_name, category, account_type, month, amount)
select v.id, ${q(BUSINESS_ID)}, ${q(TENANT_ID)}, c.code, a.name, a.category, a.atype, c.month, c.amount
from v, cell c join acct a on a.code = c.code;`)
    out.push(`update budget_versions set locked_at = now()
where business_id = ${q(BUSINESS_ID)} and tenant_id = ${q(TENANT_ID)} and fiscal_year = ${fiscalYear}
  and version_number = ${vNum} and locked_at is null;`)
    out.push('commit;')
    const fs = await import('fs')
    fs.writeFileSync(emitSql, out.join('\n'))
    console.log(`\nWrote ${built.lines.length} lines as SQL to ${emitSql} (version ${vNum}, effective ${effE}).`)
    return
  }

  if (!APPLY) {
    console.log(`\nDRY RUN — nothing written. Re-run with --apply once the numbers above tie.`)
    return
  }

  // ── Write: version unlocked → lines → lock (same order as the route) ─────
  const { data: finalised } = await admin
    .from('monthly_report_snapshots')
    .select('report_month')
    .eq('business_id', BUSINESS_ID)
    .eq('fiscal_year', fiscalYear)
    .neq('status', 'draft')

  const effective =
    effectiveFromArg ??
    defaultEffectiveFrom(fyMonthKeys, (finalised ?? []).map((r: { report_month: string }) => r.report_month))

  const { data: existing } = await admin
    .from('budget_versions')
    .select('version_number')
    .eq('business_id', BUSINESS_ID)
    .eq('tenant_id', TENANT_ID)
    .eq('fiscal_year', fiscalYear)
    .order('version_number', { ascending: false })
    .limit(1)
    .maybeSingle()
  const versionNumber = (existing?.version_number ?? 0) + 1

  console.log(`\nWriting version ${versionNumber}, effective from ${effective} …`)

  const { data: version, error: versionError } = await admin
    .from('budget_versions')
    .insert({
      business_id: BUSINESS_ID,
      tenant_id: TENANT_ID,
      fiscal_year: fiscalYear,
      source: 'xero',
      xero_budget_id: budget.budgetId,
      xero_budget_type: budget.type,
      xero_updated_at: budget.updatedAt ?? null,
      currency: connection.functional_currency ?? null,
      label: labelArg || budget.name || 'Xero budget',
      version_number: versionNumber,
      effective_from: effective,
      locked_at: null,
      imported_by: null,
      months_covered: built.monthsCovered,
      first_period: built.firstPeriod,
      last_period: built.lastPeriod,
      notes: 'Imported by scripts/import-xero-budget-oneshot.ts',
    })
    .select('id')
    .single()

  if (versionError || !version) {
    console.error(`Could not create the budget version: ${versionError?.message}`)
    process.exit(1)
  }

  const { error: linesError } = await admin.from('budget_lines').insert(
    built.lines.map((line) => ({
      budget_version_id: version.id,
      business_id: BUSINESS_ID,
      tenant_id: TENANT_ID,
      account_code: line.account_code,
      account_name: line.account_name,
      category: line.category,
      account_type: line.account_type,
      month: line.month,
      amount: line.amount,
    })),
  )

  if (linesError) {
    console.error(`Could not write the budget lines: ${linesError.message}`)
    console.error(`Version ${version.id} left UNLOCKED — the resolver reads only locked rows, so it is invisible.`)
    process.exit(1)
  }

  const { error: lockError } = await admin
    .from('budget_versions')
    .update({ locked_at: new Date().toISOString() })
    .eq('id', version.id)

  if (lockError) {
    console.error(`Budget imported but could not be locked: ${lockError.message}`)
    process.exit(1)
  }

  console.log(`\nDONE. version ${version.id} (v${versionNumber}), ${built.lines.length} lines, effective ${effective}, LOCKED.`)
  console.log(`It is NOT yet the report's budget — set monthly_report_settings.budget_source = 'budget_version' to switch this client over.`)
}

const MODE_VERIFY = process.argv.includes('--verify')
const MODE_LOCK = process.argv.includes('--lock')

const entry = MODE_VERIFY || MODE_LOCK ? () => verifyAndMaybeLock(MODE_LOCK) : main

entry().catch((err) => {
  console.error(err)
  process.exit(1)
})
