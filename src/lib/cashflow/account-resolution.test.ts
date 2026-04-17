import { describe, it, expect } from 'vitest'
import {
  buildAccountLookup,
  lineMatchesAccountIds,
  resolveIsDepreciation,
  resolveIsWagesExpense,
  type XeroAccountRef,
  type AccountResolutionSettings,
} from './account-resolution'
import type { PLLine } from '@/app/finances/forecast/types'

const xeroAccounts: XeroAccountRef[] = [
  { xero_account_id: 'uuid-depn-001', account_code: '61600', account_name: 'Depreciation Expense' },
  { xero_account_id: 'uuid-wages-002', account_code: '62170', account_name: 'Wages & Salaries' },
  { xero_account_id: 'uuid-rent-003', account_code: '64100', account_name: 'Rent' },
]

const lookup = buildAccountLookup(xeroAccounts)

function makeLine(name: string, code?: string): PLLine {
  return {
    account_name: name,
    account_code: code,
    category: 'Operating Expenses',
    actual_months: {},
    forecast_months: {},
  }
}

describe('lineMatchesAccountIds', () => {
  it('matches by account_code (most precise)', () => {
    const line = makeLine('Something unrelated', '61600')
    expect(lineMatchesAccountIds(line, ['uuid-depn-001'], lookup)).toBe(true)
  })

  it('falls back to account_name when code not set', () => {
    const line = makeLine('Depreciation Expense')
    expect(lineMatchesAccountIds(line, ['uuid-depn-001'], lookup)).toBe(true)
  })

  it('returns false when neither code nor name match', () => {
    const line = makeLine('Rent', '64100')
    expect(lineMatchesAccountIds(line, ['uuid-depn-001'], lookup)).toBe(false)
  })

  it('handles unknown uuid gracefully', () => {
    const line = makeLine('Depreciation Expense', '61600')
    expect(lineMatchesAccountIds(line, ['uuid-not-in-lookup'], lookup)).toBe(false)
  })
})

describe('resolveIsDepreciation', () => {
  it('falls back to keyword matching when settings null', () => {
    expect(resolveIsDepreciation(makeLine('Depreciation'), null, lookup)).toBe(true)
    expect(resolveIsDepreciation(makeLine('Amortisation'), null, lookup)).toBe(true)
    expect(resolveIsDepreciation(makeLine('Rent'), null, lookup)).toBe(false)
  })

  it('falls back to keyword matching when use_explicit_accounts=false', () => {
    const settings: AccountResolutionSettings = {
      use_explicit_accounts: false,
      depreciation_expense_account_id: 'uuid-depn-001',
    }
    // Even though settings has a depreciation ID, flag is off → use keyword
    expect(resolveIsDepreciation(makeLine('Depreciation'), settings, lookup)).toBe(true)
    expect(resolveIsDepreciation(makeLine('Weird non-depn name', '61600'), settings, lookup)).toBe(false)
  })

  it('uses explicit account ID when use_explicit_accounts=true', () => {
    const settings: AccountResolutionSettings = {
      use_explicit_accounts: true,
      depreciation_expense_account_id: 'uuid-depn-001',
    }
    // Account named "Weird thing" but with code 61600 → matches via explicit ID
    expect(resolveIsDepreciation(makeLine('Weird thing', '61600'), settings, lookup)).toBe(true)
    // Account named "Depreciation" but NOT the configured one → doesn't match
    expect(resolveIsDepreciation(makeLine('Depreciation on small assets', '99999'), settings, lookup)).toBe(false)
  })
})

describe('resolveIsWagesExpense', () => {
  it('returns false when no settings', () => {
    expect(resolveIsWagesExpense(makeLine('Wages'), null, lookup)).toBe(false)
  })

  it('matches configured wages account when use_explicit_accounts=true', () => {
    const settings: AccountResolutionSettings = {
      use_explicit_accounts: true,
      wages_expense_account_id: 'uuid-wages-002',
    }
    expect(resolveIsWagesExpense(makeLine('Wages & Salaries', '62170'), settings, lookup)).toBe(true)
    expect(resolveIsWagesExpense(makeLine('Rent', '64100'), settings, lookup)).toBe(false)
  })
})
