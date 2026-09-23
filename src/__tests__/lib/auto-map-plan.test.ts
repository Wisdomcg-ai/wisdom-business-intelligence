/**
 * WA.5a — non-destructive auto-map planner.
 *
 * The old auto-map blanket-upserted every Xero account with is_confirmed:false,
 * a recomputed report_category and a fuzzy-rematched forecast link — so one
 * click of the Auto-Map button reset a fully-confirmed business (Just Digital:
 * 88 confirmed rows, 84 hand-verified forecast links) back to unconfirmed.
 *
 * These tests pin the replacement's one rule: fill gaps, never overwrite
 * judgement. The most important cases are the ones asserting what does NOT
 * happen to existing rows.
 */
import { describe, it, expect } from 'vitest'
import {
  planAutoMap,
  mapAccountTypeToCategory,
  type XeroAccountInput,
  type ExistingMapping,
  type ForecastLine,
} from '@/lib/monthly-report/auto-map'

const BIZ = 'b1000000-0000-0000-0000-000000000000'

const acc = (
  name: string,
  type = 'opex',
  code: string | null = null,
  section = '',
): XeroAccountInput => ({ account_name: name, account_code: code, account_type: type, section })

const existing = (
  name: string,
  opts: { confirmed?: boolean; linked?: boolean } = {},
): ExistingMapping => ({
  xero_account_name: name,
  is_confirmed: opts.confirmed ?? false,
  forecast_pl_line_id: opts.linked ? 'f-linked' : null,
})

const fLine = (id: string, name: string, code: string | null = null): ForecastLine => ({
  id,
  account_name: name,
  account_code: code,
})

describe('planAutoMap — unmapped accounts', () => {
  it('inserts a row for every unmapped account', () => {
    const plan = planAutoMap({
      businessId: BIZ,
      xeroAccounts: [acc('Rent'), acc('Sales', 'revenue')],
      existingMappings: [],
      forecastLines: [],
      now: '2026-08-31T00:00:00.000Z',
    })
    expect(plan.toInsert).toHaveLength(2)
    expect(plan.toLinkForecast).toHaveLength(0)
    expect(plan.toInsert.every((r) => r.is_auto_mapped && !r.is_confirmed)).toBe(true)
    expect(plan.toInsert.find((r) => r.xero_account_name === 'Sales')?.report_category).toBe(
      'Revenue',
    )
  })

  it('dedupes repeated account names (one row per period_month upstream)', () => {
    const plan = planAutoMap({
      businessId: BIZ,
      xeroAccounts: [acc('Rent'), acc('Rent'), acc('Rent')],
      existingMappings: [],
      forecastLines: [],
    })
    expect(plan.xeroAccounts).toBe(1)
    expect(plan.toInsert).toHaveLength(1)
  })

  it('links new rows to the forecast by code first, then by name', () => {
    const plan = planAutoMap({
      businessId: BIZ,
      xeroAccounts: [acc('Rent Expense', 'opex', '469'), acc('Wages & Salaries', 'opex')],
      existingMappings: [],
      forecastLines: [fLine('f1', 'Rent', '469'), fLine('f2', 'Salaries & Wages')],
    })
    const rent = plan.toInsert.find((r) => r.xero_account_name === 'Rent Expense')
    const wages = plan.toInsert.find((r) => r.xero_account_name === 'Wages & Salaries')
    expect(rent?.forecast_pl_line_id).toBe('f1') // code beats the name mismatch
    expect(wages?.forecast_pl_line_id).toBe('f2') // word-order-insensitive name match
    expect(plan.matchedByCode).toBe(1)
    expect(plan.matchedByName).toBe(1)
    expect(plan.matchedToForecast).toBe(2)
  })
})

describe('planAutoMap — existing rows are never overwritten', () => {
  it('a confirmed row produces no insert and no update, ever', () => {
    // The Just Digital scenario: everything confirmed and linked.
    const plan = planAutoMap({
      businessId: BIZ,
      xeroAccounts: [acc('Rent', 'opex', '469')],
      existingMappings: [existing('Rent', { confirmed: true, linked: true })],
      forecastLines: [fLine('f-other', 'Rent', '469')],
    })
    expect(plan.toInsert).toHaveLength(0)
    expect(plan.toLinkForecast).toHaveLength(0)
    expect(plan.preserved).toBe(1)
    expect(plan.confirmedPreserved).toBe(1)
  })

  it('a confirmed but unlinked row is still untouched — confirmation wins', () => {
    // A coach confirming "no budget line for this account" is a decision, not a gap.
    const plan = planAutoMap({
      businessId: BIZ,
      xeroAccounts: [acc('Rent', 'opex', '469')],
      existingMappings: [existing('Rent', { confirmed: true, linked: false })],
      forecastLines: [fLine('f1', 'Rent', '469')],
    })
    expect(plan.toLinkForecast).toHaveLength(0)
    expect(plan.confirmedPreserved).toBe(1)
  })

  it('an unconfirmed row that already has a link keeps it', () => {
    const plan = planAutoMap({
      businessId: BIZ,
      xeroAccounts: [acc('Rent', 'opex', '469')],
      existingMappings: [existing('Rent', { confirmed: false, linked: true })],
      forecastLines: [fLine('f-different', 'Rent', '469')],
    })
    expect(plan.toInsert).toHaveLength(0)
    expect(plan.toLinkForecast).toHaveLength(0)
    expect(plan.preserved).toBe(1)
  })

  it('fills the forecast link on an unconfirmed, unlinked row — and nothing else', () => {
    // The Efficient Living shape: mapped before a forecast existed (87 rows,
    // 0 confirmed, 0 linked). Re-running auto-map should add links only.
    const plan = planAutoMap({
      businessId: BIZ,
      xeroAccounts: [acc('Rent', 'opex', '469')],
      existingMappings: [existing('Rent')],
      forecastLines: [fLine('f1', 'Rent', '469')],
    })
    expect(plan.toInsert).toHaveLength(0)
    expect(plan.toLinkForecast).toEqual([
      { xero_account_name: 'Rent', forecast_pl_line_id: 'f1', forecast_pl_line_name: 'Rent' },
    ])
    expect(plan.preserved).toBe(1)
  })

  it('mixes correctly: inserts only the new account on a mostly-mapped business', () => {
    const plan = planAutoMap({
      businessId: BIZ,
      xeroAccounts: [acc('Rent'), acc('Sales', 'revenue'), acc('Brand New Account')],
      existingMappings: [
        existing('Rent', { confirmed: true }),
        existing('Sales', { confirmed: true, linked: true }),
      ],
      forecastLines: [],
    })
    expect(plan.toInsert.map((r) => r.xero_account_name)).toEqual(['Brand New Account'])
    expect(plan.preserved).toBe(2)
    expect(plan.confirmedPreserved).toBe(2)
  })

  it('treats is_confirmed null as unconfirmed', () => {
    const plan = planAutoMap({
      businessId: BIZ,
      xeroAccounts: [acc('Rent', 'opex', '469')],
      existingMappings: [
        { xero_account_name: 'Rent', is_confirmed: null, forecast_pl_line_id: null },
      ],
      forecastLines: [fLine('f1', 'Rent', '469')],
    })
    expect(plan.toLinkForecast).toHaveLength(1)
  })
})

describe('mapAccountTypeToCategory', () => {
  it.each([
    ['revenue', 'Revenue'],
    ['cogs', 'Cost of Sales'],
    ['opex', 'Operating Expenses'],
    ['other_income', 'Other Income'],
    ['other_expense', 'Other Expenses'],
    ['', 'Operating Expenses'],
    ['unknown_type', 'Operating Expenses'],
  ])('%s -> %s', (input, expected) => {
    expect(mapAccountTypeToCategory(input)).toBe(expected)
  })
})
