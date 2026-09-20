/**
 * The Balance Sheet page for a business Xero holds as several organisations,
 * against the stored mirror as it stood for the August 2026 packs — IICT
 * Group's three organisations (one in HKD) and Dragon Roofing's two.
 *
 * Fixtures: fixtures/iict-bs-mirror-2026-08.json and
 * fixtures/dragon-bs-mirror-2026-08.json, read-only from prod on 16 Sep 2026
 * (their _provenance fields say exactly what was read and what was restored).
 * The Calxa figures quoted are pages 21-22 of IICT's August pack and page 21
 * of Dragon's.
 */
import { describe, it, expect } from 'vitest'
import iict from './fixtures/iict-bs-mirror-2026-08.json'
import dragon from './fixtures/dragon-bs-mirror-2026-08.json'
import {
  buildConsolidatedBalanceSheet,
  consolidatedBalanceSheetDates,
  type ConsolidatedBsInput,
} from '../consolidated-balance-sheet'
import { bsAmountText } from '../balance-sheet-rows'
import type { EliminationRule } from '@/lib/consolidation/types'
import type { BalanceSheetCompare, BalanceSheetData } from '@/app/finances/monthly-report/types'

const IAP = '1d83c9a4-bf6d-448f-bb87-88e2684317bf'
const IGL = 'de943481-389d-4134-b0af-410f025f53c2'
const IGP = '44582ebf-ec15-414b-9f20-8706967257f3'
const DRAGON = '42735fc3-21f2-4668-9783-93ce0f66f481'
const EHC = '3b67e5b6-780c-4158-831c-82293f34ca04'

type Fixture = typeof iict | typeof dragon

function input(fx: Fixture, compare: BalanceSheetCompare, over: Partial<ConsolidatedBsInput> = {}): ConsolidatedBsInput {
  return {
    businessId: fx.business_id,
    month: '2026-08',
    compare,
    fiscalYearStart: 7,
    organisations: fx.connections.map((c) => ({ tenant_id: c.tenant_id, name: c.name, functional_currency: c.functional_currency })),
    rows: fx.rows,
    accounts: fx.accounts,
    rates: 'fx_rates' in fx ? fx.fx_rates : [],
    rules: [],
    ...over,
  }
}

function sheet(result: ReturnType<typeof buildConsolidatedBalanceSheet>): BalanceSheetData {
  if (!result.ok) throw new Error(`refused: ${result.reason}`)
  return result.data
}

/** The note every group's sheet opens with, so an organisation missing from it is visible. */
const addedTogether = (...names: string[]) => `Added together: ${listOf(names)}.`

/** "A", "A and B", "A, B and C" — the builder's own list, so the notes read the same. */
function listOf(items: string[]): string {
  return items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

/** What a group's sheet says when no intercompany balance came off it. */
const GROSS_NO_RULES =
  'No intercompany elimination rules are set for this business, so any loans between the organisations ' +
  'are included in full in Total Asset and Total Liability.'
const GROSS_NOT_ELIMINATED =
  'No intercompany balances were eliminated, so any loans between the organisations ' +
  'are included in full in Total Asset and Total Liability.'

/** A row's two printed figures, as the page prints them. */
function printed(data: BalanceSheetData, label: string, type?: string): [string, string] {
  const matches = data.rows.filter((r) => r.label === label && (!type || r.type === type))
  if (matches.length !== 1) throw new Error(`expected one "${label}" row, found ${matches.length}`)
  return [bsAmountText(matches[0].current), bsAmountText(matches[0].prior)]
}

function rule(over: Partial<EliminationRule>): EliminationRule {
  return {
    id: 'rule-1',
    business_id: 'biz',
    rule_type: 'intercompany_loan',
    tenant_a_id: DRAGON,
    entity_a_account_code: '700',
    entity_a_account_name_pattern: null,
    tenant_b_id: EHC,
    entity_b_account_code: '906',
    entity_b_account_name_pattern: null,
    direction: 'bidirectional',
    description: 'Dragon ↔ Easy Hail loan',
    active: true,
    ...over,
  }
}

describe('IICT Group — three organisations, one in HKD', () => {
  it("prints 31 Aug 2025's net assets as Calxa does: 1,101,808, with all three organisations", () => {
    const data = sheet(buildConsolidatedBalanceSheet(input(iict, 'yoy')))
    expect(data.prior_label).toBe('Aug 2025')
    expect(printed(data, 'Net Assets')[1]).toBe('1,101,808')
    // Calxa p22's prior column: the class totals tie as well, because in
    // August 2025 no account sat in the other class's sign.
    expect(printed(data, 'Total Asset')[1]).toBe('849,632')
    expect(printed(data, 'Total Liability')[1]).toBe('(252,176)')
    // …and so does the year's profit at the average rates.
    expect(printed(data, 'Current Earnings')[1]).toBe('135,491')
    expect(data.balances).toBe(true)
  })

  it('translates the HKD organisation at each date’s closing rate — never adds Hong Kong dollars to Australian ones', () => {
    const data = sheet(buildConsolidatedBalanceSheet(input(iict, 'mom')))
    // AWX holds HK$1,237,808.62 at 31 Aug (×0.177902) and HK$1,303,713.43 at 31 Jul (×0.181785).
    expect(printed(data, 'AWX_IICT Group Limite_Cash_HKD')).toEqual(['220,209', '236,995'])
    expect(data.rows.some((r) => bsAmountText(r.current) === '1,237,809')).toBe(false)
    // At the stored OXR rates: Calxa's 1,169,393 for July is +71, its 1,138,758
    // for August −503 (IICT-46: payables and PayPal, the IGP org since 10 Sep).
    expect(printed(data, 'Net Assets')).toEqual(['1,138,255', '1,169,464'])
    expect(printed(data, 'Total Equity')).toEqual(['1,138,255', '1,169,464'])
    expect(data.balances).toBe(true)
  })

  it('splits the HKD organisation’s equity by IAS 21: brought forward at the opening rate, the year’s profit at average rates, and the difference', () => {
    const data = sheet(buildConsolidatedBalanceSheet(input(iict, 'mom')))
    const equity = data.rows.slice(data.rows.findIndex((r) => r.type === 'net_assets') + 1)
    expect(equity.map((r) => r.label)).toEqual([
      'Equity',
      'Dividends Paid',
      'Retained Earnings',
      'Owner A Share Capital',
      'Currency Translation Difference',
      'Current Earnings',
      'Total Equity',
    ])
    // Current Earnings is the group's July–August profit with IICT Group
    // Limited's months at their average rates — Calxa's 120,975 less the
    // currency-gains row decision 8 accepts (IICT-11), and not IGL's own
    // April–August "Current Year Earnings" of HK$7,471,759 at any rate.
    expect(printed(data, 'Current Earnings')).toEqual(['119,666', '93,895'])
    // Brought forward does not move within the year.
    const [aug, jul] = printed(data, 'Retained Earnings')
    expect(aug).toBe(jul)
    expect(printed(data, 'Currency Translation Difference')).toEqual(['(92,179)', '(35,199)'])
    expect(data.consolidation?.notes).toEqual([
      addedTogether('IICT (Aust) Pty Ltd', 'IICT Group Limited (HKD)', 'IICT Group Pty Ltd'),
      GROSS_NO_RULES,
      'IICT Group Limited reports in HKD. Its assets and liabilities are translated at the closing rate on each date ' +
        '(Aug 2026 0.1779; Jul 2026 0.1818); its equity at the rate when the financial year began (30 Jun 2026 0.1845), ' +
        "with each month's movement at that month's average rate. The Currency Translation Difference is what that leaves. " +
        "Rates from before the year began are not stored, so earlier years' equity is carried at the year's opening rate.",
    ])
  })

  it('prints credit cards as negative assets, adding the two organisations’ Mastercards as Calxa p17 and p21 do', () => {
    const data = sheet(buildConsolidatedBalanceSheet(input(iict, 'mom')))
    // IICT (Aust) owes 7,146.40 and IICT Group Pty Ltd is 6,556 in credit.
    expect(printed(data, 'Altitude Business Gold Mastercard', 'line_item')).toEqual(['(590)', '1,128'])
    const liabilities = data.rows.slice(data.rows.findIndex((r) => r.label === 'Liability'))
    expect(liabilities.some((r) => r.label === 'Altitude Business Gold Mastercard')).toBe(false)
  })

  it('takes an account’s class from the catalogue row carrying the mirror’s code when two rows disagree', () => {
    // IICT (Aust)'s "Loan - IICT Group Pty Ltd" has a current row (700,
    // NONCURRENT) and a stale one (900, TERMLIAB). The mirror says 700.
    const data = sheet(buildConsolidatedBalanceSheet(input(iict, 'mom')))
    // 52,598.19 (IAP) + HK$464,147.14 × 0.177902 (IGL), both assets.
    expect(printed(data, 'Loan - IICT Group Pty Ltd')).toEqual(['135,171', '136,973'])
  })

  it('restates the comparison column into the line’s own class when an account was recoded between the two dates', () => {
    // IICT (Aust)'s "Loan - IICT Group Pty Ltd" is 700 ASSET at 31 Jul 2025 and
    // 900 LIABILITY at 30 Jun 2025 — recoded in Xero, and the catalogue carries
    // a row for each code. The account is ONE line in ONE class (July's, the
    // report date's), so June's credit-positive 4,400 is a debit balance of
    // 4,400 in the asset column — the single-org page's restate(). Taking the
    // report date's class with the comparison date's sign printed it (4,400),
    // put Total Asset 8,800 short and left Net Assets 8,800 under Total Equity
    // with nothing on the page to name the cause.
    const organisations = iict.connections
      .filter((c) => c.tenant_id !== IGL)
      .map((c) => ({ tenant_id: c.tenant_id, name: c.name, functional_currency: c.functional_currency }))
    const data = sheet(buildConsolidatedBalanceSheet(input(iict, 'mom', { month: '2025-07', organisations })))
    expect(printed(data, 'Loan - IICT Group Pty Ltd')).toEqual(['(43,600)', '4,400'])
    expect(printed(data, 'Total Asset')[1]).toBe('1,088,367')
    expect(printed(data, 'Net Assets')[1]).toBe('564,527')
    expect(printed(data, 'Total Equity')[1]).toBe('564,527')
    expect(data.balances).toBe(true)
  })

  it('refuses the page, naming the date, when a closing rate is missing', () => {
    const rates = iict.fx_rates.filter((r) => !(r.rate_type === 'closing_spot' && r.period === '2026-08-31'))
    const result = buildConsolidatedBalanceSheet(input(iict, 'mom', { rates }))
    expect(result).toEqual({ ok: false, reason: 'no HKD/AUD closing rate is stored for 31 Aug 2026' })
  })

  it('names every missing closing date for the comparison too', () => {
    const rates = iict.fx_rates.filter((r) => r.rate_type !== 'closing_spot')
    const result = buildConsolidatedBalanceSheet(input(iict, 'yoy', { rates }))
    expect(result).toEqual({ ok: false, reason: 'no HKD/AUD closing rate is stored for 31 Aug 2025 and 31 Aug 2026' })
  })

  it('translates equity at the closing rate, and says why, when a month’s average rate is not stored', () => {
    const rates = iict.fx_rates.filter((r) => !(r.rate_type === 'monthly_average' && r.period === '2026-07-01'))
    const data = sheet(buildConsolidatedBalanceSheet(input(iict, 'mom', { rates })))
    // Net Assets never depended on it.
    expect(printed(data, 'Net Assets')).toEqual(['1,138,255', '1,169,464'])
    expect(data.balances).toBe(true)
    expect(data.rows.some((r) => r.label === 'Currency Translation Difference')).toBe(false)
    expect(data.consolidation?.notes).toEqual([
      addedTogether('IICT (Aust) Pty Ltd', 'IICT Group Limited (HKD)', 'IICT Group Pty Ltd'),
      GROSS_NO_RULES,
      'IICT Group Limited reports in HKD and is translated at the closing rate on each date, equity included ' +
        '(Aug 2026 0.1779; Jul 2026 0.1818): no HKD/AUD average rate is stored for Jul 2026, so its equity cannot be ' +
        "split into this year's earnings and a translation difference.",
    ])
  })

  it('refuses when an organisation has no synced balance sheet at the report date', () => {
    const rows = iict.rows.filter((r) => !(r.tenant_id === IGP && r.balance_date === '2026-08-31'))
    expect(buildConsolidatedBalanceSheet(input(iict, 'mom', { rows }))).toEqual({
      ok: false,
      reason: 'no balance sheet has been synced for IICT Group Pty Ltd at 31 Aug 2026',
    })
  })

  it('refuses rather than printing a comparison column short by one organisation', () => {
    const rows = iict.rows.filter((r) => !(r.tenant_id === IAP && r.balance_date === '2026-07-31'))
    expect(buildConsolidatedBalanceSheet(input(iict, 'mom', { rows }))).toEqual({
      ok: false,
      reason: 'no balance sheet has been synced for IICT (Aust) Pty Ltd at 31 Jul 2026',
    })
  })

  it('refuses an organisation whose currency was never recorded, rather than guessing AUD', () => {
    const organisations = iict.connections.map((c) => ({
      tenant_id: c.tenant_id,
      name: c.name,
      functional_currency: c.tenant_id === IGL ? null : c.functional_currency,
    }))
    const result = buildConsolidatedBalanceSheet(input(iict, 'mom', { organisations }))
    expect(result.ok).toBe(false)
    expect(!result.ok && result.reason).toMatch(/^the reporting currency of IICT Group Limited is not recorded/)
  })

  it('does not eliminate a loan whose two sides disagree: both stay in full, and the page says how far apart', () => {
    // IICT-49: IICT Group Limited's "Loan - IICT (Aust)" (HK$ at the closing
    // rate) against IICT (Aust)'s "Loan - Hong Kong company" payable.
    const loan = rule({ tenant_a_id: IGL, entity_a_account_code: '730', tenant_b_id: IAP, entity_b_account_code: '625' })
    const gross = sheet(buildConsolidatedBalanceSheet(input(iict, 'mom')))
    const data = sheet(buildConsolidatedBalanceSheet(input(iict, 'mom', { rules: [loan] })))
    expect(data.rows).toEqual(gross.rows)
    expect(data.consolidation?.warnings).toEqual([
      'Not eliminated: Loan - IICT (Aust) Pty Ltd (IICT Group Limited) and Loan - Hong Kong company - IICT Group Limited ' +
        '(IICT (Aust) Pty Ltd) are 68,211 apart at Aug 2026 and 26,679 apart at Jul 2026, so both are shown in full. ' +
        'Reconcile the loan in Xero and it will be eliminated.',
    ])
    expect(data.consolidation?.notes.some((n) => n.startsWith('Eliminated'))).toBe(false)
  })
})

describe('Dragon Roofing + Easy Hail Claim — two AUD organisations', () => {
  it('adds the two organisations: net assets 270,523, before any elimination', () => {
    const data = sheet(buildConsolidatedBalanceSheet(input(dragon, 'mom')))
    expect(printed(data, 'Total Asset')[0]).toBe('2,050,535')
    expect(printed(data, 'Total Liability')[0]).toBe('1,780,012')
    expect(printed(data, 'Net Assets')[0]).toBe('270,523')
    expect(data.balances).toBe(true)
    expect(data.consolidation?.notes).toEqual([
      addedTogether('Dragon Roofing Pty Ltd', 'EASY HAIL CLAIM PTY LTD'),
      GROSS_NO_RULES,
    ])
    expect(data.consolidation?.organisations).toEqual([
      { name: 'Dragon Roofing Pty Ltd', currency: 'AUD' },
      { name: 'EASY HAIL CLAIM PTY LTD', currency: 'AUD' },
    ])
  })

  it('eliminates the 488,119.64 intercompany loan: assets 1,562,415, net assets still 270,523, and one line says so', () => {
    const data = sheet(buildConsolidatedBalanceSheet(input(dragon, 'mom', { rules: [rule({})] })))
    expect(printed(data, 'Total Asset')).toEqual(['1,562,415', '1,711,072'])
    expect(printed(data, 'Total Liability')).toEqual(['1,291,893', '1,393,991'])
    expect(printed(data, 'Net Assets')).toEqual(['270,523', '317,081'])
    expect(printed(data, 'Total Equity')).toEqual(['270,523', '317,081'])
    // Gone from both columns (458,955.48 a side at 31 Jul).
    expect(data.rows.some((r) => /Loan (Receivable - Easy Hail|Payable - Dragon)/.test(r.label))).toBe(false)
    expect(data.consolidation?.notes).toEqual([
      addedTogether('Dragon Roofing Pty Ltd', 'EASY HAIL CLAIM PTY LTD'),
      'Eliminated on consolidation: Loan Receivable - Easy Hail Claim Pty Ltd (Dragon Roofing Pty Ltd) against ' +
        'Loan Payable - Dragon Roofing Pty Ltd (EASY HAIL CLAIM PTY LTD), 488,120 at Aug 2026.',
    ])
    expect(data.consolidation?.warnings).toEqual([])
  })

  it('matches a rule by account name pattern as well as by code', () => {
    const byName = rule({
      entity_a_account_code: null,
      entity_a_account_name_pattern: '^Loan Receivable - Easy Hail',
      entity_b_account_code: null,
      entity_b_account_name_pattern: '^Loan Payable - Dragon',
    })
    expect(printed(sheet(buildConsolidatedBalanceSheet(input(dragon, 'mom', { rules: [byName] }))), 'Total Asset')[0]).toBe('1,562,415')
  })

  it('warns, and eliminates nothing, when a rule matches no account on one side', () => {
    const data = sheet(buildConsolidatedBalanceSheet(input(dragon, 'mom', { rules: [rule({ entity_b_account_code: '999' })] })))
    expect(printed(data, 'Total Asset')[0]).toBe('2,050,535')
    expect(data.consolidation?.warnings).toEqual([
      'The intercompany loan elimination between Dragon Roofing Pty Ltd and EASY HAIL CLAIM PTY LTD matches no account in EASY HAIL CLAIM PTY LTD, so nothing was eliminated for it.',
    ])
  })

  it('warns when a rule names an organisation this consolidation does not include', () => {
    const data = sheet(buildConsolidatedBalanceSheet(input(dragon, 'mom', { rules: [rule({ tenant_b_id: 'not-connected' })] })))
    expect(printed(data, 'Total Asset')[0]).toBe('2,050,535')
    expect(data.consolidation?.warnings).toEqual([
      'An intercompany loan elimination names an organisation that is not in this consolidation (its other side is Dragon Roofing Pty Ltd), so nothing was eliminated for it.',
    ])
  })

  it('ignores a rule that is not active, or not a loan rule', () => {
    const data = sheet(
      buildConsolidatedBalanceSheet(input(dragon, 'mom', { rules: [rule({ active: false }), rule({ id: 'r2', rule_type: 'account_pair' })] })),
    )
    expect(printed(data, 'Total Asset')[0]).toBe('2,050,535')
    expect(data.consolidation?.warnings).toEqual([])
  })

  it('never adds accounts across organisations by code: same code, different names, two rows', () => {
    // Dragon 900 "Loan" and IAP-style collisions: Dragon and Easy Hail share
    // codes 610, 800, 820, 830 and 970 with the same names, but 730 is Mini
    // Cooper S (Dragon) and Loan - Director (Easy Hail).
    const data = sheet(buildConsolidatedBalanceSheet(input(dragon, 'mom')))
    expect(printed(data, 'Loan - Director')[0]).toBe('739,661')
    expect(printed(data, 'Mini Cooper S - at cost')[0]).toBe('36,087')
    expect(printed(data, 'Accounts Receivable')[0]).toBe('394,847')
  })
})

describe('what the page says it did', () => {
  const ORGS = [
    { tenant_id: 't1', name: 'One Pty Ltd', functional_currency: 'AUD' },
    { tenant_id: 't2', name: 'Two Pty Ltd', functional_currency: 'AUD' },
  ]
  const row = (over: Partial<ConsolidatedBsInput['rows'][number]>) => ({
    tenant_id: 't1',
    account_id: 'a-1',
    account_code: '090',
    account_name: 'Cash',
    account_type: 'asset',
    section: null,
    balance_date: '2026-08-31',
    balance: 0,
    ...over,
  })
  const plain = (over: Partial<ConsolidatedBsInput> = {}): ConsolidatedBsInput => ({
    businessId: 'biz',
    month: '2026-08',
    compare: 'mom',
    fiscalYearStart: 7,
    organisations: ORGS,
    rows: [],
    accounts: [],
    rates: [],
    rules: [],
    ...over,
  })

  it('restates the comparison column when the catalogue cannot place an account and Xero filed it differently at the two dates', () => {
    // An empty catalogue is the state a failed read leaves (accounts: null) or
    // an account created since the last sync. Placement then falls back to the
    // section Xero's report filed the row under, and that can differ between
    // the two months: the credit-card refiling this module was written around.
    // The line is still ONE account in one class, so July's asset 4,000 is a
    // liability of (4,000) — exactly as the single-org page restates it.
    const rows = [
      row({ balance_date: '2026-08-31', balance: 2010 }),
      row({ balance_date: '2026-07-31', balance: 1010 }),
      row({ account_id: 'a-2', account_code: '800', account_name: 'Amex', account_type: 'liability', balance_date: '2026-08-31', balance: 5000 }),
      row({ account_id: 'a-2', account_code: '800', account_name: 'Amex', account_type: 'asset', balance_date: '2026-07-31', balance: 4000 }),
    ]
    const data = sheet(buildConsolidatedBalanceSheet(plain({ organisations: [ORGS[0]], rows })))
    expect(printed(data, 'Amex', 'line_item')).toEqual(['5,000', '(4,000)'])
    expect(printed(data, 'Total Liability')).toEqual(['5,000', '(4,000)'])
    expect(printed(data, 'Net Assets')).toEqual(['(2,990)', '5,010'])
  })

  it('names the organisations it added, so one that drops out of the consolidation is visible', () => {
    // IICT Group is three organisations in the client's Calxa pack; IICT Group
    // Pty Ltd is not an active connection today, and the loader reads only
    // active ones. A sheet that quietly added two printed Net Assets 646,151
    // short, balanced, with nothing to say which organisations were in it.
    const three = sheet(buildConsolidatedBalanceSheet(input(iict, 'mom')))
    expect(three.consolidation?.notes[0]).toBe(
      addedTogether('IICT (Aust) Pty Ltd', 'IICT Group Limited (HKD)', 'IICT Group Pty Ltd'),
    )
    const two = sheet(
      buildConsolidatedBalanceSheet(
        input(iict, 'mom', {
          organisations: iict.connections
            .filter((c) => c.tenant_id !== IGP)
            .map((c) => ({ tenant_id: c.tenant_id, name: c.name, functional_currency: c.functional_currency })),
        }),
      ),
    )
    expect(two.consolidation?.notes[0]).toBe(addedTogether('IICT (Aust) Pty Ltd', 'IICT Group Limited (HKD)'))
    expect(printed(two, 'Net Assets')[0]).toBe('492,104')
  })

  it('says the sheet is gross of intercompany when no elimination rule is set — the state a group ships in', () => {
    // IICT's Total Asset and Total Liability each carry ~2.2m of intercompany
    // loan until a coach writes the rules. Net Assets is right either way; the
    // two class totals the page labels as the group's are not, and the only
    // disclosure this page had — the "Not eliminated" warning — needed a rule
    // to already exist.
    const data = sheet(buildConsolidatedBalanceSheet(input(iict, 'yoy')))
    expect(printed(data, 'Total Asset')[0]).toBe('3,272,789')
    expect(data.consolidation?.notes).toContain(GROSS_NO_RULES)
  })

  it('says so too when rules are set but none of them eliminated anything', () => {
    const loan = rule({ tenant_a_id: IGL, entity_a_account_code: '730', tenant_b_id: IAP, entity_b_account_code: '625' })
    const data = sheet(buildConsolidatedBalanceSheet(input(iict, 'mom', { rules: [loan] })))
    expect(data.consolidation?.warnings[0]).toMatch(/^Not eliminated:/)
    expect(data.consolidation?.notes).toContain(GROSS_NOT_ELIMINATED)
    expect(data.consolidation?.notes).not.toContain(GROSS_NO_RULES)
  })

  it('says none of it for one organisation on its own — there is no intercompany to disclose', () => {
    const data = sheet(buildConsolidatedBalanceSheet(plain({ organisations: [ORGS[0]], rows: [row({ balance: 10 })] })))
    expect(data.consolidation?.notes).toEqual([addedTogether('One Pty Ltd')])
  })
})

describe('an elimination may not move Net Assets past the sheet’s own proof', () => {
  const EIGHT = '2026-08-31'
  /** Easy Hail's loan payable `gap` higher and its own equity `gap` lower, so its own sheet still balances. */
  const withGap = (gap: number) =>
    dragon.rows.map((r) =>
      r.tenant_id === EHC && r.balance_date === EIGHT && r.account_code === '906'
        ? { ...r, balance: Number(r.balance) + gap }
        : r.tenant_id === EHC && r.balance_date === EIGHT && r.account_type === 'equity' && r.account_name === 'Retained Earnings'
          ? { ...r, balance: Number(r.balance) - gap }
          : r,
    )

  it('does not eliminate a pair 50c apart: it would move Net Assets off Total Equity with no word said', () => {
    // $1 was 20x the $0.05 the sheet proves itself to. A 50c pair came off, Net
    // Assets moved 50c against a Total Equity that did not, the page then
    // raised two alarming banners about a residual the page itself had made,
    // and consolidation.warnings was empty.
    const data = sheet(buildConsolidatedBalanceSheet(input(dragon, 'mom', { rows: withGap(0.5), rules: [rule({})] })))
    expect(printed(data, 'Total Asset')[0]).toBe('2,050,535')
    expect(data.balances).toBe(true)
    expect(data.consolidation?.notes.some((n) => n.startsWith('Eliminated'))).toBe(false)
    // Whole dollars are the page's convention, but they would print this 50c as
    // "1 apart" — so a gap inside a dollar says its cents.
    expect(data.consolidation?.warnings).toEqual([
      'Not eliminated: Loan Receivable - Easy Hail Claim Pty Ltd (Dragon Roofing Pty Ltd) and Loan Payable - Dragon Roofing Pty Ltd ' +
        '(EASY HAIL CLAIM PTY LTD) are 0.50 apart at Aug 2026, so both are shown in full. ' +
        'Reconcile the loan in Xero and it will be eliminated.',
    ])
  })

  it('still eliminates a pair inside that proof, and the sheet still balances', () => {
    const data = sheet(buildConsolidatedBalanceSheet(input(dragon, 'mom', { rows: withGap(0.04), rules: [rule({})] })))
    expect(printed(data, 'Total Asset')[0]).toBe('1,562,415')
    expect(data.balances).toBe(true)
    expect(data.consolidation?.warnings).toEqual([])
  })
})

describe('the dates it reads', () => {
  it('reads the opening of each column’s financial year and every month-end since, for a foreign organisation', () => {
    expect(consolidatedBalanceSheetDates('2026-08', 'mom', 7)).toEqual({
      current: '2026-08-31',
      prior: '2026-07-31',
      foreign: ['2026-06-30', '2026-07-31', '2026-08-31'],
    })
    expect(consolidatedBalanceSheetDates('2026-08', 'yoy', 7).foreign).toEqual([
      '2025-06-30', '2025-07-31', '2025-08-31', '2026-06-30', '2026-07-31', '2026-08-31',
    ])
    // A July report compared with June: June closes the previous year, whose
    // walk starts a year earlier.
    expect(consolidatedBalanceSheetDates('2026-07', 'mom', 7).foreign[0]).toBe('2025-06-30')
  })
})
