/**
 * Phase 44 Plan 44-03 (RED → GREEN) — fills bodies for the it.todo
 * scaffold from 44-01.  Covers D-05, D-09, D-16, D-17.
 *
 * Test names are anchored to 44-VALIDATION.md and MUST stay verbatim
 * so the per-decision `vitest -t '<name>'` filters resolve.
 */
import { describe, it, expect } from 'vitest'
import envisageFY26 from './fixtures/envisage-fy26.json'
import jdsFY26 from './fixtures/jds-fy26.json'
import {
  parsePLByMonth,
  computeCoverage,
  parseAmount,
  parsePeriodHeader,
  classifyAccountType,
} from '@/lib/xero/pl-by-month-parser'

describe('PL-by-Month Parser', () => {
  // ────────────────────────────────────────────────────────────────────────
  // D-05: Canonical query returns 12 monthly columns for active tenant
  // ────────────────────────────────────────────────────────────────────────
  it('returns 12 monthly columns', () => {
    const rows = parsePLByMonth(jdsFY26)
    const distinctMonths = new Set(rows.map((r) => r.period_month))
    expect(distinctMonths.size).toBe(12)
    // Sanity: months are formatted YYYY-MM-01
    for (const m of distinctMonths) {
      expect(m).toMatch(/^\d{4}-\d{2}-01$/)
    }
    // First/last per the recorded fixture (May 2025 → Apr 2026)
    const sorted = Array.from(distinctMonths).sort()
    expect(sorted[0]).toBe('2025-05-01')
    expect(sorted[sorted.length - 1]).toBe('2026-04-01')
  })

  // ────────────────────────────────────────────────────────────────────────
  // D-05: Sparse-tenant policy — months Xero did NOT return are absent
  // ────────────────────────────────────────────────────────────────────────
  it('sparse tenant', () => {
    // Construct a synthetic sparse Xero response (4 months only).
    // No zero-padding allowed — the parser must reflect Xero's truth.
    const sparseReport = {
      Reports: [
        {
          Rows: [
            {
              RowType: 'Header',
              Cells: [
                { Value: '' },
                { Value: '30 Apr 26' },
                { Value: '30 Mar 26' },
                { Value: '28 Feb 26' },
                { Value: '30 Jan 26' },
              ],
            },
            {
              RowType: 'Section',
              Title: 'Income',
              Rows: [
                {
                  RowType: 'Row',
                  Cells: [
                    {
                      Value: 'Sales',
                      Attributes: [{ Id: 'account', Value: 'acct-001' }],
                    },
                    { Value: '100.00' },
                    { Value: '200.00' },
                    { Value: '0.00' },
                    { Value: '50.00' },
                  ],
                },
              ],
            },
          ],
        },
      ],
    }
    const rows = parsePLByMonth(sparseReport)
    const distinctMonths = new Set(rows.map((r) => r.period_month))
    expect(distinctMonths.size).toBe(4) // exactly four — NOT zero-padded to 12
    expect(rows.length).toBe(4) // one account × four months
    // Verify NO zero-padding for the missing 8 months: only the 4 returned
    // months should appear.
    const expectedMonths = new Set([
      '2026-01-01',
      '2026-02-01',
      '2026-03-01',
      '2026-04-01',
    ])
    expect(distinctMonths).toEqual(expectedMonths)
    // Real-zero (Feb's $0.00) IS preserved; absent months are simply absent.
    const feb = rows.find((r) => r.period_month === '2026-02-01')
    expect(feb).toBeDefined()
    expect(feb!.amount).toBe(0)
  })

  // ────────────────────────────────────────────────────────────────────────
  // D-17: Envisage fixture parser produces expected row count + types
  // ────────────────────────────────────────────────────────────────────────
  it('envisage', () => {
    const rows = parsePLByMonth(envisageFY26)
    // Per Plan 44-01-SUMMARY: 9 top-level sections, 12 monthly columns,
    // 48 distinct (Row-typed, non-summary) account lines.
    const distinctAccounts = new Set(
      rows.map((r) => r.account_code ?? `NAME:${r.account_name}`),
    )
    expect(distinctAccounts.size).toBe(48)
    // Long-format: 48 accounts × 12 months
    expect(rows.length).toBe(48 * 12)
    // Type distribution from the recorded fixture:
    //   revenue=5 (Income section), other_income=1, opex=42 (Less Operating
    //   Expenses + Think Bigger + VCFO sub-sections inherit opex)
    const byType = new Map<string, Set<string>>()
    for (const r of rows) {
      const key = r.account_code ?? `NAME:${r.account_name}`
      if (!byType.has(r.account_type)) byType.set(r.account_type, new Set())
      byType.get(r.account_type)!.add(key)
    }
    expect(byType.get('revenue')?.size).toBe(5)
    expect(byType.get('other_income')?.size).toBe(1)
    expect(byType.get('opex')?.size).toBe(42)
    // Verify the parser gracefully skipped Xero's calculated rows
    // (Gross Profit, Net Profit, Total Operating Expenses).
    expect(rows.find((r) => r.account_name === 'Gross Profit')).toBeUndefined()
    expect(rows.find((r) => r.account_name === 'Net Profit')).toBeUndefined()
    expect(
      rows.find((r) => r.account_name === 'Total Operating Expenses'),
    ).toBeUndefined()
  })

  // ────────────────────────────────────────────────────────────────────────
  // D-16/D-17: JDS fixture parser produces expected row count + types
  // ────────────────────────────────────────────────────────────────────────
  it('jds', () => {
    const rows = parsePLByMonth(jdsFY26)
    const distinctAccounts = new Set(
      rows.map((r) => r.account_code ?? `NAME:${r.account_name}`),
    )
    // Per 44-01-SUMMARY: 86 distinct accounts × 12 months
    expect(distinctAccounts.size).toBe(86)
    expect(rows.length).toBe(86 * 12)
    // Type distribution from recorded fixture:
    //   revenue=18, cogs=22, opex=45, other_income=1
    const byType = new Map<string, Set<string>>()
    for (const r of rows) {
      const key = r.account_code ?? `NAME:${r.account_name}`
      if (!byType.has(r.account_type)) byType.set(r.account_type, new Set())
      byType.get(r.account_type)!.add(key)
    }
    expect(byType.get('revenue')?.size).toBe(18)
    expect(byType.get('cogs')?.size).toBe(22)
    expect(byType.get('opex')?.size).toBe(45)
    expect(byType.get('other_income')?.size).toBe(1)
    // Spot-check a known account: Sales - CFO has account_code
    // 3be3a7ca-... — but JDS fixture is a different tenant. Verify we have
    // at least one account with each Xero account_code attribute populated.
    const codedRows = rows.filter((r) => r.account_code !== null)
    expect(codedRows.length).toBeGreaterThan(0)
    expect(codedRows.length).toBe(rows.length) // every JDS account has a code
  })

  // ────────────────────────────────────────────────────────────────────────
  // D-04: Parser correctly classifies Other Income / Other Expense
  // ────────────────────────────────────────────────────────────────────────
  it('classifies Other Income / Other Expense', () => {
    const rows = parsePLByMonth(envisageFY26)
    const types = new Set(rows.map((r) => r.account_type))
    expect(types.has('other_income')).toBe(true)
    // Envisage has no other_expense section — JDS doesn't either, so we
    // assert the classifier handles a synthetic Other Expense section.
    const synthetic = {
      Reports: [
        {
          Rows: [
            {
              RowType: 'Header',
              Cells: [{ Value: '' }, { Value: '30 Apr 26' }],
            },
            {
              RowType: 'Section',
              Title: 'Less Other Expense',
              Rows: [
                {
                  RowType: 'Row',
                  Cells: [
                    {
                      Value: 'Bank Charges',
                      Attributes: [{ Id: 'account', Value: 'acct-bank' }],
                    },
                    { Value: '50.00' },
                  ],
                },
              ],
            },
          ],
        },
      ],
    }
    const synthRows = parsePLByMonth(synthetic)
    expect(synthRows).toHaveLength(1)
    expect(synthRows[0]!.account_type).toBe('other_expense')
  })

  // ────────────────────────────────────────────────────────────────────────
  // D-05: Parser handles Xero's accounting-string amount formatting
  // ────────────────────────────────────────────────────────────────────────
  it('parses accounting parens as negative', () => {
    expect(parseAmount('($1,234.56)')).toBe(-1234.56)
    expect(parseAmount('(99.99)')).toBe(-99.99)
    // Plain positive formats
    expect(parseAmount('1,234.56')).toBe(1234.56)
    expect(parseAmount('$5000')).toBe(5000)
    // Empty / dash → 0
    expect(parseAmount('')).toBe(0)
    expect(parseAmount('-')).toBe(0)
    expect(parseAmount(null)).toBe(0)
    expect(parseAmount(undefined)).toBe(0)
  })

  // ────────────────────────────────────────────────────────────────────────
  // D-05: Parser converts Xero's period-header strings to YYYY-MM-01
  // ────────────────────────────────────────────────────────────────────────
  it('parses period header into YYYY-MM-01', () => {
    // Xero's three observed formats across tenant tiers
    expect(parsePeriodHeader('Jul-25')).toBe('2025-07-01')
    expect(parsePeriodHeader('Jul 25')).toBe('2025-07-01')
    expect(parsePeriodHeader('31 Jul 2025')).toBe('2025-07-01')
    expect(parsePeriodHeader('30 Apr 26')).toBe('2026-04-01')
    expect(parsePeriodHeader('28 Feb 26')).toBe('2026-02-01')
  })

  // ────────────────────────────────────────────────────────────────────────
  // D-10: computeCoverage returns the per-fixture coverage record
  // ────────────────────────────────────────────────────────────────────────
  it('computes coverage record', () => {
    const rows = parsePLByMonth(envisageFY26)
    const cov = computeCoverage(rows, 12)
    expect(cov.months_covered).toBe(12) // Envisage fixture has full 12 months
    expect(cov.first_period).toBe('2025-05')
    expect(cov.last_period).toBe('2026-04')
    expect(cov.expected_months).toBe(12)
  })
})

// classifyAccountType used internally + exported — sanity-check the
// observed Xero section title vocabulary.
describe('classifyAccountType', () => {
  it('maps every observed Xero section title correctly', () => {
    expect(classifyAccountType('Income')).toBe('revenue')
    expect(classifyAccountType('Trading Income')).toBe('revenue')
    expect(classifyAccountType('Less Cost of Sales')).toBe('cogs')
    expect(classifyAccountType('COGS')).toBe('cogs')
    expect(classifyAccountType('Direct Costs')).toBe('cogs')
    expect(classifyAccountType('Less Operating Expenses')).toBe('opex')
    expect(classifyAccountType('Operating Expenses')).toBe('opex')
    expect(classifyAccountType('Plus Other Income')).toBe('other_income')
    expect(classifyAccountType('Other Income')).toBe('other_income')
    expect(classifyAccountType('Less Other Expense')).toBe('other_expense')
    expect(classifyAccountType('Other Expenses')).toBe('other_expense')
  })
})
