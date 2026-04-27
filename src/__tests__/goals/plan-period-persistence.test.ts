import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Phase 42 — REQ-42-07 round-trip persistence fence
 *
 * Asserts that `planPeriod` written by FinancialService.saveFinancialGoals
 * survives a reload round-trip with byte-for-byte identical ISO date strings.
 *
 * Mocks the supabase client at the FinancialService class-load boundary —
 * the service instantiates `private static supabase = createClient()` once,
 * so the mock must be wired before the FinancialService import is resolved.
 */

// Per-test mutable state for the mocked DB row.
let dbRow: Record<string, unknown> | null = null

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({
      upsert: vi.fn(async (data: Record<string, unknown>) => {
        dbRow = { ...data }
        return { error: null }
      }),
      select: () => ({
        eq: () => ({
          maybeSingle: vi.fn(async () => ({ data: dbRow, error: null })),
        }),
      }),
    }),
  }),
}))

// Import AFTER the mock is registered.
import { FinancialService } from '@/app/goals/services/financial-service'
import type { FinancialData } from '@/app/goals/types'

const emptyFinancialData: FinancialData = {
  revenue: { current: 0, year1: 100000, year2: 0, year3: 0 },
  grossProfit: { current: 0, year1: 0, year2: 0, year3: 0 },
  grossMargin: { current: 0, year1: 0, year2: 0, year3: 0 },
  netProfit: { current: 0, year1: 0, year2: 0, year3: 0 },
  netMargin: { current: 0, year1: 0, year2: 0, year3: 0 },
  customers: { current: 0, year1: 0, year2: 0, year3: 0 },
  employees: { current: 0, year1: 0, year2: 0, year3: 0 },
}

describe('Phase 42 — Plan period persistence round-trip (REQ-42-07)', () => {
  beforeEach(() => {
    dbRow = null
  })

  it('saves planPeriod as ISO YYYY-MM-DD strings AND reloads them identically', async () => {
    // Use UTC midnight Dates so toISOString().slice(0,10) is deterministic
    // across timezones (FinancialService.saveFinancialGoals serializes via
    // toISOString — see financial-service.ts line 117-119).
    const planPeriod = {
      planStartDate: new Date(Date.UTC(2026, 3, 1)), //  2026-04-01 UTC
      planEndDate: new Date(Date.UTC(2029, 5, 30)), //  2029-06-30 UTC
      year1EndDate: new Date(Date.UTC(2027, 5, 30)), // 2027-06-30 UTC
    }

    const saveResult = await FinancialService.saveFinancialGoals(
      'business-uuid',
      'user-uuid',
      emptyFinancialData,
      'FY',
      undefined,
      {},
      { isExtendedPeriod: true, year1Months: 14, currentYearRemainingMonths: 2 },
      planPeriod
    )
    expect(saveResult.success).toBe(true)

    // The captured upsert payload should contain ISO date strings.
    expect(dbRow).not.toBeNull()
    expect(dbRow!.plan_start_date).toBe('2026-04-01')
    expect(dbRow!.plan_end_date).toBe('2029-06-30')
    expect(dbRow!.year1_end_date).toBe('2027-06-30')
    // Phase 14 fields also persisted (Plan 42-01 Task 5 / sentinel)
    expect(dbRow!.is_extended_period).toBe(true)
    expect(dbRow!.year1_months).toBe(14)
    expect(dbRow!.current_year_remaining_months).toBe(2)

    // Load returns the planPeriod as raw YYYY-MM-DD strings (Pitfall 7
    // contract — service boundary stays string|null; hook converts to Date).
    const loaded = await FinancialService.loadFinancialGoals('business-uuid')
    expect(loaded.planPeriod.planStartDate).toBe('2026-04-01')
    expect(loaded.planPeriod.planEndDate).toBe('2029-06-30')
    expect(loaded.planPeriod.year1EndDate).toBe('2027-06-30')

    // Constructing Dates from the loaded strings yields the same calendar day.
    const reconstructed = new Date(loaded.planPeriod.planStartDate as string)
    expect(reconstructed.getUTCFullYear()).toBe(2026)
    expect(reconstructed.getUTCMonth()).toBe(3) // April
    expect(reconstructed.getUTCDate()).toBe(1)
  })

  it('returns null planPeriod fields when the row has no plan period set (legacy/un-backfilled row)', async () => {
    // Simulate a row that exists with financials but no Phase 42 columns yet.
    dbRow = {
      revenue_year1: 50000,
      year_type: 'FY',
      is_extended_period: false,
      year1_months: 12,
      current_year_remaining_months: 0,
      plan_start_date: null,
      plan_end_date: null,
      year1_end_date: null,
    }

    const loaded = await FinancialService.loadFinancialGoals('business-uuid')
    expect(loaded.planPeriod.planStartDate).toBeNull()
    expect(loaded.planPeriod.planEndDate).toBeNull()
    expect(loaded.planPeriod.year1EndDate).toBeNull()
    // The legacy extended-period block still hydrates correctly.
    expect(loaded.extendedPeriod.isExtendedPeriod).toBe(false)
    expect(loaded.extendedPeriod.year1Months).toBe(12)
  })

  it('saving without planPeriod stores null in all three columns', async () => {
    // Plan 42-01 Task 4 contract: planPeriod is OPTIONAL — old call sites
    // without it must not regress. The schema columns are nullable.
    const result = await FinancialService.saveFinancialGoals(
      'business-uuid',
      'user-uuid',
      emptyFinancialData,
      'FY',
      undefined,
      {},
      { isExtendedPeriod: false, year1Months: 12, currentYearRemainingMonths: 0 }
      // planPeriod intentionally omitted
    )
    expect(result.success).toBe(true)
    expect(dbRow).not.toBeNull()
    expect(dbRow!.plan_start_date).toBeNull()
    expect(dbRow!.plan_end_date).toBeNull()
    expect(dbRow!.year1_end_date).toBeNull()
  })

  it('returns default planPeriod (all nulls) when loadFinancialGoals receives no businessId', async () => {
    const loaded = await FinancialService.loadFinancialGoals('')
    expect(loaded.planPeriod.planStartDate).toBeNull()
    expect(loaded.planPeriod.planEndDate).toBeNull()
    expect(loaded.planPeriod.year1EndDate).toBeNull()
    // Error sentinel
    expect(loaded.error).toBe('Business ID required')
  })
})
