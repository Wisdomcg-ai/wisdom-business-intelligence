/**
 * POST /api/consolidation/fx-rates/sync-oxr — the coach's "Sync from OXR"
 * button, pinned through the exported handler.
 *
 * The monthly FX cron shares this route's row-building and upsert. These tests
 * pin what the button does TODAY so that sharing cannot change it: the same
 * two rows, the same upsert conflict key, the same response body — including
 * the behaviour the cron deliberately refuses (a mid-month click still stores
 * a partial month, closing on today's date).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { makeOxrFetchStub } from '@/lib/consolidation/__fixtures__/oxr-fetch-stub'

const captureException = vi.fn()
const captureMessage = vi.fn()
vi.mock('@sentry/nextjs', () => ({
  captureException: (...a: unknown[]) => captureException(...a),
  captureMessage: (...a: unknown[]) => captureMessage(...a),
}))

vi.mock('@/lib/supabase/keys', () => ({ getSupabaseSecretKey: () => 'test-secret-key' }))

const upsertCalls: Array<{ rows: any[]; options: any }> = []
let upsertError: { message: string } | null = null
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table: string) => {
      if (table !== 'fx_rates') throw new Error(`unexpected table ${table}`)
      return {
        upsert: (rows: any[], options: any) => {
          upsertCalls.push({ rows, options })
          return {
            select: async () =>
              upsertError
                ? { data: null, error: upsertError }
                : { data: rows.map((r, i) => ({ id: `row-${i}`, ...r })), error: null },
          }
        },
      }
    },
  }),
}))

let role: string | null = 'coach'
vi.mock('@/lib/supabase/server', () => ({
  createRouteHandlerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'coach-1' } }, error: null }) },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: role ? { role } : null }) }) }),
    }),
  }),
}))

const ORIGINAL_APP_ID = process.env.OPENEXCHANGERATES_APP_ID

function post(body: unknown) {
  return new Request('http://localhost/api/consolidation/fx-rates/sync-oxr', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as any
}

beforeEach(() => {
  vi.resetModules()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-16T02:15:00Z'))
  process.env.OPENEXCHANGERATES_APP_ID = 'test-app-id'
  upsertCalls.length = 0
  upsertError = null
  role = 'coach'
  captureException.mockReset()
  captureMessage.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  if (ORIGINAL_APP_ID === undefined) delete process.env.OPENEXCHANGERATES_APP_ID
  else process.env.OPENEXCHANGERATES_APP_ID = ORIGINAL_APP_ID
})

describe('POST /api/consolidation/fx-rates/sync-oxr', () => {
  it('stores the August 2026 average and 31 Aug closing as two oxr rows', async () => {
    const oxr = makeOxrFetchStub()
    vi.stubGlobal('fetch', oxr.fetchImpl)
    const { POST } = await import('@/app/api/consolidation/fx-rates/sync-oxr/route')

    const res = await POST(post({ currency_pair: 'HKD/AUD', year: 2026, month: 8 }))
    expect(res.status).toBe(200)

    expect(upsertCalls).toHaveLength(1)
    expect(upsertCalls[0].options).toEqual({ onConflict: 'currency_pair,rate_type,period' })
    const [avg, close] = upsertCalls[0].rows
    expect(Object.keys(avg).sort()).toEqual(['currency_pair', 'period', 'rate', 'rate_type', 'source'])
    expect(avg).toMatchObject({ currency_pair: 'HKD/AUD', rate_type: 'monthly_average', period: '2026-08-01', source: 'oxr' })
    expect(avg.rate).toBeCloseTo(0.179536, 6)
    expect(close).toMatchObject({ currency_pair: 'HKD/AUD', rate_type: 'closing_spot', period: '2026-08-31', source: 'oxr' })
    expect(close.rate).toBeCloseTo(0.177902, 6)

    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.rates).toHaveLength(2)
    expect(body.rates[0]).toMatchObject({ id: 'row-0', period: '2026-08-01' })
    expect(body.diagnostics).toEqual({
      days_fetched: 31,
      days_missing: [],
      monthly_average: avg.rate,
      closing_spot: close.rate,
      closing_spot_date: '2026-08-31',
    })
    expect(oxr.requestedDates).toHaveLength(31)
  })

  it('still stores a partial month when a coach clicks mid-month (the cron refuses this; the button is unchanged)', async () => {
    const oxr = makeOxrFetchStub({ fallbackRate: 0.1775 })
    vi.stubGlobal('fetch', oxr.fetchImpl)
    const { POST } = await import('@/app/api/consolidation/fx-rates/sync-oxr/route')

    const res = await POST(post({ currency_pair: 'HKD/AUD', year: 2026, month: 9 }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.diagnostics.days_fetched).toBe(16)
    expect(body.diagnostics.closing_spot_date).toBe('2026-09-16')
    expect(upsertCalls[0].rows.map((r: any) => r.period)).toEqual(['2026-09-01', '2026-09-16'])
  })

  it('refuses a non-coach with 403 and writes nothing', async () => {
    role = 'client'
    vi.stubGlobal('fetch', makeOxrFetchStub().fetchImpl)
    const { POST } = await import('@/app/api/consolidation/fx-rates/sync-oxr/route')
    const res = await POST(post({ currency_pair: 'HKD/AUD', year: 2026, month: 8 }))
    expect(res.status).toBe(403)
    expect(upsertCalls).toHaveLength(0)
  })

  it('400s on a malformed currency pair', async () => {
    const { POST } = await import('@/app/api/consolidation/fx-rates/sync-oxr/route')
    const res = await POST(post({ currency_pair: 'HKDAUD', year: 2026, month: 8 }))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'currency_pair must match "XXX/YYY"' })
  })

  it('500s with "Failed to save rates" when the upsert fails', async () => {
    upsertError = { message: 'boom' }
    vi.stubGlobal('fetch', makeOxrFetchStub().fetchImpl)
    const { POST } = await import('@/app/api/consolidation/fx-rates/sync-oxr/route')
    const res = await POST(post({ currency_pair: 'HKD/AUD', year: 2026, month: 8 }))
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'Failed to save rates', detail: 'boom' })
    expect(captureException).toHaveBeenCalledTimes(1)
  })
})
