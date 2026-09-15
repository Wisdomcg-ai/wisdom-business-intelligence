/**
 * Reading a coach's budget spreadsheet — the two exports these clients
 * actually have.
 *
 * Dragon's comes out of Calxa Budget Tools per organisation:
 * `Business Unit Name | Account Number | Account Name | 2026 Jul … 2027 Jun`
 * (dragon-ehc SKILL.md:140). IICT's is `Account Code | Account Name |
 * Jul 2026 … Jun 2027` on accounts that exist in no Xero organisation — 221
 * Commissions Received GST Free and 429 General Expenses (iict SKILL.md:93-96,
 * IICT-08).
 *
 * The rule the preview exists for: a row with money on it that answers to no
 * account stops the save. Mapping 210 onto 200 is the coach's choice in the
 * preview, never a rule in the code (IICT-22, decision 1).
 */
import { describe, it, expect } from 'vitest'
import {
  parseBudgetSheet, parseAmount, parseMonthHeader, matchBudgetSheet, budgetLinesFromPreview,
  type Cell, type CatalogEntry,
} from '../budget-spreadsheet'
import { FY_MONTHS } from '../__fixtures__/multi-org-budgets'

const FY = [...FY_MONTHS]

/** Calxa's Dragon export: an organisation column and "2026 Jul" headers. */
const DRAGON_SHEET: Cell[][] = [
  ['Dragon Roofing - Consolidated', '', '', '', '', '', '', '', ''],
  ['Business Unit Path', 'Business Unit Number', 'Business Unit Name', 'Account Path', 'Account Number', 'Account Name',
    ...FY.map((m) => `${m.slice(0, 4)} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(m.slice(5)) - 1]}`)],
  ['Group', '1', 'Dragon Roofing Pty Ltd', 'Income', '200.1', 'Sales - Insurance', ...FY.map(() => 673_565)],
  ['Group', '1', 'Dragon Roofing Pty Ltd', 'Expense', '477', 'Wages and Salaries - Admin', ...FY.map(() => 26_023)],
  ['Group', '2', 'EASY HAIL CLAIM PTY LTD', 'Expense', '477', 'Wages and Salaries', ...FY.map(() => 12_000)],
  ['Group', '2', 'Not An Org', 'Expense', '404', 'Bank Fees', ...FY.map(() => 550)],
]

/** IICT's: no organisation column, and Calxa-only accounts. */
const IICT_SHEET: Cell[][] = [
  ['Account Code', 'Account Name', ...FY.map((m) => `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(m.slice(5)) - 1]} ${m.slice(0, 4)}`)],
  ['210', 'Membership income GST free', ...FY.map(() => 214_830)],
  ['221', 'Commissions Received GST Free', ...FY.map(() => '102,990')],
  ['212', 'Membership Discounts', ...FY.map(() => '(3,807)')],
  ['429', 'General Expenses', ...FY.map(() => 15_000)],
  ['Total', '', ...FY.map(() => '')],
]

const IICT_CATALOG: CatalogEntry[] = [
  { tenant_id: 'igp', code: '200', name: 'Membership income', type: 'revenue' },
  { tenant_id: 'igp', code: '210', name: 'Membership income GST free', type: 'revenue' },
  { tenant_id: 'igp', code: '220', name: 'Commissions Received', type: 'revenue' },
  { tenant_id: 'iap', code: '220', name: 'Commissions Received', type: 'revenue' },
  { tenant_id: 'igl', code: '200', name: 'Membership income', type: 'revenue' },
]

const IICT_SCOPE = [{ tenantId: null, displayName: 'IICT Group Consolidated', currency: 'AUD' }]

describe('cells', () => {
  it('reads both Calxa header spellings, Excel dates and nothing else', () => {
    expect(parseMonthHeader('Jul 2026')).toBe('2026-07')
    expect(parseMonthHeader('2026 Jul')).toBe('2026-07')
    expect(parseMonthHeader('July 2026')).toBe('2026-07')
    expect(parseMonthHeader('Jul-26')).toBe('2026-07')
    expect(parseMonthHeader('2026-07-01')).toBe('2026-07')
    expect(parseMonthHeader('Account Name')).toBeNull()
    expect(parseMonthHeader('2026')).toBeNull()
  })

  it('reads accounting amounts, and a blank cell as no figure rather than zero', () => {
    expect(parseAmount('$1,234.50')).toBe(1234.5)
    expect(parseAmount('(3,807)')).toBe(-3807)
    expect(parseAmount(-500)).toBe(-500)
    expect(parseAmount('')).toBeNull()
    expect(parseAmount('-')).toBeNull()
    expect(parseAmount('n/a')).toBeNull()
  })
})

describe('parseBudgetSheet', () => {
  it("finds Calxa's header row under a title, and every row under it", () => {
    const sheet = parseBudgetSheet(DRAGON_SHEET, FY)
    expect(sheet.problems).toEqual([])
    expect(sheet.hasOrgColumn).toBe(true)
    expect(sheet.months).toEqual(FY)
    expect(sheet.rows.map((r) => [r.row, r.code, r.name, r.org, r.annual])).toEqual([
      [3, '200.1', 'Sales - Insurance', 'Dragon Roofing Pty Ltd', 673_565 * 12],
      [4, '477', 'Wages and Salaries - Admin', 'Dragon Roofing Pty Ltd', 26_023 * 12],
      [5, '477', 'Wages and Salaries', 'EASY HAIL CLAIM PTY LTD', 12_000 * 12],
      [6, '404', 'Bank Fees', 'Not An Org', 550 * 12],
    ])
  })

  it('leaves out a total row with no code and no figures', () => {
    const sheet = parseBudgetSheet(IICT_SHEET, FY)
    expect(sheet.rows.map((r) => r.code)).toEqual(['210', '221', '212', '429'])
    expect(sheet.rows[2].months['2026-08']).toBe(-3807)
  })

  it('says so when the sheet does not cover the whole year', () => {
    const short = IICT_SHEET.map((row) => row.slice(0, 8))
    const sheet = parseBudgetSheet(short, FY)
    expect(sheet.problems[0]).toContain('no column for 2027-01')
  })

  it('leaves out a column from another fiscal year and says so', () => {
    const withExtra = IICT_SHEET.map((row, i) => [...row, i === 0 ? 'Jul 2027' : 1_000])
    const sheet = parseBudgetSheet(withExtra, FY)
    expect(sheet.problems[0]).toBe('Columns for 2027-07 are outside this fiscal year and were left out.')
    expect(sheet.rows[0].annual).toBe(214_830 * 12)
  })
})

describe('matchBudgetSheet — Dragon, one version per organisation', () => {
  const catalog: CatalogEntry[] = [
    { tenant_id: 'drg', code: '200.1', name: 'Sales - Insurance', type: 'revenue' },
    { tenant_id: 'drg', code: '477', name: 'Wages and Salaries - Admin', type: 'opex' },
    { tenant_id: 'ehc', code: '477', name: 'Wages and Salaries', type: 'opex' },
    { tenant_id: 'ehc', code: '404', name: 'Bank Fees', type: 'opex' },
  ]
  const scopes = [
    { tenantId: 'drg', displayName: 'Dragon Roofing Pty Ltd', currency: 'AUD' },
    { tenantId: 'ehc', displayName: 'Easy Hail Claim Pty Ltd', currency: 'AUD' },
  ]

  it('sends each row to its own organisation, and 477 to a different account in each', () => {
    const preview = matchBudgetSheet({
      sheet: parseBudgetSheet(DRAGON_SHEET, FY),
      scopes,
      catalog,
      orgNames: { ehc: ['EASY HAIL CLAIM PTY LTD'] },
    })
    const dragon = preview.scopes.find((s) => s.scope === 'drg')!
    const easyHail = preview.scopes.find((s) => s.scope === 'ehc')!
    expect(dragon.rows.map((r) => [r.account_code, r.account_name, r.status])).toEqual([
      ['200.1', 'Sales - Insurance', 'matched'],
      ['477', 'Wages and Salaries - Admin', 'matched'],
    ])
    expect(easyHail.rows.map((r) => [r.account_name, r.status])).toEqual([['Wages and Salaries', 'matched']])
    expect(dragon.totals.by_type).toMatchObject({ revenue: 673_565 * 12, opex: 26_023 * 12 })
  })

  it('refuses to save while a row names an organisation this business does not have', () => {
    const preview = matchBudgetSheet({
      sheet: parseBudgetSheet(DRAGON_SHEET, FY),
      scopes,
      catalog,
      orgNames: { ehc: ['EASY HAIL CLAIM PTY LTD'] },
    })
    const unplaced = preview.scopes.find((s) => s.display_name === 'Not assigned to an organisation')!
    expect(unplaced.rows[0].note).toBe('“Not An Org” is not one of this business’s Xero organisations.')
    expect(preview.can_save).toBe(false)
    expect(preview.blocking[0]).toContain('row 6 (404 Bank Fees)')
  })
})

describe('matchBudgetSheet — IICT, one business-level version', () => {
  it('matches what exists, and blocks on what does not until the coach chooses', () => {
    const preview = matchBudgetSheet({ sheet: parseBudgetSheet(IICT_SHEET, FY), scopes: IICT_SCOPE, catalog: IICT_CATALOG })
    const rows = preview.scopes[0].rows
    expect(rows.map((r) => [r.code, r.status])).toEqual([
      ['210', 'matched'], // IGP's own 210
      ['221', 'unmatched'],
      ['212', 'unmatched'],
      ['429', 'unmatched'],
    ])
    expect(preview.can_save).toBe(false)
    expect(preview.blocking[0]).toContain('3 rows could not be matched')
  })

  it("carries out the coach's mapping and budget-only choices, and then saves", () => {
    const preview = matchBudgetSheet({
      sheet: parseBudgetSheet(IICT_SHEET, FY),
      scopes: IICT_SCOPE,
      catalog: IICT_CATALOG,
      choices: {
        2: { action: 'map', target_code: '200' },
        3: { action: 'map', target_code: '220' },
        4: { action: 'budget_only', account_type: 'revenue' },
        5: { action: 'budget_only', account_type: 'opex' },
      },
    })
    expect(preview.can_save).toBe(true)
    const rows = preview.scopes[0].rows
    expect(rows.map((r) => [r.account_code, r.account_name, r.status, r.account_type])).toEqual([
      ['200', 'Membership income', 'matched', 'revenue'],
      ['220', 'Commissions Received', 'matched', 'revenue'],
      ['212', 'Membership Discounts', 'budget_only', 'revenue'],
      ['429', 'General Expenses', 'budget_only', 'opex'],
    ])
    expect(rows[0].note).toBe('Mapped to 200 Membership income')
    expect(preview.scopes[0].totals).toMatchObject({ matched: 2, budget_only: 2, unmatched: 0 })
    // Calxa's August: 214,830 − 3,807 + 102,990 income, 15,000 expense.
    const lines = budgetLinesFromPreview(preview.scopes[0], FY)
    const august = lines.filter((l) => l.month === '2026-08')
    expect(august.filter((l) => l.account_type === 'revenue').reduce((s, l) => s + l.amount, 0)).toBe(214_830 - 3_807 + 102_990)
    expect(august.find((l) => l.account_code === '429')).toMatchObject({ amount: 15_000, category: 'Operating Expenses' })
  })

  it('adds two rows mapped onto one account together, rather than one overwriting the other', () => {
    const header = FY.map((m) => `${m}-01`)
    const sheet = parseBudgetSheet([
      ['Account Code', 'Account Name', ...header],
      ['210', 'Membership income GST free', 100, ...FY.slice(1).map(() => '')],
      ['200', 'Membership income', 25, ...FY.slice(1).map(() => '')],
    ] as Cell[][], FY)
    const preview = matchBudgetSheet({
      sheet,
      scopes: IICT_SCOPE,
      catalog: IICT_CATALOG,
      choices: { 2: { action: 'map', target_code: '200' } },
    })
    const lines = budgetLinesFromPreview(preview.scopes[0], FY)
    expect(lines).toEqual([{ account_code: '200', account_name: 'Membership income', account_type: 'revenue', category: 'Revenue', month: '2026-07', amount: 125 }])
  })

  it('a row the coach skips is saved by nothing and stops nothing', () => {
    const preview = matchBudgetSheet({
      sheet: parseBudgetSheet(IICT_SHEET, FY),
      scopes: IICT_SCOPE,
      catalog: IICT_CATALOG,
      choices: {
        3: { action: 'skip' },
        4: { action: 'skip' },
        5: { action: 'skip' },
      },
    })
    expect(preview.can_save).toBe(true)
    expect(preview.scopes[0].totals).toMatchObject({ matched: 1, skipped: 3 })
    expect(budgetLinesFromPreview(preview.scopes[0], FY).every((l) => l.account_code === '210')).toBe(true)
  })

  it('a code that names different accounts in two organisations is not guessed', () => {
    const preview = matchBudgetSheet({
      sheet: parseBudgetSheet([
        ['Account Code', 'Account Name', ...FY.map((m) => `${m}-01`)],
        ['402', 'Marketing', ...FY.map(() => 1_000)],
      ] as Cell[][], FY),
      scopes: IICT_SCOPE,
      catalog: [
        { tenant_id: 'a', code: '402', name: 'Bad Debts expense', type: 'opex' },
        { tenant_id: 'b', code: '402', name: 'Marketing', type: 'opex' },
      ],
    })
    expect(preview.scopes[0].rows[0].note).toContain('is “Bad Debts expense” and “Marketing” in different organisations')
    expect(preview.can_save).toBe(false)
  })
})
