/**
 * FX account split — flag ON, through the real orchestrator.
 *
 * Urban Road's shape: 15 months (Jul-25..Sep-26) each carrying the merged
 * "Foreign Currency Gains and Losses" row at its stored prod amount, run on
 * 14 Sep 2026 (open months Aug-26 and Sep-26). The flag-off side is pinned by
 * sync-orchestrator-fx-flag-off-golden.test.ts; this file pins what the split
 * does, and — the part that matters on a critical sync — that no failure of it
 * ever becomes a failed month, an errored tenant or a lost row.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  installSupabaseStub,
  routeXero,
  urbanRoadBook,
  urbanRoadTb,
  jsonResponse,
  UR_BIZ,
  UR_PROFILE,
  UR_TENANT,
  UR_FX_GROUP_ID,
  UR_FX_MERGED,
  UR_FX_SPLIT,
  UR_CONNECTION,
  SECOND_CONNECTION,
  SECOND_TENANT,
  ACC_SALES,
  ACC_497,
  ACC_498,
  ACC_499,
  type FetchRecord,
  type StubConfig,
  type TenantBook,
} from './helpers/fx-split-harness'

const sentry = vi.hoisted(() => ({
  addBreadcrumb: vi.fn(),
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}))
vi.mock('@sentry/nextjs', () => sentry)

const supabaseMock: any = {}
vi.mock('@/lib/supabase/admin', () => ({
  createServiceRoleClient: () => supabaseMock,
}))

vi.mock('@/lib/xero/token-manager', () => ({
  getValidAccessToken: vi.fn(async () => ({ success: true, accessToken: 'access-token-mock' })),
}))

const FLAG_ON = { sections: { fx_account_split: true, cashflow: true } }
const ALL_MONTHS = Object.keys(UR_FX_MERGED).sort()
const CODED = [ACC_497, ACC_498, ACC_499]

async function run(opts: {
  cfg?: Partial<StubConfig>
  books?: Record<string, TenantBook>
  advanceMs?: number
}) {
  const stub = installSupabaseStub(supabaseMock, {
    connections: [UR_CONNECTION],
    settings: FLAG_ON,
    ...opts.cfg,
  })
  const fetches: FetchRecord[] = []
  vi.spyOn(global, 'fetch').mockImplementation(
    routeXero(opts.books ?? { [UR_TENANT]: urbanRoadBook() }, fetches) as any,
  )
  const { syncBusinessXeroPL } = await import('@/lib/xero/sync-orchestrator')
  const promise = syncBusinessXeroPL(UR_BIZ)
  if (opts.advanceMs) await vi.advanceTimersByTimeAsync(opts.advanceMs)
  const result = await promise

  const plUpserts = stub.events.filter((e) => e.table === 'xero_pl_lines' && e.op === 'upsert')
  const plRows = plUpserts.flatMap((e) => e.payload as any[])
  const accruals = plRows.filter((r) => r.basis === 'accruals')
  const jobUpdates = stub.events.filter((e) => e.table === 'sync_jobs' && e.op === 'update').map((e) => e.payload as any)
  const sweeps = stub.events.filter((e) => e.table === 'xero_pl_lines' && e.op === 'delete')
  const tbFetches = fetches.filter((f) => f.url.includes('/Reports/TrialBalance'))
  const fxSentry = sentry.captureMessage.mock.calls.filter((c: any[]) => c[1]?.tags?.invariant === 'xero_sync_fx_split')
  return { result, stub, fetches, plRows, accruals, jobUpdates, sweeps, tbFetches, fxSentry }
}

/** Stored coded rows as a previous enabled run would have left them. */
function storedSplit(stamp: (month: string) => string, over: Record<string, [number, number, number]> = {}) {
  const rows: Array<Record<string, unknown>> = []
  for (const month of ALL_MONTHS) {
    const split = over[month] ?? UR_FX_SPLIT[month]!
    CODED.forEach((id, i) => {
      rows.push({
        business_id: UR_PROFILE,
        tenant_id: UR_TENANT,
        basis: 'accruals',
        account_id: id,
        period_month: month,
        amount: split[i],
        updated_at: stamp(month),
      })
    })
  }
  return rows
}

const tbMonths = (fetches: FetchRecord[]) =>
  fetches.map((f) => f.url.match(/TrialBalance\?date=(\d{4}-\d{2})/)?.[1]).filter(Boolean)

/** Would any recorded delete remove this row? Evaluates the sweeps' own filters. */
function swept(sweeps: Array<{ filters: Array<[string, string, unknown]> }>, row: Record<string, unknown>): boolean {
  return sweeps.some((s) =>
    s.filters.every(([op, col, val]) => {
      if (op === 'eq') return row[col] === val
      if (op === 'not.in') {
        const ids = String(val).slice(1, -1).split(',').map((x) => x.replace(/^"|"$/g, ''))
        return !ids.includes(String(row[col]))
      }
      return true
    }),
  )
}

/** A previous run's fx_split record: every month kept, as the TB said then. */
function priorAllUnreconciled(checkedAt: (month: string) => string) {
  return {
    enabled: true,
    applied: [],
    reused: [],
    zero: [],
    kept: ALL_MONTHS.map((month) => ({
      month,
      reason: 'unreconciled',
      delta: -UR_FX_SPLIT[month]![0],
      merged: UR_FX_MERGED[month],
      checked_at: checkedAt(month),
    })),
    residuals: [],
    tb_requests: 15,
  }
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(new Date('2026-09-14T02:00:00Z'))
  vi.resetModules()
  sentry.addBreadcrumb.mockClear()
  sentry.captureException.mockClear()
  sentry.captureMessage.mockClear()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('FX account split — first enabled run (nothing stored)', () => {
  it('fetches 15 Trial Balances and persists the three coded rows in place of the merged row, every month', async () => {
    const r = await run({})
    expect(r.result.status).toBe('success')

    // 34-request shape + 15 TB, each fetched right after its month's P&L.
    expect(r.tbFetches).toHaveLength(15)
    expect(r.result.xero_request_count).toBe(49)
    expect(r.tbFetches.every((f) => f.tenant === UR_TENANT)).toBe(true)
    expect(r.tbFetches.every((f) => /date=\d{4}-\d{2}-\d{2}&paymentsOnly=false$/.test(f.url))).toBe(true)
    const urls = r.fetches.map((f) => f.url)
    const julPl = urls.findIndex((u) => u.includes('ProfitAndLoss?fromDate=2026-07-01&toDate=2026-07-31'))
    expect(urls[julPl + 1]).toContain('TrialBalance?date=2026-07-31')

    // No merged row persisted anywhere; three coded rows per month.
    expect(r.accruals.some((x) => x.account_id === UR_FX_GROUP_ID)).toBe(false)
    for (const month of ALL_MONTHS) {
      const coded = r.accruals.filter((x) => x.period_month === month && CODED.includes(x.account_id))
      expect(coded.map((x) => x.account_code)).toEqual(['497', '498', '499'])
      expect(coded.map((x) => x.amount)).toEqual(UR_FX_SPLIT[month])
    }
    const aug = r.accruals.filter((x) => x.period_month === '2026-08-01' && CODED.includes(x.account_id))
    expect(aug).toEqual([
      expect.objectContaining({ account_id: ACC_497, account_code: '497', account_name: 'Bank Revaluations', account_type: 'opex', amount: 96.72, basis: 'accruals', source: 'xero' }),
      expect.objectContaining({ account_id: ACC_498, account_code: '498', account_name: 'Unrealised Currency Gains', account_type: 'opex', amount: 484.27 }),
      expect.objectContaining({ account_id: ACC_499, account_code: '499', account_name: 'Realised Currency Gains', account_type: 'opex', amount: 338.26 }),
    ])

    // The sweep keeps only today's ids per month — the merged row goes.
    const augSweep = r.sweeps.find((s) => s.filters.some(([op, col, v]) => op === 'eq' && col === 'period_month' && v === '2026-08-01'))!
    const notIn = String(augSweep.filters.find(([op]) => op === 'not.in')![2])
    expect(notIn).not.toContain(UR_FX_GROUP_ID)
    for (const id of CODED) expect(notIn).toContain(id)

    // The reconciler ran on the UNSPLIT rows: zero discrepancies, zero absorber.
    const job = r.jobUpdates[0]
    expect(job.status).toBe('success')
    expect(job.reconciliation.pl.discrepant_accounts).toEqual([])
    expect(job.reconciliation.pl.absorber_adjustments).toBe(0)
    expect(job.reconciliation.pl.months_failed).toEqual([])
    expect(job.xero_request_count).toBe(49)

    expect(job.reconciliation.pl.fx_split).toEqual({
      enabled: true,
      // Window order: the current FY first, then the prior FY.
      applied: [...ALL_MONTHS.slice(12), ...ALL_MONTHS.slice(0, 12)],
      reused: [],
      zero: [],
      kept: [],
      // Urban Road Mar-26: 368.44 across the accounts, 368.43 merged.
      residuals: [{ month: '2026-03-01', residual: 0.01 }],
      tb_requests: 15,
    })
    expect(r.fxSentry).toHaveLength(0)

    // Totals unchanged: per month, coded rows sum to the merged row within $0.05.
    for (const month of ALL_MONTHS) {
      const sum = r.accruals.filter((x) => x.period_month === month && CODED.includes(x.account_id)).reduce((s, x) => s + x.amount, 0)
      expect(Math.abs(sum - UR_FX_MERGED[month]!)).toBeLessThanOrEqual(0.05)
    }
  })

  it('reads the stored split once, scoped to the business, tenant, accruals and the three system GUIDs', async () => {
    const r = await run({})
    const reads = r.stub.events.filter((e) => e.table === 'xero_pl_lines' && e.op === 'select')
    expect(reads).toHaveLength(1)
    expect(reads[0]!.filters).toEqual([
      ['eq', 'business_id', UR_PROFILE],
      ['eq', 'tenant_id', UR_TENANT],
      ['eq', 'basis', 'accruals'],
      ['in', 'account_id', CODED],
    ])
  })

  it('cash rows are never split', async () => {
    const r = await run({ cfg: { settings: { sections: { fx_account_split: true, cash_basis: true } } } })
    const cash = r.plRows.filter((x) => x.basis === 'cash')
    expect(cash.filter((x) => x.account_id === UR_FX_GROUP_ID)).toHaveLength(15)
    expect(cash.some((x) => CODED.includes(x.account_id))).toBe(false)
    expect(r.tbFetches).toHaveLength(15)
  })

  it('cash_basis on too: the accruals merged row a flag-off sync left is swept — FX is never counted twice', async () => {
    // The sweep's id list per month was the UNION of accruals and cash ids with
    // no basis filter. The cash twin is never split, so it still carries the
    // merged id — which then protected the stale ACCRUALS merged row sitting
    // beside the new coded rows: FX expense doubled on every accruals reader,
    // and every later run repeated it.
    const r = await run({ cfg: { settings: { sections: { fx_account_split: true, cash_basis: true } } } })
    const at = (basis: string, account_id: string) => ({
      business_id: UR_PROFILE, tenant_id: UR_TENANT, period_month: '2026-08-01', basis, account_id,
    })
    const before = [
      at('accruals', UR_FX_GROUP_ID), // left by the flag-off syncs
      at('cash', UR_FX_GROUP_ID),
      at('accruals', ACC_SALES),
      at('cash', ACC_SALES),
      ...CODED.map((id) => at('accruals', id)),
    ]
    const survivors = before.filter((row) => !swept(r.sweeps, row)).map((x) => `${x.basis}:${x.account_id}`)
    expect(survivors.sort()).toEqual(
      ['cash:' + UR_FX_GROUP_ID, 'accruals:' + ACC_SALES, 'cash:' + ACC_SALES, ...CODED.map((id) => 'accruals:' + id)].sort(),
    )
    // The accruals-scoped sweep runs only in months whose accruals ids differ
    // from the union — here every month (the cash twin carries the merged id).
    const basisSweeps = r.sweeps.filter((x) => x.filters.some(([op, col]) => op === 'eq' && col === 'basis'))
    expect(basisSweeps).toHaveLength(15)
    expect(basisSweeps.every((x) => x.filters.some(([op, col, v]) => op === 'eq' && col === 'basis' && v === 'accruals'))).toBe(true)
  })

  it('without cash_basis the sweep is exactly the per-month union sweep — no basis-scoped deletes', async () => {
    const r = await run({})
    expect(r.sweeps).toHaveLength(15)
    expect(r.sweeps.some((x) => x.filters.some(([, col]) => col === 'basis'))).toBe(false)
  })
})

describe('FX account split — steady state (closed months reused)', () => {
  it('second run: only the 2 open months + 1 rotation month fetch; the rest re-emit their stored updated_at', async () => {
    // Every month last read 13 Sep; Jan-26 is the oldest, read 1 Sep.
    const stamp = (m: string) => (m === '2026-01-01' ? '2026-09-01T04:00:00+00:00' : '2026-09-13T22:00:00+00:00')
    const r = await run({ cfg: { storedPlRows: storedSplit(stamp) } })
    expect(r.result.status).toBe('success')
    expect(tbMonths(r.fetches).sort()).toEqual(['2026-01', '2026-08', '2026-09'])
    expect(r.result.xero_request_count).toBe(37)

    const fx = r.jobUpdates[0].reconciliation.pl.fx_split
    expect(fx.applied.sort()).toEqual(['2026-01-01', '2026-08-01', '2026-09-01'])
    expect(fx.reused).toHaveLength(12)
    expect(fx.kept).toEqual([])
    expect(fx.tb_requests).toBe(3)

    // Reused rows keep their stored stamp; fetched rows are stamped now.
    const jul = r.accruals.filter((x) => x.period_month === '2026-07-01' && CODED.includes(x.account_id))
    expect(jul.map((x) => x.updated_at)).toEqual(Array(3).fill('2026-09-13T22:00:00+00:00'))
    expect(jul.map((x) => x.amount)).toEqual([76.93, -124.09, 285.77])
    const aug = r.accruals.filter((x) => x.period_month === '2026-08-01' && CODED.includes(x.account_id))
    expect(aug.every((x) => String(x.updated_at).startsWith('2026-09-14'))).toBe(true)
    const jan = r.accruals.filter((x) => x.period_month === '2026-01-01' && CODED.includes(x.account_id))
    expect(jan.every((x) => String(x.updated_at).startsWith('2026-09-14'))).toBe(true)
    expect(r.accruals.some((x) => x.account_id === UR_FX_GROUP_ID)).toBe(false)
  })

  it('a restated closed month (Mar-26 Unrealised 252 → 292.02) no longer ties and is re-fetched', async () => {
    const stamp = (m: string) => (m === '2025-07-01' ? '2026-09-01T00:00:00+00:00' : '2026-09-13T22:00:00+00:00')
    // What Calxa's 7 Apr pack showed: Unrealised 252, Realised 200-ish, Bank Revaluations (123.21).
    const r = await run({ cfg: { storedPlRows: storedSplit(stamp, { '2026-03-01': [-123.21, 252, 199.63] }) } })
    expect(tbMonths(r.fetches).sort()).toEqual(['2025-07', '2026-03', '2026-08', '2026-09'])
    const mar = r.accruals.filter((x) => x.period_month === '2026-03-01' && CODED.includes(x.account_id))
    expect(mar.map((x) => x.amount)).toEqual([-123.21, 292.02, 199.63])
  })

  it('a stored split with a missing account (sweep-era partial) fails the tie and is re-fetched', async () => {
    const stored = storedSplit(() => '2026-09-13T22:00:00+00:00').filter(
      (x) => !(x.period_month === '2025-10-01' && x.account_id === ACC_497),
    )
    const r = await run({ cfg: { storedPlRows: stored } })
    expect(tbMonths(r.fetches)).toContain('2025-10')
  })

  it('stored-split read fails → every month fetches, the failure is recorded, nothing else changes', async () => {
    const r = await run({ cfg: { plSelectError: { message: 'boom', code: '57014' } } })
    expect(r.result.status).toBe('success')
    expect(r.tbFetches).toHaveLength(15)
    expect(r.jobUpdates[0].reconciliation.pl.fx_split.stored_read_error).toBe('boom')
    expect(r.accruals.some((x) => x.account_id === UR_FX_GROUP_ID)).toBe(false)
  })
})

describe('FX account split — every failure degrades to the merged row', () => {
  it('Bank Revaluations absent from the TB → every month keeps its merged row (unreconciled), ONE Sentry warning', async () => {
    const book = urbanRoadBook({ tb: (m) => urbanRoadTb(m, { omit497: true }) })
    const r = await run({ books: { [UR_TENANT]: book } })
    expect(r.result.status).toBe('success')
    expect(r.accruals.filter((x) => x.account_id === UR_FX_GROUP_ID)).toHaveLength(15)
    expect(r.accruals.some((x) => CODED.includes(x.account_id))).toBe(false)
    const fx = r.jobUpdates[0].reconciliation.pl.fx_split
    expect(fx.applied).toEqual([])
    expect(fx.kept).toHaveLength(15)
    expect(fx.kept.find((k: any) => k.month === '2026-07-01')).toEqual({ month: '2026-07-01', reason: 'unreconciled', delta: -76.93, merged: 238.61, checked_at: '2026-09-14T02:00:00.000Z' })
    expect(fx.kept.find((k: any) => k.month === '2026-08-01')).toEqual({ month: '2026-08-01', reason: 'unreconciled', delta: -96.72, merged: 919.25, checked_at: '2026-09-14T02:00:00.000Z' })
    expect(r.tbFetches).toHaveLength(15)
    // The sweep keeps the merged id — a previous run's coded rows would go.
    const augSweep = r.sweeps.find((s) => s.filters.some(([op, col, v]) => op === 'eq' && col === 'period_month' && v === '2026-08-01'))!
    expect(String(augSweep.filters.find(([op]) => op === 'not.in')![2])).toContain(UR_FX_GROUP_ID)
    expect(r.fxSentry).toHaveLength(1)
    expect(r.fxSentry[0]![1]).toMatchObject({
      level: 'warning',
      tags: { invariant: 'xero_sync_fx_split', business_id: UR_PROFILE, tenant_id: UR_TENANT },
    })
    expect(r.jobUpdates[0].status).toBe('success')
  })

  it('Bank Revaluations absent, NEXT run: closed months the TB already failed at the same merged amount are not re-read; no new Sentry event', async () => {
    // Before: every 6-hourly run re-fetched all 15 Trial Balances (nothing is
    // stored to reuse when a month keeps its merged row) and raised a Sentry
    // warning — +60 Xero calls and 4 events a day for as long as the condition
    // lasted. Now: 2 open months + ONE rotation month (the one checked longest
    // ago) per run, and a warning only for a month/reason not already recorded.
    const checkedAt = (m: string) => (m === '2026-01-01' ? '2026-09-01T04:00:00.000Z' : '2026-09-13T22:00:00.000Z')
    const book = urbanRoadBook({ tb: (m) => urbanRoadTb(m, { omit497: true }) })
    const r = await run({ books: { [UR_TENANT]: book }, cfg: { priorFxSplit: priorAllUnreconciled(checkedAt) } })
    expect(r.result.status).toBe('success')
    expect(tbMonths(r.fetches).sort()).toEqual(['2026-01', '2026-08', '2026-09'])
    const fx = r.jobUpdates[0].reconciliation.pl.fx_split
    expect(fx.kept).toHaveLength(15)
    expect(fx.tb_requests).toBe(3)
    // Carried forward with the stamp of the Trial Balance that actually said so.
    expect(fx.kept.find((k: any) => k.month === '2026-07-01')).toEqual({
      month: '2026-07-01', reason: 'unreconciled', delta: -76.93, merged: 238.61, checked_at: '2026-09-13T22:00:00.000Z',
    })
    expect(fx.kept.find((k: any) => k.month === '2026-01-01').checked_at).toBe('2026-09-14T02:00:00.000Z')
    expect(r.accruals.filter((x) => x.account_id === UR_FX_GROUP_ID)).toHaveLength(15)
    expect(r.fxSentry).toHaveLength(0)
    // The read is one row, scoped to this business + tenant's finished P&L syncs.
    const read = r.stub.events.find((e) => e.table === 'sync_jobs' && e.op === 'select')!
    expect(read.filters).toEqual([
      ['eq', 'business_id', UR_PROFILE],
      ['eq', 'tenant_id', UR_TENANT],
      ['eq', 'job_type', 'xero_pl_sync'],
      ['in', 'status', ['success', 'partial']],
      ['order', 'started_at', { ascending: false }],
      ['limit', 'n', 1],
    ])
  })

  it('a closed month whose merged amount moved since the TB failed is re-read (a restatement is never skipped)', async () => {
    const book = urbanRoadBook({ tb: (m) => urbanRoadTb(m, { omit497: true }) })
    const prior = priorAllUnreconciled(() => '2026-09-13T22:00:00.000Z')
    prior.kept = prior.kept.map((k) => (k.month === '2026-03-01' ? { ...k, merged: 328.43 } : k))
    const r = await run({ books: { [UR_TENANT]: book }, cfg: { priorFxSplit: prior } })
    expect(tbMonths(r.fetches)).toContain('2026-03')
  })

  it('a new kept month still raises ONE warning; the previous-run read failing degrades to fetch-everything', async () => {
    const book = urbanRoadBook({ tb: (m) => urbanRoadTb(m, { omit497: true }) })
    const r = await run({ books: { [UR_TENANT]: book }, cfg: { syncJobsSelectError: { message: 'timeout', code: '57014' } } })
    expect(r.result.status).toBe('success')
    expect(r.tbFetches).toHaveLength(15)
    expect(r.jobUpdates[0].reconciliation.pl.fx_split.prior_read_error).toBe('timeout')
    expect(r.fxSentry).toHaveLength(1)

    const prior = priorAllUnreconciled(() => '2026-09-13T22:00:00.000Z')
    prior.kept = prior.kept.filter((k) => k.month !== '2026-09-01') // Sep-26 kept for the first time
    sentry.captureMessage.mockClear()
    const r2 = await run({ books: { [UR_TENANT]: book }, cfg: { priorFxSplit: prior } })
    expect(r2.fxSentry).toHaveLength(1)
  })

  it('(e) TB 500 → merged rows kept, months_failed empty, tenant success, one retry then the rest skip, ONE Sentry warning', async () => {
    const book = urbanRoadBook({ tb: () => jsonResponse({ error: 'svc' }, 500) })
    const r = await run({ books: { [UR_TENANT]: book }, advanceMs: 30_000 })
    expect(r.result.status).toBe('success')
    const job = r.jobUpdates[0]
    expect(job.status).toBe('success')
    expect(job.reconciliation.pl.months_failed).toEqual([])
    // Two attempts on the first month (maxRetries 2), then no more TB calls.
    expect(r.tbFetches).toHaveLength(2)
    expect(tbMonths(r.fetches)).toEqual(['2026-07', '2026-07'])
    expect(r.accruals.filter((x) => x.account_id === UR_FX_GROUP_ID)).toHaveLength(15)
    const fx = job.reconciliation.pl.fx_split
    expect(fx.kept[0]).toMatchObject({ month: '2026-07-01', reason: 'fetch_failed' })
    expect(fx.kept.slice(1).every((k: any) => k.reason === 'fetch_skipped')).toBe(true)
    expect(fx.kept).toHaveLength(15)
    expect(fx.tb_requests).toBe(0)
    expect(r.fxSentry).toHaveLength(1)
    // The 34-request P&L/BS shape is intact.
    expect(r.result.xero_request_count).toBe(34)
  })

  it('TB failing with stored splits that still tie → every such month re-emits its stored split, closed, rotation and open alike', async () => {
    // Before: the rotation month (Jul-25) and the open months kept the merged
    // row on a passing 503, so the sweep deleted a stored split that still tied
    // and the next run brought it back — a month's grouping flipped between
    // syncs, and a pack generated in that window printed different subtotals.
    // Aug-26 is the month Matt's September pack reports, and it is OPEN.
    const stamp = (m: string) => (m === '2025-07-01' ? '2026-09-01T00:00:00+00:00' : '2026-09-13T22:00:00+00:00')
    const book = urbanRoadBook({ tb: () => jsonResponse({ error: 'svc' }, 503) })
    const r = await run({ books: { [UR_TENANT]: book }, cfg: { storedPlRows: storedSplit(stamp) }, advanceMs: 30_000 })
    const job = r.jobUpdates[0]
    expect(job.status).toBe('success')
    const fx = job.reconciliation.pl.fx_split
    expect(fx.reused.sort()).toEqual(ALL_MONTHS)
    expect(fx.kept).toEqual([])
    // Current FY first: Aug-26 is the failed fetch, Sep-26 skipped after it;
    // prior FY: Jul-25 is the rotation month, skipped.
    expect(fx.reused_after_fetch_failure.map((k: any) => [k.month, k.reason])).toEqual([
      ['2026-08-01', 'fetch_failed'],
      ['2026-09-01', 'fetch_skipped'],
      ['2025-07-01', 'fetch_skipped'],
    ])
    expect(fx.reused_after_fetch_failure[0].error).toBeTruthy()
    // No merged row anywhere; every month's coded rows keep their stored stamp.
    expect(r.accruals.some((x) => x.account_id === UR_FX_GROUP_ID)).toBe(false)
    for (const month of ALL_MONTHS) {
      const coded = r.accruals.filter((x) => x.period_month === month && CODED.includes(x.account_id))
      expect(coded.map((x) => x.amount)).toEqual(UR_FX_SPLIT[month])
      expect(coded.every((x) => x.updated_at === stamp(month))).toBe(true)
    }
    // A failed fetch is still news: ONE warning.
    expect(r.fxSentry).toHaveLength(1)
  })

  it('TB failing where the stored split no longer ties → the merged row stays (a stale breakdown is never re-emitted)', async () => {
    const stamp = () => '2026-09-13T22:00:00+00:00'
    const book = urbanRoadBook({ tb: () => jsonResponse({ error: 'svc' }, 503) })
    const r = await run({
      books: { [UR_TENANT]: book },
      cfg: { storedPlRows: storedSplit(stamp, { '2026-08-01': [96.72, 400, 338.26] }) },
      advanceMs: 30_000,
    })
    const fx = r.jobUpdates[0].reconciliation.pl.fx_split
    expect(fx.kept).toEqual([expect.objectContaining({ month: '2026-08-01', reason: 'fetch_failed' })])
    const aug = r.accruals.filter((x) => x.period_month === '2026-08-01')
    expect(aug.some((x) => x.account_id === UR_FX_GROUP_ID)).toBe(true)
    expect(aug.some((x) => CODED.includes(x.account_id))).toBe(false)
  })

  it('(f) TB 429 daily → tenant paused, exactly like any other Xero call', async () => {
    const book = urbanRoadBook({ tb: () => jsonResponse({}, 429, { 'X-Rate-Limit-Problem': 'daily' }) })
    const r = await run({ books: { [UR_TENANT]: book } })
    expect(r.jobUpdates[0].status).toBe('paused')
    expect(r.jobUpdates[0].reconciliation.reason).toBe('rate_limit_daily')
  })

  it('(h) the splitter throwing keeps that month merged — no tenant error, other months split', async () => {
    vi.doMock('@/lib/xero/fx-group-split', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@/lib/xero/fx-group-split')>()
      return {
        ...actual,
        splitFxGroupMonth: (input: Parameters<typeof actual.splitFxGroupMonth>[0]) => {
          const month = input.plRows[0]?.period_month
          if (month === '2026-08-01' && input.tbMovements.length > 0) throw new Error('splitter defect')
          return actual.splitFxGroupMonth(input)
        },
      }
    })
    const r = await run({})
    vi.doUnmock('@/lib/xero/fx-group-split')
    expect(r.result.status).toBe('success')
    expect(r.jobUpdates[0].status).toBe('success')
    const aug = r.accruals.filter((x) => x.period_month === '2026-08-01')
    expect(aug.some((x) => x.account_id === UR_FX_GROUP_ID)).toBe(true)
    expect(aug.some((x) => CODED.includes(x.account_id))).toBe(false)
    const fx = r.jobUpdates[0].reconciliation.pl.fx_split
    expect(fx.kept).toEqual([{ month: '2026-08-01', reason: 'error', error: 'splitter defect' }])
    expect(fx.applied).toHaveLength(14)
    // The request that preceded the throw is counted.
    expect(fx.tb_requests).toBe(15)
    expect(r.result.xero_request_count).toBe(49)
  })

  it('a malformed Trial Balance (three columns) keeps the merged row, reason error', async () => {
    const threeCol = { Reports: [{ Rows: [{ RowType: 'Header', Cells: [{ Value: '' }, { Value: 'Debit' }, { Value: 'Credit' }] }] }] }
    const book = urbanRoadBook({ tb: () => jsonResponse(threeCol) })
    const r = await run({ books: { [UR_TENANT]: book } })
    expect(r.jobUpdates[0].status).toBe('success')
    const fx = r.jobUpdates[0].reconciliation.pl.fx_split
    expect(fx.kept).toHaveLength(15)
    expect(fx.kept.every((k: any) => k.reason === 'error')).toBe(true)
    expect(r.accruals.filter((x) => x.account_id === UR_FX_GROUP_ID)).toHaveLength(15)
  })

  it('a revenue-side merged row is kept without spending a Trial Balance request', async () => {
    const base = urbanRoadBook()
    const book = urbanRoadBook({
      monthRows: (m) => base.monthRows(m).map((x) => (x.id === 'FXGROUPID' ? { ...x, section: 'Other Income' } : x)),
    })
    const r = await run({ books: { [UR_TENANT]: book } })
    expect(r.tbFetches).toHaveLength(0)
    expect(r.jobUpdates[0].reconciliation.pl.fx_split.kept.every((k: any) => k.reason === 'section')).toBe(true)
  })

  it('a catalog with no FX system accounts spends no Trial Balance request', async () => {
    const base = urbanRoadBook()
    const book = urbanRoadBook({ catalog: base.catalog.map(({ systemAccount: _s, ...a }) => a) })
    const r = await run({ books: { [UR_TENANT]: book } })
    expect(r.tbFetches).toHaveLength(0)
    expect(r.stub.events.some((e) => e.table === 'xero_pl_lines' && e.op === 'select')).toBe(false)
    expect(r.jobUpdates[0].reconciliation.pl.fx_split.kept.every((k: any) => k.reason === 'no_system_accounts')).toBe(true)
    expect(r.accruals.filter((x) => x.account_id === UR_FX_GROUP_ID)).toHaveLength(15)
  })

  it('a merged row of exactly 0.00 emits nothing for that month and fetches nothing', async () => {
    const base = urbanRoadBook()
    const book = urbanRoadBook({
      monthRows: (m) => base.monthRows(m).map((x) => (x.id === 'FXGROUPID' && m === '2026-02-01' ? { ...x, amount: 0 } : x)),
    })
    const r = await run({ books: { [UR_TENANT]: book } })
    expect(tbMonths(r.fetches)).not.toContain('2026-02')
    expect(r.tbFetches).toHaveLength(14)
    const feb = r.accruals.filter((x) => x.period_month === '2026-02-01')
    expect(feb.some((x) => x.account_id === UR_FX_GROUP_ID || CODED.includes(x.account_id))).toBe(false)
    expect(r.jobUpdates[0].reconciliation.pl.fx_split.zero).toEqual(['2026-02-01'])
  })
})

describe('FX account split — refusals', () => {
  it('(g) two active connections → skipped_reason multi_org, zero TB calls, merged rows on both', async () => {
    const second: TenantBook = {
      catalog: [{ id: ACC_SALES, code: '200', name: 'Sales', type: 'REVENUE' }],
      monthRows: () => [{ name: 'Sales', id: ACC_SALES, amount: 250, section: 'Income' }],
    }
    const r = await run({
      cfg: { connections: [UR_CONNECTION, SECOND_CONNECTION] },
      books: { [UR_TENANT]: urbanRoadBook(), [SECOND_TENANT]: second },
    })
    expect(r.tbFetches).toHaveLength(0)
    expect(r.accruals.filter((x) => x.account_id === UR_FX_GROUP_ID)).toHaveLength(15)
    expect(r.jobUpdates).toHaveLength(2)
    for (const j of r.jobUpdates) {
      expect(j.status).toBe('success')
      expect(j.reconciliation.pl.fx_split).toEqual({
        enabled: true,
        skipped_reason: 'multi_org',
        applied: [],
        reused: [],
        zero: [],
        kept: [],
        residuals: [],
        tb_requests: 0,
      })
    }
    expect(sentry.addBreadcrumb.mock.calls.some((c: any[]) => String(c[0]?.message).includes('fx_account_split refused'))).toBe(true)
    expect(r.stub.events.some((e) => e.table === 'xero_pl_lines' && e.op === 'select')).toBe(false)
  })

  it('XERO_FX_SPLIT_DISABLE=true overrides the flag: no TB, no record, merged rows', async () => {
    vi.stubEnv('XERO_FX_SPLIT_DISABLE', 'true')
    const r = await run({})
    expect(r.tbFetches).toHaveLength(0)
    expect(r.jobUpdates[0].reconciliation.pl.fx_split).toBeUndefined()
    expect(r.accruals.filter((x) => x.account_id === UR_FX_GROUP_ID)).toHaveLength(15)
  })
})
