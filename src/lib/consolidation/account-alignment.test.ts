import { describe, it, expect } from 'vitest'
import {
  accountAlignmentKey,
  deduplicateLines,
  buildAlignedAccountUniverse,
  buildEntityColumn,
} from './account-alignment'
import type { XeroPLLineLike, ConsolidationTenant } from './types'
import {
  FY_MONTHS,
  dragonRoofingPL,
  easyHailPL,
  DRAGON_ROOFING_BIZ,
  DRAGON_ROOFING_TENANT,
} from './__fixtures__/dragon-mar-2026'

describe('accountAlignmentKey', () => {
  it('normalizes type + name (lowercase + trim)', () => {
    expect(accountAlignmentKey({ account_type: 'Revenue', account_name: '  Sales - Deposit  ' })).toBe(
      'revenue::sales - deposit',
    )
  })

  it('same name under different type yields different keys (Pitfall 4)', () => {
    const a = accountAlignmentKey({ account_type: 'opex', account_name: 'Bank Fees' })
    const b = accountAlignmentKey({ account_type: 'other_expense', account_name: 'Bank Fees' })
    expect(a).not.toBe(b)
  })
})

describe('deduplicateLines', () => {
  it('sums monthly_values of duplicate account_name rows', () => {
    const input: XeroPLLineLike[] = [
      {
        business_id: 'x',
        tenant_id: 't1',
        account_name: 'Sales',
        account_type: 'revenue',
        section: 'Revenue',
        monthly_values: { '2026-03': 100, '2026-04': 50 },
      },
      {
        business_id: 'x',
        tenant_id: 't1',
        account_name: 'Sales',
        account_type: 'revenue',
        section: 'Revenue',
        monthly_values: { '2026-03': 200, '2026-05': 30 },
      },
    ]
    const result = deduplicateLines(input)
    expect(result.length).toBe(1)
    expect(result[0].monthly_values).toEqual({ '2026-03': 300, '2026-04': 50, '2026-05': 30 })
  })

  it('prefers populated account_code and section when merging a partial dupe', () => {
    const input: XeroPLLineLike[] = [
      {
        business_id: 'x',
        tenant_id: 't1',
        account_name: 'Fees',
        account_code: null,
        account_type: 'opex',
        section: '',
        monthly_values: { '2026-03': 10 },
      },
      {
        business_id: 'x',
        tenant_id: 't1',
        account_name: 'Fees',
        account_code: '410',
        account_type: 'opex',
        section: 'Operating Expenses',
        monthly_values: { '2026-03': 5 },
      },
    ]
    const result = deduplicateLines(input)
    expect(result.length).toBe(1)
    expect(result[0].account_code).toBe('410')
    expect(result[0].section).toBe('Operating Expenses')
    expect(result[0].monthly_values['2026-03']).toBe(15)
  })
})

describe('buildAlignedAccountUniverse — Dragon fixture', () => {
  it('produces a single universe covering accounts from both tenants', () => {
    const universe = buildAlignedAccountUniverse([dragonRoofingPL, easyHailPL])
    const names = universe.map((u) => u.account_name)
    expect(names).toContain('Advertising & Marketing')
    expect(names).toContain('Sales - Deposit')
    expect(names).toContain('Referral Fee - Easy Hail')
    expect(names).toContain('Sales - Referral Fee')
  })

  it('merges shared accounts (Advertising & Marketing appears exactly once)', () => {
    const universe = buildAlignedAccountUniverse([dragonRoofingPL, easyHailPL])
    const advMatches = universe.filter((u) => u.account_name === 'Advertising & Marketing')
    expect(advMatches.length).toBe(1)
  })

  it('sorts revenue accounts before opex', () => {
    const universe = buildAlignedAccountUniverse([dragonRoofingPL, easyHailPL])
    const revIdx = universe.findIndex((u) => u.account_type === 'revenue')
    const opexIdx = universe.findIndex((u) => u.account_type === 'opex')
    expect(revIdx).toBeLessThan(opexIdx)
  })
})

describe('buildEntityColumn — fills absent accounts with $0', () => {
  const dragonTenant: ConsolidationTenant = {
    connection_id: 'c-dragon',
    business_id: DRAGON_ROOFING_BIZ,
    tenant_id: DRAGON_ROOFING_TENANT,
    display_name: 'Dragon Roofing Pty Ltd',
    display_order: 0,
    functional_currency: 'AUD',
    include_in_consolidation: true,
  }

  it('Dragon tenant column covers every universe row including Easy-Hail-only accounts', () => {
    const universe = buildAlignedAccountUniverse([dragonRoofingPL, easyHailPL])
    const col = buildEntityColumn(dragonTenant, dragonRoofingPL, universe, FY_MONTHS)
    expect(col.lines.length).toBe(universe.length)
    const depositRow = col.lines.find((l) => l.account_name === 'Sales - Deposit')
    expect(depositRow).toBeDefined()
    expect(depositRow!.monthly_values['2026-03']).toBe(0)
  })

  it('filler rows contain all FY months initialised to 0', () => {
    const universe = buildAlignedAccountUniverse([dragonRoofingPL, easyHailPL])
    const col = buildEntityColumn(dragonTenant, dragonRoofingPL, universe, FY_MONTHS)
    const depositRow = col.lines.find((l) => l.account_name === 'Sales - Deposit')
    expect(depositRow).toBeDefined()
    for (const m of FY_MONTHS) {
      expect(depositRow!.monthly_values[m]).toBe(0)
    }
  })
})
