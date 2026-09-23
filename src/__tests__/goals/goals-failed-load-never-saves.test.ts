/**
 * D3 (22 Sep 2026 system diagnostic) — a failed goals load became a write.
 *
 * FinancialService.loadFinancialGoals returns nulls WITH an `error`, which the
 * hook dropped; KPIService.getUserKPIs answered [] for a failed query and for a
 * business with no KPIs alike. Either way the hook marked itself loaded, so the
 * next edit's autosave wrote zeros over the 3-year revenue and profit targets
 * (financial-service builds the row from state) and deactivated every stored
 * KPI — a read failure turned into data loss.
 *
 * The KPI read's contract is tested directly. The hook itself is pinned by
 * source sentinels, as the rest of this folder does: a previous attempt to
 * drive useStrategicPlanning through renderHook was abandoned because its load
 * chain leaves async work outstanding past the test boundary (see
 * plan-period-coach-owner-equivalence.test.ts). Re-attempted here and the load
 * effect re-fires indefinitely under mocks, so sentinels it is.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const supabaseMock = vi.hoisted(() => ({ rows: null as unknown, error: null as unknown }))

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        in: () => ({
          eq: () => ({
            order: async () => ({ data: supabaseMock.rows, error: supabaseMock.error }),
          }),
        }),
      }),
    }),
  }),
}))
vi.mock('@/lib/business/resolveBusinessProfileIds', () => ({
  resolveBusinessProfileIds: vi.fn(async () => ({
    businessId: 'businesses-uuid', profileId: 'profile-uuid', all: ['businesses-uuid', 'profile-uuid'],
  })),
}))

import { KPIService } from '@/app/goals/services/kpi-service'

beforeEach(() => {
  supabaseMock.rows = null
  supabaseMock.error = null
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
})
afterEach(() => vi.restoreAllMocks())

describe('a KPI read that failed is not "this client has no KPIs"', () => {
  it('a failed query answers ok: false with an empty list', async () => {
    supabaseMock.error = { message: 'canceling statement due to statement timeout' }
    const result = await KPIService.getUserKPIsResult('businesses-uuid')
    expect(result).toEqual({ kpis: [], ok: false })
  })

  it('a business with no KPIs answers ok: true', async () => {
    supabaseMock.rows = []
    const result = await KPIService.getUserKPIsResult('businesses-uuid')
    expect(result).toEqual({ kpis: [], ok: true })
  })

  it('stored KPIs come back with ok: true', async () => {
    supabaseMock.rows = [
      { kpi_id: 'k1', name: 'Gross margin', business_id: 'profile-uuid', is_active: true, updated_at: '2026-09-01' },
    ]
    const result = await KPIService.getUserKPIsResult('businesses-uuid')
    expect(result.ok).toBe(true)
    expect(result.kpis).toHaveLength(1)
  })

  it('the list-only form still works for its other callers', async () => {
    supabaseMock.rows = []
    expect(await KPIService.getUserKPIs('businesses-uuid')).toEqual([])
  })
})

describe('the goals hook cannot save a plan it failed to load (source fence)', () => {
  const hookSource = readFileSync(
    path.resolve(__dirname, '../../app/goals/hooks/useStrategicPlanning.ts'),
    'utf-8',
  )

  it('reads the error loadFinancialGoals returns instead of dropping it', () => {
    expect(hookSource).toMatch(/error:\s*loadFinancialError/)
    expect(hookSource).toMatch(/if\s*\(\s*loadFinancialError\s*\)[\s\S]{0,200}setLoadUnavailable\(true\)/)
  })

  it('reads KPIs through the result form and flags a failed read', () => {
    expect(hookSource).toContain('KPIService.getUserKPIsResult')
    expect(hookSource).toMatch(/if\s*\(\s*!kpiReadOk\s*\)[\s\S]{0,200}setLoadUnavailable\(true\)/)
  })

  it('the autosave gate refuses when the load failed', () => {
    expect(hookSource).toMatch(/if\s*\(!isLoadComplete\s*\|\|\s*!isDirty\s*\|\|\s*!businessId\s*\|\|\s*!userId\s*\|\|\s*loadUnavailable\)/)
  })

  it('saveAllData itself refuses, so a manual save cannot do it either', () => {
    expect(hookSource).toMatch(/if\s*\(\s*loadUnavailable\s*\)\s*\{[\s\S]{0,260}return false/)
  })

  it('both goals pages say so instead of showing an empty plan', () => {
    for (const page of ['../../app/goals/page.tsx', '../../app/coach/clients/[id]/goals/page.tsx']) {
      const source = readFileSync(path.resolve(__dirname, page), 'utf-8')
      expect(source, page).toMatch(/if\s*\(loadUnavailable\)/)
      expect(source, page).toMatch(/couldn&apos;t be loaded/)
    }
  })
})
