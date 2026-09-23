/**
 * Which forecast the app means for a fiscal year — shared by
 * ForecastService.getOrCreateForecast and the preview harness, so the pack's
 * cashflow page is built on the same forecast in both.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { pickForecast, forecastPeriodsFor, findPackForecast, FORECAST_PERIOD_FIELDS } from '../select-forecast'
import { calculateForecastPeriods } from '@/lib/utils/fiscal-year-utils'

afterEach(() => { vi.useRealTimers() })

describe('pickForecast', () => {
  it('prefers the active forecast over a newer abandoned draft (H7)', () => {
    const rows = [
      { id: 'draft', is_active: false, assumptions: { revenue: 1 } },
      { id: 'active', is_active: true, assumptions: {} },
    ]
    expect(pickForecast(rows)!.id).toBe('active')
  })

  it('then one with assumptions, then the newest', () => {
    expect(pickForecast([{ id: 'empty', is_active: false, assumptions: {} }, { id: 'has', is_active: false, assumptions: { x: 1 } }])!.id).toBe('has')
    expect(pickForecast([{ id: 'newest', is_active: false, assumptions: {} }, { id: 'older', is_active: false, assumptions: {} }])!.id).toBe('newest')
  })

  it('maps wizard_v4 assumptions onto an empty assumptions column', () => {
    const picked = pickForecast([{ id: 'w', is_active: true, assumptions: null, category_assumptions: { wizard_v4: { assumptions: { goals: 1 } } } }])
    expect(picked!.assumptions).toEqual({ goals: 1 })
  })

  it('is null when there is nothing to pick', () => {
    expect(pickForecast([])).toBeNull()
    expect(pickForecast(null)).toBeNull()
  })
})

describe('forecastPeriodsFor', () => {
  it('flags a forecast whose windows have not rolled forward', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-14T00:00:00'))
    const periods = calculateForecastPeriods(2027)
    const current = Object.fromEntries(FORECAST_PERIOD_FIELDS.map((k) => [k, (periods as Record<string, unknown>)[k]]))
    expect(forecastPeriodsFor(current, 2027)).toEqual({ periods, needsUpdate: false })
    expect(forecastPeriodsFor({ ...current, actual_end_month: '2026-07' }, 2027).needsUpdate).toBe(true)
    expect(periods.actual_end_month).toBe('2026-08')
  })
})

describe('findPackForecast — the pack reads the forecast and never writes it (IICT-53, DRG-48)', () => {
  const BUSINESS = 'c7df2983-5711-4959-8ec8-a48030d62666'
  const PROFILE = 'a1657c67-a12f-41e0-a312-ba90180e864b'

  it("picks Dragon Roofing's active forecast under the profile id, correcting its periods in memory only", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-14T00:00:00'))
    const { fakeSupabase } = await import('@/lib/monthly-report/__tests__/fake-supabase')
    const stale = { actual_start_month: '2026-07', actual_end_month: '2026-07' }
    const db = fakeSupabase({
      business_profiles: [{ id: PROFILE, business_id: BUSINESS }],
      financial_forecasts: [
        { id: '102189f9', business_id: PROFILE, fiscal_year: 2027, is_active: false, assumptions: { x: 1 }, updated_at: '2026-09-10', ...stale },
        { id: '7b90633d', business_id: PROFILE, fiscal_year: 2027, is_active: true, assumptions: {}, updated_at: '2026-09-01', ...stale },
      ],
    })
    const { forecast, error } = await findPackForecast(db, BUSINESS, 2027)
    expect(error).toBeNull()
    expect(forecast!.id).toBe('7b90633d')
    const periods = calculateForecastPeriods(2027)
    expect(forecast!.actual_end_month).toBe(periods.actual_end_month)
    expect(forecast!.actual_end_month).not.toBe('2026-07')
    // fakeSupabase throws on any write verb, so reaching here is the proof.
  })

  it('no forecast for the year is null, and nothing is created', async () => {
    const { fakeSupabase } = await import('@/lib/monthly-report/__tests__/fake-supabase')
    const db = fakeSupabase({ business_profiles: [{ id: PROFILE, business_id: BUSINESS }], financial_forecasts: [] })
    expect(await findPackForecast(db, BUSINESS, 2027)).toEqual({ forecast: null, error: null })
  })

  it('a lookup that fails says so — it is not "no forecast"', async () => {
    const { fakeSupabase } = await import('@/lib/monthly-report/__tests__/fake-supabase')
    const db = fakeSupabase({ business_profiles: [{ id: PROFILE, business_id: BUSINESS }], financial_forecasts: { error: { message: 'timeout' } } })
    expect(await findPackForecast(db, BUSINESS, 2027)).toEqual({ forecast: null, error: 'timeout' })
  })
})
