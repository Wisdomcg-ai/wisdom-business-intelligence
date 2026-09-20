/**
 * Switching a business with more than one Xero organisation onto its approved
 * budget.
 *
 * The settings route refused it outright — MULTI_ORG_BUDGET_UNSUPPORTED —
 * because nothing could combine two organisations' budgets (DRG-03). The
 * consolidated resolver now does, and refuses per report with a stated reason
 * when it cannot (an organisation without a version, a missing exchange rate),
 * so the switch itself only needs a locked version to switch to.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { dragonState, memorySupabase, DRAGON } from '@/lib/budgets/__fixtures__/multi-org-budgets'

vi.mock('@/lib/permissions/requireSectionPermission', () => ({
  requireSectionPermission: vi.fn(async () => ({ allowed: true, reason: 'test-bypass' })),
}))
vi.mock('@/lib/permissions/sectionPermissionConfig', () => ({ enforceSectionPermission: vi.fn(() => null) }))
vi.mock('@/lib/supabase/server', () => ({
  createRouteHandlerClient: vi.fn(async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'coach-1' } }, error: null }) } })),
}))
vi.mock('@/lib/supabase/keys', () => ({ getSupabaseSecretKey: () => 'test-secret-key' }))
vi.mock('@/lib/utils/verify-business-access', () => ({ verifyBusinessAccess: vi.fn(async () => true) }))
vi.mock('@/lib/reports/revert-report', () => ({ revertReportIfApproved: vi.fn(async () => ({ reverted: false })) }))
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from: (table: string) => service.from(table) })),
}))

let service: any
let upserts: any[] = []

function withUpsert(tables: Record<string, any[]>) {
  const mem = memorySupabase(tables)
  return {
    from: (table: string) => ({
      ...mem.from(table),
      select: (...args: any[]) => (mem.from(table) as any).select(...args),
      upsert: (row: any) => {
        upserts.push({ table, row })
        return { select: () => ({ single: async () => ({ data: row, error: null }) }) }
      },
    }),
  }
}

async function post(body: Record<string, unknown>) {
  const { POST } = await import('../route')
  const res = await POST(new Request('http://localhost/api/monthly-report/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as any)
  return { status: res.status, json: (await res.json()) as any }
}

describe('POST /api/monthly-report/settings — budget_source for a two-organisation business', () => {
  beforeEach(() => {
    upserts = []
  })

  it('switches Dragon Roofing & Easy Hail onto its locked per-organisation versions', async () => {
    service = withUpsert(dragonState({ budgetSource: 'forecast' }))
    const { status, json } = await post({ business_id: DRAGON, budget_source: 'budget_version' })
    expect(status).toBe(200)
    expect(json.code).toBeUndefined()
    expect(upserts).toHaveLength(1)
    expect(upserts[0].row.budget_source).toBe('budget_version')
  })

  it('still refuses a business with no locked version to switch to', async () => {
    const state = dragonState({ budgetSource: 'forecast' })
    state.budget_versions = state.budget_versions.map((v: any) => ({ ...v, locked_at: null }))
    service = withUpsert(state)
    const { status, json } = await post({ business_id: DRAGON, budget_source: 'budget_version' })
    expect(status).toBe(400)
    expect(json.code).toBe('NO_BUDGET_VERSION')
    expect(upserts).toHaveLength(0)
  })
})
