import { describe, it, expect } from 'vitest'
import { combineEntities } from './engine'
import { buildAlignedAccountUniverse, buildEntityColumn } from './account-alignment'
import {
  FY_MONTHS,
  dragonRoofingPL,
  easyHailPL,
  DRAGON_ROOFING_BIZ,
  EASY_HAIL_BIZ,
} from './__fixtures__/dragon-mar-2026'
import type { ConsolidationMember } from './types'

function buildFixtureColumns() {
  const universe = buildAlignedAccountUniverse([dragonRoofingPL, easyHailPL])
  const dragonMember: ConsolidationMember = {
    id: 'm-dragon',
    group_id: 'g1',
    source_business_id: DRAGON_ROOFING_BIZ,
    display_name: 'Dragon Roofing Pty Ltd',
    display_order: 0,
    functional_currency: 'AUD',
  }
  const easyHailMember: ConsolidationMember = {
    id: 'm-easyhail',
    group_id: 'g1',
    source_business_id: EASY_HAIL_BIZ,
    display_name: 'Easy Hail Claim Pty Ltd',
    display_order: 1,
    functional_currency: 'AUD',
  }
  const dragonCol = buildEntityColumn(dragonMember, dragonRoofingPL, universe, FY_MONTHS)
  const easyHailCol = buildEntityColumn(easyHailMember, easyHailPL, universe, FY_MONTHS)
  return { universe, byEntity: [dragonCol, easyHailCol] }
}

describe('combineEntities — Dragon March 2026 (no eliminations)', () => {
  it('Sales - Deposit consolidated = 0 (Dragon) + 11652 (Easy Hail) = 11652', () => {
    const { universe, byEntity } = buildFixtureColumns()
    const consolidated = combineEntities(byEntity, universe, [], FY_MONTHS)
    const depositRow = consolidated.lines.find((l) => l.account_name === 'Sales - Deposit')
    expect(depositRow).toBeDefined()
    expect(depositRow!.monthly_values['2026-03']).toBeCloseTo(11652, 0)
  })

  it('Advertising & Marketing consolidated = -9015 + 9015 = 0 (pre-elimination)', () => {
    const { universe, byEntity } = buildFixtureColumns()
    const consolidated = combineEntities(byEntity, universe, [], FY_MONTHS)
    const advRow = consolidated.lines.find((l) => l.account_name === 'Advertising & Marketing')
    expect(advRow).toBeDefined()
    expect(advRow!.monthly_values['2026-03']).toBeCloseTo(0, 0)
  })

  it('every universe row appears exactly once in consolidated', () => {
    const { universe, byEntity } = buildFixtureColumns()
    const consolidated = combineEntities(byEntity, universe, [], FY_MONTHS)
    expect(consolidated.lines.length).toBe(universe.length)
  })

  it('empty elimination list produces pure arithmetic sum (Referral Fee - Easy Hail = 818 pre-elim)', () => {
    const { universe, byEntity } = buildFixtureColumns()
    const consolidated = combineEntities(byEntity, universe, [], FY_MONTHS)
    // Referral Fee - Easy Hail: Dragon 818, Easy Hail 0 (filler) → consolidated 818 (pre-elim)
    const refFeeRow = consolidated.lines.find((l) => l.account_name === 'Referral Fee - Easy Hail')
    expect(refFeeRow).toBeDefined()
    expect(refFeeRow!.monthly_values['2026-03']).toBeCloseTo(818, 0)
  })

  it('Sales - Referral Fee consolidated = 0 (Dragon) + 818 (Easy Hail) = 818 (pre-elim)', () => {
    const { universe, byEntity } = buildFixtureColumns()
    const consolidated = combineEntities(byEntity, universe, [], FY_MONTHS)
    const refRow = consolidated.lines.find((l) => l.account_name === 'Sales - Referral Fee')
    expect(refRow).toBeDefined()
    expect(refRow!.monthly_values['2026-03']).toBeCloseTo(818, 0)
  })
})

describe('combineEntities — months other than reportMonth are pure sums', () => {
  it('months with no fixture data sum to zero', () => {
    const { universe, byEntity } = buildFixtureColumns()
    const consolidated = combineEntities(byEntity, universe, [], FY_MONTHS)
    const depositRow = consolidated.lines.find((l) => l.account_name === 'Sales - Deposit')
    // Fixture only populates 2026-03; other months default to 0 in entity columns
    expect(depositRow!.monthly_values['2025-07'] ?? 0).toBe(0)
    expect(depositRow!.monthly_values['2026-06'] ?? 0).toBe(0)
  })
})

describe('combineEntities — staging no-op elimination behaviour (plan 00b)', () => {
  it('elimination entries passed in are zeroed out in 00b (plan 00d removes the * 0)', () => {
    const { universe, byEntity } = buildFixtureColumns()
    // Fabricate a would-be elimination entry for Sales - Deposit. In 00d this would reduce
    // the consolidated total; in 00b the * 0 multiplier neutralises it — intentional staging.
    const consolidated = combineEntities(
      byEntity,
      universe,
      [
        {
          rule_id: 'test',
          rule_description: 'test-elim (should be zeroed in 00b)',
          account_type: 'revenue',
          account_name: 'Sales - Deposit',
          amount: -11652,
          source_entity_id: 'm-easyhail',
          source_amount: 11652,
        },
      ],
      FY_MONTHS,
    )
    const depositRow = consolidated.lines.find((l) => l.account_name === 'Sales - Deposit')
    // With plan 00b staging, elimination contribution = amount * 0 = 0 → consolidated unchanged.
    expect(depositRow!.monthly_values['2026-03']).toBeCloseTo(11652, 0)
  })
})
