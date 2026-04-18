import { describe, it, expect } from 'vitest'
import {
  accountAlignmentKey,
  deduplicateMemberLines,
  buildAlignedAccountUniverse,
  buildEntityColumn,
} from './account-alignment'
import type { XeroPLLineLike, ConsolidationMember } from './types'
import {
  FY_MONTHS,
  dragonRoofingPL,
  easyHailPL,
  DRAGON_ROOFING_BIZ,
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

describe('deduplicateMemberLines', () => {
  it('sums monthly_values of duplicate account_name rows', () => {
    const input: XeroPLLineLike[] = [
      {
        business_id: 'x',
        account_name: 'Sales',
        account_type: 'revenue',
        section: 'Revenue',
        monthly_values: { '2026-03': 100, '2026-04': 50 },
      },
      {
        business_id: 'x',
        account_name: 'Sales',
        account_type: 'revenue',
        section: 'Revenue',
        monthly_values: { '2026-03': 200, '2026-05': 30 },
      },
    ]
    const result = deduplicateMemberLines(input)
    expect(result.length).toBe(1)
    expect(result[0].monthly_values).toEqual({ '2026-03': 300, '2026-04': 50, '2026-05': 30 })
  })

  it('prefers populated account_code and section when merging a partial dupe', () => {
    const input: XeroPLLineLike[] = [
      {
        business_id: 'x',
        account_name: 'Fees',
        account_code: null,
        account_type: 'opex',
        section: '',
        monthly_values: { '2026-03': 10 },
      },
      {
        business_id: 'x',
        account_name: 'Fees',
        account_code: '410',
        account_type: 'opex',
        section: 'Operating Expenses',
        monthly_values: { '2026-03': 5 },
      },
    ]
    const result = deduplicateMemberLines(input)
    expect(result.length).toBe(1)
    expect(result[0].account_code).toBe('410')
    expect(result[0].section).toBe('Operating Expenses')
    expect(result[0].monthly_values['2026-03']).toBe(15)
  })
})

describe('buildAlignedAccountUniverse — Dragon fixture', () => {
  it('produces a single universe covering accounts from both members', () => {
    const universe = buildAlignedAccountUniverse([dragonRoofingPL, easyHailPL])
    // At minimum the elimination-pivot accounts must appear
    const names = universe.map((u) => u.account_name)
    expect(names).toContain('Advertising & Marketing') // shared between members
    expect(names).toContain('Sales - Deposit') // Easy Hail only
    expect(names).toContain('Referral Fee - Easy Hail') // Dragon only
    expect(names).toContain('Sales - Referral Fee') // Easy Hail only
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
  it('Dragon entity column covers every universe row including Easy-Hail-only accounts', () => {
    const universe = buildAlignedAccountUniverse([dragonRoofingPL, easyHailPL])
    const dragonMember: ConsolidationMember = {
      id: 'm-dragon',
      group_id: 'g1',
      source_business_id: DRAGON_ROOFING_BIZ,
      display_name: 'Dragon Roofing Pty Ltd',
      display_order: 0,
      functional_currency: 'AUD',
    }
    const col = buildEntityColumn(dragonMember, dragonRoofingPL, universe, FY_MONTHS)
    expect(col.lines.length).toBe(universe.length)
    const depositRow = col.lines.find((l) => l.account_name === 'Sales - Deposit')
    expect(depositRow).toBeDefined()
    expect(depositRow!.monthly_values['2026-03']).toBe(0) // absent in Dragon → $0 filler
  })

  it('filler rows contain all FY months initialised to 0', () => {
    const universe = buildAlignedAccountUniverse([dragonRoofingPL, easyHailPL])
    const dragonMember: ConsolidationMember = {
      id: 'm-dragon',
      group_id: 'g1',
      source_business_id: DRAGON_ROOFING_BIZ,
      display_name: 'Dragon Roofing Pty Ltd',
      display_order: 0,
      functional_currency: 'AUD',
    }
    const col = buildEntityColumn(dragonMember, dragonRoofingPL, universe, FY_MONTHS)
    const depositRow = col.lines.find((l) => l.account_name === 'Sales - Deposit')
    expect(depositRow).toBeDefined()
    for (const m of FY_MONTHS) {
      expect(depositRow!.monthly_values[m]).toBe(0)
    }
  })
})
