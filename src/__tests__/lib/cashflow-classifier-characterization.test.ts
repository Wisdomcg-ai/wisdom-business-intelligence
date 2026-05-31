/**
 * CHARACTERIZATION / GOLDEN-MASTER TESTS — Stream 3
 *
 * Pins the CURRENT behavior of the cashflow keyword classifier in
 * `src/lib/cashflow/engine.ts` to the cent, ahead of a refactor. These tests
 * lock today's exact numeric output so the refactor cannot silently change
 * money math or classification routing.
 *
 * NOTE: The classifier helpers (classifyExpenseGroup, isGSTExemptExpense,
 * isEmploymentExpense, isBankFee) are NOT exported, so we pin their observable
 * effects THROUGH the public `generateCashflowForecast` entry point. Only
 * `isDepreciationExpense` is exported and pinned directly.
 *
 * Engine GST gross-up rules (verified against source, ~lines 454-460):
 *   - GST-exempt OpEx (isGSTExemptExpense match): cashAmount = accrual (no GST)
 *   - Taxable OpEx:  cashAmount = accrual * (1 + gst_rate * gst_applicable_expense_pct)
 *   With baseAssumptions: gst_rate=0.10, gst_applicable_expense_pct=0.80
 *     => taxable multiplier = 1 + 0.10 * 0.80 = 1.08
 */

import { describe, it, expect } from 'vitest'
import {
  generateCashflowForecast,
  isDepreciationExpense,
} from '@/lib/cashflow/engine'
import {
  FORECAST,
  baseAssumptions,
  plLine,
} from '@/lib/cashflow/__fixtures__/small-business'

/**
 * Drive a single OpEx P&L line through the public engine and return the
 * expense-group + line-value as observed in a steady forecast month
 * (month index 1 = 2025-08, the first all-forecast month).
 */
function classifyViaEngine(
  accountName: string,
  monthlyAmount: number,
  opts: Parameters<typeof baseAssumptions>[0] = {},
) {
  const result = generateCashflowForecast(
    [plLine(accountName, 'Operating Expenses', monthlyAmount)],
    null,
    baseAssumptions(opts),
    FORECAST,
  )
  const month = result.months[1] // 2025-08 — steady forecast month
  for (const group of month.expense_groups) {
    const line = group.lines.find(l => l.label === accountName)
    if (line) return { group: group.group, value: line.value }
  }
  return { group: undefined as string | undefined, value: undefined as number | undefined }
}

// ─── 1. Each of the 7 expense groups ─────────────────────────────────────────
// One representative keyword per group (from EXPENSE_GROUP_KEYWORDS ~lines 29-38).
// GST turned OFF here so the pinned dollar value equals the raw accrual and the
// test isolates CLASSIFICATION routing only.

describe('expense-group classification (via public engine, GST off)', () => {
  const cases: { name: string; keyword: string; expectedGroup: string }[] = [
    { name: 'Staff Wages',          keyword: 'wage',        expectedGroup: 'Employment Expense' },
    { name: 'Airfare & Travel',     keyword: 'travel',      expectedGroup: 'Travel & Accommodation' },
    { name: 'Accounting Services',  keyword: 'accounting',  expectedGroup: 'Professional Expense' },
    { name: 'Software Licenses',    keyword: 'software',    expectedGroup: 'IT Hardware and Software' },
    { name: 'Marketing Campaign',   keyword: 'marketing',   expectedGroup: 'Marketing and Advertising' },
    { name: 'Office Rent',          keyword: 'rent',        expectedGroup: 'Occupancy Expense' },
    { name: 'Merchant Fees',        keyword: 'merchant',    expectedGroup: 'Bank and Other Fees' },
  ]

  for (const { name, keyword, expectedGroup } of cases) {
    it(`'${name}' (keyword "${keyword}") → ${expectedGroup}`, () => {
      const { group, value } = classifyViaEngine(name, 1000, { gst_registered: false })
      expect(group).toBe(expectedGroup)
      // GST off → cash value equals raw accrual to the cent
      expect(value).toBeCloseTo(1000, 2)
    })
  }
})

// ─── 2. Catch-all bucket ─────────────────────────────────────────────────────

describe('catch-all classification', () => {
  it("a line matching no keyword lands in 'Other Operating Expenses'", () => {
    // 'Sundry Subscriptions Q' avoids every keyword in EXPENSE_GROUP_KEYWORDS.
    const { group, value } = classifyViaEngine('Sundry Subscriptions Q', 1000, {
      gst_registered: false,
    })
    expect(group).toBe('Other Operating Expenses')
    expect(value).toBeCloseTo(1000, 2)
  })
})

// ─── 3. GST-exempt vs GST-taxable gross-up (golden to the cent) ───────────────

describe('GST gross-up golden masters (gst_rate=0.10, gst_applicable_expense_pct=0.80)', () => {
  it('GST-EXEMPT wage line ("Wages & Salaries") → NO gross-up: $5000 stays $5000.00', () => {
    // 'wage'/'salary' are GST_EXEMPT_KEYWORDS → cashAmount = accrual (no GST).
    // Employment-keyword routing puts it in Employment Expense group.
    const { group, value } = classifyViaEngine('Wages & Salaries', 5000)
    expect(group).toBe('Employment Expense')
    // GOLDEN: exempt → exactly the accrual, no gross-up.
    expect(value).toBe(5000)
  })

  it('GST-TAXABLE ordinary expense ("Office Rent") → 1.08x gross-up: $5000 → $5400.00', () => {
    // Taxable: 5000 * (1 + 0.10 * 0.80) = 5000 * 1.08 = 5400.00 exactly.
    const { group, value } = classifyViaEngine('Office Rent', 5000)
    expect(group).toBe('Occupancy Expense')
    // GOLDEN: locked taxable gross-up amount.
    expect(value).toBe(5400)
  })

  it('GST gross-up delta between exempt and taxable is exactly $400.00 on $5000', () => {
    const exempt = classifyViaEngine('Wages & Salaries', 5000).value!
    const taxable = classifyViaEngine('Office Rent', 5000).value!
    // GOLDEN: 5400 - 5000 = 400.00
    expect(taxable - exempt).toBe(400)
  })

  it('insurance is GST-exempt by keyword → NO gross-up ($500 stays $500.00)', () => {
    // 'insurance' is in GST_EXEMPT_KEYWORDS but NOT an employment keyword, so it
    // is taxable-routed to a group yet exempt from gross-up.
    const { group, value } = classifyViaEngine('Insurance', 500)
    // 'insurance' matches no EXPENSE_GROUP keyword → catch-all group.
    expect(group).toBe('Other Operating Expenses')
    expect(value).toBe(500) // GOLDEN: exempt, no gross-up
  })
})

// ─── 4. GST-paid accrual behavior on a taxable expense ───────────────────────

describe('GST-paid accrual on a taxable OpEx line (BAS payment golden)', () => {
  it('taxable OpEx feeds monthGSTPaid → reduces quarterly BAS payment to the cent', () => {
    // Single taxable expense, GST registered, quarterly BAS.
    // Each forecast month: accrual 5000, cash 5400, GST embedded in cash =
    //   5400 * (0.08 / 1.08) = 400.00 per month.
    // No revenue → accruedGST goes negative (a GST refund) each quarter.
    const result = generateCashflowForecast(
      [plLine('Office Rent', 'Operating Expenses', 5000)],
      null,
      baseAssumptions({
        gst_registered: true,
        gst_reporting_frequency: 'quarterly',
        opening_bank_balance: 0,
      }),
      FORECAST,
    )
    // October 2025 is a BAS payment month settling Q1 (Jul-Aug-Sep).
    // Jul (actual) + Aug + Sep each pay $400 GST → accruedGST = -1200.
    // GST/BAS Payment line = -(-1200) = +1200.00 (a refund inflow).
    const oct = result.months.find(m => m.month === '2025-10')!
    const gstLine = oct.liability_lines.find(l => l.label === 'GST / BAS Payment')
    expect(gstLine).toBeDefined()
    // GOLDEN: exact quarterly GST refund pinned to the cent.
    expect(gstLine!.value).toBe(1200)
  })
})

// ─── 5. Employment-expense and depreciation classification ───────────────────

describe('employment-expense classification (via engine, no payroll summary)', () => {
  it('"Superannuation" routes to Employment Expense (keyword "super")', () => {
    const { group } = classifyViaEngine('Superannuation', 1380, { gst_registered: false })
    expect(group).toBe('Employment Expense')
  })

  it('"Payroll Costs" routes to Employment Expense (keyword "payroll")', () => {
    const { group } = classifyViaEngine('Payroll Costs', 1000, { gst_registered: false })
    expect(group).toBe('Employment Expense')
  })
})

describe('depreciation classification (exported helper + engine exclusion)', () => {
  it('isDepreciationExpense matches depreciation / amortisation account names', () => {
    expect(isDepreciationExpense('Depreciation')).toBe(true)
    expect(isDepreciationExpense('depreciation')).toBe(true)
    expect(isDepreciationExpense('Amortisation')).toBe(true)
    expect(isDepreciationExpense('Amortization')).toBe(true)
    expect(isDepreciationExpense('Rent')).toBe(false)
  })

  it('depreciation OpEx line is EXCLUDED from cash outflows in every month', () => {
    const result = generateCashflowForecast(
      [plLine('Depreciation', 'Operating Expenses', 2000)],
      null,
      baseAssumptions({ gst_registered: false }),
      FORECAST,
    )
    for (const m of result.months) {
      const labels = m.expense_groups.flatMap(g => g.lines).map(l => l.label)
      expect(labels).not.toContain('Depreciation')
    }
  })
})

// ─── 6. isBankFee dead-code pin ──────────────────────────────────────────────

describe('isBankFee dead-code characterization', () => {
  it("documents that isBankFee is unreferenced; bank-fee routing flows through classifyExpenseGroup instead", () => {
    // CHARACTERIZATION: isBankFee appears dead — pinning raw behavior.
    // `isBankFee` (engine.ts ~lines 64-67) is defined but NEVER called anywhere
    // in the codebase (grep confirms a single definition, zero references). It
    // is also not exported, so we cannot invoke it directly. The OpEx loop does
    // NOT use isBankFee; bank-fee lines are routed purely via classifyExpenseGroup
    // matching the same 'Bank and Other Fees' keyword array.
    //
    // We pin the OBSERVABLE consequence: a 'Bank Fees' line still classifies into
    // 'Bank and Other Fees' (proving the keyword array routes correctly) even
    // though isBankFee itself is dead. If a refactor wires isBankFee in or
    // changes this routing, this golden fails.
    const { group, value } = classifyViaEngine('Bank Fees', 250, { gst_registered: false })
    expect(group).toBe('Bank and Other Fees')
    expect(value).toBeCloseTo(250, 2)
  })
})
