/**
 * D1 (22 Sep 2026 system diagnostic) — a failed settings load wiped the real
 * settings on the next save.
 *
 * loadSettings returned DEFAULT_SETTINGS whenever the request failed, which is
 * indistinguishable from a business that has never saved any. Both writers —
 * the settings panel and the PDF layout editor — post the WHOLE key set back,
 * and the route fills every absent key with a default. So one failed GET
 * followed by a coach dragging a page in the layout editor cleared the pinned
 * budget forecast, the subscription account codes, the wages account names and
 * every section toggle.
 *
 * A business with no settings row is NOT this case: the API answers with
 * defaults and is_default: true, which is a real answer.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { loadSettings } from '../monthly-report-service'

const BUSINESS = 'biz-1'
const STORED = {
  business_id: BUSINESS,
  sections: { profit_loss: true, balance_sheet: false },
  budget_forecast_id: 'fc-pinned',
  subscription_account_codes: ['6100', '6110'],
  wages_account_names: ['Employ - Wages & Salaries'],
  show_ytd: false,
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const answer = (body: unknown, ok = true, status = 200) =>
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok, status, json: async () => body }))

describe('loadSettings tells a failure from an answer', () => {
  it('returns the stored settings', async () => {
    answer({ settings: STORED, is_default: false })
    expect(await loadSettings(BUSINESS)).toEqual(STORED)
  })

  it('a business with no row gets the defaults the API sends — that is an answer', async () => {
    const defaults = { business_id: BUSINESS, sections: {}, budget_forecast_id: null }
    answer({ settings: defaults, is_default: true })
    expect(await loadSettings(BUSINESS)).toEqual(defaults)
  })

  it.each([500, 403, 404])('a %d is null, never defaults', async (status) => {
    answer({ error: 'nope' }, false, status)
    expect(await loadSettings(BUSINESS)).toBeNull()
  })

  it('a request that throws is null', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    expect(await loadSettings(BUSINESS)).toBeNull()
  })

  it('a 200 carrying no settings is null', async () => {
    answer({})
    expect(await loadSettings(BUSINESS)).toBeNull()
  })

  it('never invents a pinned budget, subscription codes or wages names', async () => {
    answer({ error: 'boom' }, false, 500)
    const result = await loadSettings(BUSINESS)
    // The wipe chain starts here: anything object-shaped would be posted back
    // by the next save and stored over the real settings.
    expect(result).toBeNull()
  })
})
