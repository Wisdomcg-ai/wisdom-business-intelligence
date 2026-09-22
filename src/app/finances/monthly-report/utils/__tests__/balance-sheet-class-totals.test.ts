/**
 * The labels and figures are Urban Road's August 2026 balance sheet, the month
 * the pack told the client in a red box that their books did not balance.
 */
import { describe, it, expect } from 'vitest'
import { balanceSheetClassTotals } from '../balance-sheet-pdf'
import type { BalanceSheetRow } from '../../types'

const sub = (label: string, current: number): BalanceSheetRow =>
  ({ label, type: 'subtotal', current, prior: null } as BalanceSheetRow)
const item = (label: string, current: number): BalanceSheetRow =>
  ({ label, type: 'line_item', current, prior: null } as BalanceSheetRow)

/** Xero's own row order: every sub-class total comes BEFORE the grand total. */
const URBAN_ROAD: BalanceSheetRow[] = [
  item('CBA Cheque Account', 18725),
  sub('Total Bank', 210025),
  sub('Total Current Assets', 249232),
  sub('Total Fixed Assets', 102040),
  sub('Total Non-current Assets', 149570),
  sub('Total Asset', 710867),
  sub('Total Current Liabilities', 226068),
  sub('Total Non-Current Liabilities', 59557),
  sub('Total Liability', 285625),
  sub('Net Assets', 425242),
  sub('Total Equity', 425242),
]

describe('balanceSheetClassTotals', () => {
  it('takes the grand total, not the first subtotal that mentions the class', () => {
    const t = balanceSheetClassTotals(URBAN_ROAD)
    expect(t.assets).toBe(710867)
    expect(t.liabilities).toBe(285625)
    expect(t.equity).toBe(425242)
  })

  it('the sheet that printed "residual of $402,078" balances exactly', () => {
    // The banner's figure was Total CURRENT Assets − (Total CURRENT Liabilities
    // + Total Equity) = 249,232 − 651,310 = −402,078, to the dollar.
    const t = balanceSheetClassTotals(URBAN_ROAD)
    expect(t.assets! - (t.liabilities! + t.equity!)).toBe(0)
  })

  it('says nothing rather than guessing when the equity heading is unrecognised', () => {
    // "Total Owner's Funds" contains neither "total equity" nor "equity", so
    // NEITHER branch matches it — and never did, whatever the old comment
    // claimed. Null is the honest answer: the caller then prints "the equation
    // could not be checked on this page" instead of a residual it invented.
    const rows = [...URBAN_ROAD.slice(0, 9), sub("Total Owner's Funds", 425242)]
    expect(balanceSheetClassTotals(rows).equity).toBeNull()
  })

  it('ignores line items that happen to contain the word', () => {
    const rows = [item('Total Asset Finance Loan', 999), ...URBAN_ROAD]
    expect(balanceSheetClassTotals(rows).assets).toBe(710867)
  })

  it('returns null rather than a wrong number when a class is absent', () => {
    const rows = URBAN_ROAD.filter(r => !r.label.toLowerCase().includes('equit'))
    expect(balanceSheetClassTotals(rows).equity).toBeNull()
  })

  it('prefers the closing heading when a sheet repeats it', () => {
    const rows = [...URBAN_ROAD, sub('Total Assets', 720000)]
    expect(balanceSheetClassTotals(rows).assets).toBe(720000)
  })
})
