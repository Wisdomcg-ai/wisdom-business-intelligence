/**
 * An inactive forecast is never a consolidated budget (IICT-09).
 *
 * IICT's two FY2027 forecasts are both inactive: 88199866 (48 lines) and the
 * 0-line shell 1c72355f. The engine preferred an active forecast but did not
 * require one, so 88199866 became the budget on IICT's statement pages while
 * the Full Year and Subscriptions pages — which require an active forecast —
 * said there was none. Dragon Roofing's active 7b90633d is unaffected.
 */
import { describe, it, expect, vi } from 'vitest'
import { fakeSupabase } from '@/lib/monthly-report/__tests__/fake-supabase'

const BIZ = 'fbc6dffd-677d-47ec-8277-7157982938e7'
const PROFILE = '6c0dfadb-4229-4fc2-89eb-ec064d24511b'

vi.mock('@/lib/business/resolveBusinessProfileIds', () => ({
  resolveBusinessProfileIds: vi.fn(async () => ({ businessId: BIZ, profileId: PROFILE, all: [BIZ, PROFILE] })),
}))

import { loadSingleBusinessBudget, loadTenantBudgets } from './engine'

const line = (forecast_id: string, account_name: string, v: number) => ({
  forecast_id, account_name, account_type: 'revenue', account_class: null, category: 'Revenue', actual_months: {}, forecast_months: { '2026-08': v },
})

describe('loadSingleBusinessBudget', () => {
  it("IICT's shape — only inactive forecasts — has no budget", async () => {
    const db = fakeSupabase({
      financial_forecasts: [
        { id: '1c72355f', business_id: PROFILE, tenant_id: null, fiscal_year: 2027, is_active: false, deleted_at: null, updated_at: '2026-05-20' },
        { id: '88199866', business_id: PROFILE, tenant_id: null, fiscal_year: 2027, is_active: false, deleted_at: null, updated_at: '2026-05-10' },
      ],
      forecast_pl_lines: [line('88199866', 'Membership income', 314_012)],
    })
    expect(await loadSingleBusinessBudget(db, BIZ, 2027)).toBeNull()
  })

  it("Dragon Roofing's shape — an active forecast beside a newer inactive one — takes the active one", async () => {
    const db = fakeSupabase({
      financial_forecasts: [
        { id: '102189f9', business_id: PROFILE, tenant_id: null, fiscal_year: 2027, is_active: false, deleted_at: null, updated_at: '2026-09-10' },
        { id: '7b90633d', business_id: PROFILE, tenant_id: null, fiscal_year: 2027, is_active: true, deleted_at: null, updated_at: '2026-09-01' },
      ],
      forecast_pl_lines: [line('102189f9', 'Sales', 1), line('7b90633d', 'Sales', 1_000_000)],
    })
    const budget = await loadSingleBusinessBudget(db, BIZ, 2027)
    expect(budget?.[0].monthly_values['2026-08']).toBe(1_000_000)
  })
})

describe('loadTenantBudgets', () => {
  it('skips a tenant whose only forecast is inactive', async () => {
    const tenants = [
      { connection_id: 'c1', tenant_id: 't-a', display_name: 'A', display_order: 1, functional_currency: 'AUD', include_in_consolidation: true },
      { connection_id: 'c2', tenant_id: 't-b', display_name: 'B', display_order: 2, functional_currency: 'AUD', include_in_consolidation: true },
    ] as any
    const db = fakeSupabase({
      financial_forecasts: [
        { id: 'fa', business_id: PROFILE, tenant_id: 't-a', fiscal_year: 2027, is_active: true, deleted_at: null, updated_at: '2026-09-01' },
        { id: 'fb', business_id: PROFILE, tenant_id: 't-b', fiscal_year: 2027, is_active: false, deleted_at: null, updated_at: '2026-09-02' },
      ],
      forecast_pl_lines: [line('fa', 'Sales', 500), line('fb', 'Sales', 900)],
    })
    const budgets = await loadTenantBudgets(db, BIZ, tenants, 2027)
    expect([...budgets.keys()]).toEqual(['t-a'])
  })
})
