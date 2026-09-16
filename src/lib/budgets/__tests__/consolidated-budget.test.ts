/**
 * The approved budget of a business with more than one Xero organisation.
 *
 * Two things were missing (DRG-03, IICT-07, DRG-20):
 *
 *   1. Nothing read budget_versions for a consolidation parent. The single-
 *      entity resolver refused versions from more than one organisation, and
 *      the consolidation engine only ever read forecasts.
 *   2. Budget lines were aligned to accounts by exact name across the whole
 *      business. $44,922 of Dragon's August Wages, Super and Subscriptions
 *      budget sat on budget-only rows while the accounts it belonged to showed
 *      $0 budget — and the fix must not become "align by code", because 26 of
 *      the 74 codes Dragon and Easy Hail share name different accounts.
 *
 * So each organisation's lines are aligned to THAT organisation's accounts —
 * code, then the coach's mapping, then name — and only then merged across
 * organisations by account type and name. Currency is one presentation
 * currency or a refusal that says why.
 */
import { describe, it, expect, vi } from 'vitest'
import { alignApprovedBudget, resolveApprovedBudgetForTenants, resolveConsolidatedApprovedBudget } from '../consolidated-budget'
import { loadBusinessContext, loadTenantSnapshots } from '@/lib/consolidation/engine'
import { deduplicateLines } from '@/lib/consolidation/account-alignment'
import {
  DRAGON, DRG, EHC, FY_MONTHS, IICT, IGL, IAP, dragonState, iictState, memorySupabase,
} from '../__fixtures__/multi-org-budgets'

vi.mock('@/lib/business/resolveBusinessProfileIds', () => ({
  resolveBusinessProfileIds: vi.fn(async (_s: unknown, id: string) => ({
    businessId: id,
    profileId: id === DRAGON ? 'dragon-profile' : 'iict-profile',
    all: [id, id === DRAGON ? 'dragon-profile' : 'iict-profile'],
  })),
}))

const sum = (m: Record<string, number>) => Object.values(m).reduce((s, v) => s + v, 0)
const aug = (lines: Array<{ account_type: string; monthly_values: Record<string, number> }>, type: string) =>
  lines.filter((l) => l.account_type === type).reduce((s, l) => s + (l.monthly_values['2026-08'] ?? 0), 0)
const line = (lines: Array<{ account_name: string; monthly_values: Record<string, number> }>, name: string) =>
  lines.filter((l) => l.account_name === name)

async function resolveFor(state: Record<string, any[]>, businessId: string, reportMonth = '2026-08') {
  const supabase = memorySupabase(state)
  return resolveConsolidatedApprovedBudget(supabase as any, {
    businessId,
    fiscalYear: 2027,
    reportMonth,
    fyMonths: FY_MONTHS,
  })
}

describe('alignApprovedBudget — a shared code is not a shared account', () => {
  const tenants = [
    { tenant_id: 'A', display_name: 'Dragon', accounts: [
      { account_code: '402', account_name: 'Bad Debts expense', account_type: 'opex' },
      { account_code: '400.8', account_name: 'Marketing', account_type: 'opex' },
      { account_code: '477', account_name: 'Wages and Salaries - Admin', account_type: 'opex' },
    ] },
    { tenant_id: 'B', display_name: 'Easy Hail', accounts: [
      { account_code: '402', account_name: 'Marketing', account_type: 'opex' },
    ] },
  ]
  const months = (aug: number) => ({ '2026-08': aug })

  it("each organisation's line lands on its own account, then same-named accounts merge", () => {
    const out = alignApprovedBudget({
      scopes: [
        { tenantId: 'A', lines: [
          { account_code: '402', account_name: 'Bad Debts expense', category: 'Operating Expenses', account_type: 'opex', monthly_values: months(100) },
          { account_code: '400.8', account_name: 'Marketing', category: 'Operating Expenses', account_type: 'opex', monthly_values: months(45) },
        ] },
        { tenantId: 'B', lines: [
          { account_code: '402', account_name: 'Marketing', category: 'Operating Expenses', account_type: 'opex', monthly_values: months(4_000) },
          // Easy Hail's 477 is "Wages and Salaries"; it has no activity, so no account row.
          { account_code: '477', account_name: 'Wages and Salaries', category: 'Operating Expenses', account_type: 'opex', monthly_values: months(12_000) },
        ] },
      ],
      tenants,
      mappings: [],
      fyMonths: ['2026-08'],
    })
    expect(line(out.consolidated, 'Marketing').map((l) => l.monthly_values['2026-08'])).toEqual([4_045])
    expect(line(out.consolidated, 'Bad Debts expense').map((l) => l.monthly_values['2026-08'])).toEqual([100])
    // Not added to Dragon's admin wages through the shared 477.
    expect(line(out.consolidated, 'Wages and Salaries - Admin')).toEqual([])
    expect(line(out.consolidated, 'Wages and Salaries').map((l) => l.monthly_values['2026-08'])).toEqual([12_000])
    expect(out.budgetOnly).toEqual([{ tenant_id: 'B', account_code: '477', account_name: 'Wages and Salaries' }])
    // Per organisation, for the per-entity page.
    expect(out.byTenant!.get('A')!.map((l) => l.account_name).sort()).toEqual(['Bad Debts expense', 'Marketing'])
  })

  it('a code two accounts share keeps no code on the merged row', () => {
    const out = alignApprovedBudget({
      scopes: [
        { tenantId: 'A', lines: [{ account_code: '402', account_name: 'Bad Debts expense', category: null, account_type: 'opex', monthly_values: months(1) }] },
        { tenantId: 'B', lines: [{ account_code: '402', account_name: 'Marketing', category: null, account_type: 'opex', monthly_values: months(2) }] },
      ],
      tenants,
      mappings: [],
      fyMonths: ['2026-08'],
    })
    expect(out.consolidated.map((l) => [l.account_name, l.account_code])).toEqual([
      ['Bad Debts expense', null],
      ['Marketing', null],
    ])
  })

  it('a business-level line whose code names different accounts in two organisations falls to the name', () => {
    const out = alignApprovedBudget({
      scopes: [{ tenantId: null, lines: [
        { account_code: '402', account_name: 'Marketing', category: 'Operating Expenses', account_type: 'opex', monthly_values: months(500) },
      ] }],
      tenants,
      mappings: [],
      fyMonths: ['2026-08'],
    })
    expect(out.consolidated.map((l) => [l.account_name, l.monthly_values['2026-08']])).toEqual([['Marketing', 500]])
    expect(out.byTenant).toBeNull()
    expect(out.matches).toMatchObject({ code: 0, name: 1 })
  })

  it("the coach's mapping names the account when neither code nor name does", () => {
    const out = alignApprovedBudget({
      scopes: [{ tenantId: 'A', lines: [
        { account_code: null, account_name: 'Wages & Salaries (budgeted)', category: 'Operating Expenses', account_type: 'opex', monthly_values: months(26_023) },
      ] }],
      tenants,
      mappings: [{ xero_account_name: 'Wages and Salaries - Admin', xero_account_code: '477', forecast_pl_line_name: 'Wages & Salaries (budgeted)' }],
      fyMonths: ['2026-08'],
    })
    expect(out.consolidated.map((l) => [l.account_name, l.monthly_values['2026-08']])).toEqual([['Wages and Salaries - Admin', 26_023]])
    expect(out.matches.mapping).toBe(1)
  })
})

describe('Dragon Roofing & Easy Hail — one approved FY27 version per organisation', () => {
  it("prints Calxa's August budget: income 1,000,000, cost of sales 582,727, expenses 231,529", async () => {
    const out = await resolveFor(dragonState(), DRAGON)
    expect(out.status).toBe('resolved')
    if (out.status !== 'resolved') return
    expect(out.scope).toBe('per_tenant')
    expect(out.versionIds.sort()).toEqual(['bv-fy27-dragon', 'bv-fy27-easy-hail'])
    expect(out.label).toBe('FY27 Budget')
    expect(Math.round(aug(out.consolidated, 'revenue'))).toBe(1_000_000)
    expect(Math.round(aug(out.consolidated, 'cogs'))).toBe(582_727)
    expect(Math.round(aug(out.consolidated, 'opex'))).toBe(231_529)
    // The income year is Calxa's: 9,630,584.
    expect(Math.round(out.consolidated.filter((l) => l.account_type === 'revenue').reduce((s, l) => s + sum(l.monthly_values), 0))).toBe(9_630_584)
  })

  it("DRG-20: Wages, Super and Subscriptions budgets sit on the accounts the actuals are on", async () => {
    const out = await resolveFor(dragonState(), DRAGON)
    if (out.status !== 'resolved') throw new Error(out.status)
    const at = (name: string) => line(out.consolidated, name).map((l) => l.monthly_values['2026-08'])
    expect(at('Wages and Salaries - Admin')).toEqual([26_023])
    expect(at('Superannuation - Admin')).toEqual([3_123])
    expect(at('Subscriptions')).toEqual([7_206])
    // Easy Hail's own 477 is its own row, not 38,023 on Dragon's admin wages.
    expect(at('Wages and Salaries')).toEqual([12_000])
    // Same name, different code in each organisation: one row.
    expect(at('Virtual Contractors')).toEqual([33_000])
    expect(at('Facebook Adverts')).toEqual([26_000])
    expect(at('Marketing')).toEqual([4_045])
    // Easy Hail's 510 is Consultants; Dragon's 510 (Stripe Fees) takes nothing.
    expect(at('Consultants')).toEqual([52_000])
  })

  it('refuses, naming the organisation, when one organisation has no version in force', async () => {
    const state = dragonState()
    state.budget_versions = state.budget_versions.filter((v: any) => v.tenant_id !== EHC)
    const out = await resolveFor(state, DRAGON)
    expect(out).toMatchObject({ status: 'refused', reason: 'tenant_without_budget' })
    if (out.status === 'refused') expect(out.detail).toContain('Easy Hail Claim Pty Ltd')
  })

  it('refuses a month the year-to-date and annual columns add up that only some organisations budget', async () => {
    // Easy Hail's version imported a month after Dragon's — an ordinary
    // sequence, because effective_from defaults past the finalised months. The
    // report month resolved happily while July's group income budget printed
    // 980,040 against Calxa's 1,230,584 and the year 9,380,040 against 9,630,584.
    const state = dragonState()
    state.budget_versions = state.budget_versions.map((v: any) => (v.tenant_id === EHC ? { ...v, effective_from: '2026-08' } : v))
    const out = await resolveFor(state, DRAGON)
    expect(out).toMatchObject({ status: 'refused', reason: 'tenant_without_budget' })
    if (out.status === 'refused') {
      expect(out.detail).toContain('Easy Hail Claim Pty Ltd')
      expect(out.detail).toContain('Jul 2026')
    }
  })

  it('a year that starts partway through for EVERY organisation is a span, not a gap', async () => {
    const state = dragonState()
    state.budget_versions = state.budget_versions.map((v: any) => ({ ...v, effective_from: '2026-10' }))
    const out = await resolveFor(state, DRAGON, '2026-10')
    expect(out.status).toBe('resolved')
    if (out.status !== 'resolved') return
    expect(aug(out.consolidated, 'revenue')).toBe(0)
    const october = out.consolidated
      .filter((l) => l.account_type === 'revenue')
      .reduce((s, l) => s + (l.monthly_values['2026-10'] ?? 0), 0)
    expect(Math.round(october)).toBe(1_000_000)
  })

  it('a locked version with no lines is not a budget in force for its organisation', async () => {
    const state = dragonState()
    state.budget_lines = state.budget_lines.filter((l: any) => l.tenant_id !== EHC)
    const out = await resolveFor(state, DRAGON)
    expect(out).toMatchObject({ status: 'refused', reason: 'tenant_without_budget' })
    if (out.status === 'refused') expect(out.detail).toContain('Easy Hail Claim Pty Ltd')
  })

  it('refuses a business-level version and per-organisation versions in force together', async () => {
    const state = dragonState()
    state.budget_versions.push({ ...state.budget_versions[0], id: 'bv-business', tenant_id: null })
    const out = await resolveFor(state, DRAGON)
    expect(out).toMatchObject({ status: 'refused', reason: 'mixed_budget_scopes' })
  })

  it('ignores an unlocked (half-written) version', async () => {
    const state = dragonState()
    state.budget_versions = state.budget_versions.map((v: any) => (v.tenant_id === EHC ? { ...v, locked_at: null } : v))
    const out = await resolveFor(state, DRAGON)
    expect(out).toMatchObject({ status: 'refused', reason: 'tenant_without_budget' })
  })

  it('refuses two versions of one organisation in force from the same month', async () => {
    const state = dragonState()
    state.budget_versions.push({ ...state.budget_versions[0], id: 'bv-dragon-v2', version_number: 2 })
    const out = await resolveFor(state, DRAGON)
    expect(out).toMatchObject({ status: 'refused', reason: 'multiple_versions_in_force' })
  })
})

describe('IICT Group — a business-level AUD version over three organisations, one HKD', () => {
  it("resolves Calxa's August budget without translating it — it is already AUD", async () => {
    const out = await resolveFor(iictState(), IICT)
    expect(out.status).toBe('resolved')
    if (out.status !== 'resolved') return
    expect(out.scope).toBe('business')
    expect(out.byTenant).toBeNull()
    expect(Math.round(aug(out.consolidated, 'revenue'))).toBe(314_012)
    expect(Math.round(aug(out.consolidated, 'revenue') - aug(out.consolidated, 'cogs') - aug(out.consolidated, 'opex'))).toBe(30_136)
    // 200 is "Membership income" in all three organisations: one account.
    expect(line(out.consolidated, 'Membership income').map((l) => l.monthly_values['2026-08'])).toEqual([214_829.6])
    // 429 is in no organisation's Xero: kept as a budget-only row.
    expect(out.budgetOnly.map((b) => b.account_code).sort()).toEqual(['212', '429', '477'])
  })

  it('refuses a version whose currency is not recorded, because the organisations differ', async () => {
    const out = await resolveFor(iictState({ versionCurrency: null }), IICT)
    expect(out).toMatchObject({ status: 'refused', reason: 'budget_currency_unknown' })
  })

  it("translates an HKD version at each month's average rate", async () => {
    const out = await resolveFor(iictState({ versionCurrency: 'HKD' }), IICT)
    if (out.status !== 'resolved') throw new Error(`${out.status}: ${(out as any).detail}`)
    // 214,829.60 HKD at Aug's 0.179536
    expect(line(out.consolidated, 'Membership income')[0].monthly_values['2026-08']).toBeCloseTo(214_829.6 * 0.179536, 2)
    expect(out.translated).toEqual([{ scope: null, currency_pair: 'HKD/AUD' }])
  })

  it('refuses an HKD version when a month has no stored rate, naming the months', async () => {
    const out = await resolveFor(iictState({ versionCurrency: 'HKD', omitRateMonths: ['2027-05', '2027-06'] }), IICT)
    expect(out).toMatchObject({ status: 'refused', reason: 'budget_fx_rate_missing' })
    if (out.status === 'refused') expect(out.detail).toBe('no HKD/AUD exchange rate is stored for May 2027 and Jun 2027')
  })

  it("a per-organisation HKD version for IICT Group Limited is translated before it is summed with IICT (Aust)'s AUD one", async () => {
    const state = iictState()
    state.budget_versions = [
      { ...state.budget_versions[0], id: 'bv-iap', tenant_id: IAP, currency: 'AUD' },
      { ...state.budget_versions[0], id: 'bv-igl', tenant_id: IGL, currency: null }, // takes the organisation's HKD
      { ...state.budget_versions[0], id: 'bv-igp', tenant_id: 'tenant-igp', currency: 'AUD' },
    ]
    state.budget_lines = [
      { id: 'l1', budget_version_id: 'bv-iap', business_id: IICT, tenant_id: IAP, account_code: '220', account_name: 'Commissions Received', category: 'Revenue', account_type: 'revenue', month: '2026-08', amount: 100_000 },
      { id: 'l2', budget_version_id: 'bv-igl', business_id: IICT, tenant_id: IGL, account_code: '200', account_name: 'Membership income', category: 'Revenue', account_type: 'revenue', month: '2026-08', amount: 1_000_000 },
      { id: 'l3', budget_version_id: 'bv-igp', business_id: IICT, tenant_id: 'tenant-igp', account_code: '200', account_name: 'Membership income', category: 'Revenue', account_type: 'revenue', month: '2026-08', amount: 50 },
    ]
    const out = await resolveFor(state, IICT)
    if (out.status !== 'resolved') throw new Error(`${out.status}: ${(out as any).detail}`)
    expect(out.scope).toBe('per_tenant')
    expect(line(out.consolidated, 'Membership income')[0].monthly_values['2026-08']).toBeCloseTo(1_000_000 * 0.179536 + 50, 2)
    expect(aug(out.consolidated, 'revenue')).toBeCloseTo(100_000 + 179_536 + 50, 2)
  })
})

describe('resolveApprovedBudgetForTenants — the engine hands in what it already read', () => {
  it('reads no P&L lines of its own', async () => {
    const state = dragonState()
    const supabase = memorySupabase(state)
    const { tenants } = await loadBusinessContext(supabase, DRAGON)
    const snapshots = await loadTenantSnapshots(supabase, DRAGON, tenants)
    const from = vi.spyOn(supabase, 'from')
    const out = await resolveApprovedBudgetForTenants(supabase as any, {
      businessId: DRAGON,
      fiscalYear: 2027,
      reportMonth: '2026-08',
      fyMonths: FY_MONTHS,
      tenants,
      accountsByTenant: new Map(snapshots.map((s) => [s.tenant.tenant_id, deduplicateLines(s.rawLines)])),
      presentationCurrency: 'AUD',
    })
    expect(out.status).toBe('resolved')
    expect(from.mock.calls.map(([t]) => t)).not.toContain('xero_pl_lines_wide_compat')
    expect(DRG).toBeTruthy()
  })
})
