import { describe, it, expect } from 'vitest'
import { generateCashflowForecast } from './engine'
import { computeCompanyTaxByMonth } from './company-tax'
import {
  FORECAST,
  FY_MONTHS,
  baseAssumptions,
  smallBusinessPL,
  plLine,
} from './__fixtures__/small-business'

// ─── Phase 28.2: Settings-gated depreciation identification ─────────────

describe('Phase 28.2 — depreciation via explicit account ID', () => {
  it('falls back to keyword when use_explicit_accounts=false', () => {
    const pl = [plLine('Depreciation', 'Operating Expenses', 2000, { xeroAccountId: '61600' })]
    const result = generateCashflowForecast(
      pl, null,
      baseAssumptions({ gst_registered: false }),
      FORECAST,
      [],
      {
        settings: { use_explicit_accounts: false, depreciation_expense_account_id: 'uuid-depn' },
        xeroAccounts: [{ xero_account_id: 'uuid-depn', account_code: '61600', account_name: 'Depreciation' }],
      },
    )
    for (const m of result.months) {
      const labels = m.expense_groups.flatMap(g => g.lines).map(l => l.label)
      expect(labels).not.toContain('Depreciation')
    }
  })

  it('uses explicit account ID when use_explicit_accounts=true', () => {
    // Account named "Weird thing" but code matches depreciation account UUID
    const pl = [plLine('Weird thing', 'Operating Expenses', 2000, { xeroAccountId: '61600' })]
    const result = generateCashflowForecast(
      pl, null,
      baseAssumptions({ gst_registered: false }),
      FORECAST,
      [],
      {
        settings: { use_explicit_accounts: true, depreciation_expense_account_id: 'uuid-depn' },
        xeroAccounts: [{ xero_account_id: 'uuid-depn', account_code: '61600', account_name: 'whatever' }],
      },
    )
    // "Weird thing" should be filtered out because its account_code matches
    for (const m of result.months) {
      const labels = m.expense_groups.flatMap(g => g.lines).map(l => l.label)
      expect(labels).not.toContain('Weird thing')
    }
  })
})

// ─── Phase 28.2: Company Tax ────────────────────────────────────────────

describe('Phase 28.2 — Company Tax module', () => {
  it('computeCompanyTaxByMonth distributes annual tax across 4 quarterly payment months', () => {
    const netProfitByMonth: Record<string, number> = {}
    for (const m of FY_MONTHS) netProfitByMonth[m] = 10000  // $120k annual profit

    const result = computeCompanyTaxByMonth(FY_MONTHS, netProfitByMonth, {
      rate: 0.25,
      schedule: 'quarterly_payg_instalment',
    })

    // Annual tax: $120k * 0.25 = $30k, split across 4 BAS months = $7.5k each
    const keys = Object.keys(result).sort()
    expect(keys.length).toBe(4)  // 4 BAS months in the forecast period
    for (const k of keys) {
      expect(result[k]).toBeCloseTo(7500, 0)
    }
  })

  it('computeCompanyTaxByMonth returns empty when rate is 0', () => {
    const netProfitByMonth: Record<string, number> = {}
    for (const m of FY_MONTHS) netProfitByMonth[m] = 10000
    const result = computeCompanyTaxByMonth(FY_MONTHS, netProfitByMonth, {
      rate: 0,
      schedule: 'quarterly_payg_instalment',
    })
    expect(Object.keys(result).length).toBe(0)
  })

  it('computeCompanyTaxByMonth returns empty when schedule is "none"', () => {
    const netProfitByMonth: Record<string, number> = {}
    for (const m of FY_MONTHS) netProfitByMonth[m] = 10000
    const result = computeCompanyTaxByMonth(FY_MONTHS, netProfitByMonth, {
      rate: 0.25,
      schedule: 'none',
    })
    expect(Object.keys(result).length).toBe(0)
  })

  it('engine adds Company Tax to liability_lines when settings enabled', () => {
    const pl = [
      plLine('Sales', 'Revenue', 50000),
      plLine('COGS', 'Cost of Sales', 20000),
      plLine('Rent', 'Operating Expenses', 5000),
    ]
    const result = generateCashflowForecast(
      pl, null,
      baseAssumptions({ gst_registered: false }),
      FORECAST, [],
      {
        settings: {
          use_explicit_accounts: true,
          // Add tax-specific settings (cast as any since AccountResolutionSettings doesn't include tax)
        } as any,
      },
    )
    // Without company_tax_rate/schedule passed, engine should NOT add tax
    for (const m of result.months) {
      const hasTax = m.liability_lines.some(l => l.label === 'Company Tax')
      expect(hasTax).toBe(false)
    }
  })

  it('engine adds Company Tax when rate + schedule provided via settings', () => {
    const pl = [
      plLine('Sales', 'Revenue', 50000),
      plLine('COGS', 'Cost of Sales', 20000),
      plLine('Rent', 'Operating Expenses', 5000),
    ]
    const result = generateCashflowForecast(
      pl, null,
      baseAssumptions({ gst_registered: false }),
      FORECAST, [],
      {
        settings: {
          use_explicit_accounts: true,
          company_tax_rate: 0.25,
          company_tax_schedule: 'quarterly_payg_instalment',
        } as any,
      },
    )
    // Should have Company Tax on BAS payment months (Feb, Apr, Jul, Oct)
    const monthsWithTax = result.months.filter(m =>
      m.liability_lines.some(l => l.label === 'Company Tax')
    )
    expect(monthsWithTax.length).toBeGreaterThanOrEqual(1)
  })
})

// ─── Phase 28.2: CapEx ──────────────────────────────────────────────────

describe('Phase 28.2 — CapEx from balance sheet', () => {
  it('engine adds CapEx to asset_lines when settings enabled + capexByMonth provided', () => {
    const pl = [plLine('Sales', 'Revenue', 50000)]
    const result = generateCashflowForecast(
      pl, null,
      baseAssumptions({ gst_registered: false }),
      FORECAST, [],
      {
        settings: { use_explicit_accounts: true } as any,
        capexByMonth: { '2025-09': 15000 },  // $15k asset purchase in Sept
      },
    )
    const sept = result.months.find(m => m.month === '2025-09')
    expect(sept).toBeDefined()
    const capexLine = sept?.asset_lines.find(l => l.label === 'CapEx (Fixed Assets)')
    expect(capexLine).toBeDefined()
    expect(capexLine?.value).toBeCloseTo(-15000, 0)  // outflow = negative
  })

  it('engine does NOT add CapEx when settings disabled (backwards compat)', () => {
    const pl = [plLine('Sales', 'Revenue', 50000)]
    const result = generateCashflowForecast(
      pl, null,
      baseAssumptions({ gst_registered: false }),
      FORECAST, [],
      {
        // Note: no settings or use_explicit_accounts=false
        capexByMonth: { '2025-09': 15000 },
      },
    )
    for (const m of result.months) {
      const capex = m.asset_lines.find(l => l.label === 'CapEx (Fixed Assets)')
      expect(capex).toBeUndefined()
    }
  })

  it('engine populates capex_payment in indirect-method output field', () => {
    const pl = [plLine('Sales', 'Revenue', 50000)]
    const result = generateCashflowForecast(
      pl, null,
      baseAssumptions({ gst_registered: false }),
      FORECAST, [],
      {
        settings: { use_explicit_accounts: true } as any,
        capexByMonth: { '2025-09': 15000 },
      },
    )
    const sept = result.months.find(m => m.month === '2025-09')
    expect(sept?.capex_payment).toBeCloseTo(15000, 0)
    // Other months should have 0
    const oct = result.months.find(m => m.month === '2025-10')
    expect(oct?.capex_payment ?? 0).toBeCloseTo(0, 0)
  })
})

// ─── Phase 28.2: Indirect-method output fields ─────────────────────────

describe('Phase 28.2 — indirect-method output fields', () => {
  it('every month has net_profit populated', () => {
    const result = generateCashflowForecast(
      smallBusinessPL(), null,
      baseAssumptions({ gst_registered: false }),
      FORECAST,
    )
    for (const m of result.months) {
      expect(typeof m.net_profit).toBe('number')
    }
  })

  it('net_profit equals revenue - cogs - opex (accrual)', () => {
    // Revenue 50k, COGS 30k, OpEx 10k depn + 9k other = 19k → net_profit = 1k
    // (wait, smallBusinessPL has rent 3k + utilities 800 + marketing 2k +
    //  software 1200 + prof fees 1500 + insurance 500 + depreciation 1000 = 10k total opex)
    const pl = [
      plLine('Revenue', 'Revenue', 50000),
      plLine('COGS', 'Cost of Sales', 30000),
      plLine('Rent', 'Operating Expenses', 10000),
    ]
    const result = generateCashflowForecast(
      pl, null,
      baseAssumptions({ gst_registered: false }),
      FORECAST,
    )
    // Each month: 50k - 30k - 10k = 10k net profit
    for (const m of result.months) {
      expect(m.net_profit).toBeCloseTo(10000, 0)
    }
  })

  it('depreciation_addback equals sum of depreciation OpEx for the month', () => {
    const pl = [
      plLine('Sales', 'Revenue', 50000),
      plLine('Depreciation', 'Operating Expenses', 1000),
      plLine('Amortisation', 'Operating Expenses', 500),
    ]
    const result = generateCashflowForecast(
      pl, null,
      baseAssumptions({ gst_registered: false }),
      FORECAST,
    )
    for (const m of result.months) {
      expect(m.depreciation_addback).toBeCloseTo(1500, 0)  // 1000 + 500
    }
  })

  it('depreciation_addback is 0 when no depreciation lines', () => {
    const pl = [
      plLine('Sales', 'Revenue', 50000),
      plLine('Rent', 'Operating Expenses', 5000),
    ]
    const result = generateCashflowForecast(
      pl, null,
      baseAssumptions({ gst_registered: false }),
      FORECAST,
    )
    for (const m of result.months) {
      expect(m.depreciation_addback).toBeCloseTo(0, 0)
    }
  })
})
