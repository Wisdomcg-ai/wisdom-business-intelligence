/**
 * A forecast id from outside the trust boundary is a capability.
 *
 * `wages-detail` took one straight from the request body and used it to read
 * `forecast_employees` — employee_name, position, annual_salary, super_rate,
 * pay_per_period, monthly_cost — on the service-role client, which bypasses
 * RLS. `settings` persisted one with no ownership check, which is the same
 * exposure with a longer fuse: generate, full-year and subscription-detail all
 * read whatever it points at.
 */
import { describe, it, expect, vi } from 'vitest'
import { forecastBelongsToBusiness } from '../owned-forecast'

/** Minimal client honouring `.eq()` and `.in()`, which is the whole check. */
function clientWith(rows: Array<{ id: string; business_id: string }>, error: unknown = null) {
  const build = (filters: Array<[string, unknown, 'eq' | 'in']>): any => ({
    select: () => build(filters),
    eq: (col: string, val: unknown) => build([...filters, [col, val, 'eq']]),
    in: (col: string, val: unknown[]) => build([...filters, [col, val, 'in']]),
    maybeSingle: async () => {
      if (error) return { data: null, error }
      const match = rows.find((r) =>
        filters.every(([col, val, op]) =>
          op === 'in' ? Array.isArray(val) && val.includes((r as any)[col]) : (r as any)[col] === val,
        ),
      )
      return { data: match ?? null, error: null }
    },
  })
  return { from: vi.fn(() => build([])) } as any
}

const OURS = { id: 'fc-ours', business_id: 'profile-1' }
const THEIRS = { id: 'fc-theirs', business_id: 'profile-2' }
// resolveBusinessProfileIds returns BOTH id-spaces; forecasts live in the
// profiles one, so the businesses id in this set never matches on its own.
const IDS = ['profile-1', 'biz-1']

describe('forecastBelongsToBusiness', () => {
  it('admits a forecast belonging to this business', async () => {
    expect(await forecastBelongsToBusiness(clientWith([OURS, THEIRS]), 'fc-ours', IDS)).toBe(true)
  })

  it("refuses another tenant's forecast — the IDOR", async () => {
    expect(await forecastBelongsToBusiness(clientWith([OURS, THEIRS]), 'fc-theirs', IDS)).toBe(false)
  })

  it('refuses a forecast that does not exist', async () => {
    expect(await forecastBelongsToBusiness(clientWith([OURS]), 'fc-nope', IDS)).toBe(false)
  })

  it('checks BOTH id-spaces — a profiles-space forecast must still match', async () => {
    // The dual-ID trap: validating against businesses.id alone matches nothing,
    // because all 39 prod forecasts are profiles-space. That would silently
    // reject every legitimate pin.
    expect(await forecastBelongsToBusiness(clientWith([OURS]), 'fc-ours', ['biz-1'])).toBe(false)
    expect(await forecastBelongsToBusiness(clientWith([OURS]), 'fc-ours', IDS)).toBe(true)
  })

  it('fails closed on a query error', async () => {
    expect(await forecastBelongsToBusiness(clientWith([OURS], { message: 'boom' }), 'fc-ours', IDS)).toBe(false)
  })

  it('refuses empty input rather than querying', async () => {
    const client = clientWith([OURS])
    expect(await forecastBelongsToBusiness(client, '', IDS)).toBe(false)
    expect(await forecastBelongsToBusiness(client, 'fc-ours', [])).toBe(false)
    expect(client.from).not.toHaveBeenCalled()
  })
})
