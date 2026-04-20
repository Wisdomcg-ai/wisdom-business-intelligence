/**
 * Unit tests for the Consolidated BS engine — pure math + structure.
 *
 * Full integration (Supabase mock covering loadBusinessContext +
 * loadBSTenantSnapshots + loadEliminationRulesForBusiness) lives in
 * src/app/api/monthly-report/consolidated-bs/route.test.ts.
 *
 * These tests exercise the pure helpers directly:
 *   - applyLoanEliminations — intercompany_loan rules zero BOTH sides
 *   - computeTranslationReserve — residual CTA math
 *   - buildConsolidatedBalanceSheet — end-to-end via an in-memory mock client
 */

import { describe, it, expect } from 'vitest'
import {
  applyLoanEliminations,
  computeTranslationReserve,
  buildConsolidatedBalanceSheet,
  type BSEntityColumn,
  type BSRow,
} from './balance-sheet'
import type { EliminationRule } from './types'

// ─── Test helpers ────────────────────────────────────────────────────────────

const DRAGON_TENANT = 'tenant-dragon-roofing'
const EASY_HAIL_TENANT = 'tenant-easy-hail'
const IICT_HK_TENANT = 'tenant-iict-hk'
const IICT_AUST_TENANT = 'tenant-iict-aust'
const BIZ = '00000000-0000-0000-0000-000000000000'

function row(
  accountType: 'asset' | 'liability' | 'equity',
  accountName: string,
  balance: number,
  section = '',
): BSRow {
  return { account_type: accountType, account_name: accountName, balance, section }
}

function column(
  tenantId: string,
  displayName: string,
  rows: BSRow[],
  functionalCurrency = 'AUD',
): BSEntityColumn {
  return {
    connection_id: `c-${tenantId}`,
    tenant_id: tenantId,
    business_id: BIZ,
    display_name: displayName,
    display_order: 0,
    functional_currency: functionalCurrency,
    rows,
  }
}

// ─── applyLoanEliminations ───────────────────────────────────────────────────

describe('applyLoanEliminations — intercompany loan zeroing (Pitfall 5)', () => {
  it('zeroes BOTH sides when Dragon Loan Payable 315173 matches Easy Hail Loan Receivable 315173', () => {
    const byTenant = [
      column(DRAGON_TENANT, 'Dragon Roofing', [
        row('liability', 'Loan Payable - Dragon Roofing', 315173),
      ]),
      column(EASY_HAIL_TENANT, 'Easy Hail Claim', [
        row('asset', 'Loan Receivable - Dragon Roofing', 315173),
      ]),
    ]
    const rule: EliminationRule = {
      id: 'r-loan',
      business_id: BIZ,
      rule_type: 'intercompany_loan',
      tenant_a_id: DRAGON_TENANT,
      entity_a_account_code: null,
      entity_a_account_name_pattern: 'Loan Payable - Dragon Roofing',
      tenant_b_id: EASY_HAIL_TENANT,
      entity_b_account_code: null,
      entity_b_account_name_pattern: 'Loan Receivable - Dragon Roofing',
      direction: 'bidirectional',
      description: 'Dragon/Easy Hail intercompany loan',
      active: true,
    }

    const entries = applyLoanEliminations([rule], byTenant)
    // One elimination per side — both sides zeroed
    expect(entries.length).toBe(2)
    // Side A (Dragon Loan Payable) — amount negates the source balance
    const aSide = entries.find((e) => e.source_tenant_id === DRAGON_TENANT)
    expect(aSide?.amount).toBeCloseTo(-315173, 0)
    expect(aSide?.account_name).toBe('Loan Payable - Dragon Roofing')
    // Side B (Easy Hail Loan Receivable) — amount negates the source balance
    const bSide = entries.find((e) => e.source_tenant_id === EASY_HAIL_TENANT)
    expect(bSide?.amount).toBeCloseTo(-315173, 0)
    expect(bSide?.account_name).toBe('Loan Receivable - Dragon Roofing')
  })

  it('ignores non-intercompany_loan rules (account_pair, account_category)', () => {
    const byTenant = [
      column(DRAGON_TENANT, 'Dragon', [row('liability', 'Loan Payable', 100)]),
      column(EASY_HAIL_TENANT, 'Easy Hail', [row('asset', 'Loan Receivable', 100)]),
    ]
    const rule: EliminationRule = {
      id: 'r-ap',
      business_id: BIZ,
      rule_type: 'account_pair',
      tenant_a_id: DRAGON_TENANT,
      entity_a_account_code: null,
      entity_a_account_name_pattern: 'Loan Payable',
      tenant_b_id: EASY_HAIL_TENANT,
      entity_b_account_code: null,
      entity_b_account_name_pattern: 'Loan Receivable',
      direction: 'bidirectional',
      description: 'Not a loan rule',
      active: true,
    }
    const entries = applyLoanEliminations([rule], byTenant)
    expect(entries.length).toBe(0)
  })

  it('skips rules whose tenants are not present in byTenant', () => {
    const byTenant = [
      column(DRAGON_TENANT, 'Dragon', [row('liability', 'Loan Payable', 100)]),
    ]
    const rule: EliminationRule = {
      id: 'r-missing',
      business_id: BIZ,
      rule_type: 'intercompany_loan',
      tenant_a_id: DRAGON_TENANT,
      entity_a_account_code: null,
      entity_a_account_name_pattern: 'Loan Payable',
      tenant_b_id: 'tenant-missing',
      entity_b_account_code: null,
      entity_b_account_name_pattern: 'Loan Receivable',
      direction: 'bidirectional',
      description: 'Tenant B missing',
      active: true,
    }
    const entries = applyLoanEliminations([rule], byTenant)
    expect(entries.length).toBe(0)
  })

  it('returns [] for empty input', () => {
    expect(applyLoanEliminations([], [])).toEqual([])
  })
})

// ─── computeTranslationReserve ───────────────────────────────────────────────

describe('computeTranslationReserve — CTA residual math', () => {
  it('returns 0 when Assets = Liabilities + Equity exactly', () => {
    const rows = [
      row('asset', 'Bank', 1000),
      row('asset', 'Inventory', 500),
      row('liability', 'Payables', 600),
      row('equity', 'Retained Earnings', 900),
    ]
    expect(computeTranslationReserve(rows)).toBeCloseTo(0, 2)
  })

  it('returns +residual when assets exceed (liab + equity) — CTA positive', () => {
    const rows = [
      row('asset', 'Bank', 1100), // +100 vs. balanced case
      row('liability', 'Payables', 600),
      row('equity', 'Retained Earnings', 400),
    ]
    expect(computeTranslationReserve(rows)).toBeCloseTo(100, 2)
  })

  it('returns -residual when (liab + equity) exceed assets — CTA negative', () => {
    const rows = [
      row('asset', 'Bank', 1000),
      row('liability', 'Payables', 700), // +100 vs. balanced case
      row('equity', 'Retained Earnings', 400),
    ]
    expect(computeTranslationReserve(rows)).toBeCloseTo(-100, 2)
  })

  it('ignores rows with non-asset/liability/equity account_type', () => {
    const rows = [
      row('asset', 'Bank', 1000),
      row('liability', 'Payables', 600),
      row('equity', 'Retained Earnings', 400),
      { account_type: 'unknown', account_name: 'Mystery', balance: 999, section: '' },
    ]
    expect(computeTranslationReserve(rows as BSRow[])).toBeCloseTo(0, 2)
  })
})

// ─── buildConsolidatedBalanceSheet — end-to-end with Supabase mock ──────────

/**
 * Minimal Supabase mock supporting the exact query chains used by:
 *   - loadBusinessContext — businesses.single() + xero_connections.in/eq chain
 *   - loadBSTenantSnapshots — xero_balance_sheet_lines.in().in()
 *   - resolveBusinessIds — business_profiles chains
 *   - loadEliminationRulesForBusiness — consolidation_elimination_rules.eq().eq()
 */
function mockSupabase(rowsByTable: Record<string, any[]>) {
  const matchAll = (rows: any[], filters: Array<[string, unknown, 'eq' | 'in']>) => {
    return rows.filter((r) => {
      return filters.every(([col, val, op]) => {
        if (op === 'eq') return r[col] === val
        if (op === 'in') return Array.isArray(val) && (val as unknown[]).includes(r[col])
        return false
      })
    })
  }

  const buildQuery = (table: string, filters: Array<[string, unknown, 'eq' | 'in']> = []): any => {
    const rows = rowsByTable[table] ?? []
    const ex = () => matchAll(rows, filters)
    return {
      eq: (col: string, val: unknown) =>
        buildQuery(table, [...filters, [col, val, 'eq']]),
      in: (col: string, val: unknown[]) =>
        buildQuery(table, [...filters, [col, val, 'in']]),
      order: () => Promise.resolve({ data: ex(), error: null }),
      single: () =>
        Promise.resolve({ data: ex()[0] ?? null, error: ex()[0] ? null : { message: 'not found' } }),
      maybeSingle: () => Promise.resolve({ data: ex()[0] ?? null, error: null }),
      then: (resolve: any) => Promise.resolve({ data: ex(), error: null }).then(resolve),
    }
  }

  return {
    from: (table: string) => ({
      select: (_cols: string) => buildQuery(table),
    }),
  }
}

const DRAGON_BIZ = '11111111-1111-1111-1111-111111111111'

// Shared dragon/easy-hail fixture — balanced on each tenant, so consolidated
// without eliminations is also balanced (Assets = Liab + Equity).
//
// Dragon Roofing: Assets 1,000,000 = Liabilities 600,000 + Equity 400,000
//   (includes 315,173 Loan Payable on the liabilities side)
// Easy Hail:      Assets 500,000 = Liabilities 100,000 + Equity 400,000
//   (includes 315,173 Loan Receivable on the assets side)
const dragonBSLines = [
  { business_id: DRAGON_BIZ, tenant_id: DRAGON_TENANT, account_name: 'Bank', account_code: null, account_type: 'asset', section: 'Current Assets', monthly_values: { '2026-03-31': 684827 } },
  { business_id: DRAGON_BIZ, tenant_id: DRAGON_TENANT, account_name: 'Fixed Assets', account_code: null, account_type: 'asset', section: 'Non-Current Assets', monthly_values: { '2026-03-31': 315173 } },
  { business_id: DRAGON_BIZ, tenant_id: DRAGON_TENANT, account_name: 'Trade Payables', account_code: null, account_type: 'liability', section: 'Current Liabilities', monthly_values: { '2026-03-31': 284827 } },
  { business_id: DRAGON_BIZ, tenant_id: DRAGON_TENANT, account_name: 'Loan Payable - Dragon Roofing', account_code: null, account_type: 'liability', section: 'Non-Current Liabilities', monthly_values: { '2026-03-31': 315173 } },
  { business_id: DRAGON_BIZ, tenant_id: DRAGON_TENANT, account_name: 'Retained Earnings', account_code: null, account_type: 'equity', section: 'Equity', monthly_values: { '2026-03-31': 400000 } },
]
const easyHailBSLines = [
  { business_id: DRAGON_BIZ, tenant_id: EASY_HAIL_TENANT, account_name: 'Bank', account_code: null, account_type: 'asset', section: 'Current Assets', monthly_values: { '2026-03-31': 184827 } },
  { business_id: DRAGON_BIZ, tenant_id: EASY_HAIL_TENANT, account_name: 'Loan Receivable - Dragon Roofing', account_code: null, account_type: 'asset', section: 'Current Assets', monthly_values: { '2026-03-31': 315173 } },
  { business_id: DRAGON_BIZ, tenant_id: EASY_HAIL_TENANT, account_name: 'Trade Payables', account_code: null, account_type: 'liability', section: 'Current Liabilities', monthly_values: { '2026-03-31': 100000 } },
  { business_id: DRAGON_BIZ, tenant_id: EASY_HAIL_TENANT, account_name: 'Retained Earnings', account_code: null, account_type: 'equity', section: 'Equity', monthly_values: { '2026-03-31': 400000 } },
]

function dragonMockState(extraRules: any[] = []) {
  return {
    businesses: [{ id: DRAGON_BIZ, name: 'Dragon Consolidation' }],
    business_profiles: [{ id: DRAGON_BIZ, business_id: DRAGON_BIZ }],
    xero_connections: [
      { id: 'c-1', business_id: DRAGON_BIZ, tenant_id: DRAGON_TENANT, tenant_name: 'Dragon Roofing Pty Ltd', display_name: 'Dragon Roofing Pty Ltd', display_order: 0, functional_currency: 'AUD', include_in_consolidation: true, is_active: true },
      { id: 'c-2', business_id: DRAGON_BIZ, tenant_id: EASY_HAIL_TENANT, tenant_name: 'Easy Hail Claim Pty Ltd', display_name: 'Easy Hail Claim Pty Ltd', display_order: 1, functional_currency: 'AUD', include_in_consolidation: true, is_active: true },
    ],
    xero_balance_sheet_lines: [...dragonBSLines, ...easyHailBSLines],
    consolidation_elimination_rules: extraRules,
  }
}

describe('buildConsolidatedBalanceSheet — Dragon AUD-only (no FX, no CTA)', () => {
  it('Consolidated Assets = Liabilities + Equity (balance check), CTA = 0', async () => {
    const mock = mockSupabase(dragonMockState([]))
    const report = await buildConsolidatedBalanceSheet(mock as any, {
      businessId: DRAGON_BIZ,
      asOfDate: '2026-03-31',
    })

    const assets = report.consolidated.rows
      .filter((r) => r.account_type === 'asset')
      .reduce((s, r) => s + r.balance, 0)
    const liabilities = report.consolidated.rows
      .filter((r) => r.account_type === 'liability')
      .reduce((s, r) => s + r.balance, 0)
    const equity = report.consolidated.rows
      .filter((r) => r.account_type === 'equity')
      .reduce((s, r) => s + r.balance, 0)

    // Pre-elimination sums: Assets $1,500,000 = Liab $700,000 + Equity $800,000
    expect(assets).toBeCloseTo(1500000, 0)
    expect(liabilities).toBeCloseTo(700000, 0)
    expect(equity).toBeCloseTo(800000, 0)
    expect(Math.abs(assets - (liabilities + equity))).toBeLessThanOrEqual(0.01)
    // No FX translation, so CTA line absent
    expect(report.consolidated.translationReserve).toBe(0)
    expect(
      report.consolidated.rows.find((r) => r.account_name === 'Translation Reserve (CTA)'),
    ).toBeUndefined()
    // FX diagnostics empty
    expect(report.fx_context.rates_used).toEqual({})
    expect(report.fx_context.missing_rates).toEqual([])
    // Diagnostics
    expect(report.diagnostics.tenants_loaded).toBe(2)
    expect(report.byTenant.length).toBe(2)
  })

  it('intercompany_loan rule zeroes BOTH sides in the consolidated column', async () => {
    const rule = {
      id: 'r-loan',
      business_id: DRAGON_BIZ,
      rule_type: 'intercompany_loan',
      tenant_a_id: DRAGON_TENANT,
      entity_a_account_code: null,
      entity_a_account_name_pattern: 'Loan Payable - Dragon Roofing',
      tenant_b_id: EASY_HAIL_TENANT,
      entity_b_account_code: null,
      entity_b_account_name_pattern: 'Loan Receivable - Dragon Roofing',
      direction: 'bidirectional',
      description: 'Dragon/Easy Hail intercompany loan',
      active: true,
    }
    const mock = mockSupabase(dragonMockState([rule]))
    const report = await buildConsolidatedBalanceSheet(mock as any, {
      businessId: DRAGON_BIZ,
      asOfDate: '2026-03-31',
    })

    const loanPayable = report.consolidated.rows.find(
      (r) => r.account_name === 'Loan Payable - Dragon Roofing',
    )
    const loanReceivable = report.consolidated.rows.find(
      (r) => r.account_name === 'Loan Receivable - Dragon Roofing',
    )
    // Both sides zeroed post-elimination (Pitfall 5)
    expect(loanPayable?.balance ?? 0).toBeCloseTo(0, 0)
    expect(loanReceivable?.balance ?? 0).toBeCloseTo(0, 0)
    // 2 elimination entries captured (one per side)
    expect(report.eliminations.length).toBe(2)
    // Consolidated still balances
    const assets = report.consolidated.rows.filter((r) => r.account_type === 'asset').reduce((s, r) => s + r.balance, 0)
    const liab = report.consolidated.rows.filter((r) => r.account_type === 'liability').reduce((s, r) => s + r.balance, 0)
    const eq = report.consolidated.rows.filter((r) => r.account_type === 'equity').reduce((s, r) => s + r.balance, 0)
    expect(Math.abs(assets - (liab + eq))).toBeLessThanOrEqual(0.01)
    // Consolidated assets: $1,500,000 − $315,173 = $1,184,827
    expect(assets).toBeCloseTo(1184827, 0)
    // Consolidated liabilities: $700,000 − $315,173 = $384,827
    expect(liab).toBeCloseTo(384827, 0)
  })
})

describe('buildConsolidatedBalanceSheet — HKD member (FX + CTA)', () => {
  it('invokes translate callback for non-AUD tenant, posts Translation Reserve line', async () => {
    // IICT consolidation with one HKD tenant.
    // HKD balance sheet (in HKD): Assets 5000 = Liabilities 3000 + Equity 2000
    // At closing-spot 0.2, translated: Assets 1000 = Liabilities 600 + Equity 400 (still balances)
    // To force a non-zero CTA, we deliberately mis-match the Retained Earnings translation
    // (simulate a non-AUD-translated equity component), which the engine absorbs.
    const IICT_BIZ = '22222222-2222-2222-2222-222222222222'
    const state: Record<string, any[]> = {
      businesses: [{ id: IICT_BIZ, name: 'IICT Consolidation' }],
      business_profiles: [{ id: IICT_BIZ, business_id: IICT_BIZ }],
      xero_connections: [
        { id: 'c-hk', business_id: IICT_BIZ, tenant_id: IICT_HK_TENANT, tenant_name: 'IICT Group Limited', display_name: 'IICT Group Limited', display_order: 0, functional_currency: 'HKD', include_in_consolidation: true, is_active: true },
        { id: 'c-au', business_id: IICT_BIZ, tenant_id: IICT_AUST_TENANT, tenant_name: 'IICT (Aust) Pty Ltd', display_name: 'IICT (Aust) Pty Ltd', display_order: 1, functional_currency: 'AUD', include_in_consolidation: true, is_active: true },
      ],
      xero_balance_sheet_lines: [
        { business_id: IICT_BIZ, tenant_id: IICT_HK_TENANT, account_name: 'Cash', account_code: null, account_type: 'asset', section: 'Current Assets', monthly_values: { '2026-03-31': 5000 } },
        { business_id: IICT_BIZ, tenant_id: IICT_HK_TENANT, account_name: 'Payables', account_code: null, account_type: 'liability', section: 'Current Liabilities', monthly_values: { '2026-03-31': 3000 } },
        { business_id: IICT_BIZ, tenant_id: IICT_HK_TENANT, account_name: 'Retained Earnings', account_code: null, account_type: 'equity', section: 'Equity', monthly_values: { '2026-03-31': 2000 } },
        { business_id: IICT_BIZ, tenant_id: IICT_AUST_TENANT, account_name: 'Cash', account_code: null, account_type: 'asset', section: 'Current Assets', monthly_values: { '2026-03-31': 1000 } },
        { business_id: IICT_BIZ, tenant_id: IICT_AUST_TENANT, account_name: 'Payables', account_code: null, account_type: 'liability', section: 'Current Liabilities', monthly_values: { '2026-03-31': 400 } },
        { business_id: IICT_BIZ, tenant_id: IICT_AUST_TENANT, account_name: 'Retained Earnings', account_code: null, account_type: 'equity', section: 'Equity', monthly_values: { '2026-03-31': 600 } },
      ],
      consolidation_elimination_rules: [],
    }
    const mock = mockSupabase(state)

    // Translate callback: HKD → AUD at closing-spot 0.2 on assets + liabilities
    // but DELIBERATELY apply rate 0.1 on equity to force a CTA residual.
    const translate = async (tenant: any, lines: any[]) => {
      const translated = lines.map((l) => {
        const scale = l.account_type === 'equity' ? 0.1 : 0.2
        return {
          ...l,
          monthly_values: Object.fromEntries(
            Object.entries(l.monthly_values).map(([k, v]) => [k, (v as number) * scale]),
          ),
        }
      })
      return {
        translated,
        missing: [],
        ratesUsed: { 'HKD/AUD': 0.2 },
      }
    }

    const report = await buildConsolidatedBalanceSheet(mock as any, {
      businessId: IICT_BIZ,
      asOfDate: '2026-03-31',
      translate,
    })

    // FX rates populated
    expect(report.fx_context.rates_used['HKD/AUD']).toBeCloseTo(0.2, 4)
    expect(report.fx_context.missing_rates).toEqual([])
    // CTA line present because translated BS doesn't balance
    // HK translated: Assets 1000, Liab 600, Equity 200 (vs expected 400)
    // AU: Assets 1000, Liab 400, Equity 600
    // Consolidated (pre-CTA):  Assets 2000, Liab 1000, Equity 800
    // CTA = 2000 − (1000 + 800) = +200
    const ctaRow = report.consolidated.rows.find(
      (r) => r.account_name === 'Translation Reserve (CTA)',
    )
    expect(ctaRow).toBeDefined()
    expect(ctaRow?.balance).toBeCloseTo(200, 0)
    expect(report.consolidated.translationReserve).toBeCloseTo(200, 0)
    // And after CTA, the consolidated balances.
    const assets = report.consolidated.rows.filter((r) => r.account_type === 'asset').reduce((s, r) => s + r.balance, 0)
    const liab = report.consolidated.rows.filter((r) => r.account_type === 'liability').reduce((s, r) => s + r.balance, 0)
    const eq = report.consolidated.rows.filter((r) => r.account_type === 'equity').reduce((s, r) => s + r.balance, 0)
    expect(Math.abs(assets - (liab + eq))).toBeLessThanOrEqual(0.01)
  })

  it('AUD-only tenant in HKD-containing group is NOT translated (pass-through)', async () => {
    // Sanity check: engine short-circuits the translate callback for tenants
    // whose functional_currency already matches presentation currency.
    const IICT_BIZ = '33333333-3333-3333-3333-333333333333'
    let translateCalls = 0
    const state: Record<string, any[]> = {
      businesses: [{ id: IICT_BIZ, name: 'IICT' }],
      business_profiles: [{ id: IICT_BIZ, business_id: IICT_BIZ }],
      xero_connections: [
        { id: 'c-au', business_id: IICT_BIZ, tenant_id: IICT_AUST_TENANT, tenant_name: 'IICT Aust', display_name: 'IICT Aust', display_order: 0, functional_currency: 'AUD', include_in_consolidation: true, is_active: true },
      ],
      xero_balance_sheet_lines: [
        { business_id: IICT_BIZ, tenant_id: IICT_AUST_TENANT, account_name: 'Bank', account_code: null, account_type: 'asset', section: 'Current Assets', monthly_values: { '2026-03-31': 1000 } },
        { business_id: IICT_BIZ, tenant_id: IICT_AUST_TENANT, account_name: 'Payables', account_code: null, account_type: 'liability', section: 'Current Liabilities', monthly_values: { '2026-03-31': 400 } },
        { business_id: IICT_BIZ, tenant_id: IICT_AUST_TENANT, account_name: 'Equity', account_code: null, account_type: 'equity', section: 'Equity', monthly_values: { '2026-03-31': 600 } },
      ],
      consolidation_elimination_rules: [],
    }
    const mock = mockSupabase(state)
    const translate = async (_tenant: any, lines: any[]) => {
      translateCalls++
      return { translated: lines, missing: [], ratesUsed: {} }
    }
    const report = await buildConsolidatedBalanceSheet(mock as any, {
      businessId: IICT_BIZ,
      asOfDate: '2026-03-31',
      translate,
    })
    // translate() never invoked for AUD tenant
    expect(translateCalls).toBe(0)
    // BS balances, no CTA
    expect(report.consolidated.translationReserve).toBe(0)
    expect(report.diagnostics.tenants_loaded).toBe(1)
  })
})
