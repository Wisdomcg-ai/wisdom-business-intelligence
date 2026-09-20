/**
 * GET /api/cron/sync-fx-rates — exchange rates arrive on their own (IICT-03).
 *
 * Driven through the exported handler against an in-memory fx_rates table that
 * behaves like prod's (unique on currency_pair+rate_type+period, updated_at
 * bumped by trigger on every write) and an OXR stub serving the July/August
 * 2026 fixture. The store is seeded in the shape prod had before a coach
 * clicked on 15 Sep 2026: OXR rates Sep 2025–Mar 2026, April entered by hand,
 * May synced on the 25th (a partial month), and nothing for Jun–Aug.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { makeOxrFetchStub } from '@/lib/consolidation/__fixtures__/oxr-fetch-stub'

const captureMessage = vi.fn()
const captureException = vi.fn()
vi.mock('@sentry/nextjs', () => ({
  captureMessage: (...a: unknown[]) => captureMessage(...a),
  captureException: (...a: unknown[]) => captureException(...a),
}))

const heartbeats: Array<Record<string, any>> = []
vi.mock('@/lib/cron/heartbeat', () => ({
  recordHeartbeat: async (opts: Record<string, any>) => {
    heartbeats.push({ ...opts, fetchesBefore: fetchLog.length })
  },
}))

let fakeDb: FakeDb
vi.mock('@/lib/supabase/admin', () => ({
  createServiceRoleClient: () => fakeDb,
}))

let fetchLog: string[] = []

// ─── in-memory tables ────────────────────────────────────────────────────────

interface FxRow {
  id: string
  currency_pair: string
  rate_type: 'monthly_average' | 'closing_spot'
  period: string
  rate: number
  source: string
  created_at: string
  updated_at: string
}

type Filter = (row: Record<string, any>) => boolean

class FakeDb {
  fx: FxRow[] = []
  connections: Array<Record<string, any>> = []
  fxReads = 0
  failUpsert: string | null = null
  private seq = 0

  constructor(private readonly clock: () => string) {}

  from(table: string) {
    const db = this
    const filters: Filter[] = []
    let op: 'select' | 'upsert' | 'delete' = 'select'
    let payload: any[] = []
    const builder: any = {
      select: () => builder,
      eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), builder),
      gte: (c: string, v: string) => (filters.push((r) => r[c] >= v), builder),
      in: (c: string, vs: unknown[]) => (filters.push((r) => vs.includes(r[c])), builder),
      upsert: (rows: any[], options: { onConflict: string }) => {
        expect(options).toEqual({ onConflict: 'currency_pair,rate_type,period' })
        op = 'upsert'
        payload = rows
        return builder
      },
      delete: () => ((op = 'delete'), builder),
      then: (resolve: any, reject: any) => Promise.resolve(run()).then(resolve, reject),
    }
    function run() {
      if (table === 'xero_connections') {
        return { data: db.connections.filter((r) => filters.every((f) => f(r))), error: null }
      }
      if (table !== 'fx_rates') throw new Error(`unexpected table ${table}`)
      if (op === 'select') {
        db.fxReads++
        return { data: db.fx.filter((r) => filters.every((f) => f(r))).map((r) => ({ ...r })), error: null }
      }
      if (op === 'upsert') {
        if (db.failUpsert) return { data: null, error: { message: db.failUpsert } }
        const now = db.clock()
        const written = payload.map((p) => {
          const hit = db.fx.find(
            (r) => r.currency_pair === p.currency_pair && r.rate_type === p.rate_type && r.period === p.period,
          )
          if (hit) {
            Object.assign(hit, p, { updated_at: now }) // fx_rates_updated_at trigger
            return { ...hit }
          }
          const row = { id: `new-${++db.seq}`, created_at: now, updated_at: now, ...p }
          db.fx.push(row)
          return { ...row }
        })
        return { data: written, error: null }
      }
      const doomed = db.fx.filter((r) => filters.every((f) => f(r)))
      db.fx = db.fx.filter((r) => !doomed.includes(r))
      return { data: null, error: null }
    }
    return builder
  }
}

function fx(pair: string, rate_type: FxRow['rate_type'], period: string, rate: number, source: string, at: string): FxRow {
  return { id: `${rate_type}-${period}`, currency_pair: pair, rate_type, period, rate, source, created_at: at, updated_at: at }
}

/** Prod's HKD/AUD rows before anyone clicked on 15 Sep 2026. */
function seedProdBeforeSep15(db: FakeDb) {
  const at = '2026-04-21T20:31:59Z'
  const settled: Array<[string, string, number, number]> = [
    ['2025-09-01', '2025-09-30', 0.194847, 0.194371],
    ['2025-10-01', '2025-10-31', 0.196717, 0.196599],
    ['2025-11-01', '2025-11-30', 0.197559, 0.196037],
    ['2025-12-01', '2025-12-31', 0.193303, 0.192604],
    ['2026-01-01', '2026-01-31', 0.189239, 0.183968],
    ['2026-02-01', '2026-02-28', 0.181317, 0.179631],
    ['2026-03-01', '2026-03-31', 0.182284, 0.184348],
  ]
  for (const [avgP, closeP, avg, close] of settled) {
    db.fx.push(fx('HKD/AUD', 'monthly_average', avgP, avg, 'oxr', at))
    db.fx.push(fx('HKD/AUD', 'closing_spot', closeP, close, 'oxr', at))
  }
  db.fx.push(fx('HKD/AUD', 'monthly_average', '2026-04-01', 0.1925, 'manual', '2026-04-20T20:31:43Z'))
  db.fx.push(fx('HKD/AUD', 'closing_spot', '2026-04-30', 0.1925, 'manual', '2026-04-20T20:31:43Z'))
  db.fx.push(fx('HKD/AUD', 'monthly_average', '2026-05-01', 0.17759, 'oxr', '2026-05-25T20:14:44Z'))
  db.fx.push(fx('HKD/AUD', 'closing_spot', '2026-05-25', 0.177869, 'oxr', '2026-05-25T20:14:44Z'))
}

const IICT_CONNECTIONS = [
  { business_id: 'iict', tenant_id: 'aust', functional_currency: 'AUD', is_active: true, include_in_consolidation: true },
  { business_id: 'iict', tenant_id: 'pty', functional_currency: 'AUD', is_active: true, include_in_consolidation: true },
  { business_id: 'iict', tenant_id: 'hk', functional_currency: 'HKD', is_active: true, include_in_consolidation: true },
  { business_id: 'dragon', tenant_id: 'roof', functional_currency: 'AUD', is_active: true, include_in_consolidation: true },
]

const find = (db: FakeDb, rate_type: string, period: string) =>
  db.fx.find((r) => r.currency_pair === 'HKD/AUD' && r.rate_type === rate_type && r.period === period)

// ─── harness ─────────────────────────────────────────────────────────────────

const ORIGINAL = { secret: process.env.CRON_SECRET, appId: process.env.OPENEXCHANGERATES_APP_ID }

function setNow(iso: string) {
  vi.setSystemTime(new Date(iso))
}

function useOxr(options: Parameters<typeof makeOxrFetchStub>[0] = {}) {
  const stub = makeOxrFetchStub(options)
  fetchLog = stub.requestedDates
  vi.stubGlobal('fetch', stub.fetchImpl)
  return stub
}

function request(headers: Record<string, string> = { authorization: 'Bearer test-cron-secret' }) {
  return new Request('http://localhost/api/cron/sync-fx-rates', { method: 'GET', headers }) as any
}

async function runCron(headers?: Record<string, string>) {
  const { GET } = await import('@/app/api/cron/sync-fx-rates/route')
  const res = await GET(request(headers))
  return { res, body: await res.json() }
}

beforeEach(() => {
  vi.resetModules()
  vi.useFakeTimers({ toFake: ['Date'] })
  setNow('2026-09-01T02:15:00Z')
  process.env.CRON_SECRET = 'test-cron-secret'
  process.env.OPENEXCHANGERATES_APP_ID = 'test-app-id'
  fakeDb = new FakeDb(() => new Date().toISOString())
  fakeDb.connections = IICT_CONNECTIONS.map((c) => ({ ...c }))
  heartbeats.length = 0
  fetchLog = []
  captureMessage.mockReset()
  captureException.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  if (ORIGINAL.secret === undefined) delete process.env.CRON_SECRET
  else process.env.CRON_SECRET = ORIGINAL.secret
  if (ORIGINAL.appId === undefined) delete process.env.OPENEXCHANGERATES_APP_ID
  else process.env.OPENEXCHANGERATES_APP_ID = ORIGINAL.appId
})

// ─── tests ───────────────────────────────────────────────────────────────────

describe('cron/sync-fx-rates — auth gate', () => {
  it.each([
    ['no Authorization header', {}],
    ['a wrong bearer', { authorization: 'Bearer nope' }],
  ])('401s with %s, before any heartbeat, read or OXR call', async (_label, headers) => {
    useOxr()
    const { res } = await runCron(headers)
    expect(res.status).toBe(401)
    expect(heartbeats).toHaveLength(0)
    expect(fakeDb.fxReads).toBe(0)
    expect(fetchLog).toHaveLength(0)
  })

  it('fails closed when CRON_SECRET is unset, even for "Bearer undefined"', async () => {
    delete process.env.CRON_SECRET
    useOxr()
    const { res } = await runCron({ authorization: 'Bearer undefined' })
    expect(res.status).toBe(401)
    expect(heartbeats).toHaveLength(0)
  })
})

describe('cron/sync-fx-rates — nobody clicking', () => {
  it('stores HKD/AUD August 2026 at average 0.179536 and 31 Aug closing 0.177902 (and July, June) on the 1 Sep run', async () => {
    seedProdBeforeSep15(fakeDb)
    useOxr({ fallbackRate: 0.182 })

    const { res, body } = await runCron()
    expect(res.status).toBe(200)

    const augAvg = find(fakeDb, 'monthly_average', '2026-08-01')!
    const augClose = find(fakeDb, 'closing_spot', '2026-08-31')!
    expect(augAvg.source).toBe('oxr')
    expect(augAvg.rate).toBeCloseTo(0.179536, 6)
    expect(augClose.source).toBe('oxr')
    expect(augClose.rate).toBeCloseTo(0.177902, 6)

    expect(find(fakeDb, 'monthly_average', '2026-07-01')!.rate).toBeCloseTo(0.183092, 6)
    expect(find(fakeDb, 'closing_spot', '2026-07-31')!.rate).toBeCloseTo(0.181785, 6)
    expect(find(fakeDb, 'monthly_average', '2026-06-01')!.rate).toBeCloseTo(0.182, 6)
    expect(find(fakeDb, 'closing_spot', '2026-06-30')).toBeDefined()

    expect(body.success).toBe(true)
    expect(body.pairs).toEqual(['HKD/AUD'])
    expect(body.synced.map((s: any) => s.month)).toEqual(['2026-08', '2026-07', '2026-06', '2026-05'])
    expect(body.skipped).toBeUndefined()
    expect(body.errors).toBeUndefined()
    expect(captureMessage).not.toHaveBeenCalled()
    expect(captureException).not.toHaveBeenCalled()
  })

  it('re-derives the partial May from the whole month, closes it on 31 May and retires the 25 May row', async () => {
    seedProdBeforeSep15(fakeDb)
    useOxr({ fallbackRate: 0.1781 })

    const { body } = await runCron()

    const mayAvg = find(fakeDb, 'monthly_average', '2026-05-01')!
    expect(mayAvg.rate).toBeCloseTo(0.1781, 6)
    expect(fetchLog.filter((d) => d.startsWith('2026-05-'))).toHaveLength(31)
    expect(find(fakeDb, 'closing_spot', '2026-05-31')!.rate).toBeCloseTo(0.1781, 6)
    expect(find(fakeDb, 'closing_spot', '2026-05-25')).toBeUndefined()
    expect(body.retired).toEqual([{ currency_pair: 'HKD/AUD', rate_type: 'closing_spot', period: '2026-05-25' }])
    // Only one closing rate per month is left for readers keyed on the month.
    expect(fakeDb.fx.filter((r) => r.rate_type === 'closing_spot' && r.period.startsWith('2026-05'))).toHaveLength(1)
  })

  it('never overwrites the manual April rates and never re-fetches settled months', async () => {
    seedProdBeforeSep15(fakeDb)
    useOxr({ fallbackRate: 0.182 })
    const before = fakeDb.fx.filter((r) => r.period < '2026-05-01').map((r) => ({ ...r }))

    const { body } = await runCron()

    expect(fakeDb.fx.filter((r) => r.period < '2026-05-01')).toEqual(before)
    expect(find(fakeDb, 'monthly_average', '2026-04-01')).toMatchObject({ rate: 0.1925, source: 'manual' })
    expect(fetchLog.filter((d) => d < '2026-05-01')).toEqual([])
    expect(body.kept_manual).toEqual([
      { currency_pair: 'HKD/AUD', month: '2026-04', rate_types: ['monthly_average', 'closing_spot'] },
    ])
  })

  it('stamps a start-marker heartbeat before the first OXR call and a success heartbeat after', async () => {
    seedProdBeforeSep15(fakeDb)
    useOxr({ fallbackRate: 0.182 })

    await runCron()

    expect(heartbeats).toHaveLength(2)
    expect(heartbeats[0]).toMatchObject({
      cronPath: '/api/cron/sync-fx-rates',
      status: 'partial',
      errorMessage: 'run started — not yet completed',
      fetchesBefore: 0,
    })
    expect(heartbeats[1]).toMatchObject({ cronPath: '/api/cron/sync-fx-rates', status: 'success' })
    expect(heartbeats[1].metadata).toMatchObject({ pairs: 1, months_synced: 4, rows_retired: 1, skipped: 0, errors: 0 })
  })

  it('a second run the next day finds every month settled and calls OXR zero times', async () => {
    seedProdBeforeSep15(fakeDb)
    useOxr({ fallbackRate: 0.182 })
    await runCron()

    setNow('2026-09-02T02:15:00Z')
    vi.resetModules()
    const second = useOxr({ fallbackRate: 0.182 })
    heartbeats.length = 0
    const { body } = await runCron()

    expect(second.requestedDates).toEqual([])
    expect(body.synced).toEqual([])
    expect(body.retired).toEqual([])
    expect(heartbeats.at(-1)!.status).toBe('success')
  })

  it('refuses the partial current month: a 16 Sep run never fetches or stores September', async () => {
    seedProdBeforeSep15(fakeDb)
    setNow('2026-09-16T02:15:00Z')
    useOxr({ fallbackRate: 0.182 })

    await runCron()

    expect(fetchLog.some((d) => d.startsWith('2026-09-'))).toBe(false)
    expect(fakeDb.fx.some((r) => r.period.startsWith('2026-09-'))).toBe(false)
    expect(find(fakeDb, 'closing_spot', '2026-08-31')!.rate).toBeCloseTo(0.177902, 6)
  })
})

describe('cron/sync-fx-rates — failures are loud and aggregated', () => {
  it('refuses August when OXR has a day missing, keeps July, and raises ONE Sentry event', async () => {
    seedProdBeforeSep15(fakeDb)
    useOxr({ fallbackRate: 0.182, missingDates: ['2026-08-14'] })

    const { body } = await runCron()

    expect(find(fakeDb, 'monthly_average', '2026-08-01')).toBeUndefined()
    expect(find(fakeDb, 'closing_spot', '2026-08-31')).toBeUndefined()
    expect(find(fakeDb, 'closing_spot', '2026-07-31')!.rate).toBeCloseTo(0.181785, 6)
    expect(body.errors).toEqual([
      expect.objectContaining({ currency_pair: 'HKD/AUD', month: '2026-08', error: expect.stringMatching(/2026-08-14/) }),
    ])
    expect(captureMessage).toHaveBeenCalledTimes(1)
    expect(captureMessage.mock.calls[0][1]).toMatchObject({ tags: { cron: 'sync-fx-rates', invariant: 'fx_rates_monthly_sync' } })
    expect(heartbeats.at(-1)!.status).toBe('partial')
  })

  it('caps a backfill at 6 months per run, newest first, and names the rest as skipped', async () => {
    useOxr({ fallbackRate: 0.18 })

    const { body } = await runCron()

    expect(body.synced.map((s: any) => s.month)).toEqual(['2026-08', '2026-07', '2026-06', '2026-05', '2026-04', '2026-03'])
    expect(body.skipped).toEqual(
      ['2026-02', '2026-01', '2025-12', '2025-11', '2025-10', '2025-09'].map((month) => ({
        currency_pair: 'HKD/AUD',
        month,
        reason: 'run_cap',
      })),
    )
    expect(fetchLog.some((d) => d < '2026-03-01')).toBe(false)
    expect(captureMessage).toHaveBeenCalledTimes(1)
    expect(heartbeats.at(-1)!.status).toBe('partial')
  })

  it('stops calling OXR after a 429 and skips the remaining months', async () => {
    seedProdBeforeSep15(fakeDb)
    useOxr({ failWithStatus: 429 })

    const { body } = await runCron()

    expect(body.synced).toEqual([])
    expect(body.errors).toHaveLength(1)
    expect(body.skipped.map((s: any) => [s.month, s.reason])).toEqual([
      ['2026-07', 'oxr_unavailable'],
      ['2026-06', 'oxr_unavailable'],
      ['2026-05', 'oxr_unavailable'],
    ])
    expect(fetchLog.every((d) => d.startsWith('2026-08-'))).toBe(true)
    expect(captureMessage).toHaveBeenCalledTimes(1)
    expect(heartbeats.at(-1)!.status).toBe('failed')
  })

  it('does not retire the mid-month row when the month-end write fails', async () => {
    seedProdBeforeSep15(fakeDb)
    fakeDb.failUpsert = 'permission denied'
    useOxr({ fallbackRate: 0.182 })

    const { body } = await runCron()

    expect(find(fakeDb, 'closing_spot', '2026-05-25')).toBeDefined()
    expect(body.retired).toEqual([])
    expect(body.errors.length).toBeGreaterThan(0)
    expect(captureMessage).toHaveBeenCalledTimes(1)
  })

  it('fails the run (500, failed heartbeat, one Sentry event) when OPENEXCHANGERATES_APP_ID is missing', async () => {
    delete process.env.OPENEXCHANGERATES_APP_ID
    seedProdBeforeSep15(fakeDb)
    useOxr()

    const { res } = await runCron()

    expect(res.status).toBe(500)
    expect(fetchLog).toHaveLength(0)
    expect(heartbeats.at(-1)!.status).toBe('failed')
    expect(captureMessage.mock.calls.length + captureException.mock.calls.length).toBe(1)
  })

  it('does nothing — and says so — when no active consolidation has a foreign currency', async () => {
    fakeDb.connections = IICT_CONNECTIONS.filter((c) => c.functional_currency === 'AUD')
    useOxr()

    const { res, body } = await runCron()

    expect(res.status).toBe(200)
    expect(body.pairs).toEqual([])
    expect(fakeDb.fxReads).toBe(0)
    expect(fetchLog).toHaveLength(0)
    expect(captureMessage).not.toHaveBeenCalled()
    expect(heartbeats.at(-1)!.status).toBe('success')
  })
})
