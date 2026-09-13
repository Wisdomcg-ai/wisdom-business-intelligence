/**
 * Urban Road's August pack opened its cashflow at $0 bank. The real Total Bank
 * at 30 Jun 2026 was $167,629.81, already in the synced balance-sheet mirror.
 * The fixture below is a SUBSET of Urban Road's real rows at that date: every
 * bank account, plus the liabilities most likely to be mistaken for one.
 */
import { describe, it, expect, vi } from 'vitest'
import { isBankRow, openingBalanceDate, totalBankAt, type BankRowInput } from '../opening-bank'
import { deriveMoneyFlow } from '../money-flow'

const UR = '8519c134-ed81-4d9b-8f07-ce499d12b7ee'
const AUD = [{ tenant_id: UR, currency: 'AUD' }]

const row = (
  account_type: string,
  section: string | null,
  balance: number | string | null,
  balance_date = '2026-06-30',
  tenant_id: string | null = UR,
): BankRowInput => ({ tenant_id, account_type, section, balance_date, balance })

// Balances as the mirror stores them: numeric strings.
const URBAN_ROAD_30_JUN: BankRowInput[] = [
  row('asset', 'Bank', '2641.06'),     // AUD PayPal#001
  row('asset', 'Bank', '86037.86'),    // Bus Online Saver
  row('asset', 'Bank', '31948.67'),    // CBA Cheque Account
  row('asset', 'Bank', '0.00'),        // CBA Foreign Currency Account
  row('asset', 'Bank', '45000.00'),    // Urban Road Tax Savings acct
  row('asset', 'Bank', '122.81'),      // USD PayPal #001
  row('asset', 'Bank', '1879.41'),     // Wise account
  row('liability', 'Current Liabilities', '65862.42'), // American Express Platinum Business Card
  row('liability', 'Current Liabilities', '26.15'),    // Suzie Credit Card
  row('liability', 'Current Liabilities', '527764.12'), // Trade Creditors
  row('asset', 'Current Assets', '267324.20'),          // Trade Debtors
  // A month later, same accounts — must not leak into the 30 June total.
  row('asset', 'Bank', '265684.92', '2026-07-31'),
]

describe('isBankRow — the money-flow definition, shared', () => {
  it('counts only section Bank AND account_type asset', () => {
    expect(isBankRow({ section: 'Bank', account_type: 'asset' })).toBe(true)
    expect(isBankRow({ section: 'Current Assets', account_type: 'asset' })).toBe(false)
  })

  it('never counts a credit card, even one filed in a bank-ish section', () => {
    // Xero lets a credit card be a "bank account"; on the balance sheet it is a
    // liability, and counting what is owing on it as cash overstates the bank.
    expect(isBankRow({ section: 'Bank', account_type: 'liability' })).toBe(false)
  })
})

describe('totalBankAt', () => {
  it("reads Urban Road's Total Bank at 30 Jun 2026 to the cent", () => {
    expect(totalBankAt(URBAN_ROAD_30_JUN, '2026-06-30', AUD))
      .toEqual({ status: 'read', amount: 167629.81, asAt: '2026-06-30' })
  })

  it('excludes a credit card liability sitting in the Bank section', () => {
    const withCard = [...URBAN_ROAD_30_JUN, row('liability', 'Bank', '5000.00')]
    expect(totalBankAt(withCard, '2026-06-30', AUD)).toMatchObject({ amount: 167629.81 })
  })

  it('reads the date asked for, not the newest', () => {
    expect(totalBankAt(URBAN_ROAD_30_JUN, '2026-07-31', AUD)).toMatchObject({ status: 'read', amount: 265684.92 })
  })

  it('agrees with the money-flow page on the same rows', () => {
    // Same definition, same number — the whole point of sharing isBankRow.
    const wide = URBAN_ROAD_30_JUN.filter(r => r.balance_date === '2026-06-30').map((r, i) => ({
      account_name: `a${i}`,
      account_type: r.account_type,
      section: r.section,
      tenant_id: UR,
      balances_by_date: { '2026-06-30': Number(r.balance), '2026-07-31': Number(r.balance) },
    }))
    const flow = deriveMoneyFlow(wide, '2026-07', { equationTolerance: Infinity })
    expect(flow.bank.start).toBe(167629.81)
  })

  it('is unavailable, not $0, when the sync never reached that date', () => {
    const v = totalBankAt(URBAN_ROAD_30_JUN, '2026-05-31', AUD)
    expect(v.status).toBe('unavailable')
  })

  it('is unavailable when there is no active Xero connection', () => {
    expect(totalBankAt(URBAN_ROAD_30_JUN, '2026-06-30', []).status).toBe('unavailable')
  })

  it('is unavailable when one of several organisations has no balance sheet that day', () => {
    // Summing only the org that did sync would understate the bank silently.
    const v = totalBankAt(URBAN_ROAD_30_JUN, '2026-06-30', [...AUD, { tenant_id: 'other', currency: 'AUD' }])
    expect(v.status).toBe('unavailable')
  })

  it('sums every active AUD organisation', () => {
    const rows = [...URBAN_ROAD_30_JUN, row('asset', 'Bank', 1000, '2026-06-30', 'other')]
    expect(totalBankAt(rows, '2026-06-30', [...AUD, { tenant_id: 'other', currency: null }]))
      .toMatchObject({ status: 'read', amount: 168629.81 })
  })

  it('ignores rows from a tenant that is not an active connection of this business', () => {
    const rows = [...URBAN_ROAD_30_JUN, row('asset', 'Bank', 99999, '2026-06-30', 'stale')]
    expect(totalBankAt(rows, '2026-06-30', AUD)).toMatchObject({ amount: 167629.81 })
  })

  it('refuses to sum a foreign-currency organisation at 1:1', () => {
    const v = totalBankAt(URBAN_ROAD_30_JUN, '2026-06-30', [...AUD, { tenant_id: 'hk', currency: 'HKD' }])
    expect(v.status).toBe('unavailable')
  })

  it('a synced balance sheet with NO bank accounts is unavailable, not a confident $0', () => {
    // Far likelier to be a mirror that dropped or misfiled its sections than a
    // trading business with no cash — and printing "Opening bank $0" would
    // present that failure as a fact.
    const v = totalBankAt([row('liability', 'Current Liabilities', 10)], '2026-06-30', AUD)
    expect(v.status).toBe('unavailable')
    expect(v).toMatchObject({ reason: 'no bank accounts in the synced balance sheet' })
  })

  it('a bank account holding exactly $0 is still a real reading', () => {
    // The distinction: rows that ARE bank accounts, merely empty, are a fact.
    const v = totalBankAt([row('asset', 'Bank', '0.00')], '2026-06-30', AUD)
    expect(v).toEqual({ status: 'read', amount: 0, asAt: '2026-06-30' })
  })

  it('every organisation needs its own bank row', () => {
    const TWO = [{ tenant_id: 'a', currency: 'AUD' }, { tenant_id: 'b', currency: 'AUD' }]
    const v = totalBankAt([
      row('asset', 'Bank', '100', '2026-06-30', 'a'),
      row('liability', 'Current Liabilities', '5', '2026-06-30', 'b'),
    ], '2026-06-30', TWO)
    expect(v.status).toBe('unavailable')
  })
})

describe('openingBalanceDate', () => {
  it('opens FY2027 at 30 Jun 2026 for a July-start business', () => {
    expect(openingBalanceDate('2026-08', 7)).toBe('2026-06-30')
    expect(openingBalanceDate('2026-07', 7)).toBe('2026-06-30')
    expect(openingBalanceDate('2027-06', 7)).toBe('2026-06-30')
  })

  it('puts June in the year that is ending, not the one about to start', () => {
    expect(openingBalanceDate('2026-06', 7)).toBe('2025-06-30')
  })

  it('follows a non-July fiscal start', () => {
    // Calendar-year business: Aug 2026 is in the year that opened 1 Jan 2026.
    expect(openingBalanceDate('2026-08', 1)).toBe('2025-12-31')
    // April start: Mar 2026 belongs to the year that opened 1 Apr 2025.
    expect(openingBalanceDate('2026-03', 4)).toBe('2025-03-31')
    expect(openingBalanceDate('2026-04', 4)).toBe('2026-03-31')
    // A March start opens on the last day of February — leap years included.
    expect(openingBalanceDate('2028-05', 3)).toBe('2028-02-29')
  })

  it('does not depend on the clock', () => {
    // Re-running the August 2026 pack a year later still opens at 30 Jun 2026.
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date('2027-10-15T09:00:00Z'))
      expect(openingBalanceDate('2026-08', 7)).toBe('2026-06-30')
    } finally {
      vi.useRealTimers()
    }
  })

  it('falls back to July when fiscal_year_start is not a month', () => {
    expect(openingBalanceDate('2026-08', 0)).toBe('2026-06-30')
    expect(openingBalanceDate('2026-08', NaN)).toBe('2026-06-30')
  })
})
