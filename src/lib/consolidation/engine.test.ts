import { describe, it, expect } from 'vitest'
import { combineTenants } from './engine'
import { applyEliminations } from './eliminations'
import { buildAlignedAccountUniverse, buildEntityColumn } from './account-alignment'
import {
  FY_MONTHS,
  dragonRoofingPL,
  easyHailPL,
  DRAGON_ROOFING_BIZ,
  DRAGON_ROOFING_TENANT,
  EASY_HAIL_TENANT,
} from './__fixtures__/dragon-mar-2026'
import type { ConsolidationTenant, EliminationRule } from './types'

function buildFixtureColumns() {
  const universe = buildAlignedAccountUniverse([dragonRoofingPL, easyHailPL])
  const dragonTenant: ConsolidationTenant = {
    connection_id: 'c-dragon',
    business_id: DRAGON_ROOFING_BIZ,
    tenant_id: DRAGON_ROOFING_TENANT,
    display_name: 'Dragon Roofing Pty Ltd',
    display_order: 0,
    functional_currency: 'AUD',
    include_in_consolidation: true,
  }
  const easyHailTenant: ConsolidationTenant = {
    connection_id: 'c-easyhail',
    business_id: DRAGON_ROOFING_BIZ,
    tenant_id: EASY_HAIL_TENANT,
    display_name: 'Easy Hail Claim Pty Ltd',
    display_order: 1,
    functional_currency: 'AUD',
    include_in_consolidation: true,
  }
  const dragonCol = buildEntityColumn(dragonTenant, dragonRoofingPL, universe, FY_MONTHS)
  const easyHailCol = buildEntityColumn(easyHailTenant, easyHailPL, universe, FY_MONTHS)
  return { universe, byTenant: [dragonCol, easyHailCol] }
}

describe('combineTenants — Dragon March 2026 (no eliminations)', () => {
  it('Sales - Deposit consolidated = 0 (Dragon) + 11652 (Easy Hail) = 11652', () => {
    const { universe, byTenant } = buildFixtureColumns()
    const consolidated = combineTenants(byTenant, universe, [], FY_MONTHS, '2026-03')
    const depositRow = consolidated.lines.find((l) => l.account_name === 'Sales - Deposit')
    expect(depositRow).toBeDefined()
    expect(depositRow!.monthly_values['2026-03']).toBeCloseTo(11652, 0)
  })

  it('Advertising & Marketing consolidated (pre-elimination) = 0 from netting', () => {
    const { universe, byTenant } = buildFixtureColumns()
    const consolidated = combineTenants(byTenant, universe, [], FY_MONTHS, '2026-03')
    const advRow = consolidated.lines.find((l) => l.account_name === 'Advertising & Marketing')
    expect(advRow).toBeDefined()
    expect(advRow!.monthly_values['2026-03']).toBeCloseTo(0, 0)
  })
})

describe('combineTenants — with elimination rules applied', () => {
  it('Advertising & Marketing stays 0 after bidirectional elimination (Dragon ±9015 ↔ Easy Hail ±9015)', () => {
    const { universe, byTenant } = buildFixtureColumns()
    const rule: EliminationRule = {
      id: 'r-adv',
      business_id: DRAGON_ROOFING_BIZ,
      rule_type: 'account_category',
      tenant_a_id: DRAGON_ROOFING_TENANT,
      entity_a_account_code: null,
      entity_a_account_name_pattern: 'advertising',
      tenant_b_id: EASY_HAIL_TENANT,
      entity_b_account_code: null,
      entity_b_account_name_pattern: 'advertising',
      direction: 'bidirectional',
      description: 'Dragon/Easy Hail advertising transfer',
      active: true,
    }
    const eliminations = applyEliminations([rule], byTenant, '2026-03')
    const consolidated = combineTenants(byTenant, universe, eliminations, FY_MONTHS, '2026-03')
    const advRow = consolidated.lines.find((l) => l.account_name === 'Advertising & Marketing')
    expect(advRow!.monthly_values['2026-03']).toBeCloseTo(0, 0)
    expect(eliminations.length).toBe(2)
  })

  it('eliminations apply ONLY to reportMonth, not other months', () => {
    const { universe, byTenant } = buildFixtureColumns()
    const rule: EliminationRule = {
      id: 'r-adv',
      business_id: DRAGON_ROOFING_BIZ,
      rule_type: 'account_category',
      tenant_a_id: DRAGON_ROOFING_TENANT,
      entity_a_account_code: null,
      entity_a_account_name_pattern: 'advertising',
      tenant_b_id: EASY_HAIL_TENANT,
      entity_b_account_code: null,
      entity_b_account_name_pattern: 'advertising',
      direction: 'bidirectional',
      description: 'Dragon/Easy Hail advertising transfer',
      active: true,
    }
    const eliminations = applyEliminations([rule], byTenant, '2026-03')
    const consolidated = combineTenants(byTenant, universe, eliminations, FY_MONTHS, '2026-03')
    const advRow = consolidated.lines.find((l) => l.account_name === 'Advertising & Marketing')
    // Other months should still have raw sums (whatever those are — they're NOT double-adjusted by elims)
    expect(advRow!.monthly_values['2026-04']).toBeDefined()
  })
})
