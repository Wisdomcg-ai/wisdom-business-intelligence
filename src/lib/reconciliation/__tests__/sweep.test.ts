import { describe, it, expect } from 'vitest'
import {
  sweepWindow,
  parseBankStatementReport,
  groupFallbackTransactions,
  sumBuckets,
  latestCodedDate,
} from '../sweep'

describe('sweepWindow', () => {
  it('spans from the first of the month 11 months back through today', () => {
    expect(sweepWindow(new Date(Date.UTC(2026, 8, 16)))).toEqual({
      fromDate: '2025-10-01',
      toDate: '2026-09-16',
    })
  })

  it('handles year boundaries', () => {
    expect(sweepWindow(new Date(Date.UTC(2026, 0, 5)))).toEqual({
      fromDate: '2025-02-01',
      toDate: '2026-01-05',
    })
  })
})

/** Realistic Reports/BankStatement envelope: Header row naming columns,
 *  Section with data rows, opening/closing balance rows without a
 *  Reconciled value. */
function statementReport(rows: any[]) {
  return {
    Reports: [
      {
        ReportID: 'BankStatement',
        ReportName: 'Bank Statement',
        Rows: [
          {
            RowType: 'Header',
            Cells: [
              { Value: 'Date' }, { Value: 'Description' }, { Value: 'Reference' },
              { Value: 'Reconciled' }, { Value: 'Source' }, { Value: 'Amount' }, { Value: 'Balance' },
            ],
          },
          { RowType: 'Section', Title: '', Rows: rows },
        ],
      },
    ],
  }
}

const row = (date: string, description: string, reconciled: string, amount: string) => ({
  RowType: 'Row',
  Cells: [
    { Value: date }, { Value: description }, { Value: '' },
    { Value: reconciled }, { Value: 'Import' }, { Value: amount }, { Value: '999.00' },
  ],
})

describe('parseBankStatementReport', () => {
  it('keeps only Reconciled=No statement lines, with absolute amounts', () => {
    const parsed = parseBankStatementReport(
      statementReport([
        row('2026-08-01', 'Opening Balance', '', '0.00'),
        row('2026-08-03', 'AIRWALLEX TRANSFER', 'No', '-1,217.50'),
        row('2026-08-04', 'STRIPE PAYOUT', 'Yes', '500.00'),
        row('2026-08-05', 'FX FEE', 'No', '42.10'),
        row('2026-08-31', 'Closing Balance', '', '0.00'),
      ]),
    )
    expect(parsed.parsed).toBe(true)
    expect(parsed.items).toEqual([
      { date: '2026-08-03', amount: 1217.5 },
      { date: '2026-08-05', amount: 42.1 },
    ])
  })

  it('an unrecognised shape refuses to parse — never reads as all-clear', () => {
    expect(parseBankStatementReport(null).parsed).toBe(false)
    expect(parseBankStatementReport({}).parsed).toBe(false)
    expect(parseBankStatementReport({ Reports: [{ Rows: [] }] }).parsed).toBe(false)
    // Header present but missing the Reconciled column → refuse.
    const noReconciled = {
      Reports: [{
        Rows: [
          { RowType: 'Header', Cells: [{ Value: 'Date' }, { Value: 'Amount' }] },
          { RowType: 'Section', Rows: [row('2026-08-03', 'X', 'No', '10')] },
        ],
      }],
    }
    expect(parseBankStatementReport(noReconciled).parsed).toBe(false)
  })

  it('a recognised report with zero unreconciled lines parses as legitimately clear', () => {
    const parsed = parseBankStatementReport(
      statementReport([row('2026-08-04', 'STRIPE PAYOUT', 'Yes', '500.00')]),
    )
    expect(parsed.parsed).toBe(true)
    expect(parsed.items).toEqual([])
  })

  it('skips rows with unparseable dates and non-numeric amounts fail to zero', () => {
    const parsed = parseBankStatementReport(
      statementReport([
        row('not a date', 'MYSTERY', 'No', '100.00'),
        row('2026-08-05', 'BAD AMOUNT', 'No', 'abc'),
      ]),
    )
    expect(parsed.parsed).toBe(true)
    expect(parsed.items).toEqual([{ date: '2026-08-05', amount: 0 }])
  })
})

describe('groupFallbackTransactions', () => {
  it('groups by bank account with absolute totals and prefers DateString', () => {
    const { byAccount, dropped } = groupFallbackTransactions([
      {
        BankAccount: { AccountID: 'acc-1', Name: 'ANZ Cheque' },
        DateString: '2026-08-14T00:00:00',
        Date: '/Date(1755129600000+0000)/',
        Total: -150.25,
      },
      { BankAccount: { AccountID: 'acc-1', Name: 'ANZ Cheque' }, DateString: '2026-07-02T00:00:00', Total: 40 },
      { BankAccount: { AccountID: 'acc-2', Name: 'Visa' }, DateString: '2026-08-20T00:00:00', Total: 99 },
    ])
    expect(dropped).toBe(0)
    expect(byAccount.get('acc-1')).toEqual({
      name: 'ANZ Cheque',
      items: [
        { date: '2026-08-14T00:00:00', amount: 150.25 },
        { date: '2026-07-02T00:00:00', amount: 40 },
      ],
    })
    expect(byAccount.get('acc-2')?.items).toHaveLength(1)
  })

  it('drops transactions with no bank account id and counts them', () => {
    const { byAccount, dropped } = groupFallbackTransactions([
      { DateString: '2026-08-01', Total: 10 },
      { BankAccount: {}, DateString: '2026-08-01', Total: 10 },
    ])
    expect(byAccount.size).toBe(0)
    expect(dropped).toBe(2)
  })
})

describe('sumBuckets', () => {
  it('totals counts and values across accounts with cent rounding', () => {
    expect(
      sumBuckets([
        {
          bankAccountId: 'a',
          bankAccountName: null,
          currency: 'AUD',
          buckets: [
            { month: '2026-07', count: 2, value: 0.1 },
            { month: '2026-08', count: 1, value: 0.2 },
          ],
        },
        { bankAccountId: 'b', bankAccountName: null, currency: 'AUD', buckets: [{ month: '2026-08', count: 3, value: 10 }] },
      ])
    ).toEqual({ totalCount: 6, totalValue: 10.3 })
  })

  it('returns zeros for a fully reconciled tenant', () => {
    expect(sumBuckets([])).toEqual({ totalCount: 0, totalValue: 0 })
  })
})

describe('latestCodedDate', () => {
  it('takes the first parseable date from a Date-DESC-ordered page', () => {
    expect(
      latestCodedDate({
        BankTransactions: [
          { DateString: '2026-08-03T00:00:00', Total: 10 },
          { DateString: '2026-07-01T00:00:00', Total: 5 },
        ],
      }),
    ).toBe('2026-08-03')
  })

  it('null for empty or malformed pages — unknown, never fresh', () => {
    expect(latestCodedDate({ BankTransactions: [] })).toBeNull()
    expect(latestCodedDate({})).toBeNull()
    expect(latestCodedDate({ BankTransactions: [{ DateString: 'garbage' }] })).toBeNull()
  })
})
