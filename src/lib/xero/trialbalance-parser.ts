/**
 * Phase 44.2 Plan 44.2-06E — Trial Balance parser.
 *
 * Minimal parser supporting the reconciliation gate harness. Walks the Xero
 * /Reports/TrialBalance response and emits one ParsedTBRow per data row with
 * the debit and credit values pulled from the standard column shape.
 *
 * Gate 3 invariant (universal accounting): Σ(debit) == Σ(credit) across all
 * accounts. The TB IS the integration point between P&L and BS — every
 * journal entry hits both sides, and TB is where they sum.
 *
 * Xero TB column shape (verified across orgs in capture summaries):
 *   Cells[0] = Account label (with Id='account' attribute holding GUID)
 *   Cells[1] = Debit  — the movement for the CALENDAR MONTH of `date`
 *   Cells[2] = Credit — the movement for the CALENDAR MONTH of `date`
 *   Cells[3] = YTD Debit
 *   Cells[4] = YTD Credit
 *
 * This header used to say Cells[1]/[2] were "usually $0 for date-only TB".
 * The committed captures prove otherwise, to the cent: Envisage 30-Apr-26
 * Sales-CFO Credit 11,462.50 against YTD 112,975.00; IICT-HK (FY from April)
 * Apr-26 month == YTD; and the FX system accounts' Debit−Credit reproduces
 * the same month's single-period P&L FXGROUPID row in 6 of 6 IICT/JDS months
 * (Feb–Apr 2026). The OpenAPI spec does not state it — a Xero change would
 * surface as FX-split invariant fallbacks, not as wrong figures.
 *
 * For ?date= TB queries, the YTD columns hold the cumulative balances gate 3
 * wants (parseTrialBalance); the month movements are what the FX account
 * split wants (parseTrialBalanceMovements).
 *
 * Pure: same input → same output. No I/O, no clock.
 */
import { parseAmount } from './pl-by-month-parser'

// ─── Public types ───────────────────────────────────────────────────────────

export type ParsedTBRow = {
  account_id: string | null // GUID from Cells[0].Attributes (null for SummaryRow-style rows we skip)
  account_name: string
  section: string | null // top-level Section title (Revenue, Assets, Liabilities, etc.)
  debit: number
  credit: number
}

// ─── Xero JSON shape (defensive) ────────────────────────────────────────────

type XeroAttribute = { Id?: string; Value?: string }
type XeroCell = { Value?: string; Attributes?: XeroAttribute[] }
type XeroRow = {
  RowType?: string
  Title?: string
  Cells?: XeroCell[]
  Rows?: XeroRow[]
}
type XeroReport = { Rows?: XeroRow[] }

// ─── Internal helpers ───────────────────────────────────────────────────────

/**
 * Extract debit + credit from a TB data row.
 *
 * Column-shape decision is made ONCE per report (in parseTrialBalance) by
 * looking at the Header row, then applied uniformly to every data row. We
 * cannot decide per-row "YTD if non-zero else current" because:
 *   - cells[1]/cells[2] are PERIOD MOVEMENTS (debit/credit activity in some
 *     range); cells[3]/cells[4] are YTD BALANCES.
 *   - Movements and balances do NOT sum together — mixing them per-row
 *     breaks the universal Σ debit == Σ credit invariant. Empirically on
 *     a JDS Feb 2026 TB this caused a $1,418.81 spurious imbalance.
 *   - Empty YTD cell means "zero balance YTD", NOT "fall back to current".
 */
function extractDebitCredit(cells: XeroCell[], useYTD: boolean): { debit: number; credit: number } {
  if (useYTD) {
    return {
      debit: parseAmount(cells[3]?.Value),
      credit: parseAmount(cells[4]?.Value),
    }
  }
  return {
    debit: parseAmount(cells[1]?.Value),
    credit: parseAmount(cells[2]?.Value),
  }
}

function extractAccountId(cells: XeroCell[]): string | null {
  const attrs = cells[0]?.Attributes
  if (!Array.isArray(attrs)) return null
  const accAttr = attrs.find((a) => a?.Id === 'account')
  return accAttr?.Value ?? null
}

function walkSection(
  section: XeroRow,
  sectionTitle: string | null,
  useYTD: boolean,
  out: ParsedTBRow[],
): void {
  if (!Array.isArray(section.Rows)) return
  const ownTitle = (section.Title ?? '').trim()
  const effectiveSection = ownTitle || sectionTitle
  for (const node of section.Rows) {
    if (!node || typeof node !== 'object') continue
    if (node.RowType === 'Section') {
      walkSection(node, effectiveSection, useYTD, out)
      continue
    }
    if (node.RowType !== 'Row') continue // skip Header / SummaryRow
    const cells = node.Cells
    if (!Array.isArray(cells) || cells.length === 0) continue
    const accountName = (cells[0]?.Value ?? '').trim()
    if (!accountName) continue
    // Filter Xero's computed total rows that arrive as plain Row.
    if (accountName.toLowerCase().startsWith('total ')) continue
    const { debit, credit } = extractDebitCredit(cells, useYTD)
    out.push({
      account_id: extractAccountId(cells),
      account_name: accountName,
      section: effectiveSection,
      debit,
      credit,
    })
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Detect column shape: modern Xero TB has 5 cells per row
 * [Account, Debit, Credit, YTD Debit, YTD Credit]; legacy / minimal shape
 * has just [Account, Debit, Credit]. Cell count is the signal (locale-safe).
 *
 * Look at the Header row first. If absent (some test fixtures + edge-case
 * Xero responses), fall back to the first data Row's cell count.
 */
function shouldUseYTD(top: XeroReport): boolean {
  const header = (top.Rows ?? []).find((r) => r.RowType === 'Header')
  if (Array.isArray(header?.Cells)) return header.Cells.length >= 5
  // No Header — infer from first data Row encountered (recurse into Sections).
  const findFirstRowCellCount = (rs: XeroRow[]): number | null => {
    for (const r of rs) {
      if (r?.RowType === 'Row' && Array.isArray(r.Cells)) return r.Cells.length
      if (r?.RowType === 'Section' && Array.isArray(r.Rows)) {
        const inner = findFirstRowCellCount(r.Rows)
        if (inner !== null) return inner
      }
    }
    return null
  }
  const cellCount = findFirstRowCellCount(top.Rows ?? [])
  return cellCount !== null && cellCount >= 5
}

/**
 * Parse a Reports/TrialBalance response into long-format rows. Caller
 * verifies the universal Σ(debit) == Σ(credit) invariant downstream.
 */
export function parseTrialBalance(report: unknown): ParsedTBRow[] {
  const r = report as { Reports?: XeroReport[] } | null
  const top = r?.Reports?.[0]
  if (!top || !Array.isArray(top.Rows)) return []
  const useYTD = shouldUseYTD(top)
  const out: ParsedTBRow[] = []
  for (const node of top.Rows) {
    if (node.RowType !== 'Section') continue
    walkSection(node, null, useYTD, out)
  }
  return out
}

/**
 * Parse a Reports/TrialBalance?date= response into per-account MONTH
 * movements: always Cells[1]/[2] (Debit/Credit for the calendar month of
 * `date`), never the YTD columns. Used by the FX account split to break
 * Xero's merged "Foreign Currency Gains and Losses" P&L row into its system
 * accounts.
 *
 * Refuses (throws) any response that is not the five-column shape: the month
 * meaning of Cells[1]/[2] is proven only there, and on a three-column report
 * those cells could be balances. A throw lands the caller on its merged-row
 * fallback, which is correct; guessing would not be.
 *
 * parseTrialBalance (gate 3, YTD) is unchanged.
 */
export function parseTrialBalanceMovements(report: unknown): ParsedTBRow[] {
  const r = report as { Reports?: XeroReport[] } | null
  const top = r?.Reports?.[0]
  if (!top || !Array.isArray(top.Rows)) {
    throw new Error('TrialBalance response has no report rows')
  }
  const header = top.Rows.find((row) => row?.RowType === 'Header')
  if (!Array.isArray(header?.Cells) || header.Cells.length < 5) {
    throw new Error(
      `TrialBalance header is not Account|Debit|Credit|YTD Debit|YTD Credit (cells=${header?.Cells?.length ?? 'none'})`,
    )
  }
  const out: ParsedTBRow[] = []
  for (const node of top.Rows) {
    if (node.RowType !== 'Section') continue
    walkSection(node, null, false, out)
  }
  return out
}

/**
 * Convenience helper: returns Σ(debit) and Σ(credit) for a parsed TB.
 * Gate 3 asserts these are equal within $0.01.
 */
export function trialBalanceTotals(rows: ParsedTBRow[]): { debit: number; credit: number; delta: number } {
  let debit = 0
  let credit = 0
  for (const r of rows) {
    debit += r.debit
    credit += r.credit
  }
  const delta = Math.round((debit - credit) * 100) / 100
  return { debit, credit, delta }
}
