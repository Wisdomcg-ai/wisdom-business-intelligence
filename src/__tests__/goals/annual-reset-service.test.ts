/**
 * Tests for AnnualResetService.executeAnnualReset — Phase 73 Plan 02
 *
 * Critical assertions (per plan):
 *   (a) captureAnnualResetSnapshot is called BEFORE any business_financial_goals .update
 *   (b) snapshot failure ⇒ ZERO goals writes and ZERO initiative writes
 *   (c) happy path writes rolled ladder + rolled dates + empty quarterly_targets
 *   (d) only INCOMPLETE initiatives are carried forward with selected=false
 *       (completed/cancelled rows are NOT touched)
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'

// ---------------------------------------------------------------------------
// Mock: @/lib/supabase/client
// ---------------------------------------------------------------------------

/** Track all supabase method calls for assertion */
const mockUpdate = vi.fn()
const mockSelect = vi.fn()
const mockEq = vi.fn()
const mockIn = vi.fn()
const mockMaybeSingle = vi.fn()

// We build a chainable builder that tracks which table was targeted.
// Each .from() call returns a fresh builder so we can record which tables
// received .update() calls.

let _updateCalls: { table: string; payload: Record<string, unknown> }[] = []

function makeBuilder(table: string) {
  const builder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    update: vi.fn().mockImplementation((payload: Record<string, unknown>) => {
      _updateCalls.push({ table, payload })
      return builder
    }),
    maybeSingle: vi.fn(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
  }
  return builder
}

// Per-test table builders so we can configure per-table return values
let businessGoalsBuilder: ReturnType<typeof makeBuilder>
let initiativesBuilder: ReturnType<typeof makeBuilder>

function makeSupabaseClient() {
  return {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'business_financial_goals') return businessGoalsBuilder
      if (table === 'strategic_initiatives') return initiativesBuilder
      return makeBuilder(table)
    }),
  }
}

vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn().mockImplementation(() => makeSupabaseClient()),
}))

// ---------------------------------------------------------------------------
// Mock: annualResetSnapshotService
// ---------------------------------------------------------------------------

// Use vi.hoisted so the mock fn is available in the vi.mock factory (which
// is hoisted to the top of the file by vitest's transform).
const mockCaptureAnnualResetSnapshot = vi.hoisted(() => vi.fn())
vi.mock('@/app/goals/services/annual-reset-snapshot-service', () => ({
  annualResetSnapshotService: {
    captureAnnualResetSnapshot: mockCaptureAnnualResetSnapshot,
  },
}))

// ---------------------------------------------------------------------------
// Import after mocks are wired
// ---------------------------------------------------------------------------

import { AnnualResetService, annualResetService } from '@/app/goals/services/annual-reset-service'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const BUSINESS_ID = 'profile-id-aaa'     // business_profiles.id
const BUSINESSES_ID = 'business-id-bbb'  // businesses.id
const USER_ID = 'user-id-ccc'
const YEAR_START_MONTH = 7  // FY (Australian)

/** A representative prior row (FY26 plan ending 2026-06-30) */
const PRIOR_ROW = {
  id: 'goals-row-id',
  business_id: BUSINESS_ID,
  year_type: 'FY',
  year1_end_date: '2026-06-30',
  plan_start_date: '2025-07-01',
  plan_end_date: '2028-06-30',
  quarterly_targets: { revenue: { q1: '50000', q2: '60000', q3: '70000', q4: '80000' } },

  revenue_current: 800_000,
  revenue_year1: 1_000_000,
  revenue_year2: 1_200_000,
  revenue_year3: 1_400_000,

  gross_profit_current: 400_000,
  gross_profit_year1: 500_000,
  gross_profit_year2: 600_000,
  gross_profit_year3: 700_000,

  gross_margin_current: 50,
  gross_margin_year1: 50,
  gross_margin_year2: 50,
  gross_margin_year3: 50,

  net_profit_current: 100_000,
  net_profit_year1: 150_000,
  net_profit_year2: 200_000,
  net_profit_year3: 250_000,

  net_margin_current: 12,
  net_margin_year1: 15,
  net_margin_year2: 16,
  net_margin_year3: 17,

  customers_current: 50,
  customers_year1: 60,
  customers_year2: 70,
  customers_year3: 80,

  employees_current: 8,
  employees_year1: 10,
  employees_year2: 12,
  employees_year3: 14,

  leads_per_month_current: 20,
  leads_per_month_year1: 25,
  leads_per_month_year2: 30,
  leads_per_month_year3: 35,

  conversion_rate_current: 0.25,
  conversion_rate_year1: 0.27,
  conversion_rate_year2: 0.30,
  conversion_rate_year3: 0.33,

  avg_transaction_value_current: 5000,
  avg_transaction_value_year1: 5500,
  avg_transaction_value_year2: 6000,
  avg_transaction_value_year3: 6500,

  team_headcount_current: 4,
  team_headcount_year1: 5,
  team_headcount_year2: 6,
  team_headcount_year3: 7,

  owner_hours_per_week_current: 50,
  owner_hours_per_week_year1: 45,
  owner_hours_per_week_year2: 40,
  owner_hours_per_week_year3: 35,
}

const INCOMPLETE_INITIATIVES = [
  { id: 'init-1', status: 'not_started', title: 'Launch product' },
  { id: 'init-2', status: 'in_progress', title: 'Website redesign' },
  { id: 'init-3', status: 'on_hold',     title: 'Partnership deal' },
]

const COMPLETE_INITIATIVES = [
  { id: 'init-4', status: 'completed',  title: 'Old initiative' },
  { id: 'init-5', status: 'cancelled',  title: 'Cancelled thing' },
]

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function resetBuilders() {
  _updateCalls = []
  businessGoalsBuilder = makeBuilder('business_financial_goals')
  initiativesBuilder = makeBuilder('strategic_initiatives')
}

function configureHappyPath(initiatives = [...INCOMPLETE_INITIATIVES, ...COMPLETE_INITIATIVES]) {
  // Goals: self-read returns the prior row
  businessGoalsBuilder.maybeSingle.mockResolvedValue({ data: PRIOR_ROW, error: null })
  // Goals: update succeeds
  businessGoalsBuilder.update.mockImplementation((payload: Record<string, unknown>) => {
    _updateCalls.push({ table: 'business_financial_goals', payload })
    return { ...businessGoalsBuilder, eq: vi.fn().mockResolvedValue({ data: null, error: null }) }
  })

  // Initiatives: fetch incomplete set
  initiativesBuilder.in.mockReturnValue({
    ...initiativesBuilder,
    eq: vi.fn().mockResolvedValue({ data: initiatives.filter(i =>
      ['not_started', 'in_progress', 'on_hold'].includes(i.status)
    ), error: null }),
  })
  // Initiatives: update carries forward
  initiativesBuilder.update.mockImplementation((payload: Record<string, unknown>) => {
    _updateCalls.push({ table: 'strategic_initiatives', payload })
    return {
      in: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
    }
  })

  // Snapshot: success
  mockCaptureAnnualResetSnapshot.mockResolvedValue({
    success: true,
    snapshotId: 'snap-id-xyz',
    versionNumber: 1,
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AnnualResetService — exports', () => {
  it('exports class AnnualResetService', () => {
    expect(AnnualResetService).toBeDefined()
  })
  it('exports singleton annualResetService', () => {
    expect(annualResetService).toBeInstanceOf(AnnualResetService)
  })
})

describe('executeAnnualReset — snapshot gate (critical safety gate)', () => {
  beforeEach(() => {
    resetBuilders()
    vi.clearAllMocks()
    // Goals: self-read returns the prior row (for all tests in this suite)
    businessGoalsBuilder.maybeSingle.mockResolvedValue({ data: PRIOR_ROW, error: null })
  })

  it('(b) snapshot failure ⇒ zero business_financial_goals .update calls', async () => {
    mockCaptureAnnualResetSnapshot.mockResolvedValue({
      success: false,
      error: 'Snapshot DB write failed',
    })
    const service = new AnnualResetService()
    const result = await service.executeAnnualReset({
      businessId: BUSINESS_ID,
      businessesId: BUSINESSES_ID,
      userId: USER_ID,
      yearStartMonth: YEAR_START_MONTH,
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain('Snapshot')

    // No goals write must have occurred
    const goalsUpdateCalls = _updateCalls.filter(c => c.table === 'business_financial_goals')
    expect(goalsUpdateCalls).toHaveLength(0)
  })

  it('(b) snapshot failure ⇒ zero strategic_initiatives .update calls', async () => {
    mockCaptureAnnualResetSnapshot.mockResolvedValue({
      success: false,
      error: 'Snapshot DB write failed',
    })
    const service = new AnnualResetService()
    await service.executeAnnualReset({
      businessId: BUSINESS_ID,
      businessesId: BUSINESSES_ID,
      userId: USER_ID,
      yearStartMonth: YEAR_START_MONTH,
    })

    const initUpdateCalls = _updateCalls.filter(c => c.table === 'strategic_initiatives')
    expect(initUpdateCalls).toHaveLength(0)
  })
})

describe('executeAnnualReset — self-read contract', () => {
  beforeEach(() => {
    resetBuilders()
    vi.clearAllMocks()
  })

  it('returns error when no prior goals row exists (no priorRow param expected)', async () => {
    businessGoalsBuilder.maybeSingle.mockResolvedValue({ data: null, error: null })
    mockCaptureAnnualResetSnapshot.mockResolvedValue({ success: true, snapshotId: 'x' })

    const service = new AnnualResetService()
    const result = await service.executeAnnualReset({
      businessId: BUSINESS_ID,
      businessesId: BUSINESSES_ID,
      userId: USER_ID,
      yearStartMonth: YEAR_START_MONTH,
    })

    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
  })
})

describe('executeAnnualReset — happy path', () => {
  beforeEach(() => {
    resetBuilders()
    vi.clearAllMocks()
    configureHappyPath()
  })

  it('returns success:true with snapshotId and newFY', async () => {
    const service = new AnnualResetService()
    const result = await service.executeAnnualReset({
      businessId: BUSINESS_ID,
      businessesId: BUSINESSES_ID,
      userId: USER_ID,
      yearStartMonth: YEAR_START_MONTH,
    })

    expect(result.success).toBe(true)
    expect(result.snapshotId).toBe('snap-id-xyz')
    expect(result.newFY).toBe(2027)  // prior year1_end_date = 2026-06-30 → newFY = 2027
  })

  it('(c) writes rolled ladder: new revenue_current = prior revenue_year1 (D3)', async () => {
    const service = new AnnualResetService()
    await service.executeAnnualReset({
      businessId: BUSINESS_ID,
      businessesId: BUSINESSES_ID,
      userId: USER_ID,
      yearStartMonth: YEAR_START_MONTH,
    })

    const goalsCall = _updateCalls.find(c => c.table === 'business_financial_goals')
    expect(goalsCall).toBeDefined()
    expect(goalsCall!.payload.revenue_current).toBe(1_000_000)   // prior year1
    expect(goalsCall!.payload.revenue_year1).toBe(1_200_000)     // prior year2
    expect(goalsCall!.payload.revenue_year2).toBe(1_400_000)     // prior year3
    expect(goalsCall!.payload.revenue_year3).toBe(1_400_000)     // extrapolated
  })

  it('(c) writes rolled plan dates: plan_start_date=2026-07-01, year1_end_date=2027-06-30, plan_end_date=2029-06-30', async () => {
    const service = new AnnualResetService()
    await service.executeAnnualReset({
      businessId: BUSINESS_ID,
      businessesId: BUSINESSES_ID,
      userId: USER_ID,
      yearStartMonth: YEAR_START_MONTH,
    })

    const goalsCall = _updateCalls.find(c => c.table === 'business_financial_goals')
    expect(goalsCall).toBeDefined()
    expect(goalsCall!.payload.plan_start_date).toBe('2026-07-01')
    expect(goalsCall!.payload.year1_end_date).toBe('2027-06-30')
    expect(goalsCall!.payload.plan_end_date).toBe('2029-06-30')
  })

  it('(c) writes quarterly_targets as empty object {}', async () => {
    const service = new AnnualResetService()
    await service.executeAnnualReset({
      businessId: BUSINESS_ID,
      businessesId: BUSINESSES_ID,
      userId: USER_ID,
      yearStartMonth: YEAR_START_MONTH,
    })

    const goalsCall = _updateCalls.find(c => c.table === 'business_financial_goals')
    expect(goalsCall).toBeDefined()
    expect(goalsCall!.payload.quarterly_targets).toEqual({})
  })

  it('(c) resets extended-period fields: is_extended_period=false, year1_months=12, current_year_remaining_months=0', async () => {
    const service = new AnnualResetService()
    await service.executeAnnualReset({
      businessId: BUSINESS_ID,
      businessesId: BUSINESSES_ID,
      userId: USER_ID,
      yearStartMonth: YEAR_START_MONTH,
    })

    const goalsCall = _updateCalls.find(c => c.table === 'business_financial_goals')
    expect(goalsCall).toBeDefined()
    expect(goalsCall!.payload.is_extended_period).toBe(false)
    expect(goalsCall!.payload.year1_months).toBe(12)
    expect(goalsCall!.payload.current_year_remaining_months).toBe(0)
  })

  it('(c) preserves year_type from prior row', async () => {
    const service = new AnnualResetService()
    await service.executeAnnualReset({
      businessId: BUSINESS_ID,
      businessesId: BUSINESSES_ID,
      userId: USER_ID,
      yearStartMonth: YEAR_START_MONTH,
    })

    const goalsCall = _updateCalls.find(c => c.table === 'business_financial_goals')
    expect(goalsCall!.payload.year_type).toBe('FY')
  })

  it('returns carriedForwardCount = number of incomplete initiatives', async () => {
    const service = new AnnualResetService()
    const result = await service.executeAnnualReset({
      businessId: BUSINESS_ID,
      businessesId: BUSINESSES_ID,
      userId: USER_ID,
      yearStartMonth: YEAR_START_MONTH,
    })

    expect(result.carriedForwardCount).toBe(3)  // 3 incomplete: not_started, in_progress, on_hold
  })
})

describe('executeAnnualReset — initiative carry-forward (d)', () => {
  beforeEach(() => {
    resetBuilders()
    vi.clearAllMocks()
    configureHappyPath()
  })

  it('(d) carries forward incomplete (not_started/in_progress/on_hold) with selected=false', async () => {
    const service = new AnnualResetService()
    const result = await service.executeAnnualReset({
      businessId: BUSINESS_ID,
      businessesId: BUSINESSES_ID,
      userId: USER_ID,
      yearStartMonth: YEAR_START_MONTH,
    })

    expect(result.success).toBe(true)
    // The initiatives update payload must include selected: false
    const initCall = _updateCalls.find(c => c.table === 'strategic_initiatives')
    expect(initCall).toBeDefined()
    expect(initCall!.payload.selected).toBe(false)
    expect(initCall!.payload.status).toBe('not_started')
    expect(initCall!.payload.fiscal_year).toBe(2027)
  })

  it('(d) completed/cancelled initiatives are NOT included in the carry-forward update', async () => {
    // Reconfigure with ONLY complete initiatives — no incomplete ones
    resetBuilders()
    businessGoalsBuilder.maybeSingle.mockResolvedValue({ data: PRIOR_ROW, error: null })
    businessGoalsBuilder.update.mockImplementation((payload: Record<string, unknown>) => {
      _updateCalls.push({ table: 'business_financial_goals', payload })
      return { ...businessGoalsBuilder, eq: vi.fn().mockResolvedValue({ data: null, error: null }) }
    })
    mockCaptureAnnualResetSnapshot.mockResolvedValue({ success: true, snapshotId: 'snap-2', versionNumber: 2 })

    // In this scenario, querying incomplete initiatives returns 0 rows
    initiativesBuilder.in.mockReturnValue({
      ...initiativesBuilder,
      eq: vi.fn().mockResolvedValue({ data: [], error: null }),
    })

    const service = new AnnualResetService()
    const result = await service.executeAnnualReset({
      businessId: BUSINESS_ID,
      businessesId: BUSINESSES_ID,
      userId: USER_ID,
      yearStartMonth: YEAR_START_MONTH,
    })

    expect(result.success).toBe(true)
    expect(result.carriedForwardCount).toBe(0)
  })
})
