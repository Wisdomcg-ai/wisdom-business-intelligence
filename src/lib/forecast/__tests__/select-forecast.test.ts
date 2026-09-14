/**
 * Which forecast the app means for a fiscal year — shared by
 * ForecastService.getOrCreateForecast and the preview harness, so the pack's
 * cashflow page is built on the same forecast in both.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { pickForecast, forecastPeriodsFor, FORECAST_PERIOD_FIELDS } from '../select-forecast'
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
