/**
 * Phase 44.2 Plan 44.2-03 — Sales-Hardware $6,839.40 gap diagnostic.
 *
 * Compares Xero's FY single-period response vs the by-month response
 * (already captured as a fixture in 44.2-01) to locate WHERE the
 * difference between fy_total and sum(monthly cells) actually lives.
 *
 * Per D-44.2-10: capture the data first, then decide between
 * D-44.2-08 (Xero API quirk → 44.2-06 absorbs adjustment row) and
 * D-44.2-09 (parser bug → 44.2-06 fixes parsePLByMonth).
 *
 * The script is fixture-driven; no DB / API calls. Reusable on any
 * future tenant by swapping the fixture import.
 *
 * Output: 3 sections.
 *   A) Sales - Hardware deep dive (canonical gap)
 *   B) All accounts with |diff| > 0.01 sorted by |diff| desc
 *   C) Orphan accounts (present in only ONE of the two responses)
 *
 * Usage: `npx tsx scripts/diag-jds-sales-hardware-gap.ts`
 */
import fixture from '../src/__tests__/xero/fixtures/jds-recon-2026-04-fy-vs-by-month.json'

// ─── Types ──────────────────────────────────────────────────────────────────

type XeroAttribute = { Id?: string; Value?: string }
type XeroCell = { Value?: string; Attributes?: XeroAttribute[] }
type XeroRow = {
  RowType?: string
  Title?: string
  Cells?: XeroCell[]
  Rows?: XeroRow[]
}
type XeroReport = { Rows?: XeroRow[] }

interface FYAccount {
  account_id: string | null
  account_name: string
  section: string
  fy_total: number
}

interface MonthlyCell {
  period: string
  value: number
}

interface BMAccount {
  account_id: string | null
  account_name: string
  section: string
  monthly_cells: MonthlyCell[]
  monthly_sum_full: number // all 12 cells
  monthly_sum_fy26: number // first 10 cells (Jul 25 → Apr 26)
}

interface MergedAccount {
  account_id: string | null
  account_name: string
  section: string
  fy: FYAccount | null
  byMonth: BMAccount | null
  diff_full: number | null
  diff_fy26: number | null
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function parseAmount(s: string | null | undefined): number {
  if (s === null || s === undefined) return 0
  const trimmed = String(s).replace(/[$,]/g, '').trim()
  if (trimmed === '' || trimmed === '-') return 0
  const isParen = trimmed.startsWith('(') && trimmed.endsWith(')')
  const inner = isParen ? trimmed.slice(1, -1) : trimmed
  const num = parseFloat(inner)
  if (Number.isNaN(num)) return 0
  return isParen ? -Math.abs(num) : num
}

function getAccountId(cells: XeroCell[] | undefined): string | null {
  if (!Array.isArray(cells) || !cells[0]) return null
  const attrs = cells[0].Attributes
  if (!Array.isArray(attrs)) return null
  const idAttr = attrs.find((a) => a?.Id === 'account')
  return idAttr?.Value ?? null
}

// ─── Walk FY response (single-period) ───────────────────────────────────────

function extractFYAccounts(report: unknown): FYAccount[] {
  const r = report as { Reports?: XeroReport[] } | null
  const top = r?.Reports?.[0]
  if (!top || !Array.isArray(top.Rows)) return []

  const out: FYAccount[] = []
  for (const section of top.Rows) {
    if (section.RowType !== 'Section' || !Array.isArray(section.Rows)) continue
    const sectionTitle = (section.Title ?? '').trim() || '(no title)'
    for (const row of section.Rows) {
      if (row.RowType !== 'Row') continue // skip SummaryRow / others
      const cells = row.Cells
      if (!Array.isArray(cells) || cells.length < 2) continue
      const accountName = (cells[0]?.Value ?? '').trim()
      if (!accountName) continue
      // Skip Xero's calculated totals (Gross Profit, Net Profit) — they live
      // in untitled sections at the top level; they're computed, not accounts.
      if (SUMMARY_NAMES.has(accountName.toLowerCase())) continue
      out.push({
        account_id: getAccountId(cells),
        account_name: accountName,
        section: sectionTitle,
        fy_total: parseAmount(cells[1]?.Value),
      })
    }
  }
  return out
}

const SUMMARY_NAMES = new Set([
  'gross profit',
  'net profit',
  'total income',
  'total revenue',
  'total cost of sales',
  'total direct costs',
  'total operating expenses',
  'total expenses',
  'total other income',
  'total other expenses',
  'operating profit',
])

// ─── Walk by-month response ─────────────────────────────────────────────────

function extractBMAccounts(report: unknown): BMAccount[] {
  const r = report as { Reports?: XeroReport[] } | null
  const top = r?.Reports?.[0]
  if (!top || !Array.isArray(top.Rows)) return []

  // 1) Find header row → period titles
  const headerRow = top.Rows.find((row) => row.RowType === 'Header')
  if (!headerRow || !Array.isArray(headerRow.Cells)) return []
  const periodTitles = headerRow.Cells.slice(1).map((c) =>
    (c?.Value ?? '').trim(),
  )

  const out: BMAccount[] = []
  for (const section of top.Rows) {
    if (section.RowType !== 'Section' || !Array.isArray(section.Rows)) continue
    const sectionTitle = (section.Title ?? '').trim() || '(no title)'
    for (const row of section.Rows) {
      if (row.RowType !== 'Row') continue
      const cells = row.Cells
      if (!Array.isArray(cells) || cells.length < 2) continue
      const accountName = (cells[0]?.Value ?? '').trim()
      if (!accountName) continue
      if (SUMMARY_NAMES.has(accountName.toLowerCase())) continue

      const monthly_cells: MonthlyCell[] = []
      let monthly_sum_full = 0
      let monthly_sum_fy26 = 0
      for (let i = 1; i < cells.length; i++) {
        const period = periodTitles[i - 1] ?? ''
        const value = parseAmount(cells[i]?.Value)
        monthly_cells.push({ period, value })
        monthly_sum_full += value
        // FY26 window = Jul 25 → Apr 26 = first 10 columns
        // (period headers run newest → oldest: Apr 26, Mar 26, ..., Jun 25, May 25)
        if (i - 1 < 10) monthly_sum_fy26 += value
      }
      out.push({
        account_id: getAccountId(cells),
        account_name: accountName,
        section: sectionTitle,
        monthly_cells,
        monthly_sum_full: Math.round(monthly_sum_full * 100) / 100,
        monthly_sum_fy26: Math.round(monthly_sum_fy26 * 100) / 100,
      })
    }
  }
  return out
}

// ─── Join ───────────────────────────────────────────────────────────────────

function mergeByAccount(
  fy: FYAccount[],
  bm: BMAccount[],
): MergedAccount[] {
  const out: MergedAccount[] = []
  const fyById = new Map<string, FYAccount>()
  const fyByName = new Map<string, FYAccount>()
  for (const a of fy) {
    if (a.account_id) fyById.set(a.account_id, a)
    fyByName.set(a.account_name, a)
  }
  const bmById = new Map<string, BMAccount>()
  const bmByName = new Map<string, BMAccount>()
  for (const a of bm) {
    if (a.account_id) bmById.set(a.account_id, a)
    bmByName.set(a.account_name, a)
  }

  // All keys
  const seen = new Set<string>()
  for (const a of fy) {
    const key = a.account_id ?? `NAME:${a.account_name}`
    if (seen.has(key)) continue
    seen.add(key)
    const bmMatch = a.account_id ? bmById.get(a.account_id) : bmByName.get(a.account_name)
    out.push(buildMerged(a, bmMatch ?? null))
  }
  for (const a of bm) {
    const key = a.account_id ?? `NAME:${a.account_name}`
    if (seen.has(key)) continue
    seen.add(key)
    const fyMatch = a.account_id ? fyById.get(a.account_id) : fyByName.get(a.account_name)
    if (fyMatch) continue // already handled above
    out.push(buildMerged(null, a))
  }
  return out
}

function buildMerged(fy: FYAccount | null, bm: BMAccount | null): MergedAccount {
  const account_id = fy?.account_id ?? bm?.account_id ?? null
  const account_name = fy?.account_name ?? bm?.account_name ?? '(unknown)'
  const section = fy?.section ?? bm?.section ?? '(unknown)'
  let diff_full: number | null = null
  let diff_fy26: number | null = null
  if (fy && bm) {
    diff_full = bm.monthly_sum_full - fy.fy_total
    diff_fy26 = bm.monthly_sum_fy26 - fy.fy_total
  }
  return {
    account_id,
    account_name,
    section,
    fy,
    byMonth: bm,
    diff_full,
    diff_fy26,
  }
}

// ─── Output ─────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return n.toFixed(2).padStart(14)
}

function main() {
  const fy = extractFYAccounts(fixture.fy_query.response)
  const bm = extractBMAccounts(fixture.by_month_query.response)
  const merged = mergeByAccount(fy, bm)

  console.log('═══════════════════════════════════════════════════════════════════')
  console.log('JDS Sales - Hardware Gap Diagnostic — Phase 44.2-03')
  console.log('═══════════════════════════════════════════════════════════════════')
  console.log(`Fixture:        src/__tests__/xero/fixtures/jds-recon-2026-04-fy-vs-by-month.json`)
  console.log(`Tenant:         ${fixture.tenant_name} (${fixture.tenant_id})`)
  console.log(`FY query:       ${fixture.fy_query.params.fromDate} → ${fixture.fy_query.params.toDate}`)
  console.log(`By-month query: ${fixture.by_month_query.params.fromDate} (${fixture.by_month_query.params.timeframe} × ${fixture.by_month_query.params.periods + 1})`)
  console.log(`Captured:       ${fixture.captured_at}`)
  console.log(`Expected:       ${fixture.expected_reconciliation}`)
  console.log('')
  console.log(`FY accounts:        ${fy.length}`)
  console.log(`By-month accounts:  ${bm.length}`)
  console.log('')

  // ─── SECTION A ───────────────────────────────────────────────────────────
  console.log('═══════════════════════════════════════════════════════════════════')
  console.log('SECTION A — Sales - Hardware deep dive')
  console.log('═══════════════════════════════════════════════════════════════════')
  const target = merged.find((m) => m.account_name === 'Sales - Hardware')
  if (!target) {
    console.log('!! Sales - Hardware NOT FOUND in fixture — abort')
    process.exit(0)
  }
  console.log(`account_id (FY):       ${target.fy?.account_id ?? '(missing)'}`)
  console.log(`account_id (by-month): ${target.byMonth?.account_id ?? '(missing)'}`)
  console.log(
    `account_id match:      ${target.fy?.account_id === target.byMonth?.account_id ? 'YES' : 'NO'}`,
  )
  console.log(`section (FY):          ${target.fy?.section}`)
  console.log(`section (by-month):    ${target.byMonth?.section}`)
  console.log(`FY total:              ${fmt(target.fy?.fy_total ?? 0)}`)
  console.log('')
  console.log('Monthly cells (newest first):')
  for (const cell of target.byMonth?.monthly_cells ?? []) {
    console.log(`  ${cell.period.padEnd(12)} ${fmt(cell.value)}`)
  }
  console.log('')
  console.log(`Monthly sum (full 12 cols, May 25 → Apr 26): ${fmt(target.byMonth?.monthly_sum_full ?? 0)}`)
  console.log(`Monthly sum (FY26 window, Jul 25 → Apr 26):  ${fmt(target.byMonth?.monthly_sum_fy26 ?? 0)}`)
  console.log(`FY total:                                    ${fmt(target.fy?.fy_total ?? 0)}`)
  console.log(`Diff (full - FY):                            ${fmt((target.byMonth?.monthly_sum_full ?? 0) - (target.fy?.fy_total ?? 0))}`)
  console.log(`Diff (FY26 - FY):                            ${fmt((target.byMonth?.monthly_sum_fy26 ?? 0) - (target.fy?.fy_total ?? 0))}`)
  console.log('')

  // ─── SECTION B ───────────────────────────────────────────────────────────
  console.log('═══════════════════════════════════════════════════════════════════')
  console.log('SECTION B — All accounts with |diff_fy26| > 0.01 (sorted by |diff| desc)')
  console.log('═══════════════════════════════════════════════════════════════════')
  console.log('Window: by-month FY26 (Jul 25 → Apr 26, 10 cols) vs FY single-period (Jul 25 → Jun 26)')
  console.log('')
  const withDiff = merged.filter(
    (m) =>
      m.fy &&
      m.byMonth &&
      m.diff_fy26 !== null &&
      Math.abs(m.diff_fy26) > 0.01,
  )
  withDiff.sort(
    (a, b) => Math.abs(b.diff_fy26 ?? 0) - Math.abs(a.diff_fy26 ?? 0),
  )
  console.log(`Accounts with |diff| > 0.01: ${withDiff.length}`)
  console.log('')
  console.log(
    `${'account_name'.padEnd(50)} ${'section'.padEnd(28)} ${'fy_total'.padStart(14)} ${'monthly_sum'.padStart(14)} ${'diff'.padStart(14)}`,
  )
  console.log('─'.repeat(124))
  for (const m of withDiff) {
    console.log(
      `${m.account_name.padEnd(50)} ${m.section.padEnd(28)} ${fmt(m.fy!.fy_total)} ${fmt(m.byMonth!.monthly_sum_fy26)} ${fmt(m.diff_fy26!)}`,
    )
  }

  const totalAbsDiff = withDiff.reduce(
    (s, m) => s + Math.abs(m.diff_fy26 ?? 0),
    0,
  )
  const negCount = withDiff.filter((m) => (m.diff_fy26 ?? 0) < 0).length
  const posCount = withDiff.filter((m) => (m.diff_fy26 ?? 0) > 0).length
  console.log('')
  console.log(`Total absolute diff: ${fmt(totalAbsDiff)}`)
  console.log(`Sign distribution:   ${negCount} negative (by-month < FY) | ${posCount} positive (by-month > FY)`)
  console.log('')

  // ─── SECTION C ───────────────────────────────────────────────────────────
  console.log('═══════════════════════════════════════════════════════════════════')
  console.log('SECTION C — Orphan accounts (present in only ONE response)')
  console.log('═══════════════════════════════════════════════════════════════════')
  const onlyFY = merged.filter((m) => m.fy && !m.byMonth)
  const onlyBM = merged.filter((m) => !m.fy && m.byMonth)

  console.log(`Only in FY (by-month dropped): ${onlyFY.length}`)
  for (const m of onlyFY) {
    console.log(
      `  ${m.account_name.padEnd(50)} ${m.section.padEnd(28)} fy_total=${fmt(m.fy!.fy_total)}`,
    )
  }
  console.log('')
  console.log(`Only in by-month (FY dropped): ${onlyBM.length}`)
  for (const m of onlyBM) {
    // For by-month-only accounts, show which months had non-zero values
    const nonZero = m.byMonth!.monthly_cells.filter((c) => Math.abs(c.value) > 0.01)
    const monthSummary = nonZero
      .map((c) => `${c.period}:${c.value.toFixed(2)}`)
      .join(', ')
    console.log(
      `  ${m.account_name.padEnd(50)} ${m.section.padEnd(28)} sum_full=${fmt(m.byMonth!.monthly_sum_full)} sum_FY26=${fmt(m.byMonth!.monthly_sum_fy26)}`,
    )
    if (nonZero.length > 0) {
      console.log(`    non-zero months: ${monthSummary}`)
    }
  }
  console.log('')

  // ─── SECTION D — Hypothesis evidence ────────────────────────────────────
  console.log('═══════════════════════════════════════════════════════════════════')
  console.log('SECTION D — Hypothesis evidence summary')
  console.log('═══════════════════════════════════════════════════════════════════')

  // H1: All-negative pattern? (consistent with Xero quirk vs random parser bug)
  console.log(`Sign pattern:        ${negCount === withDiff.length ? 'ALL NEGATIVE — by-month systematically < FY' : 'MIXED'}`)

  // H2: Section concentration
  const bySection: Record<string, number> = {}
  for (const m of withDiff) {
    bySection[m.section] = (bySection[m.section] ?? 0) + Math.abs(m.diff_fy26 ?? 0)
  }
  const sectionEntries = Object.entries(bySection).sort((a, b) => b[1] - a[1])
  console.log(`Section concentration of |diff| (top 5):`)
  for (const [s, v] of sectionEntries.slice(0, 5)) {
    console.log(`  ${s.padEnd(28)} ${fmt(v)}`)
  }

  // H3: Orphan-account pattern (FY-25 transactions outside FY query window)
  const orphanAllFY25Only = onlyBM.every((m) => {
    const fy26 = m.byMonth!.monthly_sum_fy26
    const full = m.byMonth!.monthly_sum_full
    // If FY26 sum is ~0 and full sum is non-zero, the account only had transactions
    // in May/Jun 2025 (FY25) — explains why FY26 query dropped it.
    return Math.abs(fy26) < 0.01 && Math.abs(full) > 0.01
  })
  console.log(
    `Orphan accounts: ${orphanAllFY25Only && onlyBM.length > 0 ? 'ALL only have FY25 transactions (explained: FY query window correctly excludes)' : 'mixed pattern'}`,
  )

  // H4: Sales - Hardware diff = Income section diff?
  let incomeRowDiff = 0
  for (const m of withDiff) {
    if (
      m.section === 'Income' ||
      m.section === 'Software Development Dept Income' ||
      m.section === 'Support Dept Income'
    ) {
      incomeRowDiff += m.diff_fy26 ?? 0
    }
  }
  console.log(`Income section row-diff sum: ${fmt(incomeRowDiff)} (vs Sales-Hardware diff: ${fmt(target.diff_fy26 ?? 0)})`)

  console.log('')
  console.log('═══════════════════════════════════════════════════════════════════')
  console.log('END')
  console.log('═══════════════════════════════════════════════════════════════════')

  process.exit(0)
}

main()
