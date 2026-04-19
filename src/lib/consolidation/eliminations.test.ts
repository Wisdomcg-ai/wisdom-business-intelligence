import { describe, it, expect } from 'vitest'
import { matchRuleToLines, applyEliminations } from './eliminations'
import type { EliminationRule, EntityColumn, XeroPLLineLike } from './types'
import {
  DRAGON_ROOFING_BIZ,
  DRAGON_ROOFING_TENANT,
  EASY_HAIL_TENANT,
} from './__fixtures__/dragon-mar-2026'

const column = (
  tenantId: string,
  displayName: string,
  lines: XeroPLLineLike[],
): EntityColumn => ({
  connection_id: `c-${tenantId}`,
  tenant_id: tenantId,
  display_name: displayName,
  display_order: 0,
  functional_currency: 'AUD',
  lines,
})

const pairRule = (overrides: Partial<EliminationRule> = {}): EliminationRule => ({
  id: 'r1',
  business_id: DRAGON_ROOFING_BIZ,
  rule_type: 'account_pair',
  tenant_a_id: DRAGON_ROOFING_TENANT,
  entity_a_account_code: null,
  entity_a_account_name_pattern: null,
  tenant_b_id: EASY_HAIL_TENANT,
  entity_b_account_code: null,
  entity_b_account_name_pattern: null,
  direction: 'bidirectional',
  description: 'test rule',
  active: true,
  ...overrides,
})

const line = (overrides: Partial<XeroPLLineLike> = {}): XeroPLLineLike => ({
  business_id: DRAGON_ROOFING_BIZ,
  tenant_id: DRAGON_ROOFING_TENANT,
  account_name: 'X',
  account_code: null,
  account_type: 'opex',
  section: 'OpEx',
  monthly_values: {},
  ...overrides,
})

describe('matchRuleToLines', () => {
  it('matches by account_code exact', () => {
    const rule = pairRule({ entity_a_account_code: '425' })
    const lines = [
      line({ account_name: 'X', account_code: '425' }),
      line({ account_name: 'Y', account_code: '426' }),
    ]
    expect(matchRuleToLines(rule, 'a', lines).length).toBe(1)
  })

  it('matches by regex pattern, case insensitive', () => {
    const rule = pairRule({ entity_a_account_name_pattern: 'advertising' })
    const lines = [
      line({ account_name: 'Advertising & Marketing' }),
      line({ account_name: 'Rent' }),
    ]
    expect(matchRuleToLines(rule, 'a', lines).length).toBe(1)
  })

  it('throws on invalid regex', () => {
    const rule = pairRule({ entity_a_account_name_pattern: '[invalid(' })
    expect(() => matchRuleToLines(rule, 'a', [])).toThrow(/invalid regex/)
  })

  it('throws on pattern length exceeding DoS guard', () => {
    const rule = pairRule({ entity_a_account_name_pattern: 'x'.repeat(300) })
    expect(() => matchRuleToLines(rule, 'a', [])).toThrow(/DoS guard/)
  })

  it('returns empty when neither code nor pattern provided', () => {
    const rule = pairRule({})
    expect(matchRuleToLines(rule, 'a', [line({})])).toEqual([])
  })
})

describe('applyEliminations', () => {
  it('applies bidirectional rule to both sides at reportMonth', () => {
    const rule = pairRule({
      entity_a_account_name_pattern: 'advertising',
      entity_b_account_name_pattern: 'advertising',
    })
    const dragonCol = column(DRAGON_ROOFING_TENANT, 'Dragon', [
      line({ account_name: 'Advertising & Marketing', monthly_values: { '2026-03': -9015 } }),
    ])
    const easyCol = column(EASY_HAIL_TENANT, 'Easy Hail', [
      line({
        tenant_id: EASY_HAIL_TENANT,
        account_name: 'Advertising & Marketing',
        monthly_values: { '2026-03': 9015 },
      }),
    ])
    const entries = applyEliminations([rule], [dragonCol, easyCol], '2026-03')
    expect(entries.length).toBe(2)
    const dragonEntry = entries.find((e) => e.source_tenant_id === DRAGON_ROOFING_TENANT)
    const easyEntry = entries.find((e) => e.source_tenant_id === EASY_HAIL_TENANT)
    expect(dragonEntry!.amount).toBe(9015) // -(-9015)
    expect(easyEntry!.amount).toBe(-9015) // -(9015)
  })

  it('applies only to tenant A when direction=entity_a_eliminates', () => {
    const rule = pairRule({
      entity_a_account_name_pattern: 'x',
      entity_b_account_name_pattern: 'x',
      direction: 'entity_a_eliminates',
    })
    const a = column(DRAGON_ROOFING_TENANT, 'A', [
      line({ account_name: 'X', monthly_values: { '2026-03': 100 } }),
    ])
    const b = column(EASY_HAIL_TENANT, 'B', [
      line({
        tenant_id: EASY_HAIL_TENANT,
        account_name: 'X',
        monthly_values: { '2026-03': 50 },
      }),
    ])
    const entries = applyEliminations([rule], [a, b], '2026-03')
    expect(entries.length).toBe(1)
    expect(entries[0].source_tenant_id).toBe(DRAGON_ROOFING_TENANT)
  })

  it('skips rules referencing tenants not in byTenant', () => {
    const rule = pairRule({ tenant_a_id: 'missing-tenant', entity_a_account_name_pattern: 'x' })
    const b = column(EASY_HAIL_TENANT, 'B', [])
    const entries = applyEliminations([rule], [b], '2026-03')
    expect(entries).toEqual([])
  })

  it('scopes source amount to reportMonth only', () => {
    const rule = pairRule({
      entity_a_account_name_pattern: 'x',
      direction: 'entity_a_eliminates',
    })
    const a = column(DRAGON_ROOFING_TENANT, 'A', [
      line({ account_name: 'X', monthly_values: { '2026-03': 100, '2026-04': 999 } }),
    ])
    const b = column(EASY_HAIL_TENANT, 'B', [])
    const entries = applyEliminations([rule], [a, b], '2026-03')
    expect(entries[0].source_amount).toBe(100)
  })
})
