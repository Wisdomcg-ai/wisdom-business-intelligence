import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Phase 73 Plan 01 — Annual Reset Snapshot (RED → GREEN)
 *
 * Tests:
 * 1. Round-trip: capture a known FY26 plan → restore → goals row equals captured data.
 * 2. Read-only assertion: capture issues NO .update/.upsert/.delete against
 *    business_financial_goals, business_kpis, or strategic_initiatives.
 * 3. Snapshot label = `annual_reset_FY<endingFY>` and snapshot_type = 'quarterly_review_pre_sync'.
 * 4. Version number = max existing + 1; first snapshot = 1.
 *
 * Dual-ID split:
 *   business_financial_goals — keyed on business_profiles.id (businessId / profileId)
 *   business_kpis + strategic_initiatives — keyed on businesses.id (businessesId)
 */

// ---------------------------------------------------------------------------
// Mutable in-memory state for tables
// ---------------------------------------------------------------------------
let goalsRow: Record<string, unknown> | null = null
let kpisRows: Record<string, unknown>[] = []
let initiativesRows: Record<string, unknown>[] = []
let snapshotsRows: Record<string, unknown>[] = []
let goalsUpdates: Record<string, unknown>[] = []   // track any writes to goals
let goalsDeletes: number = 0

// Track mutation calls to plan tables during capture
const mutationCalls: { table: string; method: string }[] = []

// ---------------------------------------------------------------------------
// Chained-builder mock factory
//
// Returns a builder object that accumulates filter/modifier calls and
// executes on terminal calls (single, maybeSingle, etc.).
//
// We need to support:
//   from('plan_snapshots').select('version_number').eq(...).order(...).limit(1).maybeSingle()
//   from('plan_snapshots').insert({...}).select().single()
//   from('business_financial_goals').select('*').eq('business_id', id).maybeSingle()
//   from('business_kpis').select(...).eq('business_id', id).eq('is_active', true)
//   from('strategic_initiatives').select(...).eq('business_id', id)
//   from('business_financial_goals').update({...}).eq('business_id', id)
//   from('plan_snapshots').select('plan_data').eq('id', snapshotId).single()
// ---------------------------------------------------------------------------

function makeBuilder(tableName: string) {
  let _insertData: Record<string, unknown> | null = null
  let _updateData: Record<string, unknown> | null = null
  let _isDelete = false
  let _eqFilters: { column: string; value: unknown }[] = []

  const builder: Record<string, unknown> = {}

  builder.select = (_cols?: string) => {
    return builder
  }

  builder.insert = (data: Record<string, unknown>) => {
    _insertData = data
    if (['business_financial_goals', 'business_kpis', 'strategic_initiatives'].includes(tableName)) {
      mutationCalls.push({ table: tableName, method: 'insert' })
    }
    return builder
  }

  builder.update = (data: Record<string, unknown>) => {
    _updateData = data
    if (['business_financial_goals', 'business_kpis', 'strategic_initiatives'].includes(tableName)) {
      mutationCalls.push({ table: tableName, method: 'update' })
    }
    return builder
  }

  builder.upsert = (data: Record<string, unknown>) => {
    if (['business_financial_goals', 'business_kpis', 'strategic_initiatives'].includes(tableName)) {
      mutationCalls.push({ table: tableName, method: 'upsert' })
    }
    return builder
  }

  builder.delete = () => {
    _isDelete = true
    if (['business_financial_goals', 'business_kpis', 'strategic_initiatives'].includes(tableName)) {
      mutationCalls.push({ table: tableName, method: 'delete' })
    }
    return builder
  }

  builder.eq = (_col: string, _val: unknown) => {
    _eqFilters.push({ column: _col, value: _val })
    return builder
  }

  builder.order = () => builder
  builder.limit = () => builder

  builder.maybeSingle = vi.fn(async () => {
    if (tableName === 'business_financial_goals') {
      return { data: goalsRow, error: null }
    }
    if (tableName === 'plan_snapshots') {
      // version-number query: return max version
      const maxVersion = snapshotsRows.length > 0
        ? Math.max(...snapshotsRows.map(r => r.version_number as number))
        : null
      return { data: maxVersion !== null ? { version_number: maxVersion } : null, error: null }
    }
    return { data: null, error: null }
  })

  builder.single = vi.fn(async () => {
    if (_insertData && tableName === 'plan_snapshots') {
      const newRow = {
        id: 'snapshot-id-001',
        ..._insertData,
      }
      snapshotsRows.push(newRow)
      return { data: newRow, error: null }
    }
    if (_updateData && tableName === 'business_financial_goals') {
      goalsUpdates.push(_updateData)
      goalsRow = { ...goalsRow, ..._updateData }
      return { data: goalsRow, error: null }
    }
    if (tableName === 'plan_snapshots') {
      // select('plan_data').eq('id', snapshotId).single() — fetch for restore
      const idFilter = _eqFilters.find(f => f.column === 'id')
      const found = idFilter
        ? snapshotsRows.find(r => r.id === idFilter.value)
        : snapshotsRows[0]
      return { data: found || null, error: found ? null : { message: 'not found' } }
    }
    return { data: null, error: null }
  })

  // Terminal for .then() / await on the builder itself (insert without .select().single())
  builder.then = (resolve: (v: { data: unknown; error: null }) => void) => {
    if (_insertData && tableName === 'plan_snapshots') {
      const newRow = { id: 'snapshot-id-001', ..._insertData }
      snapshotsRows.push(newRow)
      resolve({ data: newRow, error: null })
    } else if (_updateData && tableName === 'business_financial_goals') {
      goalsUpdates.push(_updateData)
      goalsRow = { ...goalsRow, ..._updateData }
      resolve({ data: goalsRow, error: null })
    } else {
      resolve({ data: null, error: null })
    }
  }

  // For KPIs / initiatives selects that resolve as arrays
  ;(builder as Record<string, unknown>).__getRows = () => {
    if (tableName === 'business_kpis') return kpisRows
    if (tableName === 'strategic_initiatives') return initiativesRows
    return []
  }

  return builder as Record<string, unknown> & {
    then: (resolve: (v: { data: unknown; error: null }) => void) => void
    maybeSingle: ReturnType<typeof vi.fn>
    single: ReturnType<typeof vi.fn>
    __getRows: () => Record<string, unknown>[]
  }
}

// ---------------------------------------------------------------------------
// Supabase mock — returned builder resolves to array for list tables
// ---------------------------------------------------------------------------
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: (table: string) => {
      const builder = makeBuilder(table)

      // For kpis and initiatives, we need .eq().eq() chains to eventually
      // resolve with the array. Wrap the builder so that when the consumer
      // awaits the chained result, it gets the rows array.
      if (table === 'business_kpis' || table === 'strategic_initiatives') {
        const rows = table === 'business_kpis' ? kpisRows : initiativesRows
        const proxyBuilder = {
          ...builder,
          // Override then to return rows
          then: (resolve: (v: { data: unknown[]; error: null }) => void) => {
            resolve({ data: rows, error: null })
          },
        }
        return proxyBuilder
      }

      return builder
    },
  }),
}))

// Import AFTER mock is registered
import {
  AnnualResetSnapshotService,
  annualResetSnapshotService,
} from '@/app/goals/services/annual-reset-snapshot-service'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const PROFILE_ID = 'profile-uuid-001'       // business_financial_goals key
const BUSINESSES_ID = 'business-uuid-001'   // business_kpis + initiatives key
const USER_ID = 'user-uuid-001'
const ENDING_FY = 2026

const FY26_GOALS_ROW: Record<string, unknown> = {
  id: 'goals-row-id',
  business_id: PROFILE_ID,
  revenue_current: 500000,
  revenue_year1: 750000,
  revenue_year2: 1000000,
  revenue_year3: 1500000,
  gross_profit_current: 200000,
  gross_profit_year1: 350000,
  gross_profit_year2: 480000,
  gross_profit_year3: 720000,
  gross_margin_current: 40,
  gross_margin_year1: 46.7,
  gross_margin_year2: 48,
  gross_margin_year3: 48,
  net_profit_current: 50000,
  net_profit_year1: 100000,
  net_profit_year2: 150000,
  net_profit_year3: 250000,
  net_margin_current: 10,
  net_margin_year1: 13.3,
  net_margin_year2: 15,
  net_margin_year3: 16.7,
  customers_current: 20,
  customers_year1: 30,
  customers_year2: 40,
  customers_year3: 55,
  employees_current: 5,
  employees_year1: 8,
  employees_year2: 12,
  employees_year3: 18,
  leads_per_month_current: 50,
  leads_per_month_year1: 75,
  leads_per_month_year2: 100,
  leads_per_month_year3: 130,
  conversion_rate_current: 0.4,
  conversion_rate_year1: 0.4,
  conversion_rate_year2: 0.4,
  conversion_rate_year3: 0.42,
  avg_transaction_value_current: 25000,
  avg_transaction_value_year1: 25000,
  avg_transaction_value_year2: 25000,
  avg_transaction_value_year3: 28000,
  team_headcount_current: 5,
  team_headcount_year1: 8,
  team_headcount_year2: 12,
  team_headcount_year3: 18,
  owner_hours_per_week_current: 60,
  owner_hours_per_week_year1: 50,
  owner_hours_per_week_year2: 45,
  owner_hours_per_week_year3: 40,
  quarterly_targets: { revenue: { q1: '180000', q2: '185000', q3: '190000', q4: '195000' } },
  year_type: 'FY',
  is_extended_period: false,
  year1_months: 12,
  current_year_remaining_months: 0,
  plan_start_date: '2025-07-01',
  plan_end_date: '2028-06-30',
  year1_end_date: '2026-06-30',
  created_at: '2025-07-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

const FY26_KPIS: Record<string, unknown>[] = [
  { id: 'kpi-1', kpi_id: 'NPS', name: 'Net Promoter Score', year1_target: 50, year2_target: 60, year3_target: 70, current_value: 42, is_active: true },
]

const FY26_INITIATIVES: Record<string, unknown>[] = [
  { id: 'init-1', title: 'Launch referral program', step_type: 'initiative', status: 'in_progress', fiscal_year: 2026, selected: true, quarter_assigned: 'Q1', category: 'growth', order_index: 0 },
]

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Phase 73-01 — AnnualResetSnapshotService', () => {
  beforeEach(() => {
    goalsRow = { ...FY26_GOALS_ROW }
    kpisRows = [...FY26_KPIS]
    initiativesRows = [...FY26_INITIATIVES]
    snapshotsRows = []
    goalsUpdates = []
    goalsDeletes = 0
    mutationCalls.length = 0
  })

  // -------------------------------------------------------------------------
  // Exports
  // -------------------------------------------------------------------------
  it('exports AnnualResetSnapshotService class and annualResetSnapshotService singleton', () => {
    expect(AnnualResetSnapshotService).toBeDefined()
    expect(annualResetSnapshotService).toBeInstanceOf(AnnualResetSnapshotService)
  })

  // -------------------------------------------------------------------------
  // Version numbering
  // -------------------------------------------------------------------------
  it('assigns version_number=1 when no prior snapshot exists', async () => {
    snapshotsRows = [] // no prior snapshots
    const result = await annualResetSnapshotService.captureAnnualResetSnapshot({
      businessId: PROFILE_ID,
      businessesId: BUSINESSES_ID,
      userId: USER_ID,
      endingFY: ENDING_FY,
    })
    expect(result.success).toBe(true)
    expect(result.versionNumber).toBe(1)
  })

  it('assigns version_number = max+1 when prior snapshots exist', async () => {
    snapshotsRows = [{ id: 'snap-old', version_number: 3, business_id: PROFILE_ID }]
    const result = await annualResetSnapshotService.captureAnnualResetSnapshot({
      businessId: PROFILE_ID,
      businessesId: BUSINESSES_ID,
      userId: USER_ID,
      endingFY: ENDING_FY,
    })
    expect(result.success).toBe(true)
    expect(result.versionNumber).toBe(4)
  })

  // -------------------------------------------------------------------------
  // Snapshot shape
  // -------------------------------------------------------------------------
  it('captures snapshot with snapshot_type=quarterly_review_pre_sync', async () => {
    await annualResetSnapshotService.captureAnnualResetSnapshot({
      businessId: PROFILE_ID,
      businessesId: BUSINESSES_ID,
      userId: USER_ID,
      endingFY: ENDING_FY,
    })
    const snap = snapshotsRows.find(r => r.label === `annual_reset_FY${ENDING_FY}`)
    expect(snap).toBeDefined()
    expect(snap!.snapshot_type).toBe('quarterly_review_pre_sync')
  })

  it('stores annual_reset_FY<endingFY> in the label', async () => {
    await annualResetSnapshotService.captureAnnualResetSnapshot({
      businessId: PROFILE_ID,
      businessesId: BUSINESSES_ID,
      userId: USER_ID,
      endingFY: ENDING_FY,
    })
    const snap = snapshotsRows.find(r => r.label === `annual_reset_FY${ENDING_FY}`)
    expect(snap).toBeDefined()
    expect(snap!.label).toBe('annual_reset_FY2026')
  })

  it('stores year=endingFY in the snapshot row', async () => {
    await annualResetSnapshotService.captureAnnualResetSnapshot({
      businessId: PROFILE_ID,
      businessesId: BUSINESSES_ID,
      userId: USER_ID,
      endingFY: ENDING_FY,
    })
    const snap = snapshotsRows[snapshotsRows.length - 1]
    expect(snap.year).toBe(ENDING_FY)
  })

  it('includes plan_data.goals with the full goals row', async () => {
    await annualResetSnapshotService.captureAnnualResetSnapshot({
      businessId: PROFILE_ID,
      businessesId: BUSINESSES_ID,
      userId: USER_ID,
      endingFY: ENDING_FY,
    })
    const snap = snapshotsRows[snapshotsRows.length - 1]
    const planData = snap.plan_data as Record<string, unknown>
    expect(planData.kind).toBe('annual_reset')
    expect(planData.endingFY).toBe(ENDING_FY)
    const goals = planData.goals as Record<string, unknown>
    expect(goals.revenue_year1).toBe(FY26_GOALS_ROW.revenue_year1)
    expect(goals.quarterly_targets).toEqual(FY26_GOALS_ROW.quarterly_targets)
    expect(goals.year_type).toBe('FY')
    expect(goals.year1_end_date).toBe('2026-06-30')
  })

  it('includes plan_data.kpis and plan_data.initiatives arrays', async () => {
    await annualResetSnapshotService.captureAnnualResetSnapshot({
      businessId: PROFILE_ID,
      businessesId: BUSINESSES_ID,
      userId: USER_ID,
      endingFY: ENDING_FY,
    })
    const snap = snapshotsRows[snapshotsRows.length - 1]
    const planData = snap.plan_data as Record<string, unknown>
    expect(Array.isArray(planData.kpis)).toBe(true)
    expect(Array.isArray(planData.initiatives)).toBe(true)
    expect((planData.kpis as unknown[]).length).toBe(1)
    expect((planData.initiatives as unknown[]).length).toBe(1)
  })

  // -------------------------------------------------------------------------
  // READ-ONLY assertion (no writes to plan tables during capture)
  // -------------------------------------------------------------------------
  it('issues NO .update/.upsert/.delete against business_financial_goals during capture', async () => {
    mutationCalls.length = 0
    await annualResetSnapshotService.captureAnnualResetSnapshot({
      businessId: PROFILE_ID,
      businessesId: BUSINESSES_ID,
      userId: USER_ID,
      endingFY: ENDING_FY,
    })
    const badCalls = mutationCalls.filter(c =>
      c.table === 'business_financial_goals' && ['update', 'upsert', 'delete'].includes(c.method)
    )
    expect(badCalls).toHaveLength(0)
  })

  it('issues NO writes against business_kpis during capture', async () => {
    mutationCalls.length = 0
    await annualResetSnapshotService.captureAnnualResetSnapshot({
      businessId: PROFILE_ID,
      businessesId: BUSINESSES_ID,
      userId: USER_ID,
      endingFY: ENDING_FY,
    })
    const badCalls = mutationCalls.filter(c =>
      c.table === 'business_kpis' && ['insert', 'update', 'upsert', 'delete'].includes(c.method)
    )
    expect(badCalls).toHaveLength(0)
  })

  it('issues NO writes against strategic_initiatives during capture', async () => {
    mutationCalls.length = 0
    await annualResetSnapshotService.captureAnnualResetSnapshot({
      businessId: PROFILE_ID,
      businessesId: BUSINESSES_ID,
      userId: USER_ID,
      endingFY: ENDING_FY,
    })
    const badCalls = mutationCalls.filter(c =>
      c.table === 'strategic_initiatives' && ['insert', 'update', 'upsert', 'delete'].includes(c.method)
    )
    expect(badCalls).toHaveLength(0)
  })

  // -------------------------------------------------------------------------
  // Restore round-trip
  // -------------------------------------------------------------------------
  it('restoreAnnualResetSnapshot writes plan_data.goals back to business_financial_goals', async () => {
    // 1. Capture
    const captureResult = await annualResetSnapshotService.captureAnnualResetSnapshot({
      businessId: PROFILE_ID,
      businessesId: BUSINESSES_ID,
      userId: USER_ID,
      endingFY: ENDING_FY,
    })
    expect(captureResult.success).toBe(true)
    const snapshotId = captureResult.snapshotId!

    // 2. Mutate goals row to simulate an accidental overwrite
    goalsRow = {
      ...goalsRow,
      revenue_year1: 0,
      quarterly_targets: {},
    }

    // 3. Restore
    const restoreResult = await annualResetSnapshotService.restoreAnnualResetSnapshot({
      businessId: PROFILE_ID,
      snapshotId,
    })
    expect(restoreResult.success).toBe(true)

    // 4. Verify goals row was restored (the update was called with the original data)
    expect(goalsUpdates.length).toBeGreaterThan(0)
    const lastUpdate = goalsUpdates[goalsUpdates.length - 1]
    // revenue_year1 should have been written back from the snapshot
    expect(lastUpdate.revenue_year1).toBe(FY26_GOALS_ROW.revenue_year1)
    // quarterly_targets restored
    expect(lastUpdate.quarterly_targets).toEqual(FY26_GOALS_ROW.quarterly_targets)
    // year_type restored
    expect(lastUpdate.year_type).toBe('FY')
  })

  it('restore strips id, created_at before writing (no PK conflict)', async () => {
    await annualResetSnapshotService.captureAnnualResetSnapshot({
      businessId: PROFILE_ID,
      businessesId: BUSINESSES_ID,
      userId: USER_ID,
      endingFY: ENDING_FY,
    })
    const snapshotId = 'snapshot-id-001'

    await annualResetSnapshotService.restoreAnnualResetSnapshot({
      businessId: PROFILE_ID,
      snapshotId,
    })

    const lastUpdate = goalsUpdates[goalsUpdates.length - 1]
    expect(lastUpdate).not.toHaveProperty('id')
    expect(lastUpdate).not.toHaveProperty('created_at')
  })
})
