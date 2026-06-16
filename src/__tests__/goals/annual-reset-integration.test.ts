/**
 * Phase 73 Plan 06 — cross-unit integration test.
 *
 * Wires the THREE real units together against ONE shared in-memory Supabase so the
 * whole flow is exercised end-to-end (not stubbed):
 *   detectAnnualResetState  (entry detection)
 *   annualResetSnapshotService.captureAnnualResetSnapshot / restoreAnnualResetSnapshot
 *   annualResetService.executeAnnualReset
 *
 * Locks the phase's two non-negotiables in CI:
 *   1. Every reset is reversible from its snapshot (snapshot→roll→restore round-trip).
 *   2. Snapshot-before-overwrite is a hard gate — a failed snapshot rolls back to ZERO writes.
 *   3. Clients already on the new FY (Armstrong/Fit2Shine, year1_end 2027-06-29) are never reset.
 *   4. Rollover math holds at the FY AND CY boundaries.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// ---------------------------------------------------------------------------
// A single shared in-memory Supabase, hoisted so the vi.mock factory can use it.
// It backs business_financial_goals, business_kpis, strategic_initiatives and
// plan_snapshots, so a capture-then-restore actually round-trips on one store.
// ---------------------------------------------------------------------------
const db = vi.hoisted(() => {
  const store: Record<string, Record<string, unknown>[]> = {}
  let idCounter = 0
  const cfg = { failSnapshotInsert: false }
  const clone = <T>(v: T): T => (v == null ? v : JSON.parse(JSON.stringify(v)))
  const nextId = () => `gen-${++idCounter}`

  function table(name: string) {
    return (store[name] = store[name] || [])
  }

  function makeBuilder(name: string) {
    const st: {
      op: 'select' | 'insert' | 'update'
      filters: { col: string; val: unknown; kind: 'eq' | 'in' }[]
      payload: Record<string, unknown> | null
      insertRows: Record<string, unknown>[] | null
      orderCol: string | null
      orderAsc: boolean
      limitN: number | null
      forcedError: { message: string } | null
    } = {
      op: 'select',
      filters: [],
      payload: null,
      insertRows: null,
      orderCol: null,
      orderAsc: true,
      limitN: null,
      forcedError: null,
    }

    const matches = (r: Record<string, unknown>) =>
      st.filters.every((f) =>
        f.kind === 'eq'
          ? String(r[f.col]) === String(f.val)
          : (f.val as unknown[]).map(String).includes(String(r[f.col])),
      )

    const run = (): { data: Record<string, unknown>[] | null; error: { message: string } | null } => {
      if (st.forcedError) return { data: null, error: st.forcedError }
      if (st.op === 'insert') {
        const inserted = (st.insertRows || []).map((r) => ({ id: r.id ?? nextId(), ...r }))
        table(name).push(...inserted.map(clone))
        return { data: clone(inserted), error: null }
      }
      if (st.op === 'update') {
        const hit = table(name).filter(matches)
        hit.forEach((r) => Object.assign(r, clone(st.payload)))
        return { data: clone(hit), error: null }
      }
      let res = table(name).filter(matches)
      if (st.orderCol) {
        const col = st.orderCol
        res = [...res].sort((a, b) => {
          const x = a[col] as number, y = b[col] as number
          return (x > y ? 1 : x < y ? -1 : 0) * (st.orderAsc ? 1 : -1)
        })
      }
      if (st.limitN != null) res = res.slice(0, st.limitN)
      return { data: clone(res), error: null }
    }

    const first = () => {
      const { data, error } = run()
      return { data: data && data.length ? data[0] : null, error }
    }

    const builder: Record<string, unknown> = {
      select: () => builder,
      insert: (rows: Record<string, unknown> | Record<string, unknown>[]) => {
        st.op = 'insert'
        st.insertRows = Array.isArray(rows) ? rows : [rows]
        if (name === 'plan_snapshots' && cfg.failSnapshotInsert) {
          st.forcedError = { message: 'forced snapshot insert failure' }
        }
        return builder
      },
      update: (payload: Record<string, unknown>) => {
        st.op = 'update'
        st.payload = payload
        return builder
      },
      eq: (col: string, val: unknown) => {
        st.filters.push({ col, val, kind: 'eq' })
        return builder
      },
      in: (col: string, val: unknown[]) => {
        st.filters.push({ col, val, kind: 'in' })
        return builder
      },
      order: (col: string, opts?: { ascending?: boolean }) => {
        st.orderCol = col
        st.orderAsc = opts?.ascending ?? true
        return builder
      },
      limit: (n: number) => {
        st.limitN = n
        return builder
      },
      maybeSingle: async () => first(),
      single: async () => first(),
      // Thenable: chains awaited without maybeSingle/single (kpis read, update .eq, …).
      then: (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
        Promise.resolve(run()).then(onF, onR),
    }
    return builder
  }

  return {
    store,
    cfg,
    clone,
    makeClient: () => ({ from: (name: string) => makeBuilder(name) }),
    reset: () => {
      for (const k of Object.keys(store)) delete store[k]
      store.business_financial_goals = []
      store.business_kpis = []
      store.strategic_initiatives = []
      store.plan_snapshots = []
      idCounter = 0
      cfg.failSnapshotInsert = false
    },
  }
})

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => db.makeClient(),
}))

// Real units (snapshot service is NOT mocked — this is the integration point).
import { annualResetService } from '@/app/goals/services/annual-reset-service'
import { annualResetSnapshotService } from '@/app/goals/services/annual-reset-snapshot-service'
import { detectAnnualResetState } from '@/app/quarterly-review/utils/annual-reset-entry'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const BUSINESS_ID = 'profile-fy26'
const USER_ID = 'user-1'

const FY26_GOALS = () => ({
  id: 'goals-fy26',
  business_id: BUSINESS_ID,
  year_type: 'FY',
  plan_start_date: '2025-07-01',
  year1_end_date: '2026-06-30',
  plan_end_date: '2028-06-30',
  quarterly_targets: { revenue: { q1: '10', q2: '20', q3: '30', q4: '40' } },
  revenue_current: 800_000,
  revenue_year1: 1_000_000,
  revenue_year2: 1_300_000,
  revenue_year3: 1_700_000,
})

const CY_GOALS = () => ({
  id: 'goals-cy',
  business_id: BUSINESS_ID,
  year_type: 'CY',
  plan_start_date: '2025-01-01',
  year1_end_date: '2026-12-31',
  plan_end_date: '2027-12-31',
  quarterly_targets: {},
  revenue_current: 500_000,
  revenue_year1: 600_000,
  revenue_year2: 700_000,
  revenue_year3: 800_000,
})

const goalsRow = () => db.store.business_financial_goals.find((r) => r.business_id === BUSINESS_ID)!

beforeEach(() => db.reset())

// ---------------------------------------------------------------------------
// 1. Full round-trip: snapshot → roll → restore (reversibility)
// ---------------------------------------------------------------------------
describe('round-trip: snapshot → rollover → restore (FY26)', () => {
  beforeEach(() => {
    db.store.business_financial_goals.push(FY26_GOALS())
    db.store.strategic_initiatives.push(
      { id: 'i1', business_id: BUSINESS_ID, status: 'in_progress', selected: true, title: 'A' },
      { id: 'i2', business_id: BUSINESS_ID, status: 'not_started', selected: true, title: 'B' },
      { id: 'i3', business_id: BUSINESS_ID, status: 'completed', selected: true, title: 'done' },
    )
  })

  it('captures a restorable snapshot of the PRE-reset plan before any overwrite', async () => {
    const res = await annualResetService.executeAnnualReset({
      businessId: BUSINESS_ID,
      userId: USER_ID,
      yearStartMonth: 7,
    })
    expect(res.success).toBe(true)
    expect(res.newFY).toBe(2027)

    const snap = db.store.plan_snapshots.find((s) => s.business_id === BUSINESS_ID)!
    expect(snap).toBeDefined()
    expect(snap.label).toBe('annual_reset_FY2026')
    expect(snap.snapshot_type).toBe('quarterly_review_pre_sync')
    // The snapshot holds the ORIGINAL ladder (captured before the roll).
    const snapGoals = (snap.plan_data as { goals: Record<string, number> }).goals
    expect(snapGoals.revenue_year1).toBe(1_000_000)
    expect(snapGoals.year1_end_date as unknown).toBe('2026-06-30')
  })

  it('rolls the ladder + dates (D3) and clears quarterly_targets', async () => {
    await annualResetService.executeAnnualReset({ businessId: BUSINESS_ID, userId: USER_ID, yearStartMonth: 7 })
    const g = goalsRow()
    expect(g.revenue_current).toBe(1_000_000) // prior year1
    expect(g.revenue_year1).toBe(1_300_000) // prior year2
    expect(g.revenue_year2).toBe(1_700_000) // prior year3
    expect(g.revenue_year3).toBe(1_700_000) // extrapolated
    expect(g.plan_start_date).toBe('2026-07-01')
    expect(g.year1_end_date).toBe('2027-06-30')
    expect(g.plan_end_date).toBe('2029-06-30')
    expect(g.quarterly_targets).toEqual({})
    expect(g.is_extended_period).toBe(false)
    expect(g.year1_months).toBe(12)
  })

  it('carries forward only incomplete initiatives (selected=false, fiscal_year=newFY)', async () => {
    const res = await annualResetService.executeAnnualReset({ businessId: BUSINESS_ID, userId: USER_ID, yearStartMonth: 7 })
    expect(res.carriedForwardCount).toBe(2) // i1 + i2; i3 (completed) untouched
    const i1 = db.store.strategic_initiatives.find((r) => r.id === 'i1')!
    expect(i1.status).toBe('not_started')
    expect(i1.selected).toBe(false)
    expect(i1.fiscal_year).toBe(2027)
    const i3 = db.store.strategic_initiatives.find((r) => r.id === 'i3')!
    expect(i3.status).toBe('completed') // completed row never touched
    expect(i3.selected).toBe(true)
  })

  it('restoreAnnualResetSnapshot returns the goals ladder to its exact pre-reset state', async () => {
    const res = await annualResetService.executeAnnualReset({ businessId: BUSINESS_ID, userId: USER_ID, yearStartMonth: 7 })
    // sanity: rolled
    expect(goalsRow().revenue_year1).toBe(1_300_000)

    const restore = await annualResetSnapshotService.restoreAnnualResetSnapshot({
      businessId: BUSINESS_ID,
      snapshotId: res.snapshotId!,
    })
    expect(restore.success).toBe(true)

    const g = goalsRow()
    expect(g.revenue_current).toBe(800_000)
    expect(g.revenue_year1).toBe(1_000_000)
    expect(g.revenue_year2).toBe(1_300_000)
    expect(g.revenue_year3).toBe(1_700_000)
    expect(g.year1_end_date).toBe('2026-06-30')
    expect(g.plan_start_date).toBe('2025-07-01')
    expect(g.quarterly_targets).toEqual({ revenue: { q1: '10', q2: '20', q3: '30', q4: '40' } })
  })
})

// ---------------------------------------------------------------------------
// 2. Snapshot-before-overwrite gate: failed snapshot ⇒ ZERO writes
// ---------------------------------------------------------------------------
describe('snapshot gate: a failed snapshot rolls back to zero writes', () => {
  beforeEach(() => {
    db.store.business_financial_goals.push(FY26_GOALS())
    db.store.strategic_initiatives.push({ id: 'i1', business_id: BUSINESS_ID, status: 'in_progress', selected: true })
  })

  it('aborts with success:false and leaves the goals row byte-for-byte unchanged', async () => {
    db.cfg.failSnapshotInsert = true
    const before = db.clone(goalsRow())

    const res = await annualResetService.executeAnnualReset({ businessId: BUSINESS_ID, userId: USER_ID, yearStartMonth: 7 })

    expect(res.success).toBe(false)
    expect(res.error).toContain('Snapshot')
    expect(goalsRow()).toEqual(before) // no partial roll
    expect(db.store.plan_snapshots).toHaveLength(0) // no snapshot persisted
    // initiative untouched
    expect(db.store.strategic_initiatives.find((r) => r.id === 'i1')!.status).toBe('in_progress')
  })
})

// ---------------------------------------------------------------------------
// 3. Entry-detection matrix incl. the already-planned no-op
// ---------------------------------------------------------------------------
describe('entry detection — all three states', () => {
  const PLANNING_Q1_FY27 = new Date('2026-07-01')

  it("FY26 finished-year client → 'needs-reset'", () => {
    expect(
      detectAnnualResetState({ planningQuarterStart: PLANNING_Q1_FY27, year1EndDate: new Date('2026-06-30') }),
    ).toBe('needs-reset')
  })

  it("Armstrong/Fit2Shine (year1_end 2027-06-29) → 'normal-review' (never reset)", () => {
    expect(
      detectAnnualResetState({ planningQuarterStart: PLANNING_Q1_FY27, year1EndDate: new Date('2027-06-29') }),
    ).toBe('normal-review')
  })

  it("no plan dates → 'initial-setup'", () => {
    expect(detectAnnualResetState({ planningQuarterStart: PLANNING_Q1_FY27, year1EndDate: null })).toBe('initial-setup')
  })

  it('already-planned client is NOT rolled (gate mirrors the /goals hook: only roll when needs-reset)', async () => {
    // Seed an already-planned client and run the SAME decision the hook makes.
    db.store.business_financial_goals.push({ ...FY26_GOALS(), year1_end_date: '2027-06-29' })
    const before = db.clone(goalsRow())

    const state = detectAnnualResetState({
      planningQuarterStart: PLANNING_Q1_FY27,
      year1EndDate: new Date('2027-06-29'),
    })
    if (state === 'needs-reset') {
      await annualResetService.executeAnnualReset({ businessId: BUSINESS_ID, userId: USER_ID, yearStartMonth: 7 })
    }

    expect(state).toBe('normal-review')
    expect(goalsRow()).toEqual(before) // untouched
    expect(db.store.plan_snapshots).toHaveLength(0) // no snapshot taken
  })
})

// ---------------------------------------------------------------------------
// 4. CY boundary
// ---------------------------------------------------------------------------
describe('rollover at the CY boundary', () => {
  beforeEach(() => db.store.business_financial_goals.push(CY_GOALS()))

  it('rolls a CY client to 2027-01-01 / 2027-12-31 / 2029-12-31', async () => {
    const res = await annualResetService.executeAnnualReset({ businessId: BUSINESS_ID, userId: USER_ID, yearStartMonth: 1 })
    expect(res.success).toBe(true)
    const g = goalsRow()
    expect(g.plan_start_date).toBe('2027-01-01')
    expect(g.year1_end_date).toBe('2027-12-31')
    expect(g.plan_end_date).toBe('2029-12-31')
    expect(g.year_type).toBe('CY')
    expect(g.revenue_year1).toBe(700_000) // prior year2
  })
})

// ---------------------------------------------------------------------------
// 5. Option B — financial actuals seeding (the wired seedFinancialActuals path)
//
// Without a fetch stub the relative-URL fetch throws in jsdom and the seed
// silently no-ops (which is why the D3 assertions above hold). These tests stub
// global fetch to exercise the usable-actuals branch end-to-end: the override
// must land in the persisted *_current values, margins must be DERIVED from the
// seeded dollars, and year1/year2/year3 must stay on the D3 shift.
// ---------------------------------------------------------------------------
describe('Option B: financial actuals seeding (wired path)', () => {
  beforeEach(() => db.store.business_financial_goals.push(FY26_GOALS()))
  afterEach(() => vi.unstubAllGlobals())

  const stubFetch = (payload: unknown, ok = true) =>
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok, json: async () => payload })),
    )

  it('usable actuals → seeds financial *_current and DERIVES margins; year1/2/3 keep D3', async () => {
    stubFetch({
      usable: true,
      months_covered: 12,
      actuals: { revenue: 1_110_000, gross_profit: 444_000, net_profit: 111_000 },
    })

    const res = await annualResetService.executeAnnualReset({ businessId: BUSINESS_ID, userId: USER_ID, yearStartMonth: 7 })
    expect(res.success).toBe(true)

    const g = goalsRow()
    // current = the seeded FY26 ACTUAL, NOT prior year1 (1_000_000)
    expect(g.revenue_current).toBe(1_110_000)
    expect(g.gross_profit_current).toBe(444_000)
    expect(g.net_profit_current).toBe(111_000)
    // margins derived from the seeded dollars (whole-percent)
    expect(g.gross_margin_current).toBe(40) // 444000/1110000*100
    expect(g.net_margin_current).toBe(10)   // 111000/1110000*100
    // D3 shift preserved on the out-years (untouched by seeding)
    expect(g.revenue_year1).toBe(1_300_000) // prior year2
    expect(g.revenue_year2).toBe(1_700_000) // prior year3
    expect(g.revenue_year3).toBe(1_700_000) // extrapolated
  })

  it('usable:false → keeps D3 (current = prior year1)', async () => {
    stubFetch({ usable: false, months_covered: 11, actuals: null })

    await annualResetService.executeAnnualReset({ businessId: BUSINESS_ID, userId: USER_ID, yearStartMonth: 7 })
    expect(goalsRow().revenue_current).toBe(1_000_000) // prior year1 (D3)
  })

  it('fetch failure (network/timeout) → never aborts the rollover, keeps D3', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('aborted') }))

    const res = await annualResetService.executeAnnualReset({ businessId: BUSINESS_ID, userId: USER_ID, yearStartMonth: 7 })
    expect(res.success).toBe(true)
    expect(goalsRow().revenue_current).toBe(1_000_000) // prior year1 (D3)
  })
})
