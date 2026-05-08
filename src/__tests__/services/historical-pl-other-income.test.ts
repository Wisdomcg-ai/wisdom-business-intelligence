/**
 * Regression test for the JDS rental-income misclassification bug
 * (investigation: .planning/debug/jds-step2-recon-gap-2026-05-08.md).
 *
 * The defensive `looksLikeOtherIncome` reclassifier in
 * `historical-pl-summary.ts` substring-matches account names against
 * OTHER_INCOME_NAME_PATTERNS to reroute mis-typed revenue rows into
 * other_income. The 'rental income' pattern was matching JDS's
 * "Sales - Rental Income" account — an OPERATING revenue row Xero
 * categorized under the P&L Sales section — and silently demoting it,
 * under-reporting Step 2 Total Revenue by $70,633 for FY25.
 *
 * Fix: short-circuit the matcher for accounts whose name starts with
 * "sales" (case-insensitive, whitespace-tolerant). Xero's P&L Sales
 * section is the truth source for operating revenue; we don't second-
 * guess upstream when the account is explicitly prefixed "Sales".
 *
 * This is fleet-wide: any tenant with a "Sales - <something matching a
 * pattern>" account had the same gap.
 */
import { describe, it, expect } from 'vitest'
import { looksLikeOtherIncome } from '@/lib/services/historical-pl-summary'

describe('looksLikeOtherIncome — Sales prefix guard (JDS rental-income regression)', () => {
  it('returns false for "Sales - Rental Income" (JDS regression case)', () => {
    expect(looksLikeOtherIncome('Sales - Rental Income')).toBe(false)
  })

  it('returns false for the bare "Sales" account', () => {
    expect(looksLikeOtherIncome('Sales')).toBe(false)
  })

  it('returns false for "Sales - Rental" with leading whitespace', () => {
    expect(looksLikeOtherIncome('  Sales - Rental')).toBe(false)
  })

  it('returns false for case variations of the Sales prefix', () => {
    expect(looksLikeOtherIncome('SALES - Dividend Reinvestment')).toBe(false)
    expect(looksLikeOtherIncome('sales - interest received')).toBe(false)
  })
})

describe('looksLikeOtherIncome — non-Sales-prefixed accounts (preserved behavior)', () => {
  it('still returns true for bare "Rental Income"', () => {
    // No "Sales" prefix → original reclassification intent preserved.
    expect(looksLikeOtherIncome('Rental Income')).toBe(true)
  })

  it('still returns true for "Dividend Income"', () => {
    expect(looksLikeOtherIncome('Dividend Income')).toBe(true)
  })

  it('still returns true for "JobKeeper" (case-insensitive)', () => {
    expect(looksLikeOtherIncome('JobKeeper')).toBe(true)
  })

  it('still returns true for other established patterns', () => {
    expect(looksLikeOtherIncome('Interest Received')).toBe(true)
    expect(looksLikeOtherIncome('Government Grant')).toBe(true)
    expect(looksLikeOtherIncome('Royalty Income')).toBe(true)
    expect(looksLikeOtherIncome('Gain on Sale of Asset')).toBe(true)
    expect(looksLikeOtherIncome('FX Gain')).toBe(true)
  })

  it('returns false for accounts that do not match any pattern', () => {
    expect(looksLikeOtherIncome('Consulting Revenue')).toBe(false)
    expect(looksLikeOtherIncome('Product Sales')).toBe(false) // 'sales' not at start
  })
})
