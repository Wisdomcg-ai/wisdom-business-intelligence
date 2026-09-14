/**
 * Which cashflow the monthly-report page builds. The first cut called
 * /api/monthly-report/cash-model for EVERY client and read any failure as a
 * refusal — so a 500 from that route (a resolver error, auth) replaced the v1
 * cashflow pages of all eighteen clients with a reason card, although none of
 * them had turned v2 on.
 */
import { describe, it, expect, vi } from 'vitest'
import { resolvePageCashModel } from '../cash-model-page-gate'

describe('resolvePageCashModel', () => {
  it('a business whose settings carry no cash_model never calls the route and prints v1', async () => {
    const fetchRoute = vi.fn(async () => { throw new Error('network down') })
    for (const cashModel of [undefined, null, { enabled: false }]) {
      expect(await resolvePageCashModel(cashModel, fetchRoute)).toEqual({ status: 'off' })
    }
    expect(fetchRoute).not.toHaveBeenCalled()
  })

  it('a business that turned v2 on is refused when the lookup fails — never v1 in its place', async () => {
    const fetchRoute = vi.fn(async () => { throw new Error('500') })
    const r = await resolvePageCashModel({ enabled: true }, fetchRoute)
    expect(r.status).toBe('refused')
    expect(fetchRoute).toHaveBeenCalledTimes(1)
  })

  it('an enabled but unreadable setting still goes to the route, which says why', async () => {
    const fetchRoute = vi.fn(async () => ({ status: 'refused' as const, reason: 'The cash model settings could not be read (x).' }))
    expect(await resolvePageCashModel({ enabled: true, dso_dayz: 1 }, fetchRoute)).toEqual({ status: 'refused', reason: 'The cash model settings could not be read (x).' })
  })

  it('on: the route\'s answer is the answer', async () => {
    const ready = { status: 'ready', config: {}, inputs: {} } as never
    expect(await resolvePageCashModel({ enabled: true }, async () => ready)).toBe(ready)
  })
})
