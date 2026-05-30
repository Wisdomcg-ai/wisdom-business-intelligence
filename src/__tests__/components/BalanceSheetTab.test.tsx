/**
 * Phase 71 plan 71-08 — Balance Sheet equation residual check (S5).
 *
 * Covers:
 *   - S5 — When |assets - (liabilities + equity)| > $1, a red banner renders at the
 *     top of the BS tab with the residual amount and a mailto CTA to cfo@wisdombi.ai.
 *   - $1 tolerance is strict (`> 1`), so 0.99 is balanced.
 *   - Missing-subtotal fixtures show NO banner (cannot compute residual safely).
 *   - Negative residuals render with their absolute value.
 *
 * Note: imports the production component from
 *   '@/app/finances/monthly-report/components/BalanceSheetTab'.
 * Tests live at the repo-convention path `src/__tests__/components/` (NOT co-located).
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import BalanceSheetTab from '@/app/finances/monthly-report/components/BalanceSheetTab'
import type { BalanceSheetData } from '@/app/finances/monthly-report/types'

// ─── Fixture builder ─────────────────────────────────────────────────────────

function makeBS(assets: number, liabilities: number, equity: number): BalanceSheetData {
  return {
    business_id: 'biz_test',
    report_date: '2026-03-31',
    compare: 'mom',
    current_label: 'Mar 2026',
    prior_label: 'Feb 2026',
    balances: Math.abs(assets - liabilities - equity) <= 1,
    rows: [
      { type: 'section_header', label: 'Assets', current: null, prior: null, variance: null, variance_pct: null },
      { type: 'line_item', label: 'Cash', current: assets, prior: assets, variance: 0, variance_pct: 0 },
      { type: 'subtotal', label: 'Total Assets', current: assets, prior: assets, variance: 0, variance_pct: 0 },
      { type: 'section_header', label: 'Liabilities', current: null, prior: null, variance: null, variance_pct: null },
      { type: 'line_item', label: 'Accounts Payable', current: liabilities, prior: liabilities, variance: 0, variance_pct: 0 },
      { type: 'subtotal', label: 'Total Liabilities', current: liabilities, prior: liabilities, variance: 0, variance_pct: 0 },
      { type: 'section_header', label: 'Equity', current: null, prior: null, variance: null, variance_pct: null },
      { type: 'line_item', label: 'Retained Earnings', current: equity, prior: equity, variance: 0, variance_pct: 0 },
      { type: 'subtotal', label: 'Total Equity', current: equity, prior: equity, variance: 0, variance_pct: 0 },
      { type: 'net_assets', label: 'Net Assets', current: assets - liabilities, prior: assets - liabilities, variance: 0, variance_pct: 0 },
    ],
  }
}

// Common props used across all tests
const baseProps = {
  businessId: 'biz_test',
  month: '2026-03',
  isLoading: false,
  error: null as string | null,
  compare: 'mom' as const,
  onCompareChange: () => {},
  onLoad: () => {},
}

describe('BalanceSheetTab — S5 equation residual banner', () => {
  it('does NOT render banner when BS is balanced (residual = 0)', () => {
    const fixture = makeBS(100000, 40000, 60000)
    render(<BalanceSheetTab {...baseProps} balanceSheet={fixture} />)
    expect(screen.queryByText(/does not balance/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/residual of/i)).not.toBeInTheDocument()
  })

  it('does NOT render banner when residual is within $1 tolerance (strict >)', () => {
    // residual = 0.50 → within tolerance, no banner
    const fixture = makeBS(100000, 40000, 59999.5)
    render(<BalanceSheetTab {...baseProps} balanceSheet={fixture} />)
    expect(screen.queryByText(/does not balance/i)).not.toBeInTheDocument()
  })

  it('renders red banner with $2 residual when imbalanced by $2', () => {
    const fixture = makeBS(100000, 40000, 59998)
    render(<BalanceSheetTab {...baseProps} balanceSheet={fixture} />)
    const alert = screen.getByRole('alert')
    expect(alert).toBeInTheDocument()
    expect(alert.className).toMatch(/bg-red-50/)
    expect(alert.textContent).toMatch(/does not balance/i)
    expect(alert.textContent).toMatch(/\$2\b/)
  })

  it('renders red banner with $20,000 residual when imbalanced by $20k', () => {
    const fixture = makeBS(100000, 50000, 30000)
    render(<BalanceSheetTab {...baseProps} balanceSheet={fixture} />)
    const alert = screen.getByRole('alert')
    expect(alert).toBeInTheDocument()
    expect(alert.textContent).toMatch(/\$20,000/)
  })

  it('renders absolute value for negative residual', () => {
    // assets=100000, liab=50000, equity=80000 → residual = -30000
    const fixture = makeBS(100000, 50000, 80000)
    render(<BalanceSheetTab {...baseProps} balanceSheet={fixture} />)
    const alert = screen.getByRole('alert')
    expect(alert).toBeInTheDocument()
    expect(alert.textContent).toMatch(/\$30,000/)
    // Should NOT contain a negative sign before the residual amount
    expect(alert.textContent).not.toMatch(/-\$30,000/)
  })

  it('banner contains mailto:cfo@wisdombi.ai CTA when imbalanced', () => {
    const fixture = makeBS(100000, 50000, 30000)
    render(<BalanceSheetTab {...baseProps} balanceSheet={fixture} />)
    const link = screen.getByRole('link', { name: /report imbalance to support/i })
    expect(link).toBeInTheDocument()
    expect(link.getAttribute('href')).toMatch(/^mailto:cfo@wisdombi\.ai/)
  })

  it('does NOT render banner when subtotal rows are missing (cannot compute)', () => {
    // Fixture with only section_header + line_item rows, no subtotals.
    const fixture: BalanceSheetData = {
      business_id: 'biz_test',
      report_date: '2026-03-31',
      compare: 'mom',
      current_label: 'Mar 2026',
      prior_label: 'Feb 2026',
      balances: true,
      rows: [
        { type: 'section_header', label: 'Assets', current: null, prior: null, variance: null, variance_pct: null },
        { type: 'line_item', label: 'Cash', current: 100000, prior: 100000, variance: 0, variance_pct: 0 },
        { type: 'section_header', label: 'Liabilities', current: null, prior: null, variance: null, variance_pct: null },
        { type: 'line_item', label: 'Accounts Payable', current: 40000, prior: 40000, variance: 0, variance_pct: 0 },
      ],
    }
    render(<BalanceSheetTab {...baseProps} balanceSheet={fixture} />)
    expect(screen.queryByText(/does not balance/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
