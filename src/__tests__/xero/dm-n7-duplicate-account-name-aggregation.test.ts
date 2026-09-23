/**
 * DM-N7 — the monthly-report sync parsers keyed their account Map by display
 * NAME, so two rows sharing a display name (distinct ledger accounts that
 * happen to share a name) overwrote each other → understated section totals.
 *
 * Fix: aggregate (sum) same-named rows instead of overwriting. These tests pin
 * the corrected behaviour for both the P&L and Balance Sheet single-month
 * parsers in src/app/api/monthly-report/sync-xero/report-parsers.ts.
 */

import { describe, it, expect } from 'vitest'

const plRow = (name: string, value: string) => ({
  RowType: 'Row',
  Cells: [{ Value: name }, { Value: value }],
})

describe('parseSingleMonthReport (P&L) — DM-N7 same-name aggregation', () => {
  it('sums two rows that share a display name instead of overwriting', async () => {
    const { parseSingleMonthReport } = await import(
      '@/app/api/monthly-report/sync-xero/report-parsers'
    )
    const report = {
      Rows: [
        {
          RowType: 'Section',
          Title: 'Operating Expenses',
          Rows: [
            plRow('Bank Fees', '100'),
            plRow('Subscriptions', '40'),
            plRow('Bank Fees', '50'), // duplicate display name, distinct account
          ],
        },
      ],
    }

    const accounts = parseSingleMonthReport(report)

    // Pre-fix this was 50 (overwrite). Correct total is 150.
    expect(accounts.get('Bank Fees')?.value).toBe(150)
    expect(accounts.get('Subscriptions')?.value).toBe(40)
    expect(accounts.get('Bank Fees')?.section).toBe('Operating Expenses')
  })

  it('does not merge genuinely distinct account names', async () => {
    const { parseSingleMonthReport } = await import(
      '@/app/api/monthly-report/sync-xero/report-parsers'
    )
    const report = {
      Rows: [
        { RowType: 'Section', Title: 'Income', Rows: [plRow('Sales', '1000'), plRow('Interest', '25')] },
      ],
    }
    const accounts = parseSingleMonthReport(report)
    expect(accounts.get('Sales')?.value).toBe(1000)
    expect(accounts.get('Interest')?.value).toBe(25)
  })
})

// Real Xero BS data rows ALWAYS carry an account GUID — verified across all 12
// captured fixtures: 250 rows with an id, and the only 12 without are the
// computed "Net Assets" row. The parser now uses that attribute both to classify
// against the chart of accounts and to tell accounts apart from computed totals,
// so these fixtures carry one too. `seq` keeps duplicate-display-name rows
// distinct accounts, which is the case this file exists to cover.
let seq = 0
const bsRow = (name: string, value: string) => ({
  RowType: 'Row',
  Cells: [
    { Value: name, Attributes: [{ Value: `acct-${++seq}`, Id: 'account' }] },
    { Value: value },
  ],
})

describe('parseSingleMonthBSReport (Balance Sheet) — DM-N7 same-name aggregation', () => {
  it('sums two rows that share a display name within a section', async () => {
    const { parseSingleMonthBSReport } = await import(
      '@/app/api/monthly-report/sync-xero/report-parsers'
    )
    const report = {
      Rows: [
        {
          RowType: 'Section',
          Title: 'Assets',
          Rows: [
            bsRow('Bank Account', '200'),
            bsRow('Trade Debtors', '500'),
            bsRow('Bank Account', '300'), // duplicate display name
          ],
        },
      ],
    }

    const accounts = parseSingleMonthBSReport(report)

    // Pre-fix this was 300 (overwrite). Correct total is 500.
    expect(accounts.get('Bank Account')?.value).toBe(500)
    expect(accounts.get('Bank Account')?.account_type).toBe('asset')
    expect(accounts.get('Trade Debtors')?.value).toBe(500)
  })

  it('handles comma-formatted amounts while aggregating', async () => {
    const { parseSingleMonthBSReport } = await import(
      '@/app/api/monthly-report/sync-xero/report-parsers'
    )
    const report = {
      Rows: [
        {
          RowType: 'Section',
          Title: 'Liabilities',
          Rows: [bsRow('Loan', '1,000'), bsRow('Loan', '2,500')],
        },
      ],
    }
    const accounts = parseSingleMonthBSReport(report)
    expect(accounts.get('Loan')?.value).toBe(3500)
    expect(accounts.get('Loan')?.account_type).toBe('liability')
  })
})
