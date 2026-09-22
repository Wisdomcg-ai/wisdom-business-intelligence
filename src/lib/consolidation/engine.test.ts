import { describe, it, expect } from 'vitest'
import { combineTenants } from './engine'
import { applyEliminations, applyEliminationsByMonth } from './eliminations'
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
    const consolidated = combineTenants(byTenant, universe, {}, FY_MONTHS)
    const depositRow = consolidated.lines.find((l) => l.account_name === 'Sales - Deposit')
    expect(depositRow).toBeDefined()
    expect(depositRow!.monthly_values['2026-03']).toBeCloseTo(11652, 0)
  })

  it('Advertising & Marketing consolidated (pre-elimination) = 0 from netting', () => {
    const { universe, byTenant } = buildFixtureColumns()
    const consolidated = combineTenants(byTenant, universe, {}, FY_MONTHS)
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
    const consolidated = combineTenants(
      byTenant,
      universe,
      applyEliminationsByMonth([rule], byTenant, FY_MONTHS),
      FY_MONTHS,
    )
    const advRow = consolidated.lines.find((l) => l.account_name === 'Advertising & Marketing')
    expect(advRow!.monthly_values['2026-03']).toBeCloseTo(0, 0)
    expect(eliminations.length).toBe(2)
  })

  it('every month is eliminated, not just the report month — YTD and the full year are consolidated figures too (F4)', () => {
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
    const raw = combineTenants(byTenant, universe, {}, FY_MONTHS)
      .lines.find((l) => l.account_name === 'Advertising & Marketing')!
    const eliminated = combineTenants(
      byTenant,
      universe,
      applyEliminationsByMonth([rule], byTenant, FY_MONTHS),
      FY_MONTHS,
    ).lines.find((l) => l.account_name === 'Advertising & Marketing')!

    // Every month the intercompany trade appears in is eliminated, and the
    // year total is free of it — not just the report month's column.
    for (const month of FY_MONTHS) {
      expect(eliminated.monthly_values[month]).toBeCloseTo(0, 6)
    }
    const yearOf = (row: typeof raw) => FY_MONTHS.reduce((sum, m) => sum + (row.monthly_values[m] ?? 0), 0)
    expect(yearOf(eliminated)).toBeCloseTo(0, 6)
    expect(yearOf(eliminated)).not.toBeGreaterThan(Math.abs(yearOf(raw)) + 1)
  })
})

/**
 * F4 (22 Sep 2026 system diagnostic) — a management fee charged every month.
 *
 * The engine eliminated the REPORT MONTH only, so a $10k/month intercompany
 * fee read 0 in the September column while September YTD still showed $20k of
 * fee income and $20k of fee expense, and the full year carried eleven months
 * of it. The fixture above is a single month, so this case charges the fee in
 * three months to tell "eliminated everywhere" from "eliminated once".
 */
describe('combineTenants — an intercompany fee charged in several months', () => {
  const MONTHS = ['2025-07', '2025-08', '2025-09'] as const
  const SERVICES = 'Management Fee'
  const feeLine = (tenant: string, account_type: 'revenue' | 'opex', sign: 1 | -1) => ({
    business_id: DRAGON_ROOFING_BIZ,
    tenant_id: tenant,
    account_name: SERVICES,
    account_code: '600',
    account_type,
    section: account_type === 'revenue' ? 'Revenue' : 'Operating Expenses',
    monthly_values: Object.fromEntries(MONTHS.map((m) => [m, 10_000 * sign])),
  })

  const rule: EliminationRule = {
    id: 'r-fee',
    business_id: DRAGON_ROOFING_BIZ,
    rule_type: 'account_category',
    tenant_a_id: DRAGON_ROOFING_TENANT,
    entity_a_account_code: null,
    entity_a_account_name_pattern: 'management fee',
    tenant_b_id: EASY_HAIL_TENANT,
    entity_b_account_code: null,
    entity_b_account_name_pattern: 'management fee',
    direction: 'bidirectional',
    description: 'Dragon charges Easy Hail a monthly management fee',
    active: true,
  }

  function columns() {
    const sellerLines = [feeLine(DRAGON_ROOFING_TENANT, 'revenue', 1)]
    const buyerLines = [feeLine(EASY_HAIL_TENANT, 'opex', 1)]
    const universe = buildAlignedAccountUniverse([sellerLines, buyerLines])
    const tenant = (tenant_id: string, display_order: number): ConsolidationTenant => ({
      connection_id: `c-${tenant_id}`,
      business_id: DRAGON_ROOFING_BIZ,
      tenant_id,
      display_name: tenant_id,
      display_order,
      functional_currency: 'AUD',
      include_in_consolidation: true,
    })
    return {
      universe,
      byTenant: [
        buildEntityColumn(tenant(DRAGON_ROOFING_TENANT, 0), sellerLines, universe, FY_MONTHS),
        buildEntityColumn(tenant(EASY_HAIL_TENANT, 1), buyerLines, universe, FY_MONTHS),
      ],
    }
  }

  const rowsFor = (elims: Record<string, ReturnType<typeof applyEliminations>>) => {
    const { universe, byTenant } = columns()
    return combineTenants(byTenant, universe, elims, FY_MONTHS).lines
  }

  it('each of the three months is eliminated, not just the report month', () => {
    const { byTenant } = columns()
    const lines = rowsFor(applyEliminationsByMonth([rule], byTenant, FY_MONTHS))
    for (const row of lines.filter((l) => l.account_name === SERVICES)) {
      for (const m of MONTHS) expect(row.monthly_values[m]).toBeCloseTo(0, 6)
    }
  })

  it('the year total carries no intercompany fee — YTD is a consolidated figure too', () => {
    const { byTenant } = columns()
    const yearOf = (rows: ReturnType<typeof rowsFor>) =>
      rows
        .filter((l) => l.account_name === SERVICES)
        .reduce((sum, row) => sum + FY_MONTHS.reduce((s, m) => s + (row.monthly_values[m] ?? 0), 0), 0)

    // Un-eliminated the group would report $30k of fee income and $30k of fee
    // expense across the three months.
    expect(yearOf(rowsFor({}))).toBeCloseTo(60_000, 6)
    expect(yearOf(rowsFor(applyEliminationsByMonth([rule], byTenant, FY_MONTHS)))).toBeCloseTo(0, 6)
  })

  it('eliminating only the report month leaves the other two in the year total (the old behaviour)', () => {
    const { byTenant } = columns()
    const septemberOnly = { '2025-09': applyEliminations([rule], byTenant, '2025-09') }
    const rows = rowsFor(septemberOnly)
    const fee = rows.filter((l) => l.account_name === SERVICES)
    expect(fee.reduce((sum, row) => sum + (row.monthly_values['2025-09'] ?? 0), 0)).toBeCloseTo(0, 6)
    // July and August still carry it — $40k of the $60k.
    expect(
      fee.reduce((sum, row) => sum + (row.monthly_values['2025-07'] ?? 0) + (row.monthly_values['2025-08'] ?? 0), 0),
    ).toBeCloseTo(40_000, 6)
  })
})
