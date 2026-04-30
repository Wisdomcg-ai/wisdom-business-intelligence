/**
 * Phase 44 Plan 44-03 — Xero ProfitAndLoss-by-Month parser.
 *
 * Pure function module: same input → same output. No I/O, no clock,
 * no Date.now / new Date() unless deterministically constructed from
 * the input. Consumed by the orchestrator in 44-04 and the legacy-route
 * shims in 44-05.
 *
 * D-05 (clarification): canonical Xero query is one-month base period
 * + periods=11 → 12 single-month columns. Parser handles whatever Xero
 * actually returned — sparse tenants get fewer columns, NEVER zero-padded.
 *
 * D-09 (clarification): output shape is LONG format — one row per
 * (account_code, period_month). Maps 1:1 onto the new xero_pl_lines
 * schema added in 44-02 for ON CONFLICT upsert.
 */

export type AccountType =
  | 'revenue'
  | 'cogs'
  | 'opex'
  | 'other_income'
  | 'other_expense'

/**
 * Long-format row matching the xero_pl_lines schema (less business_id +
 * tenant_id, which the orchestrator stamps on per-call).
 */
export type ParsedPLRow = {
  account_code: string | null
  account_name: string
  account_type: AccountType
  period_month: string // 'YYYY-MM-01'
  amount: number
}

/**
 * Coverage record for a parsed row set. Surfaced on sync_jobs by the
 * orchestrator (D-10) — distinguishes "Xero has no data here" from
 * "Xero returned a real $0 for that month".
 */
export type CoverageRecord = {
  months_covered: number
  first_period: string // 'YYYY-MM' (NOT YYYY-MM-DD; the human-readable form)
  last_period: string
  expected_months: number
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Parse a Xero accounting-string amount.
 * Strips $ and ,. Treats accounting parens "(1,234.56)" as negative.
 * Empty / "-" / NaN → 0.
 */
export function parseAmount(s: string | null | undefined): number {
  if (s === null || s === undefined) return 0
  const trimmed = String(s).replace(/[$,]/g, '').trim()
  if (trimmed === '' || trimmed === '-') return 0
  const isParen = trimmed.startsWith('(') && trimmed.endsWith(')')
  const inner = isParen ? trimmed.slice(1, -1) : trimmed
  const num = parseFloat(inner)
  if (Number.isNaN(num)) return 0
  return isParen ? -Math.abs(num) : num
}

const MONTH_ABBREVS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
}

/**
 * Parse a Xero period-header string into 'YYYY-MM-01'.
 *
 * Observed Xero formats across tenant tiers:
 *   - 'Jul-25'        (compact, two-digit year)
 *   - 'Jul 25'        (space-separated, two-digit year)
 *   - '31 Jul 2025'   (day-month-year, four-digit year)
 *   - '30 Apr 26'     (day-month-year, two-digit year — most common in by-month)
 *
 * Two-digit years use the 2000s heuristic (Xero is a SaaS launched 2006;
 * historical pre-2000 P&L by-month doesn't occur in our corpus).
 */
export function parsePeriodHeader(header: string): string {
  const s = String(header).trim()
  if (!s) throw new Error(`parsePeriodHeader: empty header`)

  // Try 'DD MMM YY' or 'DD MMM YYYY' (e.g. '30 Apr 26', '31 Jul 2025')
  const m1 = s.match(/^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{2,4})$/)
  if (m1) {
    const month = MONTH_ABBREVS[m1[2]!.toLowerCase().slice(0, 3)!]
    if (!month) throw new Error(`parsePeriodHeader: unknown month "${m1[2]}"`)
    const yearRaw = parseInt(m1[3]!, 10)
    const year = yearRaw < 100 ? 2000 + yearRaw : yearRaw
    return `${year}-${String(month).padStart(2, '0')}-01`
  }

  // Try 'MMM-YY' or 'MMM YY' (e.g. 'Jul-25', 'Jul 25')
  const m2 = s.match(/^([A-Za-z]{3,})[\s-]+(\d{2,4})$/)
  if (m2) {
    const month = MONTH_ABBREVS[m2[1]!.toLowerCase().slice(0, 3)!]
    if (!month) throw new Error(`parsePeriodHeader: unknown month "${m2[1]}"`)
    const yearRaw = parseInt(m2[2]!, 10)
    const year = yearRaw < 100 ? 2000 + yearRaw : yearRaw
    return `${year}-${String(month).padStart(2, '0')}-01`
  }

  // Try ISO-ish 'YYYY-MM-DD'
  const m3 = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (m3) {
    return `${m3[1]}-${m3[2]}-01`
  }

  throw new Error(`parsePeriodHeader: unrecognized format "${header}"`)
}

/**
 * Map a Xero Section title to its account_type.
 * Case-insensitive substring match. Custom Xero sections (Think Bigger,
 * VCFO, etc.) inherit the closest preceding parent section's type at the
 * call site — see parsePLByMonth's parent-title carry-forward.
 *
 * IMPORTANT: 'other income' / 'other expense' must be checked BEFORE the
 * generic 'income'/'expense' branches.
 */
export function classifyAccountType(sectionTitle: string): AccountType {
  const t = sectionTitle.toLowerCase()
  if (t.includes('other income')) return 'other_income'
  if (t.includes('other expense')) return 'other_expense'
  if (t.includes('cost of sales') || t.includes('cogs') || t.includes('direct cost')) return 'cogs'
  if (t.includes('operating expense') || t.includes('expense')) return 'opex'
  if (t.includes('income') || t.includes('revenue') || t.includes('sales')) return 'revenue'
  return 'opex' // default for unknown sub-sections
}

/**
 * D-44.2-14 fix predicate (Phase 44.2-06B). Returns true iff `title`
 * matches one of the recognized top-level section substrings used by
 * classifyAccountType. The fix uses this to refuse parent-title
 * carry-forward for sub-sections whose title would otherwise fall through
 * to the default 'opex' bucket — preserving inherited classification.
 *
 * Used by parsePLByMonth (this module) AND the new parsePLSinglePeriod
 * (44.2-06B Task 4) — kept together with classifyAccountType so the two
 * stay in sync.
 */
export function titleClassifiesToKnownType(title: string): boolean {
  const t = title.toLowerCase()
  return (
    t.includes('other income') ||
    t.includes('other expense') ||
    t.includes('cost of sales') ||
    t.includes('cogs') ||
    t.includes('direct cost') ||
    t.includes('operating expense') ||
    t.includes('expense') ||
    t.includes('income') ||
    t.includes('revenue') ||
    t.includes('sales')
  )
}

/**
 * Xero's calculated/summary row names that must never be stored as account
 * lines. These are computed totals, not real chart-of-accounts entries.
 */
const SUMMARY_ROW_NAMES = new Set([
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

// ─── Main parser ────────────────────────────────────────────────────────────

type XeroAttribute = { Id?: string; Value?: string }
type XeroCell = { Value?: string; Attributes?: XeroAttribute[] }
type XeroRow = {
  RowType?: string
  Title?: string
  Cells?: XeroCell[]
  Rows?: XeroRow[]
}
type XeroReport = { Rows?: XeroRow[] }

/**
 * Parse a Xero ProfitAndLoss-by-month report JSON into long-format rows.
 *
 * One row per (account, period_month) Xero actually returned. Months
 * Xero did NOT return are absent from the output — never zero-padded.
 *
 * Returns [] for malformed input (the orchestrator surfaces the empty
 * result via sync_jobs.error so the caller is never silently fooled).
 */
export function parsePLByMonth(report: unknown): ParsedPLRow[] {
  // Defensive shape walk — Xero responses vary across tenant tiers.
  const r = report as { Reports?: XeroReport[] } | null
  const top = r?.Reports?.[0]
  if (!top || !Array.isArray(top.Rows)) return []

  // 1) Find the Header row to extract period column titles.
  const headerRow = top.Rows.find((row) => row.RowType === 'Header')
  if (!headerRow || !Array.isArray(headerRow.Cells)) return []
  // First cell is empty (the row-label column header). Subsequent cells
  // are the per-period titles.
  const periodCells = headerRow.Cells.slice(1)
  const periodMonths: string[] = []
  for (const cell of periodCells) {
    const raw = (cell?.Value ?? '').trim()
    if (!raw) {
      periodMonths.push('') // preserve index alignment; skipped below
      continue
    }
    try {
      periodMonths.push(parsePeriodHeader(raw))
    } catch {
      periodMonths.push('') // unknown header → skip column
    }
  }

  const out: ParsedPLRow[] = []

  // 2) Walk Section rows. Carry the most recent non-empty Title forward
  //    so sub-sections (e.g. JDS "Admin Expenses" under "Less Operating
  //    Expenses", Envisage "Think Bigger" + "VCFO" under same) inherit
  //    the parent section's account_type.
  let currentParentTitle: string | null = null

  for (const section of top.Rows) {
    if (section.RowType !== 'Section' || !Array.isArray(section.Rows)) continue

    const ownTitle = (section.Title ?? '').trim()
    // D-44.2-14 fix: only update the carry-forward when the section's title
    // classifies to a known top-level type (revenue|cogs|opex|other_income|
    // other_expense). Sub-sections like "Software Development" — which used
    // to fall through to the default 'opex' bucket — must NOT clobber the
    // inherited "Less Cost of Sales" classification, otherwise rows like
    // "PK Costs" land in opex when they belong in cogs.
    //
    // Empty-title sections (Gross Profit / Net Profit / Total Operating
    // Expenses wrappers in Xero's tree) ALSO must not clobber, which is
    // why the original `if (ownTitle)` guard already covered that case.
    // We tighten it: only classifying titles update the chain.
    if (ownTitle && titleClassifiesToKnownType(ownTitle)) {
      currentParentTitle = ownTitle
    }

    // Effective title: prefer own (if classifiable), else inherited parent.
    const effectiveTitle = ownTitle || currentParentTitle || ''
    if (!effectiveTitle) continue // can't classify → skip orphan sections
    const accountType = classifyAccountType(effectiveTitle)

    for (const row of section.Rows) {
      if (row.RowType !== 'Row') continue
      const cells = row.Cells
      if (!Array.isArray(cells) || cells.length === 0) continue

      const accountName = (cells[0]?.Value ?? '').trim()
      if (!accountName) continue
      if (SUMMARY_ROW_NAMES.has(accountName.toLowerCase())) continue

      // Extract Xero AccountID from the first cell's Attributes (when
      // present). Some legacy Xero responses omit Attributes — fall back
      // to null and let the orchestrator handle synthesizing a code if
      // needed (per the IICT precedent noted in 44-02).
      let accountCode: string | null = null
      const attrs = cells[0]?.Attributes
      if (Array.isArray(attrs)) {
        const idAttr = attrs.find((a) => a?.Id === 'account')
        if (idAttr?.Value) accountCode = idAttr.Value
      }

      // Emit one row per period column Xero returned.
      for (let i = 1; i < cells.length; i++) {
        const periodIdx = i - 1
        if (periodIdx >= periodMonths.length) break
        const periodMonth = periodMonths[periodIdx]
        if (!periodMonth) continue // unknown header column — skip
        const amount = parseAmount(cells[i]?.Value)
        out.push({
          account_code: accountCode,
          account_name: accountName,
          account_type: accountType,
          period_month: periodMonth,
          amount,
        })
      }
    }
  }

  return out
}

/**
 * Compute the coverage record for a parsed row set.
 *
 * `expectedMonths` is supplied by the orchestrator (it knows whether it
 * requested 12 or 24). Coverage = number of distinct period_months that
 * appear in the rows. NOT padded — sparse tenants get sparse records.
 */
export function computeCoverage(
  rows: ParsedPLRow[],
  expectedMonths: number,
): CoverageRecord {
  if (rows.length === 0) {
    return {
      months_covered: 0,
      first_period: '',
      last_period: '',
      expected_months: expectedMonths,
    }
  }
  const distinct = new Set(rows.map((r) => r.period_month))
  const sorted = Array.from(distinct).sort() // ISO strings sort lexicographically
  const firstFull = sorted[0]!
  const lastFull = sorted[sorted.length - 1]!
  // Coverage record uses the YYYY-MM form (NOT YYYY-MM-DD) for human
  // readability on sync_jobs.
  return {
    months_covered: distinct.size,
    first_period: firstFull.slice(0, 7),
    last_period: lastFull.slice(0, 7),
    expected_months: expectedMonths,
  }
}
