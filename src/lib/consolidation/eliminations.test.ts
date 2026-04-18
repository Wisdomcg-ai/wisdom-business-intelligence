import { describe, it, expect } from 'vitest'
import { applyEliminations, matchRuleToLines } from './eliminations'
import type { EliminationRule, EntityColumn, XeroPLLineLike } from './types'
import {
  dragonRoofingPL,
  easyHailPL,
  DRAGON_ROOFING_BIZ,
  EASY_HAIL_BIZ,
} from './__fixtures__/dragon-mar-2026'

function makeEntity(businessId: string, lines: XeroPLLineLike[]): EntityColumn {
  return {
    member_id: `m-${businessId}`,
    business_id: businessId,
    display_name: businessId,
    display_order: 0,
    functional_currency: 'AUD',
    lines,
  }
}

describe('matchRuleToLines', () => {
  it('matches by account_code exact', () => {
    const rule: EliminationRule = {
      id: 'r1',
      group_id: 'g1',
      rule_type: 'account_pair',
      entity_a_business_id: DRAGON_ROOFING_BIZ,
      entity_a_account_code: '420',
      entity_a_account_name_pattern: null,
      entity_b_business_id: EASY_HAIL_BIZ,
      entity_b_account_code: '420',
      entity_b_account_name_pattern: null,
      direction: 'bidirectional',
      description: 'advertising',
      active: true,
    }
    const matched = matchRuleToLines(rule, 'a', dragonRoofingPL)
    expect(matched.some((l) => l.account_name === 'Advertising & Marketing')).toBe(true)
  })

  it('matches by account_name_pattern case-insensitive', () => {
    const rule: EliminationRule = {
      id: 'r2',
      group_id: 'g1',
      rule_type: 'account_category',
      entity_a_business_id: DRAGON_ROOFING_BIZ,
      entity_a_account_code: null,
      entity_a_account_name_pattern: 'advertising',
      entity_b_business_id: EASY_HAIL_BIZ,
      entity_b_account_code: null,
      entity_b_account_name_pattern: 'advertising',
      direction: 'bidirectional',
      description: 'advertising',
      active: true,
    }
    const matched = matchRuleToLines(rule, 'a', dragonRoofingPL)
    expect(matched.length).toBeGreaterThan(0)
  })

  it('matches by code OR pattern (union)', () => {
    const rule: EliminationRule = {
      id: 'r-union',
      group_id: 'g1',
      rule_type: 'account_pair',
      entity_a_business_id: DRAGON_ROOFING_BIZ,
      entity_a_account_code: '420',
      entity_a_account_name_pattern: 'referral',
      entity_b_business_id: EASY_HAIL_BIZ,
      entity_b_account_code: null,
      entity_b_account_name_pattern: 'advertising',
      direction: 'bidirectional',
      description: 'union',
      active: true,
    }
    const matched = matchRuleToLines(rule, 'a', dragonRoofingPL)
    // Dragon has Advertising (code 420) and Referral Fee - Easy Hail — union matches both
    const names = matched.map((l) => l.account_name)
    expect(names).toContain('Advertising & Marketing')
    expect(names).toContain('Referral Fee - Easy Hail')
  })

  it('throws on pattern > 256 chars (DoS guard)', () => {
    const rule: EliminationRule = {
      id: 'r3',
      group_id: 'g1',
      rule_type: 'account_pair',
      entity_a_business_id: DRAGON_ROOFING_BIZ,
      entity_a_account_code: null,
      entity_a_account_name_pattern: 'a'.repeat(300),
      entity_b_business_id: EASY_HAIL_BIZ,
      entity_b_account_code: 'X',
      entity_b_account_name_pattern: null,
      direction: 'bidirectional',
      description: 'bad',
      active: true,
    }
    expect(() => matchRuleToLines(rule, 'a', dragonRoofingPL)).toThrow(/DoS/)
  })

  it('throws on invalid regex pattern with rule id context', () => {
    const rule: EliminationRule = {
      id: 'r4',
      group_id: 'g1',
      rule_type: 'account_pair',
      entity_a_business_id: DRAGON_ROOFING_BIZ,
      entity_a_account_code: null,
      entity_a_account_name_pattern: '[unclosed',
      entity_b_business_id: EASY_HAIL_BIZ,
      entity_b_account_code: 'X',
      entity_b_account_name_pattern: null,
      direction: 'bidirectional',
      description: 'bad',
      active: true,
    }
    expect(() => matchRuleToLines(rule, 'a', dragonRoofingPL)).toThrow(/invalid regex/)
  })

  it('returns empty when both code and pattern are null for the side', () => {
    const rule: EliminationRule = {
      id: 'r-empty',
      group_id: 'g1',
      rule_type: 'account_pair',
      entity_a_business_id: DRAGON_ROOFING_BIZ,
      entity_a_account_code: null,
      entity_a_account_name_pattern: null,
      entity_b_business_id: EASY_HAIL_BIZ,
      entity_b_account_code: '420',
      entity_b_account_name_pattern: null,
      direction: 'bidirectional',
      description: 'empty-a',
      active: true,
    }
    expect(matchRuleToLines(rule, 'a', dragonRoofingPL)).toEqual([])
  })
})

describe('applyEliminations — Dragon advertising bidirectional', () => {
  it('produces two entries (one per side) with amounts = -source_amount', () => {
    const entityA = makeEntity(DRAGON_ROOFING_BIZ, dragonRoofingPL)
    const entityB = makeEntity(EASY_HAIL_BIZ, easyHailPL)
    const rule: EliminationRule = {
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
    const entries = applyEliminations([rule], [entityA, entityB], '2026-03')
    expect(entries.length).toBe(2)
    const dragonEntry = entries.find((e) => e.source_entity_id === DRAGON_ROOFING_BIZ)
    const easyHailEntry = entries.find((e) => e.source_entity_id === EASY_HAIL_BIZ)
    expect(dragonEntry).toBeDefined()
    expect(easyHailEntry).toBeDefined()
    expect(dragonEntry!.source_amount).toBe(-9015)
    expect(dragonEntry!.amount).toBe(9015) // -(-9015)
    expect(easyHailEntry!.source_amount).toBe(9015)
    expect(easyHailEntry!.amount).toBe(-9015) // -(+9015)
  })
})

describe('applyEliminations — direction variants', () => {
  const entityA = makeEntity(DRAGON_ROOFING_BIZ, dragonRoofingPL)
  const entityB = makeEntity(EASY_HAIL_BIZ, easyHailPL)
  const baseRule: Omit<EliminationRule, 'direction'> = {
    id: 'r',
    group_id: 'g1',
    rule_type: 'account_category',
    entity_a_business_id: DRAGON_ROOFING_BIZ,
    entity_a_account_code: null,
    entity_a_account_name_pattern: 'advertising',
    entity_b_business_id: EASY_HAIL_BIZ,
    entity_b_account_code: null,
    entity_b_account_name_pattern: 'advertising',
    description: 'adv',
    active: true,
  }

  it('entity_a_eliminates emits only entity A entries', () => {
    const entries = applyEliminations(
      [{ ...baseRule, direction: 'entity_a_eliminates' }],
      [entityA, entityB],
      '2026-03',
    )
    expect(entries.length).toBeGreaterThan(0)
    expect(entries.every((e) => e.source_entity_id === DRAGON_ROOFING_BIZ)).toBe(true)
  })

  it('entity_b_eliminates emits only entity B entries', () => {
    const entries = applyEliminations(
      [{ ...baseRule, direction: 'entity_b_eliminates' }],
      [entityA, entityB],
      '2026-03',
    )
    expect(entries.length).toBeGreaterThan(0)
    expect(entries.every((e) => e.source_entity_id === EASY_HAIL_BIZ)).toBe(true)
  })

  it('bidirectional emits entries from both sides', () => {
    const entries = applyEliminations(
      [{ ...baseRule, direction: 'bidirectional' }],
      [entityA, entityB],
      '2026-03',
    )
    const sides = new Set(entries.map((e) => e.source_entity_id))
    expect(sides.has(DRAGON_ROOFING_BIZ)).toBe(true)
    expect(sides.has(EASY_HAIL_BIZ)).toBe(true)
  })
})

describe('applyEliminations — missing entity silently skipped', () => {
  it('rule referencing absent business_id produces zero entries', () => {
    const entityA = makeEntity(DRAGON_ROOFING_BIZ, dragonRoofingPL)
    const rule: EliminationRule = {
      id: 'r',
      group_id: 'g1',
      rule_type: 'account_pair',
      entity_a_business_id: DRAGON_ROOFING_BIZ,
      entity_a_account_code: '420',
      entity_a_account_name_pattern: null,
      entity_b_business_id: 'missing-biz-uuid',
      entity_b_account_code: '420',
      entity_b_account_name_pattern: null,
      direction: 'bidirectional',
      description: 'x',
      active: true,
    }
    const entries = applyEliminations([rule], [entityA], '2026-03')
    expect(entries.length).toBe(0)
  })
})

describe('applyEliminations — reportMonth scoping', () => {
  it('only sources values from the reportMonth', () => {
    const entityA = makeEntity(DRAGON_ROOFING_BIZ, [
      {
        business_id: DRAGON_ROOFING_BIZ,
        account_name: 'Advertising',
        account_code: null,
        account_type: 'opex',
        section: 'OpEx',
        monthly_values: { '2026-03': 100, '2026-04': 999 },
      },
    ])
    const entityB = makeEntity(EASY_HAIL_BIZ, [
      {
        business_id: EASY_HAIL_BIZ,
        account_name: 'Advertising',
        account_code: null,
        account_type: 'opex',
        section: 'OpEx',
        monthly_values: { '2026-03': -100, '2026-04': -999 },
      },
    ])
    const rule: EliminationRule = {
      id: 'r',
      group_id: 'g1',
      rule_type: 'account_category',
      entity_a_business_id: DRAGON_ROOFING_BIZ,
      entity_a_account_code: null,
      entity_a_account_name_pattern: 'advertising',
      entity_b_business_id: EASY_HAIL_BIZ,
      entity_b_account_code: null,
      entity_b_account_name_pattern: 'advertising',
      direction: 'bidirectional',
      description: 'adv',
      active: true,
    }
    const entries = applyEliminations([rule], [entityA, entityB], '2026-03')
    expect(entries.every((e) => Math.abs(e.source_amount) === 100)).toBe(true)
  })

  it('returns amount=0 entry when reportMonth value is missing (default 0)', () => {
    const entityA = makeEntity(DRAGON_ROOFING_BIZ, [
      {
        business_id: DRAGON_ROOFING_BIZ,
        account_name: 'Advertising',
        account_code: null,
        account_type: 'opex',
        section: 'OpEx',
        monthly_values: { '2026-04': 500 }, // no 2026-03 entry
      },
    ])
    const entityB = makeEntity(EASY_HAIL_BIZ, [
      {
        business_id: EASY_HAIL_BIZ,
        account_name: 'Advertising',
        account_code: null,
        account_type: 'opex',
        section: 'OpEx',
        monthly_values: { '2026-03': 50 },
      },
    ])
    const rule: EliminationRule = {
      id: 'r',
      group_id: 'g1',
      rule_type: 'account_category',
      entity_a_business_id: DRAGON_ROOFING_BIZ,
      entity_a_account_code: null,
      entity_a_account_name_pattern: 'advertising',
      entity_b_business_id: EASY_HAIL_BIZ,
      entity_b_account_code: null,
      entity_b_account_name_pattern: 'advertising',
      direction: 'bidirectional',
      description: 'adv',
      active: true,
    }
    const entries = applyEliminations([rule], [entityA, entityB], '2026-03')
    const dragonEntry = entries.find((e) => e.source_entity_id === DRAGON_ROOFING_BIZ)
    expect(dragonEntry!.source_amount).toBe(0)
    // Use toBeCloseTo(0, 0) to avoid +0 / -0 distinction from `-src` when src===0
    expect(dragonEntry!.amount).toBeCloseTo(0, 0)
  })
})
