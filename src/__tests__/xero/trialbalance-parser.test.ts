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
import fs from 'fs'
import path from 'path'
import {
  parseTrialBalance,
  parseTrialBalanceMovements,
  trialBalanceTotals,
} from '@/lib/xero/trialbalance-parser'

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

// ─── FX account split — month movements ─────────────────────────────────────

function tbFixture(name: string): unknown {
  return JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', `${name}.json`), 'utf8')).response
}

describe('parseTrialBalanceMovements (committed captures)', () => {
  it('IICT-HK 31-Mar-26: the month movement columns, never YTD', () => {
    const rows = parseTrialBalanceMovements(tbFixture('iict-hk-trialbalance-2026-03-31'))
    const realised = rows.find((r) => r.account_id === '6bd44c18-bd28-4745-9e00-0de6cb25a03b')!
    const unrealised = rows.find((r) => r.account_id === '6bd82684-a94f-495b-b3c3-505fbb95a960')!
    // 499 month Debit 64.42 (YTD 734.46); 498 month Credit 11,014.60 (YTD Credit 8,123.46).
    expect(realised.debit - realised.credit).toBeCloseTo(64.42, 2)
    expect(unrealised.debit - unrealised.credit).toBeCloseTo(-11014.6, 2)
    expect(realised.account_name).toBe('Realised Currency Gains (499)')
  })

  it('JDS 30-Apr-26: 199 −13.06, 198 −3,222.68', () => {
    const rows = parseTrialBalanceMovements(tbFixture('jds-trialbalance-2026-04-30'))
    const realised = rows.find((r) => r.account_id === 'c2878a4c-bef9-408c-9df6-d709c3b64e61')!
    const unrealised = rows.find((r) => r.account_id === '63450033-d387-4f9f-857e-0927d0902019')!
    expect(realised.debit - realised.credit).toBeCloseTo(-13.06, 2)
    expect(unrealised.debit - unrealised.credit).toBeCloseTo(-3222.68, 2)
  })

  it('leaves gate 3 exactly as it was: parseTrialBalance still reads YTD', () => {
    const report = tbFixture('iict-hk-trialbalance-2026-03-31')
    const ytd = parseTrialBalance(report)
    const realised = ytd.find((r) => r.account_id === '6bd44c18-bd28-4745-9e00-0de6cb25a03b')!
    expect(realised.debit).toBeCloseTo(734.46, 2)
    const unrealised = ytd.find((r) => r.account_id === '6bd82684-a94f-495b-b3c3-505fbb95a960')!
    expect(unrealised.credit).toBeCloseTo(8123.46, 2)
    // Same rows, same order — the two parsers differ only in the columns read.
    const mov = parseTrialBalanceMovements(report)
    expect(mov.map((r) => r.account_id)).toEqual(ytd.map((r) => r.account_id))
  })

  it('refuses a report that is not the five-column shape (movement meaning unproven there)', () => {
    const threeCol = {
      Reports: [
        {
          Rows: [
            { RowType: 'Header', Cells: [{ Value: '' }, { Value: 'Debit' }, { Value: 'Credit' }] },
            section('Expenses', [row('Realised Currency Gains', ACC_BANK, ['10.00', ''])]),
          ],
        },
      ],
    }
    expect(() => parseTrialBalanceMovements(threeCol)).toThrow(/header/i)
    expect(() => parseTrialBalanceMovements({ Reports: [] })).toThrow()
    expect(() => parseTrialBalanceMovements(null)).toThrow()
  })
})
