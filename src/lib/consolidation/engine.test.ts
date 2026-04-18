import { describe, it, expect } from 'vitest'
import { combineEntities } from './engine'
import { applyEliminations } from './eliminations'
import { buildAlignedAccountUniverse, buildEntityColumn } from './account-alignment'
import {
  FY_MONTHS,
  dragonRoofingPL,
  easyHailPL,
  DRAGON_ROOFING_BIZ,
  EASY_HAIL_BIZ,
} from './__fixtures__/dragon-mar-2026'
import type { ConsolidationMember, EliminationRule } from './types'

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
    const consolidated = combineEntities(byEntity, universe, [], FY_MONTHS, '2026-03')
    const depositRow = consolidated.lines.find((l) => l.account_name === 'Sales - Deposit')
    expect(depositRow).toBeDefined()
    expect(depositRow!.monthly_values['2026-03']).toBeCloseTo(11652, 0)
  })

  it('Advertising & Marketing consolidated = -9015 + 9015 = 0 (pre-elimination)', () => {
    const { universe, byEntity } = buildFixtureColumns()
    const consolidated = combineEntities(byEntity, universe, [], FY_MONTHS, '2026-03')
    const advRow = consolidated.lines.find((l) => l.account_name === 'Advertising & Marketing')
    expect(advRow).toBeDefined()
    expect(advRow!.monthly_values['2026-03']).toBeCloseTo(0, 0)
  })

  it('every universe row appears exactly once in consolidated', () => {
    const { universe, byEntity } = buildFixtureColumns()
    const consolidated = combineEntities(byEntity, universe, [], FY_MONTHS, '2026-03')
    expect(consolidated.lines.length).toBe(universe.length)
  })

  it('empty elimination list produces pure arithmetic sum (Referral Fee - Easy Hail = 818 pre-elim)', () => {
    const { universe, byEntity } = buildFixtureColumns()
    const consolidated = combineEntities(byEntity, universe, [], FY_MONTHS, '2026-03')
    // Referral Fee - Easy Hail: Dragon 818, Easy Hail 0 (filler) → consolidated 818 (pre-elim)
    const refFeeRow = consolidated.lines.find((l) => l.account_name === 'Referral Fee - Easy Hail')
    expect(refFeeRow).toBeDefined()
    expect(refFeeRow!.monthly_values['2026-03']).toBeCloseTo(818, 0)
  })

  it('Sales - Referral Fee consolidated = 0 (Dragon) + 818 (Easy Hail) = 818 (pre-elim)', () => {
    const { universe, byEntity } = buildFixtureColumns()
    const consolidated = combineEntities(byEntity, universe, [], FY_MONTHS, '2026-03')
    const refRow = consolidated.lines.find((l) => l.account_name === 'Sales - Referral Fee')
    expect(refRow).toBeDefined()
    expect(refRow!.monthly_values['2026-03']).toBeCloseTo(818, 0)
  })
})

describe('combineEntities — months other than reportMonth are pure sums', () => {
  it('months with no fixture data sum to zero', () => {
    const { universe, byEntity } = buildFixtureColumns()
    const consolidated = combineEntities(byEntity, universe, [], FY_MONTHS, '2026-03')
    const depositRow = consolidated.lines.find((l) => l.account_name === 'Sales - Deposit')
    // Fixture only populates 2026-03; other months default to 0 in entity columns
    expect(depositRow!.monthly_values['2025-07'] ?? 0).toBe(0)
    expect(depositRow!.monthly_values['2026-06'] ?? 0).toBe(0)
  })
})

describe('combineEntities — with Dragon advertising elimination', () => {
  const advRule: EliminationRule = {
    id: 'r-adv',
    group_id: 'g1',
    rule_type: 'account_category',
    entity_a_business_id: DRAGON_ROOFING_BIZ,
    entity_a_account_code: null,
    entity_a_account_name_pattern: 'advertising & marketing',
    entity_b_business_id: EASY_HAIL_BIZ,
    entity_b_account_code: null,
    entity_b_account_name_pattern: 'advertising & marketing',
    direction: 'bidirectional',
    description: 'Dragon/EasyHail advertising transfer',
    active: true,
  }

  it('applies bidirectional advertising elimination so consolidated nets to zero', () => {
    const { universe, byEntity } = buildFixtureColumns()
    const eliminations = applyEliminations([advRule], byEntity, '2026-03')
    const consolidated = combineEntities(byEntity, universe, eliminations, FY_MONTHS, '2026-03')
    const advRow = consolidated.lines.find((l) => l.account_name === 'Advertising & Marketing')
    // Pre-sum: Dragon -9015 + EasyHail +9015 = 0
    // Eliminations: +9015 (negates Dragon) + -9015 (negates EasyHail) = 0
    // Consolidated: 0 + 0 = 0
    expect(advRow!.monthly_values['2026-03']).toBeCloseTo(0, 0)
  })

  it('elimination does NOT apply to non-report months', () => {
    const { universe, byEntity } = buildFixtureColumns()
    const eliminations = applyEliminations([advRule], byEntity, '2026-03')
    const consolidated = combineEntities(byEntity, universe, eliminations, FY_MONTHS, '2026-03')
    const advRow = consolidated.lines.find((l) => l.account_name === 'Advertising & Marketing')
    // 2025-07 has no data → pure sum of zeros → still zero (elimination should not affect it)
    expect(advRow!.monthly_values['2025-07'] ?? 0).toBe(0)
  })

  it('fabricated elimination entry reduces consolidated total at reportMonth', () => {
    const { universe, byEntity } = buildFixtureColumns()
    // Fabricate an elimination entry for Sales - Deposit (not a real rule — just to prove the wiring).
    // Plan 00d removes the `* 0` so this entry now actually reduces the consolidated total.
    const consolidated = combineEntities(
      byEntity,
      universe,
      [
        {
          rule_id: 'test',
          rule_description: 'test-elim',
          account_type: 'revenue',
          account_name: 'Sales - Deposit',
          amount: -11652,
          source_entity_id: 'm-easyhail',
          source_amount: 11652,
        },
      ],
      FY_MONTHS,
      '2026-03',
    )
    const depositRow = consolidated.lines.find((l) => l.account_name === 'Sales - Deposit')
    expect(depositRow!.monthly_values['2026-03']).toBeCloseTo(0, 0)
  })

  it('fabricated elimination entry does NOT affect months other than reportMonth', () => {
    const { universe, byEntity } = buildFixtureColumns()
    const consolidated = combineEntities(
      byEntity,
      universe,
      [
        {
          rule_id: 'test',
          rule_description: 'test-elim',
          account_type: 'revenue',
          account_name: 'Sales - Deposit',
          amount: -999,
          source_entity_id: 'm-easyhail',
          source_amount: 999,
        },
      ],
      FY_MONTHS,
      '2026-03',
    )
    const depositRow = consolidated.lines.find((l) => l.account_name === 'Sales - Deposit')
    // reportMonth gets elimination applied; other months do not
    expect(depositRow!.monthly_values['2026-03']).toBeCloseTo(11652 - 999, 0)
    expect(depositRow!.monthly_values['2025-07'] ?? 0).toBe(0)
    expect(depositRow!.monthly_values['2026-06'] ?? 0).toBe(0)
  })
})
