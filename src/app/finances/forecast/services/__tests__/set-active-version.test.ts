/**
 * One rule for "make this version active", shared by the Forecast Builder
 * selector and the Versions tab.
 */
import { describe, it, expect, vi } from 'vitest'

const resolveMock = vi.fn()
vi.mock('@/lib/business/resolveBusinessProfileIds', () => ({ resolveBusinessProfileId: (...a: unknown[]) => resolveMock(...a) }))

import { setActiveForecastVersion } from '../set-active-version'

function makeSupabase(opts: { deactivateError?: unknown; activateError?: unknown } = {}) {
  const updates: Array<{ payload: Record<string, unknown>; filters: unknown[] }> = []
  const from = vi.fn(() => ({
    update: (payload: Record<string, unknown>) => {
      const filters: unknown[] = []
      const b: Record<string, unknown> = {}
      b.eq = vi.fn((col: string, val: unknown) => { filters.push([col, val]); return b })
      ;(b as { then?: unknown }).then = (res: (v: unknown) => void, rej: (e: unknown) => void) => {
        updates.push({ payload, filters })
        const error = payload.is_active === false ? opts.deactivateError ?? null : opts.activateError ?? null
        return Promise.resolve({ data: null, error }).then(res, rej)
      }
      return b
    },
  }))
  return { client: { from } as never, updates }
}

describe('setActiveForecastVersion', () => {
  it('deactivates every version of that business + FY by PROFILE id, then activates the chosen one by id', async () => {
    resolveMock.mockResolvedValue('profile-1')
    const { client, updates } = makeSupabase()
    const { error } = await setActiveForecastVersion(client, { businessId: 'biz-1', fiscalYear: 2026, forecastId: 'f-2' })
    expect(error).toBeNull()
    expect(resolveMock).toHaveBeenCalledWith(client, 'biz-1')
    expect(updates).toHaveLength(2)
    expect(updates[0]).toEqual({ payload: { is_active: false }, filters: [['business_id', 'profile-1'], ['fiscal_year', 2026]] })
    expect(updates[1]).toEqual({ payload: { is_active: true }, filters: [['id', 'f-2']] })
  })

  it('fails closed when the profile id cannot be resolved (no writes)', async () => {
    resolveMock.mockResolvedValue(null)
    const { client, updates } = makeSupabase()
    const { error } = await setActiveForecastVersion(client, { businessId: 'biz-1', fiscalYear: 2026, forecastId: 'f-2' })
    expect(error?.message).toMatch(/business profile/)
    expect(updates).toHaveLength(0)
  })

  it('surfaces a failed activate as an error', async () => {
    resolveMock.mockResolvedValue('profile-1')
    const { client } = makeSupabase({ activateError: { message: 'duplicate key' } })
    const { error } = await setActiveForecastVersion(client, { businessId: 'biz-1', fiscalYear: 2026, forecastId: 'f-2' })
    expect(error?.message).toBe('duplicate key')
  })
})
