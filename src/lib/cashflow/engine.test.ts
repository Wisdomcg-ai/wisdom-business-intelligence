import { describe, it, expect } from 'vitest'
import {
  generateCashflowForecast,
  getTimingSplit,
  isDepreciationExpense,
} from './engine'
import {
  FY_MONTHS,
  FORECAST,
  baseAssumptions,
  smallBusinessPL,
  payrollSummaryFixture,
  wagesAsPL,
  plLine,
  evenSpread,
} from './__fixtures__/small-business'

// ─── getTimingSplit ──────────────────────────────────────────────────────────

describe('getTimingSplit', () => {
  it('returns 100% same-month for 0 days', () => {
    const split = getTimingSplit(0)
    expect(split).toEqual([{ offset: 0, portion: 1 }])
  })

  it('returns 100% next-month for 30 days', () => {
    const split = getTimingSplit(30)
    const total = split.reduce((s, x) => s + x.portion, 0)
    expect(total).toBeCloseTo(1.0, 6)
    // At exactly 30 days, everything pushes to offset 1 (next month)
    const nextMonth = split.find(s => s.offset === 1)
    expect(nextMonth?.portion).toBeCloseTo(1.0, 6)
  })

  it('splits 50/50 between same-month and next-month for 15 days', () => {
    const split = getTimingSplit(15)
    expect(split).toEqual([
      { offset: 0, portion: 0.5 },
      { offset: 1, portion: 0.5 },
    ])
  })

  it('returns sums of exactly 100% for any day value (no overlap bug)', () => {
    // This was the bug: days=45 previously produced > 100% allocation
    for (const days of [0, 1, 15, 29, 30, 31, 45, 60, 75, 90, 120]) {
      const split = getTimingSplit(days)
      const total = split.reduce((s, x) => s + x.portion, 0)
      expect(total).toBeCloseTo(1.0, 6)
    }
  })

  it('allocates days=45 correctly (50/50 between bucket 1 and 2)', () => {
    const split = getTimingSplit(45)
    const total = split.reduce((s, x) => s + x.portion, 0)
    expect(total).toBeCloseTo(1.0, 6)
    // 45 days: bucket=1, fraction=0.5 → [{offset:1, portion:0.5}, {offset:2, portion:0.5}]
    const m1 = split.find(s => s.offset === 1)
    const m2 = split.find(s => s.offset === 2)
    expect(m1?.portion).toBeCloseTo(0.5, 6)
    expect(m2?.portion).toBeCloseTo(0.5, 6)
  })

  it('handles 60 days as pure 2-month delay', () => {
    const split = getTimingSplit(60)
    const total = split.reduce((s, x) => s + x.portion, 0)
    expect(total).toBeCloseTo(1.0, 6)
    const m2 = split.find(s => s.offset === 2)
    expect(m2?.portion).toBeCloseTo(1.0, 6)
  })
})

// ─── isDepreciationExpense ───────────────────────────────────────────────────

describe('isDepreciationExpense', () => {
  it('matches depreciation-related account names', () => {
    expect(isDepreciationExpense('Depreciation')).toBe(true)
    expect(isDepreciationExpense('depreciation')).toBe(true)
    expect(isDepreciationExpense('Accumulated Depreciation')).toBe(true)
    expect(isDepreciationExpense('Amortisation')).toBe(true)
    expect(isDepreciationExpense('Amortization')).toBe(true)
  })

  it('does not match unrelated accounts', () => {
    expect(isDepreciationExpense('Rent')).toBe(false)
    expect(isDepreciationExpense('Salaries')).toBe(false)
    expect(isDepreciationExpense('Revenue')).toBe(false)
  })
})

// ─── generateCashflowForecast ────────────────────────────────────────────────

describe('generateCashflowForecast', () => {
  it('initialises bank balance from assumptions.opening_bank_balance', () => {
    const result = generateCashflowForecast(
      smallBusinessPL(),
      null,
      baseAssumptions({ opening_bank_balance: 250000 }),
      FORECAST,
    )
    expect(result.months[0].bank_at_beginning).toBeCloseTo(250000, 2)
  })

  it('applies DSO timing to revenue — 30 days pushes all to next month', () => {
    // Revenue-only scenario
    const pl = [plLine('Sales', 'Revenue', 100000)]
    const result = generateCashflowForecast(
      pl, null,
      baseAssumptions({ dso_days: 30, gst_registered: false }),
      FORECAST,
    )
    // Month 0 (July) accrual shows up as cash inflow in Month 1 (August)
    // Note: month 0 also receives a first-month spillover injection
    expect(result.months[1].cash_inflows).toBeCloseTo(100000, 0)
  })

  it('OpEx is paid in the month it is accrued (Calxa Rule 7)', () => {
    // Just rent — should be immediate, not DPO-delayed
    const pl = [plLine('Rent', 'Operating Expenses', 5000)]
    const result = generateCashflowForecast(
      pl, null,
      baseAssumptions({ dpo_days: 30, gst_registered: false }),  // DPO=30 should NOT delay OpEx
      FORECAST,
    )
    // Month 1 (August) — $5000 rent accrued, $5000 cash outflow in same month
    const augExpenses = result.months[1].expense_groups.flatMap(g => g.lines)
    const augRent = augExpenses.find(l => l.label === 'Rent')
    expect(augRent?.value).toBeCloseTo(5000, 0)
  })

  it('excludes depreciation from cash outflows', () => {
    const pl = [plLine('Depreciation', 'Operating Expenses', 2000)]
    const result = generateCashflowForecast(
      pl, null,
      baseAssumptions({ gst_registered: false }),
      FORECAST,
    )
    // No depreciation line should appear in any month's expense groups
    for (const m of result.months) {
      const labels = m.expense_groups.flatMap(g => g.lines).map(l => l.label)
      expect(labels).not.toContain('Depreciation')
    }
  })

  it('includes opening debtors in month 0 cash inflows', () => {
    const pl = [plLine('Sales', 'Revenue', 0)]  // zero revenue to isolate opening debtors
    const result = generateCashflowForecast(
      pl, null,
      baseAssumptions({ opening_trade_debtors: 45000, gst_registered: false }),
      FORECAST,
    )
    expect(result.months[0].cash_inflows).toBeCloseTo(45000, 0)
  })

  it('uses payrollSummary for wage timing when provided', () => {
    const pl = smallBusinessPL()  // includes $1000/month depreciation but NO wages
    const result = generateCashflowForecast(
      pl, payrollSummaryFixture(),
      baseAssumptions({ gst_registered: false }),
      FORECAST,
    )
    // Month 1 should include gross wages from payroll summary
    const empGroup = result.months[1].expense_groups.find(g => g.group === 'Employment Expense')
    expect(empGroup).toBeDefined()
    // Gross wages = admin (8000) + cogs (4000) = 12000
    const grossWagesLine = empGroup?.lines.find(l => l.label === 'Gross Wages')
    expect(grossWagesLine?.value).toBeCloseTo(12000, 0)
  })

  it('skips employment lines from P&L when payrollSummary provided', () => {
    // P&L has wages AND payroll provides wages — should not double-count
    const pl = [...wagesAsPL(), plLine('Rent', 'Operating Expenses', 1000)]
    const result = generateCashflowForecast(
      pl, payrollSummaryFixture(),
      baseAssumptions({ gst_registered: false }),
      FORECAST,
    )
    // Only the payroll summary's gross wages should appear, not the P&L wages line
    const empGroup = result.months[1].expense_groups.find(g => g.group === 'Employment Expense')
    const grossWages = empGroup?.lines.find(l => l.label === 'Gross Wages')
    expect(grossWages?.value).toBeCloseTo(12000, 0)  // from payroll, not $13380 from P&L
  })

  it('pays super quarterly in Jan/Apr/Jul/Oct when frequency is quarterly', () => {
    const pl = [plLine('Sales', 'Revenue', 0)]
    const result = generateCashflowForecast(
      pl, payrollSummaryFixture(),
      baseAssumptions({ super_payment_frequency: 'quarterly', gst_registered: false }),
      FORECAST,
    )
    // October (month index 3) should show super payment (for Q1 Jul-Sep)
    const octMonth = result.months.find(m => m.month === '2025-10')
    const superLine = octMonth?.liability_lines.find(l => l.label === 'Superannuation')
    expect(superLine).toBeDefined()
    expect(Math.abs(superLine!.value)).toBeGreaterThan(0)  // Should have a value
  })

  it('pays GST quarterly on BAS months (Feb/Apr/Jul/Oct) when registered', () => {
    const pl = [plLine('Sales', 'Revenue', 100000)]
    const result = generateCashflowForecast(
      pl, null,
      baseAssumptions({ gst_registered: true, gst_reporting_frequency: 'quarterly' }),
      FORECAST,
    )
    // April (month index 9) should show GST payment (for Q3 Jan-Mar)
    const aprMonth = result.months.find(m => m.month === '2026-04')
    const gstLine = aprMonth?.liability_lines.find(l => l.label === 'GST / BAS Payment')
    expect(gstLine).toBeDefined()
  })

  it('carries bank balance forward correctly month-to-month', () => {
    // Break-even scenario: zero revenue, zero expenses, zero tax
    const pl: any[] = []
    const result = generateCashflowForecast(
      pl, null,
      baseAssumptions({ opening_bank_balance: 50000, gst_registered: false }),
      FORECAST,
    )
    // With no P&L activity, every month's bank_at_end should equal bank_at_beginning
    for (const m of result.months) {
      expect(m.bank_at_end).toBeCloseTo(m.bank_at_beginning, 0)
    }
    expect(result.months[0].bank_at_beginning).toBeCloseTo(50000, 0)
    expect(result.months[11].bank_at_end).toBeCloseTo(50000, 0)
  })

  it('prefers actual_months over forecast_months via getLineValue', () => {
    // July is actual ($70k), rest is forecast ($50k)
    const pl: any[] = [{
      account_name: 'Sales',
      category: 'Revenue',
      actual_months: { '2025-07': 70000 },
      forecast_months: evenSpread(FY_MONTHS.slice(1), 50000),
    }]
    const result = generateCashflowForecast(
      pl, null,
      baseAssumptions({ dso_days: 0, gst_registered: false }),  // immediate for simplicity
      FORECAST,
    )
    // Month 0 (July) shows $70k, not $50k
    expect(result.months[0].cash_inflows).toBeCloseTo(70000, 0)
  })

  it('processes loans: monthly payment reduces principal', () => {
    const pl = [plLine('Sales', 'Revenue', 0)]
    const result = generateCashflowForecast(
      pl, null,
      baseAssumptions({
        gst_registered: false,
        loans: [{
          name: 'Business Loan',
          balance: 100000,
          monthly_repayment: 2000,
          interest_rate: 0.06,
          is_interest_only: false,
        }],
      }),
      FORECAST,
    )
    // First month should show loan payment as liability outflow
    const loanLine = result.months[0].liability_lines.find(l => l.label.includes('Business Loan'))
    expect(loanLine).toBeDefined()
    expect(Math.abs(loanLine!.value)).toBeCloseTo(2000, 0)
  })

  it('handles planned stock changes as cash outflow in specified month', () => {
    const pl = [plLine('Sales', 'Revenue', 0)]
    const result = generateCashflowForecast(
      pl, null,
      baseAssumptions({
        gst_registered: false,
        planned_stock_changes: { '2025-10': 5000 },  // $5k stock purchase in October
      }),
      FORECAST,
    )
    const octMonth = result.months.find(m => m.month === '2025-10')
    const stockLine = octMonth?.asset_lines.find(l => l.label === 'Stock on Hand')
    expect(stockLine).toBeDefined()
    expect(stockLine!.value).toBeLessThan(0)  // outflow
  })

  it('produces a valid totals row that sums across all months', () => {
    const result = generateCashflowForecast(
      smallBusinessPL(), payrollSummaryFixture(),
      baseAssumptions(),
      FORECAST,
    )
    // totals.cash_inflows should equal sum of months
    const sumOfMonths = result.months.reduce((s, m) => s + m.cash_inflows, 0)
    expect(result.totals.cash_inflows).toBeCloseTo(sumOfMonths, 0)
  })
})
