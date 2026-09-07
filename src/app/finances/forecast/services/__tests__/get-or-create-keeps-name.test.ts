/**
 * Opening a forecast page must not rename the forecast.
 *
 * getOrCreateForecast keeps a forecast's period columns in step with the
 * calendar (rolling forecasts). That maintenance write used to include the
 * NAME, so every visit reset an operator's name to the default — My Business's
 * "FY2026 Forecast (Apr 2026)" became "FY2026 Financial Forecast" when the page
 * was opened on 8 Sep 2026. The default name belongs to brand-new rows only.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

type Recorded = { updates: Array<{ table: string; payload: Record<string, unknown>; filters: unknown[] }>; inserts: Array<{ table: string; rows: unknown }> }
let recorded: Recorded
let existingRows: Record<string, unknown>[] = []

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: (table: string) => {
      const filters: unknown[] = []
      const b: Record<string, unknown> = {}
      const chain = () => b
      for (const m of ['select', 'in', 'order', 'limit']) b[m] = vi.fn(chain)
      b.eq = vi.fn((col: string, val: unknown) => { filters.push([col, val]); return b })
      b.maybeSingle = vi.fn(async () => (table === 'business_profiles' ? { data: { id: 'profile-1' }, error: null } : { data: null, error: null }))
      b.single = vi.fn(async () => ({ data: { id: 'new-1', ...(recorded.inserts.at(-1)?.rows as unknown[])?.[0] as object }, error: null }))
      b.update = vi.fn((payload: Record<string, unknown>) => {
        const ub: Record<string, unknown> = {}
        ub.eq = vi.fn((col: string, val: unknown) => { recorded.updates.push({ table, payload, filters: [[col, val]] }); return Promise.resolve({ data: null, error: null }) })
        return ub
      })
      b.insert = vi.fn((rows: unknown) => { recorded.inserts.push({ table, rows }); return b })
      ;(b as { then?: unknown }).then = (res: (v: unknown) => void, rej: (e: unknown) => void) =>
        Promise.resolve(table === 'financial_forecasts' ? { data: existingRows, error: null } : { data: null, error: null }).then(res, rej)
      return b
    },
  }),
}))

import ForecastService from '../forecast-service'

beforeEach(() => {
  recorded = { updates: [], inserts: [] }
})

describe('getOrCreateForecast — name is the operator\'s', () => {
  it('syncs stale period columns on an existing forecast WITHOUT touching its name', async () => {
    existingRows = [{
      id: 'f-1', business_id: 'profile-1', fiscal_year: 2026, name: 'FY2026 Forecast (Apr 2026)', is_active: true,
      assumptions: { goals: {} },
      // Obviously stale windows → the maintenance update fires.
      baseline_start_month: '1999-01', baseline_end_month: '1999-12', actual_start_month: '1999-01',
      actual_end_month: '1999-12', forecast_start_month: '1999-01', forecast_end_month: '1999-12',
    }]
    const { forecast, error } = await ForecastService.getOrCreateForecast('biz-1', 'user-1', 2026)
    expect(error).toBeUndefined()
    const update = recorded.updates.find((u) => u.table === 'financial_forecasts')
    expect(update).toBeDefined()
    expect(update!.filters).toEqual([['id', 'f-1']])
    expect(update!.payload).not.toHaveProperty('name')
    expect(update!.payload).toHaveProperty('forecast_start_month')
    expect(update!.payload).toHaveProperty('forecast_end_month')
    // The returned object keeps the operator's name too.
    expect(forecast?.name).toBe('FY2026 Forecast (Apr 2026)')
  })

  it('does not write at all when the periods already match', async () => {
    // Run once to learn the periods the service expects for this FY…
    existingRows = [{ id: 'probe', business_id: 'profile-1', fiscal_year: 2026, name: 'Probe', assumptions: {}, is_active: true,
      baseline_start_month: '1999-01', baseline_end_month: '1999-12', actual_start_month: '1999-01', actual_end_month: '1999-12', forecast_start_month: '1999-01', forecast_end_month: '1999-12' }]
    await ForecastService.getOrCreateForecast('biz-1', 'user-1', 2026)
    const periods = recorded.updates[0].payload
    recorded = { updates: [], inserts: [] }
    // …then feed those back: nothing to sync, nothing written.
    existingRows = [{ id: 'f-2', business_id: 'profile-1', fiscal_year: 2026, name: 'Keep me', assumptions: {}, is_active: true, ...periods }]
    const { forecast } = await ForecastService.getOrCreateForecast('biz-1', 'user-1', 2026)
    expect(recorded.updates).toHaveLength(0)
    expect(forecast?.name).toBe('Keep me')
  })

  it('a brand-new forecast gets the default name and is created inactive', async () => {
    existingRows = []
    const { forecast } = await ForecastService.getOrCreateForecast('biz-1', 'user-1', 2027)
    const insert = recorded.inserts.find((i) => i.table === 'financial_forecasts')!
    const row = (insert.rows as Record<string, unknown>[])[0]
    expect(String(row.name)).toMatch(/^FY2027 /)
    expect(row.is_active).toBe(false)
    expect(row.business_id).toBe('profile-1')
    expect(forecast?.id).toBe('new-1')
  })
})
