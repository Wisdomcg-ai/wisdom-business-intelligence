/**
 * resolveBudget for a business with more than one Xero organisation.
 *
 * Every page that is not the statement reads the budget through resolveBudget:
 * the Full Year page (DRG-39, IICT-44), the analysis charts that plot it
 * (DRG-11), the subscription, wages and payroll pages. It refused versions from
 * more than one organisation ('multiple_versions_in_force'), so once Dragon's
 * statement was measured against its FY27 Budget every one of those pages
 * would have said no approved budget exists. It now answers with the
 * consolidated resolver's lines — the same accounts, merged the same way, as
 * the statement.
 */
import { describe, it, expect, vi } from 'vitest'
import { resolveBudget } from '../resolve-budget'
import { DRAGON, DRAGON_PROFILE, IICT, IICT_PROFILE, FY_MONTHS, dragonState, iictState, memorySupabase } from '../__fixtures__/multi-org-budgets'

vi.mock('@/lib/business/resolveBusinessProfileIds', () => ({
  resolveBusinessProfileIds: vi.fn(async (_s: unknown, id: string) => ({
    businessId: id,
    profileId: id === DRAGON ? DRAGON_PROFILE : IICT_PROFILE,
    all: [id, id === DRAGON ? DRAGON_PROFILE : IICT_PROFILE],
  })),
}))

const args = (businessId: string, profileId: string, months: readonly string[] = FY_MONTHS) => ({
  businessId,
  profileId,
  fiscalYear: 2027,
  reportMonth: '2026-08',
  months,
  budgetSource: 'budget_version' as const,
  pin: {},
})

describe('resolveBudget — two organisations on the budget store', () => {
  it("Dragon: one line per consolidated account, carrying Calxa's August", async () => {
    const out = await resolveBudget(memorySupabase(dragonState()) as any, args(DRAGON, DRAGON_PROFILE))
    expect(out.source).toBe('budget_version')
    expect(out.noBudgetReason).toBeNull()
    expect(out.versionId).toBe('bv-fy27-dragon')
    expect(out.label).toBe('FY27 Budget')
    const at = (name: string) => out.lines.filter((l) => l.account_name === name)
    expect(at('Wages and Salaries - Admin').map((l) => l.forecast_months['2026-08'])).toEqual([26_023])
    expect(at('Wages and Salaries').map((l) => [l.forecast_months['2026-08'], l.category])).toEqual([[12_000, 'Operating Expenses']])
    expect(at('Virtual Contractors').map((l) => [l.forecast_months['2026-08'], l.account_code])).toEqual([[33_000, null]])
    // 485 is Subscriptions in both organisations: the code survives the merge.
    expect(at('Subscriptions').map((l) => l.account_code)).toEqual(['485'])
    // Ids are unique — generate-style consumers key four behaviours on them.
    expect(new Set(out.lines.map((l) => l.id)).size).toBe(out.lines.length)
    expect(Math.round(out.lines.filter((l) => l.category === 'Revenue').reduce((s, l) => s + (l.forecast_months['2026-08'] ?? 0), 0))).toBe(1_000_000)
  })

  it("Dragon: a page that asks for one month still gets that month's lines", async () => {
    const out = await resolveBudget(memorySupabase(dragonState()) as any, args(DRAGON, DRAGON_PROFILE, ['2026-08']))
    expect(out.source).toBe('budget_version')
    expect(out.lines.find((l) => l.account_name === 'Subscriptions')!.forecast_months['2026-08']).toBe(7_206)
  })

  it('Dragon: an organisation without a version is refused with the resolver\'s reason, not "multiple versions"', async () => {
    const state = dragonState()
    state.budget_versions = state.budget_versions.filter((v: any) => v.tenant_id !== 'tenant-easy-hail')
    const out = await resolveBudget(memorySupabase(state) as any, args(DRAGON, DRAGON_PROFILE))
    // Only Dragon's version remains, so the single-organisation path would have
    // answered with Dragon's budget alone as the group's.
    expect(out).toMatchObject({ source: 'none', noBudgetReason: 'tenant_without_budget' })
  })

  it('IICT: a business-level version over three organisations goes through the same alignment', async () => {
    const out = await resolveBudget(memorySupabase(iictState()) as any, args(IICT, IICT_PROFILE))
    expect(out.source).toBe('budget_version')
    expect(out.lines.find((l) => l.account_name === 'General Expenses')).toMatchObject({ account_code: '429', category: 'Operating Expenses' })
    expect(Math.round(out.lines.filter((l) => l.category === 'Revenue').reduce((s, l) => s + (l.forecast_months['2026-08'] ?? 0), 0))).toBe(314_012)
  })

  it('IICT: a business-level version with no recorded currency is refused, not summed 1:1', async () => {
    const out = await resolveBudget(memorySupabase(iictState({ versionCurrency: null })) as any, args(IICT, IICT_PROFILE))
    expect(out).toMatchObject({ source: 'none', noBudgetReason: 'budget_currency_unknown' })
  })
})
