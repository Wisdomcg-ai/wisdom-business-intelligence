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
 *   Cells[1] = Debit (current period — usually $0 for date-only TB)
 *   Cells[2] = Credit (current period — usually $0 for date-only TB)
 *   Cells[3] = YTD Debit
 *   Cells[4] = YTD Credit
 *
 * For ?date= TB queries (single point-in-time), the YTD columns hold the
 * cumulative balances we want for the gate. We use YTD if non-zero anywhere,
 * otherwise fall back to Debit/Credit. This matches Xero's PDF output.
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
 * Extract debit + credit from a TB data row, preferring YTD columns
 * (Cells[3] / Cells[4]) when present, falling back to current-period columns
 * (Cells[1] / Cells[2]). Returns zero for either side when the cell is empty
 * or unparseable.
 */
function extractDebitCredit(cells: XeroCell[]): { debit: number; credit: number } {
  const ytdDebit = parseAmount(cells[3]?.Value)
  const ytdCredit = parseAmount(cells[4]?.Value)
  if (ytdDebit !== 0 || ytdCredit !== 0) {
    return { debit: ytdDebit, credit: ytdCredit }
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

function walkSection(section: XeroRow, sectionTitle: string | null, out: ParsedTBRow[]): void {
  if (!Array.isArray(section.Rows)) return
  const ownTitle = (section.Title ?? '').trim()
  const effectiveSection = ownTitle || sectionTitle
  for (const node of section.Rows) {
    if (!node || typeof node !== 'object') continue
    if (node.RowType === 'Section') {
      walkSection(node, effectiveSection, out)
      continue
    }
    if (node.RowType !== 'Row') continue // skip Header / SummaryRow
    const cells = node.Cells
    if (!Array.isArray(cells) || cells.length === 0) continue
    const accountName = (cells[0]?.Value ?? '').trim()
    if (!accountName) continue
    // Filter Xero's computed total rows that arrive as plain Row.
    if (accountName.toLowerCase().startsWith('total ')) continue
    const { debit, credit } = extractDebitCredit(cells)
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
 * Parse a Reports/TrialBalance response into long-format rows. Caller
 * verifies the universal Σ(debit) == Σ(credit) invariant downstream.
 */
export function parseTrialBalance(report: unknown): ParsedTBRow[] {
  const r = report as { Reports?: XeroReport[] } | null
  const top = r?.Reports?.[0]
  if (!top || !Array.isArray(top.Rows)) return []
  const out: ParsedTBRow[] = []
  for (const node of top.Rows) {
    if (node.RowType !== 'Section') continue
    walkSection(node, null, out)
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
