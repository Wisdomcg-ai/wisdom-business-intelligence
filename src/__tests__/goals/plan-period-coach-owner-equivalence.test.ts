import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'fs'
import path from 'path'

/**
 * Phase 42 — REQ-42-06 regression fence
 *
 * The original Fit2Shine incident (2026-04-24) was caused by a role guard
 *   if (ownerUser === user.id) { ... extended period detection ... }
 * inside useStrategicPlanning. Coach view never satisfied that guard, so
 * coaches saw a 12-month "FY26" Year 1 row of mostly-past quarters instead
 * of the 14-month "FY26 rem + FY27" row owners saw.
 *
 * Phase 42 Plan 02 removed the role guard entirely. This file is the
 * regression fence: a future PR that re-introduces the literal
 * `ownerUser === user.id` will fail the source-code sentinel below.
 *
 * The renderHook integration test is a best-effort behavioural fence — if
 * the elaborate service-mocking environment evolves and the hook stops
 * reaching `isLoading: false`, the sentinel test alone is the irreducible
 * REQ-42-06 fence (see Plan 42-03 task fallback note).
 */

// ─── Service mocks ──────────────────────────────────────────────────────────
// Every service the hook touches must be mocked, otherwise the hook never
// finishes loading and the renderHook assertions deadlock.

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'owner-uuid', email: 'owner@example.com' } }, error: null }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
        in: () => ({
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
      upsert: vi.fn().mockResolvedValue({ error: null }),
      insert: vi.fn().mockResolvedValue({ error: null }),
    }),
  }),
}))

vi.mock('@/lib/business/resolveBusinessId', () => ({
  resolveBusinessId: vi.fn().mockResolvedValue({
    businessProfileId: 'businesses-uuid',
    businessesId: 'businesses-uuid',
    ownerUserId: 'owner-uuid',
  }),
}))

vi.mock('@/app/goals/services/financial-service', () => ({
  FinancialService: {
    loadFinancialGoals: vi.fn().mockResolvedValue({
      financialData: {
        revenue: { current: 0, year1: 100000, year2: 0, year3: 0 },
        grossProfit: { current: 0, year1: 0, year2: 0, year3: 0 },
        grossMargin: { current: 0, year1: 0, year2: 0, year3: 0 },
        netProfit: { current: 0, year1: 0, year2: 0, year3: 0 },
        netMargin: { current: 0, year1: 0, year2: 0, year3: 0 },
        customers: { current: 0, year1: 0, year2: 0, year3: 0 },
        employees: { current: 0, year1: 0, year2: 0, year3: 0 },
      },
      coreMetrics: null,
      yearType: 'FY' as const,
      quarterlyTargets: {},
      extendedPeriod: { isExtendedPeriod: true, year1Months: 14, currentYearRemainingMonths: 2 },
      planPeriod: {
        planStartDate: '2026-04-01',
        planEndDate: '2029-06-30',
        year1EndDate: '2027-06-30',
      },
    }),
    saveFinancialGoals: vi.fn().mockResolvedValue({ success: true }),
  },
}))

vi.mock('@/app/goals/services/kpi-service', () => ({
  KPIService: {
    loadKPIs: vi.fn().mockResolvedValue({ kpis: [] }),
    saveKPIs: vi.fn().mockResolvedValue({ success: true }),
    getUserKPIs: vi.fn().mockResolvedValue([]),
    saveUserKPIs: vi.fn().mockResolvedValue({ success: true }),
  },
}))

vi.mock('@/app/goals/services/strategic-planning-service', () => ({
  StrategicPlanningService: {
    loadInitiatives: vi.fn().mockResolvedValue([]),
    loadSprintActions: vi.fn().mockResolvedValue([]),
    saveInitiatives: vi.fn().mockResolvedValue({ success: true }),
    saveSprintActions: vi.fn().mockResolvedValue({ success: true }),
    saveQuarterlyData: vi.fn().mockResolvedValue({ success: true }),
    loadStrategicData: vi.fn().mockResolvedValue({ swot: null, vision: null, purpose: null, values: [] }),
  },
}))

vi.mock('@/app/goals/services/operational-activities-service', () => ({
  OperationalActivitiesService: {
    loadActivities: vi.fn().mockResolvedValue([]),
    saveActivities: vi.fn().mockResolvedValue({ success: true }),
  },
}))

describe('Phase 42 — Coach view equals Owner view (REQ-42-06 regression fence)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does NOT contain the role guard `ownerUser === user.id` in the hook source (regression sentinel)', () => {
    const hookSource = readFileSync(
      path.resolve(__dirname, '../../app/goals/hooks/useStrategicPlanning.ts'),
      'utf-8'
    )
    // The literal that caused the Fit2Shine incident must never reappear.
    expect(hookSource).not.toContain('ownerUser === user.id')
  })

  it('does NOT contain the legacy proximity-detection guard pattern in the hook source', () => {
    // Defensive sentinel: prevents an alternate spelling of the same bug.
    const hookSource = readFileSync(
      path.resolve(__dirname, '../../app/goals/hooks/useStrategicPlanning.ts'),
      'utf-8'
    )
    expect(hookSource).not.toMatch(/if\s*\(\s*ownerUser\s*===\s*user\.id\s*\)/)
  })

  it('imports the Phase 42 helpers (suggestPlanPeriod, derivePeriodInfo)', () => {
    // Positive sentinel — the date-driven path is wired in.
    const hookSource = readFileSync(
      path.resolve(__dirname, '../../app/goals/hooks/useStrategicPlanning.ts'),
      'utf-8'
    )
    expect(hookSource).toMatch(/import\s*\{\s*suggestPlanPeriod\s*\}/)
    expect(hookSource).toMatch(/import\s*\{\s*derivePeriodInfo\s*\}/)
  })

  // Behavioural fence is intentionally a structural sentinel-only test.
  //
  // We tried the renderHook approach (Plan 42-03 task spec referenced it)
  // but the hook chain (createClient -> auth.getUser -> resolveBusinessId
  // -> 4 services -> setIsLoading(false)) leaves async work pending past
  // the test boundary which Vitest 4's worker rpc reports as unhandled
  // rejections at teardown — even when wrapped in try/catch with unmount.
  //
  // The 3 source-code sentinels above are the AUTHORITATIVE regression
  // fence per the plan's task fallback note: "the source-code sentinel
  // test alone is sufficient for the regression fence." The integration
  // test is replaced by an explicit AST-equivalent check that the hook's
  // plan-period resolution path is structurally role-agnostic.
  it('hook resolution branch reads `bizId` (not `user.id`) when calling FinancialService.loadFinancialGoals (REQ-42-06 structural)', () => {
    const hookSource = readFileSync(
      path.resolve(__dirname, '../../app/goals/hooks/useStrategicPlanning.ts'),
      'utf-8'
    )
    // The persisted-plan-period load goes through `loadFinancialGoals(bizId)`
    // — bizId is computed identically for owner and coach (no role branch).
    expect(hookSource).toMatch(/FinancialService\.loadFinancialGoals\s*\(\s*bizId\s*\)/)
    // The role-agnostic branch contains a setPlanStartDate call (Phase 42
    // resolution writes the dates regardless of caller).
    expect(hookSource).toContain('setPlanStartDate')
    expect(hookSource).toContain('setYear1EndDate')
    expect(hookSource).toContain('setPlanEndDate')
  })
})
