/**
 * WG.1 — the balance-sheet PDF page must never print a half-table.
 *
 * The trap this guards: a management pack whose balance sheet doesn't add up,
 * or whose comparison column is empty, is worse than a missing page — it looks
 * finished. Every path that can't be printed has to come back as a stated
 * reason, and the reason has to say which of the three things went wrong
 * (couldn't load / nothing to compare against / doesn't balance).
 *
 * Figures are Urban Road Pty Ltd, August 2026, which balances to the cent.
 */
import { describe, it, expect } from 'vitest'
import {
  assessBalanceSheetForPdf,
  BS_EQUATION_TOLERANCE,
  type BalanceSheetPdfInput,
} from '../balance-sheet-pdf'
import type { BalanceSheetData, BalanceSheetRow } from '../../types'

const ASSETS = 711806.44
const LIABILITIES = 285710.37
const EQUITY = 426096.07

function row(partial: Partial<BalanceSheetRow> & Pick<BalanceSheetRow, 'type' | 'label'>): BalanceSheetRow {
  return {
    current: null,
    prior: null,
    variance: null,
    variance_pct: null,
    ...partial,
  }
}

/** A minimal Urban Road August 2026 sheet, in the row order the route emits. */
function sheet(overrides?: { equity?: number; priorAll?: number | null; rows?: BalanceSheetRow[] }): BalanceSheetData {
  const prior = overrides?.priorAll === undefined ? 1 : overrides.priorAll
  const rows: BalanceSheetRow[] = overrides?.rows ?? [
    row({ type: 'section_header', label: 'Asset' }),
    row({ type: 'line_item', label: 'Business Bank Account', current: 211806.44, prior }),
    row({ type: 'line_item', label: 'Inventory', current: 500000, prior }),
    row({ type: 'subtotal', label: 'Total Asset', current: ASSETS, prior }),
    row({ type: 'section_header', label: 'Liability' }),
    row({ type: 'line_item', label: 'Accounts Payable', current: LIABILITIES, prior }),
    row({ type: 'subtotal', label: 'Total Liability', current: LIABILITIES, prior }),
    row({ type: 'net_assets', label: 'Net Assets', current: ASSETS - LIABILITIES, prior }),
    // Urban Road's equity rows carry no section in the mirror — Calxa prints
    // them as its "unmapped" group. The route still emits the equity subtotal.
    row({ type: 'section_header', label: 'Equity' }),
    row({ type: 'line_item', label: 'Retained Earnings', current: overrides?.equity ?? EQUITY, prior }),
    row({ type: 'subtotal', label: 'Total Equity', current: overrides?.equity ?? EQUITY, prior }),
  ]
  return {
    business_id: '28d41193-38ae-4071-a2b1-0dbea90a38fd',
    report_date: '2026-08-31',
    compare: 'mom',
    current_label: 'Aug 2026',
    prior_label: 'Jul 2026',
    rows,
    balances: true,
  }
}

const loaded = (data: BalanceSheetData): BalanceSheetPdfInput => ({ data })

describe('WG.1 — assessBalanceSheetForPdf', () => {
  it('prints the sheet when Urban Road August 2026 balances to the cent', () => {
    const v = assessBalanceSheetForPdf(loaded(sheet()), 'mom')
    expect(v.ok).toBe(true)
    if (v.ok) expect(v.data.rows).toHaveLength(11)
  })

  it('refuses to print a sheet that does not balance, and says by how much', () => {
    // $10k of equity vanishes: assets now exceed liabilities + equity.
    const v = assessBalanceSheetForPdf(loaded(sheet({ equity: EQUITY - 10000 })), 'mom')
    expect(v.ok).toBe(false)
    if (!v.ok) {
      expect(v.reason).toContain('does not balance')
      expect(v.reason).toContain('exceed')
      expect(v.reason).toContain('$10,000')
    }
  })

  it('names the direction when assets fall short instead of exceeding', () => {
    const v = assessBalanceSheetForPdf(loaded(sheet({ equity: EQUITY + 10000 })), 'mom')
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.reason).toContain('fall short of')
  })

  it('tolerates sub-dollar rounding — the same threshold the web tab uses', () => {
    // Xero's own report rounds per row; 60c of drift is noise, not a defect.
    expect(BS_EQUATION_TOLERANCE).toBe(1)
    const v = assessBalanceSheetForPdf(loaded(sheet({ equity: EQUITY - 0.6 })), 'mom')
    expect(v.ok).toBe(true)
  })

  it('refuses when there is nothing in the comparison column', () => {
    const v = assessBalanceSheetForPdf(loaded(sheet({ priorAll: null })), 'yoy')
    expect(v.ok).toBe(false)
    // A column of dashes would read as "everything was zero last year".
    if (!v.ok) expect(v.reason).toContain('Jul 2026')
  })

  it('passes the loader’s reason through verbatim when the fetch failed', () => {
    const v = assessBalanceSheetForPdf({ data: null, reason: 'Xero connection expired' }, 'mom')
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.reason).toBe('Xero connection expired')
  })

  it('says the page was never loaded when nothing was threaded through', () => {
    const v = assessBalanceSheetForPdf(undefined, 'yoy')
    expect(v.ok).toBe(false)
    if (!v.ok) {
      expect(v.reason).toContain("wasn't loaded")
      expect(v.reason).toContain('same month last year')
    }
  })

  it('refuses when the section totals cannot be identified at all', () => {
    const v = assessBalanceSheetForPdf(
      loaded(sheet({ rows: [row({ type: 'line_item', label: 'Something', current: 1, prior: 1 })] })),
      'mom',
    )
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.reason).toContain('could not be identified')
  })

  it('refuses when Xero returns no rows', () => {
    const v = assessBalanceSheetForPdf(loaded(sheet({ rows: [] })), 'mom')
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.reason).toContain('no balance sheet rows')
  })
})
