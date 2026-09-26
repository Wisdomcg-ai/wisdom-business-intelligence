/**
 * The Goals wizard shows the plan without the initiatives the coach dropped —
 * and its save never deletes them for it.
 *
 * The quarterly review saves a Drop as status 'cancelled' and never deletes the
 * row (#609). The Goals wizard loads every step of the plan through
 * StrategicPlanningService.loadInitiatives, which mapped every row and never
 * read the status, so a dropped rock was back in its quarter on Step 4, in
 * Sprint Planning and in the weekly review's rocks.
 *
 * Leaving dropped rows out of the wizard's lists is only safe because of the
 * second half. The wizard saves each step as a WHOLE list and hard-deletes
 * every row of that step the list leaves out — saveInitiatives in the browser,
 * /api/goals/save for a coach. Without removedFromList, the first autosave
 * after a review would delete every Drop the review saved, and the record of
 * the decision with it.
 *
 * Driven through the real service and the exported POST, against one
 * in-memory strategic_initiatives table.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const OWNER = 'owner-user-1'
const BUSINESS = 'businesses-uuid-1'
const PROFILE = 'profile-uuid-1'
const ALPHA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const BRAVO = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const DROPPED = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

type Row = Record<string, unknown> & { id: string }

const fake = vi.hoisted(() => {
  const db = { rows: [] as Array<Record<string, unknown> & { id: string }>, deleted: [] as string[], inserted: 0 }

  /** One query against the table, speaking the calls the two savers make. */
  function query(table: string) {
    const filters: Array<(r: Record<string, unknown>) => boolean> = []
    let op: 'select' | 'insert' | 'upsert' | 'delete' = 'select'
    let payload: Array<Record<string, unknown>> = []

    const run = () => {
      // The route's access checks: the caller owns the business, and the
      // profile it saves under belongs to that business.
      if (table === 'businesses') {
        return { data: { id: 'businesses-uuid-1', owner_id: 'owner-user-1', assigned_coach_id: null }, error: null }
      }
      if (table === 'business_profiles') return { data: { id: 'profile-uuid-1' }, error: null }
      if (table !== 'strategic_initiatives') return { data: null, error: null }
      const matching = () => db.rows.filter(r => filters.every(f => f(r)))
      switch (op) {
        case 'select':
          return { data: matching().map(r => ({ ...r })), error: null }
        case 'insert': {
          const rows = payload.map(p => ({ status: 'not_started', ...p, id: `inserted-${++db.inserted}` }))
          db.rows.push(...rows)
          return { data: rows.map(r => ({ id: r.id })), error: null }
        }
        case 'upsert': {
          for (const p of payload) {
            const at = db.rows.findIndex(r => r.id === p.id)
            if (at >= 0) db.rows[at] = { ...db.rows[at], ...p } as (typeof db.rows)[number]
            else db.rows.push({ status: 'not_started', ...p } as unknown as (typeof db.rows)[number])
          }
          return { data: null, error: null }
        }
        case 'delete': {
          const doomed = matching()
          db.deleted.push(...doomed.map(r => r.id))
          db.rows = db.rows.filter(r => !doomed.includes(r))
          return { data: null, error: null }
        }
      }
    }

    const b: any = {
      select: () => b,
      eq: (col: string, val: unknown) => { filters.push(r => r[col] === val); return b },
      in: (col: string, vals: unknown[]) => { filters.push(r => vals.includes(r[col])); return b },
      order: () => b,
      insert: (rows: Array<Record<string, unknown>>) => { op = 'insert'; payload = rows; return b },
      upsert: (rows: Array<Record<string, unknown>>) => { op = 'upsert'; payload = rows; return b },
      delete: () => { op = 'delete'; return b },
      single: async () => run(),
      maybeSingle: async () => run(),
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve().then(run).then(resolve, reject),
    }
    return b
  }

  return { db, client: () => ({ from: query }) }
})

vi.mock('@/lib/supabase/client', () => ({ createClient: () => fake.client() }))
vi.mock('@/lib/supabase/admin', () => ({ createServiceRoleClient: () => fake.client() }))
vi.mock('@/lib/supabase/server', () => ({
  createRouteHandlerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: OWNER } }, error: null }) },
  }),
}))
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn(), captureMessage: vi.fn(), addBreadcrumb: vi.fn() }))

import { StrategicPlanningService } from '@/app/goals/services/strategic-planning-service'
import { POST } from '@/app/api/goals/save/route'

const row = (id: string, title: string, over: Partial<Row> = {}): Row => ({
  id,
  business_id: PROFILE,
  user_id: OWNER,
  step_type: 'q2',
  title,
  status: 'not_started',
  notes: null,
  order_index: 0,
  ...over,
})

/** Efficient Living's shape: a rock the Q2 review dropped, beside two it kept. */
const QUARTER = () => [
  row(ALPHA, 'Generate New Leads'),
  row(BRAVO, 'Due Date Focus', { status: 'in_progress', order_index: 1 }),
  row(DROPPED, 'Hire a General Manager', { status: 'cancelled', notes: 'Not this year', order_index: 2 }),
]

const byId = (id: string) => fake.db.rows.find(r => r.id === id)

beforeEach(() => {
  fake.db.rows = QUARTER()
  fake.db.deleted = []
  fake.db.inserted = 0
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => vi.restoreAllMocks())

describe('the Goals wizard loads the plan without the initiatives the coach dropped', () => {
  it('a quarter lists its live rocks only', async () => {
    const q2 = await StrategicPlanningService.loadInitiatives(PROFILE, 'q2')
    expect(q2.map(i => i.id)).toEqual([ALPHA, BRAVO])
  })

  it('so does the 12-month list — an initiative dropped from 4.2\'s Available pool', async () => {
    fake.db.rows = [
      row(ALPHA, 'Build Client Delivery Playbooks', { step_type: 'twelve_month' }),
      row(DROPPED, 'Open a second site', { step_type: 'twelve_month', status: 'cancelled' }),
    ]
    const twelveMonth = await StrategicPlanningService.loadInitiatives(PROFILE, 'twelve_month')
    expect(twelveMonth.map(i => i.title)).toEqual(['Build Client Delivery Playbooks'])
  })
})

describe('saving the wizard never deletes an initiative the coach dropped', () => {
  it('the loaded list, saved straight back, deletes nothing and leaves the dropped row as it was', async () => {
    const q2 = await StrategicPlanningService.loadInitiatives(PROFILE, 'q2')
    const result = await StrategicPlanningService.saveInitiatives(PROFILE, OWNER, q2, 'q2')

    expect(result.success).toBe(true)
    expect(fake.db.deleted).toEqual([])
    expect(byId(DROPPED)).toEqual(QUARTER()[2])
  })

  it('a rock the client removes is still deleted — and only that one', async () => {
    const q2 = await StrategicPlanningService.loadInitiatives(PROFILE, 'q2')
    await StrategicPlanningService.saveInitiatives(PROFILE, OWNER, q2.filter(i => i.id !== BRAVO), 'q2')

    expect(fake.db.deleted).toEqual([BRAVO])
    expect(byId(DROPPED)?.status).toBe('cancelled')
  })

  it('a quarter holding only dropped rocks, saved empty, keeps them', async () => {
    fake.db.rows = [row(DROPPED, 'Hire a General Manager', { status: 'cancelled' })]
    const q2 = await StrategicPlanningService.loadInitiatives(PROFILE, 'q2')
    expect(q2).toEqual([])

    const result = await StrategicPlanningService.saveInitiatives(PROFILE, OWNER, q2, 'q2')
    expect(result.success).toBe(true)
    expect(fake.db.deleted).toEqual([])
    expect(byId(DROPPED)?.status).toBe('cancelled')
  })

  it('the empty-list guard still holds for the live rocks', async () => {
    // Unchanged: an empty list never deletes a quarter's last live rocks.
    await StrategicPlanningService.saveInitiatives(PROFILE, OWNER, [], 'q2')
    expect(fake.db.deleted).toEqual([])
  })
})

describe('a coach\'s save (/api/goals/save) never deletes one either', () => {
  const post = (q2: Array<Record<string, unknown>>) =>
    POST(
      new Request('http://test/api/goals/save', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ businessId: BUSINESS, profileId: PROFILE, data: { initiatives: { q2 } } }),
      }),
    )

  it('the wizard\'s list, saved back, deletes nothing', async () => {
    const res = await post([
      { id: ALPHA, title: 'Generate New Leads' },
      { id: BRAVO, title: 'Due Date Focus' },
    ])
    expect(res.status).toBe(200)
    expect(fake.db.deleted).toEqual([])
    expect(byId(DROPPED)).toEqual(QUARTER()[2])
  })

  it('a rock the coach removes is deleted, the dropped one is not', async () => {
    const res = await post([{ id: ALPHA, title: 'Generate New Leads' }])
    expect(res.status).toBe(200)
    expect(fake.db.deleted).toEqual([BRAVO])
    expect(byId(DROPPED)?.status).toBe('cancelled')
  })

  it('an empty quarter deletes the live rocks and keeps the dropped one', async () => {
    // The coach path has no empty-list guard; only the Drop is protected.
    await post([])
    expect(fake.db.deleted).toEqual([ALPHA, BRAVO])
    expect(fake.db.rows.map(r => r.id)).toEqual([DROPPED])
  })
})
