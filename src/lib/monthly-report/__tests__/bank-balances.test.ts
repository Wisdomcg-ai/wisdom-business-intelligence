/**
 * Bank Balances & Movement (Calxa p17) for a business Xero holds as several
 * organisations — IICT Group's three, one of them in HKD, and Dragon Roofing's
 * two — against the stored mirror as it stood for the August 2026 packs.
 *
 * Fixtures: fixtures/iict-bs-mirror-2026-08.json and
 * fixtures/dragon-bs-mirror-2026-08.json (their _provenance says what was read).
 * The Calxa figures quoted are page 17 of IICT's August pack.
 */
import { describe, it, expect } from 'vitest'
import iict from './fixtures/iict-bs-mirror-2026-08.json'
import dragon from './fixtures/dragon-bs-mirror-2026-08.json'
import { buildBankBalances, type BankBalancesInput } from '../bank-balances'
import { bsAmountText } from '../balance-sheet-rows'
import type { BankBalancesData } from '@/app/finances/monthly-report/types'

const IGL = 'de943481-389d-4134-b0af-410f025f53c2'
const IGP = '44582ebf-ec15-414b-9f20-8706967257f3'
const DRAGON = '42735fc3-21f2-4668-9783-93ce0f66f481'

type Fixture = typeof iict | typeof dragon

/** Every bank, credit-card and cash-on-hand account of the fixture — the list a coach saves (IICT-43). */
function chosen(fx: Fixture): string[] {
  return [
    ...new Set(
      fx.accounts
        .filter((a) => a.bank_account_type === 'BANK' || a.bank_account_type === 'CREDITCARD' || /cash on hand/i.test(a.account_name))
        .map((a) => a.xero_account_id),
    ),
  ]
}

function input(fx: Fixture, over: Partial<BankBalancesInput> = {}): BankBalancesInput {
  return {
    businessId: fx.business_id,
    month: '2026-08',
    organisations: fx.connections.map((c) => ({ tenant_id: c.tenant_id, name: c.name, functional_currency: c.functional_currency })),
    rows: fx.rows,
    accounts: fx.accounts,
    rates: 'fx_rates' in fx ? fx.fx_rates : [],
    accountIds: chosen(fx),
    ...over,
  }
}

function data(result: ReturnType<typeof buildBankBalances>): BankBalancesData {
  if (!result.ok) throw new Error(`refused: ${result.reason}`)
  return result.data
}

/** A row's two printed figures. */
function printed(d: BankBalancesData, label: string): [string, string] {
  const matches = d.rows.filter((r) => r.label === label)
  if (matches.length !== 1) throw new Error(`expected one "${label}" row, found ${matches.length}`)
  return [bsAmountText(matches[0].current), bsAmountText(matches[0].prior)]
}

describe('IICT Group — three organisations, one in HKD', () => {
  it('totals the bank at 226,628 less the $19 of PayPal FX, against the prior month', () => {
    const d = data(buildBankBalances(input(iict)))
    expect(d.current_label).toBe('Aug 2026')
    expect(d.prior_label).toBe('Jul 2026')
    // Calxa p17: 226,628 / 244,139 / (17,510). The residual is IICT Group Pty
    // Ltd's foreign PayPal accounts, whose mirror stopped on 10 Sep (IICT-42).
    expect(printed(d, 'Total Bank')).toEqual(['226,608', '244,120'])
    const total = d.rows.find((r) => r.label === 'Total Bank')!
    expect(bsAmountText(total.variance)).toBe('(17,512)')
    expect(total.variance_pct).not.toBeNull()
  })

  it('prints each organisation with its own subtotal, in display order', () => {
    const d = data(buildBankBalances(input(iict)))
    expect(d.rows.filter((r) => r.type === 'section_header').map((r) => r.label)).toEqual([
      'IICT (Aust) Pty Ltd',
      'IICT Group Limited',
      'IICT Group Pty Ltd',
    ])
    expect(printed(d, 'Total IICT (Aust) Pty Ltd')).toEqual(['(2,905)', '(2,181)'])
    expect(printed(d, 'Total IICT Group Limited')).toEqual(['220,209', '236,995'])
    expect(printed(d, 'Total IICT Group Pty Ltd')).toEqual(['9,304', '9,306'])
    expect(d.organisations).toEqual([
      { name: 'IICT (Aust) Pty Ltd', currency: 'AUD' },
      { name: 'IICT Group Limited', currency: 'HKD' },
      { name: 'IICT Group Pty Ltd', currency: 'AUD' },
    ])
  })

  it('translates the HKD account at each date’s closing rate — never Hong Kong dollars added to Australian ones', () => {
    const d = data(buildBankBalances(input(iict)))
    expect(printed(d, 'AWX_IICT Group Limite_Cash_HKD')).toEqual(['220,209', '236,995'])
    expect(d.rows.some((r) => bsAmountText(r.current) === '1,237,809')).toBe(false)
    expect(d.notes).toEqual([
      'IICT Group Limited reports in HKD, translated at the closing rate on each date (Aug 2026 0.1779; Jul 2026 0.1818).',
      'Credit cards are shown as negative assets: what is owing on the card is money the group does not hold.',
    ])
  })

  it('shows each organisation’s credit card as a negative asset, never netted across the two', () => {
    const d = data(buildBankBalances(input(iict)))
    // IICT (Aust) owes 7,146.40; IICT Group Pty Ltd is 6,556 in credit. Calxa
    // p17 nets them to (590) on one line; each organisation keeps its own here.
    const cards = d.rows.filter((r) => r.label === 'Altitude Business Gold Mastercard')
    expect(cards.map((r) => bsAmountText(r.current))).toEqual(['(7,146)', '6,556'])
  })

  it('leaves out an account that is nil in both months, and still counts it', () => {
    const d = data(buildBankBalances(input(iict)))
    // Debit Card, My Donations and Thank you are $0 on both dates (Calxa p17
    // does not print them either).
    expect(d.rows.some((r) => r.label === 'Debit Card')).toBe(false)
    expect(printed(d, 'Total IICT Group Pty Ltd')).toEqual(['9,304', '9,306'])
  })

  it('refuses, naming the date, when the closing rate is missing', () => {
    const rates = iict.fx_rates.filter((r) => !(r.rate_type === 'closing_spot' && r.period === '2026-07-31'))
    expect(buildBankBalances(input(iict, { rates }))).toEqual({
      ok: false,
      reason: 'no HKD/AUD closing rate is stored for 31 Jul 2026',
    })
  })

  it('refuses when no bank accounts have been chosen, rather than printing a confident $0', () => {
    for (const accountIds of [null, []]) {
      expect(buildBankBalances(input(iict, { accountIds }))).toEqual({
        ok: false,
        reason: 'no bank accounts have been chosen for this page — choose them in the report settings',
      })
    }
  })

  it('refuses when a chosen account belongs to none of the organisations this report covers', () => {
    // Dragon Roofing Main, pasted into IICT's list.
    const accountIds = [...chosen(iict), 'e1b2aa60-0b00-4171-87e9-0ca8455d81e6']
    const result = buildBankBalances(input(iict, { accountIds }))
    expect(result).toEqual({
      ok: false,
      reason: '1 of the 18 bank accounts chosen for this page is not in the Xero organisations this report covers',
    })
  })

  it('refuses when an organisation has no synced balance sheet at the report date', () => {
    const rows = iict.rows.filter((r) => !(r.tenant_id === IGP && r.balance_date === '2026-08-31'))
    expect(buildBankBalances(input(iict, { rows }))).toEqual({
      ok: false,
      reason: 'no balance sheet has been synced for IICT Group Pty Ltd at 31 Aug 2026',
    })
  })

  it('still prints every figure when the chart of accounts could not be read, and says what it could not check', () => {
    // The sign comes from the class Xero's own balance sheet filed the account
    // under, never from the catalogue, so no figure moves. What is lost is the
    // check that a chosen account with no balance in either month is real —
    // so an id nothing knows warns here where it would otherwise refuse.
    const accountIds = [...chosen(iict), 'e1b2aa60-0b00-4171-87e9-0ca8455d81e6']
    const d = data(buildBankBalances(input(iict, { accounts: null, accountIds })))
    expect(printed(d, 'Total Bank')).toEqual(['226,608', '244,120'])
    const cards = d.rows.filter((r) => r.label === 'Altitude Business Gold Mastercard')
    expect(cards.map((r) => bsAmountText(r.current))).toEqual(['(7,146)', '6,556'])
    expect(d.warnings).toEqual([
      'The chart of accounts could not be read, so a chosen account with no balance in either month could not be told apart from one this report does not cover.',
    ])
    // With the catalogue, every chosen account IS known, so nothing is warned.
    expect(data(buildBankBalances(input(iict))).warnings).toEqual([])
  })
})

describe('Dragon Roofing + Easy Hail Claim — two AUD organisations', () => {
  it('totals the two banks at 288,449, as Calxa’s balance sheet does', () => {
    const d = data(buildBankBalances(input(dragon)))
    expect(printed(d, 'Total Bank')).toEqual(['288,449', '267,246'])
    // The movement Where Did Our Money Go proves itself against (DRG-49).
    expect(bsAmountText(d.rows.find((r) => r.label === 'Total Bank')!.variance)).toBe('21,203')
    expect(printed(d, 'Dragon Roofing Main')).toEqual(['91,255', '63,477'])
    expect(printed(d, 'Easy Hail Claim')).toEqual(['176,361', '122,945'])
    expect(d.notes).toEqual([])
  })

  it('a business with one organisation gets no entity headings — just its accounts and the total', () => {
    const one = dragon.connections.filter((c) => c.tenant_id === DRAGON)
    const d = data(
      buildBankBalances(
        input(dragon, { organisations: one.map((c) => ({ tenant_id: c.tenant_id, name: c.name, functional_currency: c.functional_currency })) }),
      ),
    )
    expect(d.rows.some((r) => r.type === 'section_header')).toBe(false)
    expect(d.rows.map((r) => r.label)).toEqual(['Dragon Roofing Main', 'SUPA/ PAYG Savings', 'Total Bank'])
    expect(printed(d, 'Total Bank')).toEqual(['112,088', '144,301'])
    // Easy Hail Claim's account is still on the saved list. It is a real
    // account of the business, so the page leaves it out and says so rather
    // than refusing to print at all.
    expect(d.notes).toEqual(['Leaves out 1 chosen account that belongs to a Xero organisation this report does not cover.'])
  })
})

describe('the organisations it reads', () => {
  it('never reads an organisation outside the consolidation, whatever business id its rows were stored under', () => {
    const withoutIgl = iict.connections
      .filter((c) => c.tenant_id !== IGL)
      .map((c) => ({ tenant_id: c.tenant_id, name: c.name, functional_currency: c.functional_currency }))
    const d = data(buildBankBalances(input(iict, { organisations: withoutIgl })))
    expect(d.rows.some((r) => r.label === 'AWX_IICT Group Limite_Cash_HKD')).toBe(false)
    expect(printed(d, 'Total Bank')).toEqual(['6,400', '7,125'])
    expect(d.organisations.map((o) => o.name)).toEqual(['IICT (Aust) Pty Ltd', 'IICT Group Pty Ltd'])
    // …and no rate is needed at all once no organisation is foreign.
    expect(data(buildBankBalances(input(iict, { organisations: withoutIgl, rates: [] }))).notes).toEqual([
      'Credit cards are shown as negative assets: what is owing on the card is money the group does not hold.',
      'Leaves out 1 chosen account that belongs to a Xero organisation this report does not cover.',
    ])
  })
})
