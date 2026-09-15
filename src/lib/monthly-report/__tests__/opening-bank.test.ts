/**
 * Urban Road's August pack opened its cashflow at $0 bank. The real Total Bank
 * at 30 Jun 2026 was $167,629.81, already in the synced balance-sheet mirror.
 * The fixture below is a SUBSET of Urban Road's real rows at that date: every
 * bank account, plus the liabilities most likely to be mistaken for one.
 */
import { describe, it, expect, vi } from 'vitest'
import { isBankRow, openingBalanceDate, packCashflowV1Refusal, parseBankAccountIds, totalBankAt, type BankRowInput } from '../opening-bank'
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

describe('a chosen bank set — Calxa counts two of Urban Road\'s accounts', () => {
  const CBA = '6532a9b0-e2c4-48c9-bcc3-65757e80d4e4'
  const SAVER = 'cd058bf3-c1a1-4379-b886-424aa5e77e7f'
  const AMEX = '0aca1d06-e22b-4d9c-b172-8c4a59aee56b'
  const withId = (account_id: string, r: BankRowInput): BankRowInput => ({ ...r, account_id })
  const rows: BankRowInput[] = [
    withId('paypal', row('asset', 'Bank', '2641.06')),
    withId(SAVER, row('asset', 'Bank', '86037.86')),
    withId(CBA, row('asset', 'Bank', '31948.67')),
    withId('tax-savings', row('asset', 'Bank', '45000.00')),
    withId(AMEX, row('liability', 'Current Liabilities', '65862.42')),
  ]

  it('isBankRow reads the list when there is one, the section when there is not', () => {
    expect(isBankRow({ section: 'Bank', account_type: 'asset', account_id: 'paypal' }, [CBA, SAVER])).toBe(false)
    expect(isBankRow({ section: 'Current Assets', account_type: 'asset', account_id: CBA }, [CBA])).toBe(true)
    expect(isBankRow({ section: 'Bank', account_type: 'asset', account_id: 'paypal' }, null)).toBe(true)
  })

  it('a chosen credit card is still not cash', () => {
    expect(isBankRow({ section: 'Current Liabilities', account_type: 'liability', account_id: AMEX }, [AMEX])).toBe(false)
  })

  it("opens FY2027 on CBA Cheque + Bus Online Saver at 30 Jun 2026: 117,986.53", () => {
    expect(totalBankAt(rows, '2026-06-30', AUD, [CBA, SAVER]))
      .toEqual({ status: 'read', amount: 117986.53, asAt: '2026-06-30' })
    // Unchanged without a choice.
    expect(totalBankAt(rows, '2026-06-30', AUD)).toMatchObject({ amount: 165627.59 })
  })

  it('a list naming nothing in the balance sheet is unavailable, not $0', () => {
    expect(totalBankAt(rows, '2026-06-30', AUD, ['closed-account'])).toEqual({
      status: 'unavailable',
      asAt: '2026-06-30',
      reason: 'none of the bank accounts chosen for this report is in the synced balance sheet',
    })
  })

  it('a list that only partly matches is unavailable, not a smaller total read as fact', () => {
    // CBA alone is 31,948.67. Reading it as the opening bank because the saver
    // could not be found would open the year $86,038 short, without a word.
    expect(totalBankAt(rows, '2026-06-30', AUD, [CBA, 'closed-saver'])).toEqual({
      status: 'unavailable',
      asAt: '2026-06-30',
      reason: '1 of the 2 bank accounts chosen for this report is not in the synced balance sheet at 2026-06-30',
    })
  })

  it('a chosen account that is not an asset is unavailable too, and says which way it is wrong', () => {
    expect(totalBankAt(rows, '2026-06-30', AUD, [CBA, SAVER, AMEX])).toEqual({
      status: 'unavailable',
      asAt: '2026-06-30',
      reason: '1 of the 3 bank accounts chosen for this report is not an asset in the synced balance sheet',
    })
  })

  it('an AccountID pasted in upper case still matches the mirror\'s lower-case uuid', () => {
    expect(totalBankAt(rows, '2026-06-30', AUD, parseBankAccountIds([CBA.toUpperCase(), SAVER])))
      .toEqual({ status: 'read', amount: 117986.53, asAt: '2026-06-30' })
  })

  it('an upper-case list passed straight in, not through parseBankAccountIds, still counts every account', () => {
    // The loaders' opts.bankAccountIds and these exported functions take a raw
    // list. The presence check matched case-insensitively while the sum did
    // not, so the saver was "present" but dropped: 86,037.86 read as a fact.
    expect(totalBankAt(rows, '2026-06-30', AUD, [CBA.toUpperCase(), SAVER]))
      .toEqual({ status: 'read', amount: 117986.53, asAt: '2026-06-30' })
    expect(isBankRow({ section: 'Current Assets', account_type: 'asset', account_id: CBA }, [CBA.toUpperCase()])).toBe(true)
    expect(isBankRow({ section: 'Bank', account_type: 'asset', account_id: CBA.toUpperCase() }, [` ${CBA} `])).toBe(true)
  })

  describe('a chosen account Xero left off that day\'s balance sheet', () => {
    // The mirror has no row for an account with nothing in it: Urban Road's USD
    // PayPal is on the sheet at 31 Jul 2026 at $0 and gone at 30 Sep, Wise AUD
    // appears once in fifteen month-ends, eWay not since Sep 2025. A chosen
    // account opened mid-year is absent from the sheet the year opens on the
    // same way. Reading any of those as "not in the balance sheet" made the
    // cashflow opening unavailable for the whole year.
    const USD_PAYPAL = '1b2c3d4e-0000-4000-8000-000000000001'
    const balanced: BankRowInput[] = [
      withId(CBA, row('asset', 'Bank', '31948.67')),
      withId(SAVER, row('asset', 'Bank', '86037.86')),
      withId('trade-creditors', row('liability', 'Current Liabilities', '100000.00')),
      withId('retained', row('equity', 'Equity', '17986.53')),
    ]
    const known = (account_type = 'asset') => [{ tenant_id: UR, account_id: USD_PAYPAL, account_type }]

    it('is $0 that day when the mirror holds the account on another date and the sheet balances', () => {
      expect(totalBankAt(balanced, '2026-06-30', AUD, [CBA, SAVER, USD_PAYPAL], { knownAccounts: known() }))
        .toEqual({ status: 'read', amount: 117986.53, asAt: '2026-06-30' })
    })

    it('without that evidence it is still not in the balance sheet — unavailable, as before', () => {
      expect(totalBankAt(balanced, '2026-06-30', AUD, [CBA, SAVER, USD_PAYPAL])).toMatchObject({
        status: 'unavailable',
        reason: '1 of the 3 bank accounts chosen for this report is not in the synced balance sheet at 2026-06-30',
      })
    })

    it('a sheet that does not balance could have dropped a row that held money — unavailable, never $0', () => {
      const dropped = balanced.filter((r) => r.account_id !== 'retained')
      expect(totalBankAt(dropped, '2026-06-30', AUD, [CBA, SAVER, USD_PAYPAL], { knownAccounts: known() })).toEqual({
        status: 'unavailable',
        asAt: '2026-06-30',
        reason: '1 of the 3 bank accounts chosen for this report is not in the synced balance sheet at 2026-06-30, and that balance sheet does not balance, so it cannot be read as $0',
      })
    })

    it('an account the mirror holds only as a liability is not bank, present that day or not', () => {
      expect(totalBankAt(balanced, '2026-06-30', AUD, [CBA, SAVER, USD_PAYPAL], { knownAccounts: known('liability') })).toMatchObject({
        status: 'unavailable',
        reason: '1 of the 3 bank accounts chosen for this report is not an asset in the synced balance sheet',
      })
    })

    it('an id the mirror has never held is still unavailable beside one left off at $0', () => {
      expect(totalBankAt(balanced, '2026-06-30', AUD, [CBA, SAVER, USD_PAYPAL, 'closed-saver'], { knownAccounts: known() })).toMatchObject({
        status: 'unavailable',
        reason: '1 of the 4 bank accounts chosen for this report is not in the synced balance sheet at 2026-06-30',
      })
    })

    it('an account known only to another organisation is not evidence for this one', () => {
      expect(totalBankAt(balanced, '2026-06-30', AUD, [CBA, SAVER, USD_PAYPAL], {
        knownAccounts: [{ tenant_id: 'another-org', account_id: USD_PAYPAL, account_type: 'asset' }],
      })).toMatchObject({ status: 'unavailable' })
    })
  })

  it('a list naming only one of two organisations\' accounts says so, not that none is in the balance sheet', () => {
    const OTHER = 'second-org'
    const twoOrgs = [...AUD, { tenant_id: OTHER, currency: 'AUD' }]
    const both: BankRowInput[] = [...rows, withId('other-bank', row('asset', 'Bank', '500.00', '2026-06-30', OTHER))]
    expect(totalBankAt(both, '2026-06-30', twoOrgs, [CBA, SAVER])).toEqual({
      status: 'unavailable',
      asAt: '2026-06-30',
      reason: 'no bank account chosen for this report is in the balance sheet of 1 of the 2 Xero organisations',
    })
  })

  it('parseBankAccountIds: ids trimmed, lower-cased and de-duplicated; empty, missing or malformed is no choice', () => {
    expect(parseBankAccountIds([` ${CBA} `, SAVER, CBA.toUpperCase(), '', 7])).toEqual([CBA, SAVER])
    expect(parseBankAccountIds([])).toBeNull()
    expect(parseBankAccountIds(null)).toBeNull()
    expect(parseBankAccountIds(undefined)).toBeNull()
    expect(parseBankAccountIds('6532a9b0')).toBeNull()
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

describe('packCashflowV1Refusal — the v1 cashflow is for one AUD organisation', () => {
  it('builds for Urban Road: one organisation, AUD (or no currency recorded)', () => {
    expect(packCashflowV1Refusal(AUD)).toBeNull()
    expect(packCashflowV1Refusal([{ tenant_id: UR, currency: null }])).toBeNull()
  })

  it("refuses Dragon Roofing's two AUD organisations — v1 put $735,661 too much in the bank (DRG-45)", () => {
    expect(packCashflowV1Refusal([
      { tenant_id: 'dragon', currency: 'AUD' },
      { tenant_id: 'easy-hail', currency: 'AUD' },
    ])).toBe('This business has more than one Xero organisation, and the cashflow cannot yet be built for more than one.')
  })

  it('refuses a single organisation in a foreign currency', () => {
    expect(packCashflowV1Refusal([{ tenant_id: 'igl', currency: 'HKD' }]))
      .toBe('The Xero organisation reports in a foreign currency, which this cashflow cannot translate.')
  })

  it('counts an organisation listed under two business ids once', () => {
    expect(packCashflowV1Refusal([{ tenant_id: UR, currency: 'AUD' }, { tenant_id: UR, currency: 'AUD' }])).toBeNull()
  })

  it('no organisation is not a refusal — the opening says unavailable, as before', () => {
    expect(packCashflowV1Refusal([])).toBeNull()
  })
})
