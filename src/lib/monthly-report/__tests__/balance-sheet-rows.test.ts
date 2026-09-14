/**
 * The Balance Sheet page's rows — Calxa pages 19-21 of Urban Road Pty Ltd's
 * August 2026 pack.
 *
 * The fixture is Urban Road's own sheet at the three month-ends the pack
 * compares (31 Aug 2026, 31 Jul 2026, 31 Aug 2025), taken from the synced
 * xero_bs_lines mirror and laid out by hand in the shape Reports/BalanceSheet
 * returns for ONE date: Xero's section tree, an untitled Section around each
 * grand total and around Net Assets, rows in name order, Current Year Earnings
 * first — plus the tenant's xero_accounts codes and Classes. Laid out, not
 * captured — the mirror is synced with standardLayout=false and the route asks
 * with standardLayout=true, so the group titles and where the credit cards sit
 * are modelled on the JDS capture (which files Mastercard Aeris under Current
 * Liabilities), not observed. Where the page puts a card does not depend on it:
 * the Class does.
 *
 * The page is Calxa's flat sheet (decisions 16 and 17): Asset, Liability, Net
 * Assets, Equity, no Xero groups, credit cards as negative assets. Calxa's own
 * pp19-20 split nine accounts into "New unmapped Asset/Liability" blocks, which
 * are deliberately NOT reproduced — so its Total Asset is compared here as
 * "Asset + New unmapped Asset", and so on.
 *
 * The mirror ties Calxa's July 2026 and August 2025 columns to the dollar.
 * August 2026 differs from Calxa by one late credit ($853.89 ex GST) posted
 * after Calxa ran, so assertions on that column use Xero's figure.
 */
import { describe, it, expect } from 'vitest'
import fixture from './fixtures/urban-road-bs-aug-2026.json'
import jdsApr from '@/__tests__/xero/fixtures/jds-bs-2026-04-30.json'
import jdsMar from '@/__tests__/xero/fixtures/jds-bs-2026-03-31.json'
import {
  buildBalanceSheetData,
  balanceSheetDates,
  balanceSheetColumnLabel,
  balanceSheetVariance,
  bsAmountText,
  bsPercentText,
  type BsAccount,
  type XeroBalanceSheetReport,
} from '../balance-sheet-rows'
import { balanceSheetClassTotals, assessBalanceSheetForPdf } from '@/app/finances/monthly-report/utils/balance-sheet-pdf'
import type { BalanceSheetRow } from '@/app/finances/monthly-report/types'

const report = (date: string) =>
  (fixture.reports as Record<string, { Reports: XeroBalanceSheetReport[] }>)[date].Reports[0]
const classes = fixture.classes as Record<string, string | null>
const accounts = new Map<string, BsAccount>(
  Object.entries(fixture.codes as Record<string, string | null>).map(([id, code]) => [id, { code, xeroClass: classes[id] ?? null }]),
)

function build(compare: 'mom' | 'yoy', opts: { catalogue?: boolean } = {}) {
  const { current, prior } = balanceSheetDates('2026-08', compare)
  return buildBalanceSheetData({
    businessId: '28d41193-38ae-4071-a2b1-0dbea90a38fd',
    compare,
    currentDate: current,
    priorDate: prior,
    current: report(current),
    prior: report(prior),
    accounts: opts.catalogue === false ? null : accounts,
  })
}

const find = (rows: BalanceSheetRow[], label: string) => {
  const r = rows.find((x) => x.label === label)
  if (!r) throw new Error(`no row ${label}`)
  return r
}
const labels = (rows: BalanceSheetRow[]) => rows.map((r) => r.label)
/** The lines between two labels. */
const between = (rows: BalanceSheetRow[], from: string, to: string) => {
  const l = labels(rows)
  return l.slice(l.indexOf(from) + 1, l.indexOf(to))
}
/** The label as Calxa prints the figure: whole dollars. */
const whole = (v: number | null) => (v === null ? null : Math.round(v))

describe('balanceSheetDates — both columns on true month-ends', () => {
  it('August compares against 31 July and 31 August last year', () => {
    expect(balanceSheetDates('2026-08', 'mom')).toEqual({ current: '2026-08-31', prior: '2026-07-31' })
    expect(balanceSheetDates('2026-08', 'yoy')).toEqual({ current: '2026-08-31', prior: '2025-08-31' })
  })

  it('a 30-day month compares against 31 August, not "30 August"', () => {
    // Xero's periods=1&timeframe=MONTH comparative walks back by day-of-month.
    expect(balanceSheetDates('2026-09', 'mom')).toEqual({ current: '2026-09-30', prior: '2026-08-31' })
  })

  it('March compares against the end of February, leap years included', () => {
    expect(balanceSheetDates('2028-03', 'mom').prior).toBe('2028-02-29')
    expect(balanceSheetDates('2028-02', 'yoy')).toEqual({ current: '2028-02-29', prior: '2027-02-28' })
  })

  it('January compares against December of the year before', () => {
    expect(balanceSheetDates('2027-01', 'mom').prior).toBe('2026-12-31')
  })

  it('labels a column the way Calxa heads it', () => {
    expect(balanceSheetColumnLabel('2026-09-30')).toBe('Sep 2026')
  })
})

describe('balanceSheetVariance — favourable is positive', () => {
  it('a liability that fell is a positive variance (Trade Creditors, Calxa p19 "102,568 21%")', () => {
    const v = balanceSheetVariance('liability', 380_205.08, 482_773.53)
    expect(whole(v.variance)).toBe(102_568)
    expect(Math.round(v.variance_pct!)).toBe(21)
  })

  it('a liability that rose is negative (ATO Creditors (BAS), Calxa p19 "(50,023) (127%)")', () => {
    const v = balanceSheetVariance('liability', 10_741, -39_282)
    expect(v.variance).toBe(-50_023)
    expect(Math.round(v.variance_pct!)).toBe(-127)
  })

  it('a liability from nil has a variance and no percentage (Superannuation Payable, "(1,260) N/A")', () => {
    const v = balanceSheetVariance('liability', 1_260.47, 0)
    expect(whole(v.variance)).toBe(-1_260)
    expect(v.variance_pct).toBeNull()
  })

  it('Rounding (1.93) → (1.86) prints "(4%)" — only prior − current gives that sign', () => {
    const v = balanceSheetVariance('liability', -1.86, -1.93)
    expect(Math.round(v.variance_pct!)).toBe(-4)
  })

  it('assets, equity and Net Assets keep current − prior (Trade Debtors "149,274 115%" at Calxa\'s figure)', () => {
    const v = balanceSheetVariance('asset', 279_527.34, 130_253.03)
    expect(whole(v.variance)).toBe(149_274)
    expect(Math.round(v.variance_pct!)).toBe(115)
    expect(balanceSheetVariance(null, 425_242.16, 292_540.9).variance).toBeCloseTo(132_701.26, 2)
  })
})


describe('buildBalanceSheetData — Urban Road, August 2026 vs July 2026 (Calxa p19)', () => {
  const bs = build('mom')

  it('heads the columns with the two month-ends', () => {
    expect(bs.current_label).toBe('Aug 2026')
    expect(bs.prior_label).toBe('Jul 2026')
    expect(bs.report_date).toBe('2026-08-31')
  })

  it('is flat: three classes and four totals, none of Xero\'s groups, all at one depth', () => {
    const structure = bs.rows.filter((r) => r.type !== 'line_item').map((r) => [r.type, r.label])
    expect(structure).toEqual([
      ['section_header', 'Asset'],
      ['subtotal', 'Total Asset'],
      ['section_header', 'Liability'],
      ['subtotal', 'Total Liability'],
      ['net_assets', 'Net Assets'],
      ['section_header', 'Equity'],
      ['subtotal', 'Total Equity'],
    ])
    for (const gone of ['Bank', 'Total Bank', 'Current Assets', 'Fixed Assets', 'Current Liabilities', 'Non-Current Liabilities']) {
      expect(labels(bs.rows)).not.toContain(gone)
    }
    expect(bs.rows.every((r) => (r.depth ?? 0) === 0)).toBe(true)
    expect(bs.rows.filter((r) => r.label === '')).toEqual([])
  })

  it('puts the Amex card on the asset side as a negative, as Calxa does — "(64,332) (65,919) 1,586 2%"', () => {
    const amex = find(bs.rows, 'American Express® Platinum Business Card')
    expect(between(bs.rows, 'Asset', 'Total Asset')).toContain(amex.label)
    expect(between(bs.rows, 'Liability', 'Total Liability')).not.toContain(amex.label)
    expect(amex).toMatchObject({ current: -64_332.13, prior: -65_918.57 })
    expect(bsAmountText(amex.current)).toBe('(64,332)')
    expect(bsAmountText(amex.prior)).toBe('(65,919)')
    expect(bsAmountText(amex.variance)).toBe('1,586')
    expect(bsPercentText(amex.variance_pct)).toBe('2%')
  })

  it('adds every total from its accounts, and the sheet balances: Total Asset − Total Liability = Net Assets = Total Equity', () => {
    // Xero's report: 710,867.14 − 285,624.98. The card's 64,332.13 comes off both.
    expect(find(bs.rows, 'Total Asset').current).toBeCloseTo(646_535.01, 2)
    expect(find(bs.rows, 'Total Liability').current).toBeCloseTo(221_292.85, 2)
    expect(find(bs.rows, 'Net Assets').current).toBeCloseTo(425_242.16, 2)
    expect(find(bs.rows, 'Total Equity').current).toBeCloseTo(425_242.16, 2)
    // July: Calxa's Asset 473,133 + New unmapped Asset 86,171, to within its
    // own rounding of the two blocks; Liability 163,597 + 103,165 likewise.
    expect(find(bs.rows, 'Total Asset').prior).toBeCloseTo(559_303.41, 2)
    expect(find(bs.rows, 'Total Liability').prior).toBeCloseTo(266_762.51, 2)
    expect(find(bs.rows, 'Net Assets').prior).toBeCloseTo(292_540.9, 2)
    expect(find(bs.rows, 'Total Equity').prior).toBeCloseTo(292_540.9, 2)
    expect(bs.balances).toBe(true)
  })

  it('the class totals the equation check reads are the page\'s own, and they close', () => {
    const t = balanceSheetClassTotals(bs.rows)
    expect(t.assets! - (t.liabilities! + t.equity!)).toBeCloseTo(0, 2)
    expect(assessBalanceSheetForPdf({ data: bs }, 'mom')).toMatchObject({ ok: true, warnings: [] })
  })

  it('flips every liability variance, the total included, and leaves assets alone', () => {
    const tc = find(bs.rows, 'Trade Creditors')
    expect(whole(tc.variance)).toBe(102_568)
    expect(Math.round(tc.variance_pct!)).toBe(21)
    const ato = find(bs.rows, 'ATO Creditors (BAS)')
    expect(whole(ato.variance)).toBe(-50_023)
    expect(Math.round(ato.variance_pct!)).toBe(-127)
    expect(find(bs.rows, 'Superannuation Payable').variance_pct).toBeNull()
    expect(Math.round(find(bs.rows, 'Rounding').variance_pct!)).toBe(-4)
    expect(whole(find(bs.rows, 'Shopify loan 2 $100000').variance)).toBe(8_154)
    // 266,762.51 → 221,292.85: a 45,469.66 fall, favourable.
    expect(find(bs.rows, 'Total Liability').variance).toBeCloseTo(45_469.66, 2)
    const cba = find(bs.rows, 'CBA Cheque Account')
    expect(whole(cba.variance)).toBe(-40_708)
    expect(Math.round(cba.variance_pct!)).toBe(-68)
  })

  it('Equity reads up: Current Earnings 14,067 → 146,769 is a positive 943%', () => {
    const ce = find(bs.rows, 'Current Earnings')
    expect(whole(ce.prior)).toBe(14_067)
    expect(whole(ce.variance)).toBe(132_701)
    expect(Math.round(ce.variance_pct!)).toBe(943)
  })

  it('orders each class by account code as a string, codeless last, Current Earnings closing Equity', () => {
    expect(between(bs.rows, 'Asset', 'Total Asset')).toEqual([
      'CBA Cheque Account', 'Urban Road Tax Savings acct', 'Trade Debtors', 'Stock on Hand (Zoho)',
      'Patent & Trademarks', 'Rental Bond', 'Loan - Urban Rd Commercial',
      'Leasehold Fixture & Fitting - Cost', "Leasehold Fixture & Fitting - Dep'n",
      'Furniture & Equipment - Cost', "Furniture & Equipment - Dep'n",
      'Plant & Equipment - Cost', "Plant & Equipment - Dep'n",
      'Formation Costs - at cost', 'Borrowing Costs',
      'IT costs - software migration', 'Accumulated amortisation inhouse software',
      // Codeless, by name — the card among them.
      'American Express® Platinum Business Card', 'AUD PayPal#001', 'Bus Online Saver', 'Wise account',
    ])
    const liab = between(bs.rows, 'Liability', 'Total Liability')
    expect(liab.slice(0, 4)).toEqual(['Trade Creditors', 'ATO Creditors (BAS)', 'GST Collected & Paid', 'GST adjustments'])
    // "860" sorts after "23005" as a string — Calxa prints Rounding last.
    expect(liab.at(-1)).toBe('Rounding')
    expect(between(bs.rows, 'Equity', 'Total Equity')).toEqual([
      'Issued Ordinary Shares', 'Issued "J" Class Shares', 'Issued "K" Class Shares', 'Retained Earnings', 'Current Earnings',
    ])
  })

  it('hides accounts that round to nil in both columns, and keeps them in the totals', () => {
    for (const hidden of [
      'USD PayPal #001', 'CBA Foreign Currency Account', 'Suzie Credit Card', 'Shopify Loan',
      'Non resident W/holding payable', 'Retained Earnings b/f', 'Amex Business Card',
    ]) {
      expect(labels(bs.rows)).not.toContain(hidden)
    }
    // Retained Earnings b/f is 2c: still inside Total Equity, which is why it
    // is 425,242.16 and not 425,242.14.
    expect(find(bs.rows, 'Total Equity').current).toBeCloseTo(425_242.16, 2)
  })

  it('without the catalogue: Xero\'s order and Xero\'s placement, and still the same Net Assets', () => {
    const plain = build('mom', { catalogue: false })
    // The card stays where the report filed it, as a liability.
    expect(between(plain.rows, 'Liability', 'Total Liability')).toContain('American Express® Platinum Business Card')
    expect(find(plain.rows, 'American Express® Platinum Business Card').current).toBe(64_332.13)
    expect(find(plain.rows, 'Total Asset').current).toBeCloseTo(710_867.14, 2)
    expect(find(plain.rows, 'Total Liability').current).toBeCloseTo(285_624.98, 2)
    expect(find(plain.rows, 'Net Assets').current).toBeCloseTo(425_242.16, 2)
    expect(plain.balances).toBe(true)
    const equity = between(plain.rows, 'Equity', 'Total Equity')
    expect(equity[0]).toBe('Issued "J" Class Shares')
    expect(equity.at(-1)).toBe('Current Earnings')
  })
})

describe('buildBalanceSheetData — Urban Road, August 2026 vs August 2025 (Calxa pp20-21)', () => {
  const bs = build('yoy')

  it('Suzie Credit Card is a negative asset too, rounded as Calxa rounds it — "0 (12,841)"', () => {
    const suzie = find(bs.rows, 'Suzie Credit Card')
    expect(between(bs.rows, 'Asset', 'Total Asset')).toContain('Suzie Credit Card')
    expect(suzie).toMatchObject({ current: 0, prior: -12_840.5 })
    expect(bsAmountText(suzie.current)).toBe('0')
    expect(bsAmountText(suzie.prior)).toBe('(12,841)')
    // Coded 21110, so after the 19xxx assets and before the codeless accounts.
    const assets = between(bs.rows, 'Asset', 'Total Asset')
    expect(assets.indexOf('Suzie Credit Card')).toBe(assets.indexOf('Accumulated amortisation inhouse software') + 1)
  })

  it('ties the August 2025 totals to Calxa\'s blocks to the dollar, and balances', () => {
    // Calxa p20: Asset 559,589 + New unmapped Asset 113,579 = 673,168;
    // Liability 467,962 + New unmapped Liability 114,158 = 582,120.
    expect(bsAmountText(find(bs.rows, 'Total Asset').prior)).toBe('673,168')
    expect(bsAmountText(find(bs.rows, 'Total Liability').prior)).toBe('582,120')
    // Xero: Net Assets 91,047.72 over Total Equity 91,047.73 — a rounding
    // cent, inside the $0.05 BS materiality. Calxa printed 91,627 for Net
    // Assets, which leaves its unmapped blocks out.
    expect(bsAmountText(find(bs.rows, 'Net Assets').prior)).toBe('91,048')
    expect(bsAmountText(find(bs.rows, 'Total Equity').prior)).toBe('91,048')
    expect(bs.balances).toBe(true)
  })

  it('an account Xero omits at the prior date prints 0 and a real variance (Calxa p20)', () => {
    const s2 = find(bs.rows, 'Shopify loan 2 $100000')
    expect(s2.prior).toBe(0)
    expect(whole(s2.variance)).toBe(-89_418)
    expect(s2.variance_pct).toBeNull()
    const lat = find(bs.rows, 'Latitude Gem Visa')
    expect(lat.prior).toBe(0)
    expect(whole(lat.variance)).toBe(3_910)
  })

  it('an account closed during the year keeps its prior balance, in its class', () => {
    const s1 = find(bs.rows, 'Shopify Loan')
    expect(s1.current).toBe(0)
    expect(whole(s1.prior)).toBe(105_826)
    expect(Math.round(s1.variance_pct!)).toBe(100)
    expect(between(bs.rows, 'Liability', 'Total Liability')).toContain('Non resident W/holding payable')
    const usd = find(bs.rows, 'USD PayPal #001')
    expect(whole(usd.variance)).toBe(-755)
    expect(Math.round(usd.variance_pct!)).toBe(-100)
  })

  it('ties the August 2025 accounts to Calxa to the dollar', () => {
    expect(whole(find(bs.rows, 'Trade Debtors').prior)).toBe(245_637)
    expect(whole(find(bs.rows, 'Retained Earnings').prior)).toBe(295_233)
    expect(whole(find(bs.rows, 'Current Earnings').prior)).toBe(-204_388)
    const rounding = find(bs.rows, 'Rounding')
    expect(whole(rounding.variance)).toBe(2)
    expect(Math.round(rounding.variance_pct!)).toBe(4750)
    expect(Math.round(find(bs.rows, 'Current Earnings').variance_pct!)).toBe(172)
  })

  it('still hides a nil account that has a nil prior (Rental Bond Unit 11, Retained Earnings b/f)', () => {
    expect(labels(bs.rows)).not.toContain('Rental Bond Unit 11')
    expect(labels(bs.rows)).not.toContain('Retained Earnings b/f')
  })
})

describe('buildBalanceSheetData — a report exactly as Xero sent it (Just Digital Signage)', () => {
  // The captured JSON, not a hand-built shape: Net Assets inside an untitled
  // Section, and a credit card (Mastercard Aeris, Class ASSET) filed under
  // Current Liabilities. Only the first value column is read.
  const jds = (catalogue: Map<string, BsAccount> | null) =>
    buildBalanceSheetData({
      businessId: 'b', compare: 'mom', currentDate: '2026-04-30', priorDate: '2026-03-31',
      current: jdsApr.response.Reports[0] as XeroBalanceSheetReport,
      prior: jdsMar.response.Reports[0] as XeroBalanceSheetReport,
      accounts: catalogue,
    })

  it('adds up to Xero\'s own Net Assets, and a rounding cent is not an unbalanced sheet', () => {
    const bs = jds(null)
    expect(bs.rows.filter((r) => r.type === 'net_assets')).toHaveLength(1)
    expect(find(bs.rows, 'Net Assets').current).toBeCloseTo(662_903.57, 2)
    expect(find(bs.rows, 'Net Assets').prior).toBeCloseTo(237_409.92, 2)
    // Xero prints Current Year Earnings 662,903.58 under Net Assets 662,903.57.
    expect(find(bs.rows, 'Total Equity').current).toBeCloseTo(662_903.58, 2)
    expect(bs.balances).toBe(true)
    expect(bs.prior_label).toBe('Mar 2026')
  })

  it('with the catalogue, the card moves to the asset side and Net Assets does not move', () => {
    const bs = jds(new Map([['df7e5fda-6c21-44e3-ba48-6ab077831a71', { code: '800', xeroClass: 'ASSET' }]]))
    expect(between(bs.rows, 'Asset', 'Total Asset')).toContain('Mastercard Aeris')
    expect(find(bs.rows, 'Mastercard Aeris').current).toBe(-248.08)
    expect(find(bs.rows, 'Total Asset').current).toBeCloseTo(1_574_750.74 - 248.08, 2)
    expect(find(bs.rows, 'Total Liability').current).toBeCloseTo(911_847.17 - 248.08, 2)
    expect(find(bs.rows, 'Net Assets').current).toBeCloseTo(662_903.57, 2)
    expect(bs.balances).toBe(true)
  })
})

describe('bsAmountText / bsPercentText — as Calxa prints them', () => {
  it('rounds before choosing brackets, so 7c of Rounding movement is "0", not a red "(0)"', () => {
    expect(bsAmountText(-0.07)).toBe('0')
    expect(bsAmountText(-1.86)).toBe('(2)')
    expect(bsAmountText(-456_782.16)).toBe('(456,782)')
    expect(bsAmountText(102_568.45)).toBe('102,568')
    expect(bsAmountText(null)).toBe('—')
  })

  it('rounds a half away from zero: PrinTribe Loan (55,019.50) is Calxa\'s "(55,020)"', () => {
    expect(bsAmountText(-55_019.5)).toBe('(55,020)')
    expect(bsAmountText(12_840.5)).toBe('12,841')
    expect(bsAmountText(-0.5)).toBe('(1)')
    expect(bsAmountText(-0.49)).toBe('0')
  })

  it('whole percents, brackets when negative, N/A with no prior', () => {
    expect(bsPercentText(-3.6)).toBe('(4%)')
    expect(bsPercentText(4750)).toBe('4750%')
    expect(bsPercentText(-0.3)).toBe('0%')
    expect(bsPercentText(-2.5)).toBe('(3%)')
    expect(bsPercentText(null)).toBe('N/A')
  })
})

describe('buildBalanceSheetData — what a missing column means', () => {
  it('an empty prior report leaves the prior column null, so the page can say there is nothing to compare', () => {
    const bs = buildBalanceSheetData({
      businessId: 'b',
      compare: 'yoy',
      currentDate: '2026-08-31',
      priorDate: '2025-08-31',
      current: report('2026-08-31'),
      prior: { Rows: [] },
      accounts,
    })
    expect(bs.rows.length).toBeGreaterThan(0)
    expect(bs.rows.every((r) => r.prior === null)).toBe(true)
  })

  it('a prior report of only headings and nil totals is empty too', () => {
    // A first-year client's "same month last year". Nobody has seen what Xero
    // returns for a date before an org's first transaction, but it is a
    // Report, and a Report carries its Sections and SummaryRows: zero-filled,
    // it would claim every balance WAS nil, and the page's "no Aug 2025
    // figures to compare against" card could never print.
    const skeleton: XeroBalanceSheetReport = {
      Rows: [
        { RowType: 'Header', Cells: [{ Value: '' }, { Value: '31 Aug 2025' }] },
        { RowType: 'Section', Title: 'Assets', Rows: [] },
        { RowType: 'Section', Title: 'Bank', Rows: [{ RowType: 'SummaryRow', Cells: [{ Value: 'Total Bank' }, { Value: '0.00' }] }] },
        { RowType: 'Section', Title: '', Rows: [{ RowType: 'SummaryRow', Cells: [{ Value: 'Total Assets' }, { Value: '0.00' }] }] },
        { RowType: 'Section', Title: 'Liabilities', Rows: [] },
        { RowType: 'Section', Title: '', Rows: [{ RowType: 'SummaryRow', Cells: [{ Value: 'Total Liabilities' }, { Value: '0.00' }] }] },
        { RowType: 'Section', Title: '', Rows: [{ RowType: 'Row', Cells: [{ Value: 'Net Assets' }, { Value: '0.00' }] }] },
        { RowType: 'Section', Title: 'Equity', Rows: [
          { RowType: 'Row', Cells: [{ Value: 'Current Year Earnings', Attributes: [{ Id: 'account', Value: 'abababab-abab-abab-abab-abababababab' }] }, { Value: '0.00' }] },
          { RowType: 'SummaryRow', Cells: [{ Value: 'Total Equity' }, { Value: '0.00' }] },
        ] },
      ],
    }
    const bs = buildBalanceSheetData({
      businessId: 'b', compare: 'yoy', currentDate: '2026-08-31', priorDate: '2025-08-31',
      current: report('2026-08-31'), prior: skeleton, accounts,
    })
    expect(bs.rows.length).toBeGreaterThan(0)
    expect(bs.rows.every((r) => r.prior === null)).toBe(true)
    expect(assessBalanceSheetForPdf({ data: bs }, 'yoy')).toEqual({
      ok: false,
      reason: 'there are no Aug 2025 figures in Xero to compare against',
    })
  })

  it('an empty CURRENT report is no sheet at all, not three classes of dashes', () => {
    const bs = buildBalanceSheetData({
      businessId: 'b', compare: 'mom', currentDate: '2026-08-31', priorDate: '2026-07-31',
      current: { Rows: [] }, prior: report('2026-07-31'), accounts,
    })
    expect(bs.rows).toEqual([])
    expect(assessBalanceSheetForPdf({ data: bs }, 'mom')).toEqual({
      ok: false,
      reason: 'Xero returned no balance sheet rows for this month',
    })
  })

  it('a prior report whose only figure is one real balance is NOT empty', () => {
    const one: XeroBalanceSheetReport = {
      Rows: [
        { RowType: 'Section', Title: 'Assets', Rows: [] },
        { RowType: 'Section', Title: 'Bank', Rows: [
          { RowType: 'Row', Cells: [{ Value: 'CBA Cheque Account', Attributes: [{ Id: 'account', Value: 'x' }] }, { Value: '12.00' }] },
          { RowType: 'SummaryRow', Cells: [{ Value: 'Total Bank' }, { Value: '12.00' }] },
        ] },
      ],
    }
    const bs = buildBalanceSheetData({
      businessId: 'b', compare: 'yoy', currentDate: '2026-08-31', priorDate: '2025-08-31',
      current: report('2026-08-31'), prior: one, accounts,
    })
    expect(find(bs.rows, 'Trade Debtors').prior).toBe(0)
  })
})

describe('buildBalanceSheetData — placing an account in its class', () => {
  const sheet = (rows: XeroReportRowLike[]): XeroBalanceSheetReport => ({ Rows: rows })
  type XeroReportRowLike = NonNullable<XeroBalanceSheetReport['Rows']>[number]
  const line = (label: string, id: string, v: string): XeroReportRowLike =>
    ({ RowType: 'Row', Cells: [{ Value: label, Attributes: [{ Id: 'account', Value: id }] }, { Value: v }] })

  it('a class with nothing in it still closes, at 0, and a nil account is hidden', () => {
    const current = sheet([
      { RowType: 'Section', Title: 'Assets', Rows: [] },
      { RowType: 'Section', Title: 'Bank', Rows: [line('Old account', 'a1', '0.00')] },
      { RowType: 'Section', Title: 'Current Assets', Rows: [line('Debtors', 'a2', '10.00')] },
      { RowType: 'Section', Title: 'Equity', Rows: [line('Retained', 'e1', '10.00')] },
    ])
    const bs = buildBalanceSheetData({
      businessId: 'b', compare: 'mom', currentDate: '2026-08-31', priorDate: '2026-07-31',
      current, prior: current, accounts: new Map(),
    })
    expect(labels(bs.rows)).toEqual([
      'Asset', 'Debtors', 'Total Asset', 'Liability', 'Total Liability', 'Net Assets', 'Equity', 'Retained', 'Total Equity',
    ])
    expect(find(bs.rows, 'Total Liability')).toMatchObject({ current: 0, prior: 0 })
    expect(find(bs.rows, 'Net Assets').current).toBe(10)
    expect(bs.balances).toBe(true)
  })

  it('an equity reserve with "Asset" in its name keeps equity signs', () => {
    const r = (v: string) => sheet([
      { RowType: 'Section', Title: 'Liabilities', Rows: [] },
      { RowType: 'Section', Title: 'Current Liabilities', Rows: [line('Creditors', 'l1', v)] },
      { RowType: 'Section', Title: 'Equity', Rows: [] },
      { RowType: 'Section', Title: 'Asset Revaluation Reserve', Rows: [line('Revaluation', 'e1', v)] },
    ])
    const bs = buildBalanceSheetData({
      businessId: 'b', compare: 'mom', currentDate: '2026-08-31', priorDate: '2026-07-31',
      current: r('150.00'), prior: r('100.00'), accounts: new Map(),
    })
    expect(find(bs.rows, 'Creditors').variance).toBe(-50)
    expect(find(bs.rows, 'Revaluation').variance).toBe(50)
    expect(between(bs.rows, 'Equity', 'Total Equity')).toEqual(['Revaluation'])
  })

  it('moving between liability and equity keeps the sign; only the asset side flips', () => {
    const r = sheet([
      { RowType: 'Section', Title: 'Assets', Rows: [] },
      { RowType: 'Section', Title: 'Bank', Rows: [line('Cheque', 'a1', '500.00')] },
      { RowType: 'Section', Title: 'Liabilities', Rows: [] },
      { RowType: 'Section', Title: 'Current Liabilities', Rows: [line('Visa', 'c1', '120.00')] },
      { RowType: 'Section', Title: '', Rows: [{ RowType: 'Row', Cells: [{ Value: 'Net Assets' }, { Value: '380.00' }] }] },
      { RowType: 'Section', Title: 'Equity', Rows: [line('Owner Funds', 'e1', '300.00'), line('Retained', 'e2', '80.00')] },
    ])
    const bs = buildBalanceSheetData({
      businessId: 'b', compare: 'mom', currentDate: '2026-08-31', priorDate: '2026-07-31',
      current: r, prior: r,
      accounts: new Map([
        ['c1', { code: null, xeroClass: 'ASSET' }],
        ['e1', { code: null, xeroClass: 'LIABILITY' }],
      ]),
    })
    expect(find(bs.rows, 'Visa').current).toBe(-120)
    expect(find(bs.rows, 'Owner Funds').current).toBe(300)
    expect(between(bs.rows, 'Liability', 'Total Liability')).toEqual(['Owner Funds'])
    expect(find(bs.rows, 'Total Asset').current).toBe(380)
    expect(find(bs.rows, 'Total Liability').current).toBe(300)
    expect(find(bs.rows, 'Net Assets').current).toBe(80)
    expect(find(bs.rows, 'Total Equity').current).toBe(80)
    // Xero printed Net Assets 380; this page says 80, because an account
    // moved from equity to liability. That is a different grouping, not a
    // sheet out of balance — the proof is the page's own equation.
    expect(bs.balances).toBe(true)
  })

  it('an account no class can be found for is left off the page and fails the proof, rather than silently out of the totals', () => {
    const r = sheet([
      { RowType: 'Section', Title: 'Suspense', Rows: [line('Mystery', 'x1', '75.00')] },
      { RowType: 'Section', Title: 'Assets', Rows: [] },
      { RowType: 'Section', Title: 'Bank', Rows: [line('Cheque', 'a1', '100.00')] },
      { RowType: 'Section', Title: 'Equity', Rows: [line('Retained', 'e1', '100.00')] },
    ])
    const bs = buildBalanceSheetData({
      businessId: 'b', compare: 'mom', currentDate: '2026-08-31', priorDate: '2026-07-31',
      current: r, prior: r, accounts: null,
    })
    expect(labels(bs.rows)).not.toContain('Mystery')
    expect(bs.balances).toBe(false)
  })

  it('a Net Assets that disagrees with the equity total is reported, not assumed away', () => {
    const r = sheet([
      { RowType: 'Section', Title: '', Rows: [{ RowType: 'Row', Cells: [{ Value: 'Net Assets' }, { Value: '100.00' }] }] },
      { RowType: 'Section', Title: 'Equity', Rows: [
        line('Retained', 'e1', '99.87'),
        { RowType: 'SummaryRow', Cells: [{ Value: 'Total Equity' }, { Value: '99.87' }] },
      ] },
    ])
    const bs = buildBalanceSheetData({
      businessId: 'b', compare: 'mom', currentDate: '2026-08-31', priorDate: '2026-07-31',
      current: r, prior: r, accounts: null,
    })
    expect(bs.balances).toBe(false)
  })
})
