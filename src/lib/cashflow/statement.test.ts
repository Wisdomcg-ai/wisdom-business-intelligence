import { describe, it, expect } from 'vitest'
import {
  buildCashflowStatement,
  autoClassify,
  type StatementClassification,
  type BalanceSheetSnapshot,
} from './statement'

// ─── autoClassify ───────────────────────────────────────────────────────

describe('autoClassify', () => {
  it('classifies BANK as Unassigned (banks appear as opening/closing, not statement lines)', () => {
    expect(autoClassify('BANK')).toBe('Unassigned')
  })

  it('classifies current assets/liabilities as Operating', () => {
    expect(autoClassify('CURRENT')).toBe('Operating')
    expect(autoClassify('CURRLIAB')).toBe('Operating')
    expect(autoClassify('PREPAYMENT')).toBe('Operating')
  })

  it('classifies fixed assets and non-current assets as Investing', () => {
    expect(autoClassify('FIXED')).toBe('Investing')
    expect(autoClassify('NONCURRENT')).toBe('Investing')
    expect(autoClassify('INVENTORY')).toBe('Investing')
  })

  it('classifies term liabilities and equity as Financing', () => {
    expect(autoClassify('TERMLIAB')).toBe('Financing')
    expect(autoClassify('LIABILITY')).toBe('Financing')
    expect(autoClassify('EQUITY')).toBe('Financing')
  })

  it('classifies depreciation as NonCash', () => {
    expect(autoClassify('DEPRECIATN')).toBe('NonCash')
    expect(autoClassify('AMORTISATION')).toBe('NonCash')
  })

  it('falls back to Unassigned for unknown types', () => {
    expect(autoClassify('UNKNOWN')).toBe('Unassigned')
    expect(autoClassify(null)).toBe('Unassigned')
  })
})

// ─── buildCashflowStatement ─────────────────────────────────────────────

describe('buildCashflowStatement', () => {
  const classifications: StatementClassification[] = [
    {
      xero_account_id: 'ar', account_code: '610', account_name: 'Accounts Receivable',
      account_type: 'Asset', list_type: 'Operating',
    },
    {
      xero_account_id: 'ap', account_code: '800', account_name: 'Accounts Payable',
      account_type: 'Liability', list_type: 'Operating',
    },
    {
      xero_account_id: 'fa', account_code: '710', account_name: 'Plant & Equipment',
      account_type: 'Asset', list_type: 'Investing',
    },
    {
      xero_account_id: 'loan', account_code: '900', account_name: 'Business Loan',
      account_type: 'Liability', list_type: 'Financing',
    },
  ]

  const fromSnap: BalanceSheetSnapshot = {
    month: '2025-06',
    balancesByAccount: { ar: 40000, ap: 20000, fa: 100000, loan: 50000 },
    bankTotal: 100000,
  }

  const toSnap: BalanceSheetSnapshot = {
    month: '2026-06',
    balancesByAccount: { ar: 50000, ap: 25000, fa: 120000, loan: 40000 },
    bankTotal: 140000,
  }

  const balances = {
    '2025-06': fromSnap,
    '2026-06': toSnap,
  }

  it('net profit is passed through unchanged', () => {
    const result = buildCashflowStatement({
      period: { from: '2025-06', to: '2026-06' },
      netProfitTotal: 120000,
      depreciationAddback: 20000,
      balancesByMonth: balances,
      classifications,
    })
    expect(result.net_profit).toBe(120000)
  })

  it('depreciation add-back flows through correctly', () => {
    const result = buildCashflowStatement({
      period: { from: '2025-06', to: '2026-06' },
      netProfitTotal: 120000,
      depreciationAddback: 20000,
      balancesByMonth: balances,
      classifications,
    })
    expect(result.noncash_addbacks).toBe(20000)
  })

  it('operating AR movement (asset up = outflow) shows as negative', () => {
    const result = buildCashflowStatement({
      period: { from: '2025-06', to: '2026-06' },
      netProfitTotal: 100000,
      depreciationAddback: 0,
      balancesByMonth: balances,
      classifications,
    })
    // AR went from 40k to 50k → increase of 10k → outflow
    const ar = result.operating_movements.find(l => l.account_code === '610')
    expect(ar).toBeDefined()
    expect(ar!.movement).toBe(-10000)  // outflow = negative
  })

  it('operating AP movement (liability up = inflow) shows as positive', () => {
    const result = buildCashflowStatement({
      period: { from: '2025-06', to: '2026-06' },
      netProfitTotal: 100000,
      depreciationAddback: 0,
      balancesByMonth: balances,
      classifications,
    })
    // AP went from 20k to 25k → increase of 5k → inflow
    const ap = result.operating_movements.find(l => l.account_code === '800')
    expect(ap).toBeDefined()
    expect(ap!.movement).toBe(5000)  // inflow = positive
  })

  it('investing asset purchase shows as negative (outflow)', () => {
    const result = buildCashflowStatement({
      period: { from: '2025-06', to: '2026-06' },
      netProfitTotal: 100000,
      depreciationAddback: 0,
      balancesByMonth: balances,
      classifications,
    })
    // Fixed assets 100k → 120k = 20k outflow
    const fa = result.investing_movements.find(l => l.account_code === '710')
    expect(fa!.movement).toBe(-20000)
  })

  it('financing loan repayment shows as negative (outflow)', () => {
    const result = buildCashflowStatement({
      period: { from: '2025-06', to: '2026-06' },
      netProfitTotal: 100000,
      depreciationAddback: 0,
      balancesByMonth: balances,
      classifications,
    })
    // Loan balance 50k → 40k = 10k repayment (liability decreased) → outflow
    const loan = result.financing_movements.find(l => l.account_code === '900')
    expect(loan!.movement).toBe(-10000)
  })

  it('reconciles when opening + changes = closing cash', () => {
    // Build a scenario that balances:
    //   net profit 60k + depn 20k + AR(-10k) + AP(+5k) = 75k operating
    //   FA (-20k) = -20k investing
    //   Loan (-10k) = -10k financing
    //   Total = 75 - 20 - 10 = 45k net change in cash
    //   Bank went from 100k to 140k = 40k change
    //   Difference: 45k vs 40k = $5k off (some real-world P&L vs BS rounding)
    //
    // For this test to reconcile, we need the numbers to line up.
    // Net profit chosen to make it reconcile:
    //   cashFromOp = NP + depn + ARmov + APmov = NP + 20 -10 + 5
    //   Total = (NP + 15) + (-20) + (-10) = NP - 15
    //   Bank change = 40
    //   → NP = 55
    const result = buildCashflowStatement({
      period: { from: '2025-06', to: '2026-06' },
      netProfitTotal: 55000,
      depreciationAddback: 20000,
      balancesByMonth: balances,
      classifications,
    })
    expect(result.reconciles).toBe(true)
  })

  it('flags reconciles=false when numbers don\'t match', () => {
    const result = buildCashflowStatement({
      period: { from: '2025-06', to: '2026-06' },
      netProfitTotal: 0,   // deliberately wrong
      depreciationAddback: 0,
      balancesByMonth: balances,
      classifications,
    })
    expect(result.reconciles).toBe(false)
  })

  it('counts unassigned accounts and excludes them from statement sections', () => {
    const withUnassigned: StatementClassification[] = [
      ...classifications,
      {
        xero_account_id: 'mystery',
        account_code: '950',
        account_name: 'Mystery Account',
        account_type: 'Liability',
        list_type: 'Unassigned',
      },
    ]
    const balancesPlus = {
      '2025-06': { ...fromSnap, balancesByAccount: { ...fromSnap.balancesByAccount, mystery: 10000 } },
      '2026-06': { ...toSnap, balancesByAccount: { ...toSnap.balancesByAccount, mystery: 15000 } },
    }
    const result = buildCashflowStatement({
      period: { from: '2025-06', to: '2026-06' },
      netProfitTotal: 55000,
      depreciationAddback: 20000,
      balancesByMonth: balancesPlus,
      classifications: withUnassigned,
    })
    expect(result.unassigned_accounts).toBe(1)
    // Mystery account movement not in any section
    const allLines = [
      ...result.operating_movements,
      ...result.investing_movements,
      ...result.financing_movements,
      ...result.noncash_lines,
    ]
    expect(allLines.some(l => l.account_code === '950')).toBe(false)
  })

  it('handles empty classifications gracefully', () => {
    const result = buildCashflowStatement({
      period: { from: '2025-06', to: '2026-06' },
      netProfitTotal: 100000,
      depreciationAddback: 10000,
      balancesByMonth: balances,
      classifications: [],
    })
    expect(result.operating_movements.length).toBe(0)
    expect(result.investing_movements.length).toBe(0)
    expect(result.financing_movements.length).toBe(0)
    expect(result.net_cash_from_operating).toBe(110000)  // just net profit + depn
    expect(result.net_cash_from_investing).toBe(0)
    expect(result.net_cash_from_financing).toBe(0)
  })

  it('opening and closing cash come from the bank total snapshots', () => {
    const result = buildCashflowStatement({
      period: { from: '2025-06', to: '2026-06' },
      netProfitTotal: 55000,
      depreciationAddback: 20000,
      balancesByMonth: balances,
      classifications,
    })
    expect(result.opening_cash).toBe(100000)
    expect(result.closing_cash).toBe(140000)
    expect(result.net_change_in_cash).toBe(40000)
  })
})
