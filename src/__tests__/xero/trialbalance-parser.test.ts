/**
 * Phase 44.2 Plan 44.2-06E — Trial Balance parser tests.
 *
 * Confirms the parser handles standard Xero TB shapes:
 *   - YTD column preference
 *   - Current-period fallback when YTD is empty
 *   - Section walk + nested sub-section handling
 *   - SummaryRow / Header / "Total ..." filtering
 *   - Σ debit == Σ credit when input is balanced
 */
import { describe, it, expect } from 'vitest'
import { parseTrialBalance, trialBalanceTotals } from '@/lib/xero/trialbalance-parser'

const ACC_REVENUE = 'aaaaaaaa-1111-1111-1111-aaaaaaaaaaaa'
const ACC_BANK = 'bbbbbbbb-2222-2222-2222-bbbbbbbbbbbb'
const ACC_GST = 'cccccccc-3333-3333-3333-cccccccccccc'
const ACC_EQUITY = 'dddddddd-4444-4444-4444-dddddddddddd'

function row(name: string, accountId: string, cells: Array<string | null>) {
  return {
    RowType: 'Row',
    Cells: [
      { Value: name, Attributes: [{ Id: 'account', Value: accountId }] },
      ...cells.map((v) => ({ Value: v ?? '' })),
    ],
  }
}

function section(title: string, rows: any[]) {
  return { RowType: 'Section', Title: title, Rows: rows }
}

describe('parseTrialBalance', () => {
  it('parses standard 4-column shape with YTD columns preferred', () => {
    const report = {
      Reports: [
        {
          Rows: [
            { RowType: 'Header', Cells: [{ Value: '' }, { Value: 'Debit' }, { Value: 'Credit' }, { Value: 'YTD Debit' }, { Value: 'YTD Credit' }] },
            section('Revenue', [
              row('Sales', ACC_REVENUE, ['0.00', '0.00', '0.00', '12345.67']),
            ]),
            section('Assets', [
              row('NAB Bank', ACC_BANK, ['0.00', '0.00', '5000.00', '0.00']),
            ]),
            section('Liabilities', [
              row('GST', ACC_GST, ['0.00', '0.00', '0.00', '500.00']),
            ]),
            section('Equity', [
              row('Retained Earnings', ACC_EQUITY, ['0.00', '0.00', '0.00', '-7845.67']),
            ]),
          ],
        },
      ],
    }
    const rows = parseTrialBalance(report)
    expect(rows.length).toBe(4)
    const sales = rows.find((r) => r.account_id === ACC_REVENUE)!
    expect(sales.credit).toBeCloseTo(12345.67, 2)
    expect(sales.debit).toBe(0)
    const bank = rows.find((r) => r.account_id === ACC_BANK)!
    expect(bank.debit).toBeCloseTo(5000.00, 2)
    expect(bank.credit).toBe(0)
    expect(rows.find((r) => r.account_id === ACC_GST)!.credit).toBeCloseTo(500, 2)
    expect(rows.find((r) => r.account_id === ACC_EQUITY)!.credit).toBeCloseTo(-7845.67, 2)
  })

  it('falls back to current-period columns when YTD is empty', () => {
    const report = {
      Reports: [
        {
          Rows: [
            { RowType: 'Header', Cells: [{ Value: '' }, { Value: 'Debit' }, { Value: 'Credit' }] },
            section('Assets', [
              row('NAB Bank', ACC_BANK, ['1234.56', '0.00']),
            ]),
          ],
        },
      ],
    }
    const rows = parseTrialBalance(report)
    expect(rows[0]!.debit).toBeCloseTo(1234.56, 2)
  })

  it('captures section title for each row', () => {
    const report = {
      Reports: [
        {
          Rows: [
            section('Revenue', [row('Sales', ACC_REVENUE, ['0', '100'])]),
            section('Assets', [row('NAB Bank', ACC_BANK, ['100', '0'])]),
          ],
        },
      ],
    }
    const rows = parseTrialBalance(report)
    const r1 = rows.find((r) => r.account_id === ACC_REVENUE)
    const r2 = rows.find((r) => r.account_id === ACC_BANK)
    expect(r1!.section).toBe('Revenue')
    expect(r2!.section).toBe('Assets')
  })

  it('recurses into nested sub-sections', () => {
    const report = {
      Reports: [
        {
          Rows: [
            section('Assets', [
              section('Bank', [row('NAB', ACC_BANK, ['0', '0', '500', '0'])]),
            ]),
          ],
        },
      ],
    }
    const rows = parseTrialBalance(report)
    expect(rows.length).toBe(1)
    expect(rows[0]!.debit).toBeCloseTo(500, 2)
    // Inner sub-section title wins for `section` field.
    expect(rows[0]!.section).toBe('Bank')
  })

  it('skips Header / SummaryRow / "Total ..." rows', () => {
    const report = {
      Reports: [
        {
          Rows: [
            { RowType: 'Header', Cells: [{ Value: '' }, { Value: 'Debit' }] },
            section('Assets', [
              row('NAB Bank', ACC_BANK, ['0', '0', '500', '0']),
              { RowType: 'SummaryRow', Cells: [{ Value: 'Total Assets' }, { Value: '' }, { Value: '' }, { Value: '500' }, { Value: '' }] },
              row('Total Assets', 'fff-fake', ['0', '0', '500', '0']), // hand-typed Row that mimics a total — should be filtered
            ]),
          ],
        },
      ],
    }
    const rows = parseTrialBalance(report)
    expect(rows.length).toBe(1)
    expect(rows[0]!.account_name).toBe('NAB Bank')
  })

  it('returns empty array on malformed input', () => {
    expect(parseTrialBalance(null)).toEqual([])
    expect(parseTrialBalance({})).toEqual([])
    expect(parseTrialBalance({ Reports: [] })).toEqual([])
    expect(parseTrialBalance({ Reports: [{}] })).toEqual([])
  })

  it('trialBalanceTotals returns balanced totals on a self-balancing TB', () => {
    const report = {
      Reports: [
        {
          Rows: [
            section('Revenue', [row('Sales', ACC_REVENUE, ['0', '0', '0', '1000'])]),
            section('Assets', [row('NAB', ACC_BANK, ['0', '0', '1500', '0'])]),
            section('Liabilities', [row('GST', ACC_GST, ['0', '0', '0', '500'])]),
          ],
        },
      ],
    }
    const totals = trialBalanceTotals(parseTrialBalance(report))
    // Σ debit = 1500, Σ credit = 1500 → delta = 0
    expect(totals.debit).toBeCloseTo(1500, 2)
    expect(totals.credit).toBeCloseTo(1500, 2)
    expect(Math.abs(totals.delta)).toBeLessThan(0.01)
  })
})
