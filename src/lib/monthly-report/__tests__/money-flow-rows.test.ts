/**
 * The Where Did Our Money Go? page's rows, on Urban Road's real August 2026
 * mirror with Calxa's two bank accounts — every figure the page prints, and
 * both last lines.
 */
import { describe, it, expect } from 'vitest'
import { deriveMoneyFlow } from '../money-flow'
import { moneyFlowRows, parseMoneyFlowConfig, type MoneyFlowConfig } from '../money-flow-rows'
import {
  AMEX_PLATINUM,
  BUS_ONLINE_SAVER,
  CBA_CHEQUE,
  URBAN_ROAD_BS_JUL_AUG_2026,
  URBAN_ROAD_PL_AUG_2026,
} from './fixtures/urban-road-money-flow-2026-08'

const flow = deriveMoneyFlow(URBAN_ROAD_BS_JUL_AUG_2026, '2026-08', {
  bankAccountIds: [CBA_CHEQUE, BUS_ONLINE_SAVER],
  plRows: URBAN_ROAD_PL_AUG_2026,
  creditCardAccountIds: [AMEX_PLATINUM],
})

/** Whole dollars, the way the page prints each row. */
const DEFAULT: MoneyFlowConfig = { last_line: 'reconciliation', summary_codes: 'plain', bank_rows: 'all' }
const CALXA: MoneyFlowConfig = { last_line: 'reconciliation', summary_codes: 'calxa', bank_rows: 'all' }

const printed = (rows: ReturnType<typeof moneyFlowRows>['rows']) =>
  rows.map((r) => (r.type === 'section' ? `# ${r.label}` : `${r.label} ${Math.round(r.movement)}`))

describe('parseMoneyFlowConfig', () => {
  it("defaults to the reconciliation, plain labels and every bank account; each asks for Calxa's by name", () => {
    expect(parseMoneyFlowConfig(undefined)).toEqual({ ok: true, config: DEFAULT })
    expect(parseMoneyFlowConfig(null)).toEqual({ ok: true, config: DEFAULT })
    expect(parseMoneyFlowConfig({ last_line: 'surplus', summary_codes: 'calxa', bank_rows: 'moved' }))
      .toEqual({ ok: true, config: { last_line: 'surplus', summary_codes: 'calxa', bank_rows: 'moved' } })
  })

  it('a typo is a reason for the page, never the default in disguise', () => {
    // No UI writes this config; it is typed by hand in SQL. 'Surplus' quietly
    // printing the reconciliation is a mistake nobody would ever see.
    for (const bad of [{ last_line: 'bogus' }, { last_line: 'Surplus' }, { lastLine: 'surplus' }, { summary_codes: 'numbers' }, { bank_rows: 'moving' }, { hide_zero_bank_rows: true }]) {
      const parsed = parseMoneyFlowConfig(bad)
      expect(parsed.ok).toBe(false)
    }
    const typo = parseMoneyFlowConfig({ lastLine: 'surplus' })
    expect(typo.ok === false && typo.reason).toContain('lastLine')
    const value = parseMoneyFlowConfig({ last_line: 'Surplus' })
    expect(value.ok === false && value.reason).toContain('last_line')
  })
})

describe('moneyFlowRows — Urban Road, August 2026', () => {
  it("prints Calxa's four sections, its totals and a last line that is the bank's movement", () => {
    const { rows, notes } = moneyFlowRows(flow, CALXA)
    expect(printed(rows)).toEqual([
      '# Summary Income and Expenditure',
      '400 · Income 527562',
      '500 · Cost of Sales 232737',
      '600 · Expense 162235',
      '800 · Other Income 111',
      'Surplus / Deficit 132701',
      '# Where Our Money Came From',
      'Urban Road Tax Savings acct 21000',
      'AUD PayPal#001 2935',
      'Stock on Hand (Zoho) 7030',
      'ATO Creditors (BAS) 50023',
      'GST Collected & Paid 28181',
      'Superannuation Payable 1260',
      'Total 110429',
      "# Where We've Spent Our Money",
      'American Express® Platinum Business Card 1586',
      'Wise account 142',
      'Trade Debtors 148175',
      'Trade Creditors 102568',
      'QLD Govt Loan 2935',
      'Forklift Loan 653',
      'SKA Family Trust Loan a/c 9453',
      'Shopify loan 2 $100000 8154',
      'Latitude Gem Visa 1171',
      'Total 274838',
      '# How this Affected Our Bank',
      'CBA Cheque Account -40708',
      'Bus Online Saver 9000',
      'Total -31708',
      'Net Movement -31708',
    ])
    // It ties, so there is nothing to say under the table.
    expect(notes).toEqual([])
  })

  it("'surplus' repeats the surplus as Calxa's p26 does", () => {
    const { rows } = moneyFlowRows(flow, { ...DEFAULT, last_line: 'surplus' })
    expect(rows[rows.length - 1]).toEqual({ type: 'last', label: 'Net Movement', movement: 132701.26 })
  })

  it('a P&L that disagrees with the balance sheet is said under the table, not absorbed', () => {
    // A snapshot of the P&L taken before the $853.80 credit note: Calxa's 133,555.
    const stale = { ...flow, summary: { ...flow.summary!, income: 528415.6, surplus: 133555.06 } }
    const { rows, notes } = moneyFlowRows(stale, DEFAULT)
    expect(rows[rows.length - 1]).toMatchObject({ movement: -30854.21 })
    expect(notes).toHaveLength(1)
    expect(notes[0]).toContain('misses the bank movement of (31,708) by 854')
  })

  it('with no P&L in the sync the surplus is the earnings movement, and the page says so', () => {
    const { rows, notes } = moneyFlowRows({ ...flow, summary: null }, DEFAULT)
    expect(printed(rows).slice(0, 2)).toEqual(['# Summary Income and Expenditure', 'Surplus / Deficit 132701'])
    expect(rows[rows.length - 1]).toMatchObject({ movement: -31708.01 })
    expect(notes[0]).toContain('not in the stored Xero sync')
  })

  it("prints plain labels unless the placement asks for Calxa's report-group numbers", () => {
    // 400/500/600/800 are Calxa's mapping. On a client who never used Calxa
    // (Envisage's April page printed '400 · Income') they mean nothing.
    const plain = printed(moneyFlowRows(flow, DEFAULT).rows).slice(1, 6)
    expect(plain).toEqual(['Income 527562', 'Cost of Sales 232737', 'Expense 162235', 'Other Income 111', 'Surplus / Deficit 132701'])
    const other = { ...flow, summary: { ...flow.summary!, other_expense: 1000 } }
    expect(printed(moneyFlowRows(other, DEFAULT).rows)).toContain('Other Expense 1000')
    expect(printed(moneyFlowRows(other, CALXA).rows)).toContain('900 · Other Expense 1000')
  })

  it('a chosen bank account that is not an asset is named, as a liability, in a note', () => {
    const f = deriveMoneyFlow(URBAN_ROAD_BS_JUL_AUG_2026, '2026-08', { bankAccountIds: [CBA_CHEQUE, BUS_ONLINE_SAVER, AMEX_PLATINUM], plRows: URBAN_ROAD_PL_AUG_2026 })
    expect(moneyFlowRows(f, DEFAULT).notes).toEqual([
      'American Express® Platinum Business Card is chosen as a bank account for this report, but it is a liability in this balance sheet, so it is not counted as bank.',
    ])
  })

  it('a chosen bank account the balance sheet does not hold is counted, and not called a non-asset', () => {
    const f = deriveMoneyFlow(URBAN_ROAD_BS_JUL_AUG_2026, '2026-08', { bankAccountIds: [CBA_CHEQUE, BUS_ONLINE_SAVER, 'a-closed-account'], plRows: URBAN_ROAD_PL_AUG_2026 })
    expect(moneyFlowRows(f, DEFAULT).notes).toEqual([
      '1 of the bank accounts chosen for this report is not in this balance sheet, so it is not counted as bank - check the report settings.',
    ])
  })
})

describe("bank_rows — Distinct Directions' bank block (DD-33)", () => {
  // Calxa's p22 lists only the accounts that moved; ours printed
  // "Petty Cash 156 156 0". Petty Cash at DD's 155.81 both ends, and an
  // account that moved 30c — which prints as 0, and whose 30c the proof still
  // counts (unlisted, as deriveMoneyFlow does for a source under 50c).
  const withIdle = {
    ...flow,
    bank: { start: flow.bank.start + 155.81 + 12.3, end: flow.bank.end + 155.81 + 12.6, delta: Math.round((flow.bank.delta + 0.3) * 100) / 100 },
    bank_accounts: [
      ...flow.bank_accounts,
      { label: 'Petty Cash', account_id: 'petty', opening: 155.81, closing: 155.81, movement: 0 },
      { label: 'Cash Draw', account_id: 'draw', opening: 12.3, closing: 12.6, movement: 0.3 },
    ],
    unlisted_movement: Math.round((flow.unlisted_movement + 0.3) * 100) / 100,
  }
  const bankBlock = (config: MoneyFlowConfig) => {
    const out = printed(moneyFlowRows(withIdle, config).rows)
    return out.slice(out.indexOf('# How this Affected Our Bank'))
  }

  it("'all' (the default) lists every account with a balance, as before", () => {
    expect(bankBlock(DEFAULT)).toEqual([
      '# How this Affected Our Bank',
      'CBA Cheque Account -40708',
      'Bus Online Saver 9000',
      'Petty Cash 0',
      'Cash Draw 0',
      'Total -31708',
      'Net Movement -31708',
    ])
  })

  it("'moved' leaves off the accounts whose movement prints as 0 — the Total and the last line do not move", () => {
    const moved = { ...DEFAULT, bank_rows: 'moved' as const }
    expect(bankBlock(moved)).toEqual([
      '# How this Affected Our Bank',
      'CBA Cheque Account -40708',
      'Bus Online Saver 9000',
      'Total -31708',
      'Net Movement -31708',
    ])
    const all = moneyFlowRows(withIdle, DEFAULT)
    const onlyMoved = moneyFlowRows(withIdle, moved)
    expect(onlyMoved.rows.at(-1)).toEqual(all.rows.at(-1))
    expect(onlyMoved.rows.at(-2)).toEqual(all.rows.at(-2))
    expect(onlyMoved.notes).toEqual(all.notes)
    // Everything above the bank block is untouched.
    expect(onlyMoved.rows.slice(0, all.rows.length - 5)).toEqual(all.rows.slice(0, all.rows.length - 5))
  })

  it("an account that moved 50c or more stays — it prints as 1", () => {
    const halfDollar = { ...withIdle, bank_accounts: [...flow.bank_accounts, { label: 'Cash Draw', account_id: 'draw', opening: 12.3, closing: 12.8, movement: 0.5 }] }
    expect(printed(moneyFlowRows(halfDollar, { ...DEFAULT, bank_rows: 'moved' }).rows)).toContain('Cash Draw 1')
  })
})
