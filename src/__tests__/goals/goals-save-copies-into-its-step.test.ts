/**
 * Adding an initiative to the next step of the Goals wizard files a copy in
 * that step. The row it was picked from stays where it is.
 *
 * Every step of the plan is its own set of strategic_initiatives rows, told
 * apart by step_type: the ideas (Step 2), the 12-month list (Step 3), each
 * quarter (Step 4). Picking an initiative into the next step hands that step's
 * list the SAME object, id included: Step 3's drag onto the priority list,
 * Step 4's add-to-quarter. The coach's save (/api/goals/save) inserts a copy
 * for any id that is not already one of that step's rows, and the plan is built
 * on those copies: a quarter rock is a same-title copy of its 12-month
 * initiative (#605), and Steps 3 and 4 match the two by title.
 *
 * StrategicPlanningService.saveInitiatives upserted every UUID by id under the
 * step it was saving. So the Q1 save re-filed the 12-month row as a Q1 row, and
 * after a reload it was gone from the 12-month list and from the One-Page
 * Plan's 12-Month Initiatives. Step 3's drag did the same to an idea, which
 * then left Step 2. That service was the wizard's only save until March 2026.
 * Five businesses' plans still carry rows it moved. The /goals page has saved
 * through the API route since then, owners included. These tests hold the
 * service to the route's rule in case a save is ever routed through it again.
 *
 * Driven through the real service, in the order useStrategicPlanning's
 * saveAllData saves, and through the exported POST, against one in-memory
 * strategic_initiatives table.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const OWNER = 'owner-user-1'
const BUSINESS = 'businesses-uuid-1'
const PROFILE = 'profile-uuid-1'
const IDEA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const TWELVE = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const ROCK = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const DROPPED = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'

type Row = Record<string, unknown> & { id: string }

const fake = vi.hoisted(() => {
  const db = {
    rows: [] as Array<Record<string, unknown> & { id: string }>,
    deleted: [] as string[],
    inserted: 0,
    /** A step whose rows cannot be read, as under a statement timeout. */
    unreadable: null as string | null,
  }

  /** A new row's id: UUID-shaped like gen_random_uuid(), so a reloaded copy saves in place. */
  const newId = () => `00000000-0000-4000-8000-${String(++db.inserted).padStart(12, '0')}`

  /** One query against the table, speaking the calls the two savers make. */
  function query(table: string) {
    const filters: Array<(r: Record<string, unknown>) => boolean> = []
    const equals: Record<string, unknown> = {}
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
          if (db.unreadable && equals.step_type === db.unreadable) {
            return { data: null, error: { message: 'canceling statement due to statement timeout' } }
          }
          return { data: matching().map(r => ({ ...r })), error: null }
        case 'insert': {
          // The table generates the id; neither saver sends one on an insert.
          const rows = payload.map(p => ({ status: 'not_started', ...p, id: newId() }))
          db.rows.push(...rows)
          return { data: rows.map(r => ({ id: r.id })), error: null }
        }
        case 'upsert': {
          // ON CONFLICT (id) DO UPDATE: a payload naming another step's row
          // rewrites that row, step_type included.
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
      eq: (col: string, val: unknown) => { filters.push(r => r[col] === val); equals[col] = val; return b },
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
import type { StrategicInitiative } from '@/app/goals/types'

type Step = Parameters<typeof StrategicPlanningService.loadInitiatives>[1]

const row = (id: string, step_type: string, title: string, over: Partial<Row> = {}): Row => ({
  id,
  business_id: PROFILE,
  user_id: OWNER,
  step_type,
  title,
  status: 'not_started',
  source: 'strategic_ideas',
  order_index: 0,
  ...over,
})

/** A plan part-way through the wizard: an idea, a 12-month initiative, and a rock already in Q1. */
const PLAN = () => [
  row(IDEA, 'strategic_ideas', 'Hire a General Manager'),
  row(TWELVE, 'twelve_month', 'Build Client Delivery Playbooks', { selected: true }),
  row(ROCK, 'q1', 'Generate New Leads', { selected: true }),
]

const byId = (id: string) => fake.db.rows.find(r => r.id === id)
const inStep = (step: string) => fake.db.rows.filter(r => r.step_type === step)
const load = (step: Step) => StrategicPlanningService.loadInitiatives(PROFILE, step)
const save = (list: StrategicInitiative[], step: Step) =>
  StrategicPlanningService.saveInitiatives(PROFILE, OWNER, list, step)

/** The coach's save of these lists (the route skips a bucket the payload leaves out). */
const postInitiatives = (initiatives: Record<string, StrategicInitiative[]>) =>
  POST(
    new Request('http://test/api/goals/save', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ businessId: BUSINESS, profileId: PROFILE, data: { initiatives } }),
    }),
  )

/** saveAllData's order for an owner: one whole-list save per step, the ideas first. */
const SAVE_ORDER: Step[] = ['strategic_ideas', 'roadmap', 'twelve_month', 'q1', 'q2', 'q3', 'q4', 'sprint']
async function saveTheWizard(lists: Partial<Record<Step, StrategicInitiative[]>>) {
  for (const step of SAVE_ORDER) {
    const result = await save(lists[step] ?? [], step)
    expect(result.success, `the ${step} save`).toBe(true)
  }
}

/** Where Steps 2–4 stand after a load, as the wizard holds them. */
async function loadTheWizard() {
  return {
    strategic_ideas: await load('strategic_ideas'),
    twelve_month: await load('twelve_month'),
    q1: await load('q1'),
  }
}

beforeEach(() => {
  fake.db.rows = PLAN()
  fake.db.deleted = []
  fake.db.inserted = 0
  fake.db.unreadable = null
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => vi.restoreAllMocks())

describe('adding an initiative to the next step files a copy there; the original stays put', () => {
  it('Step 4: a 12-month initiative put in a quarter stays on the 12-month list, and the quarter gets its own copy', async () => {
    const wizard = await loadTheWizard()
    // handleAddToQuarter: Q1's list gets the 12-month object itself, id and all.
    wizard.q1 = [...wizard.q1, wizard.twelve_month[0]]
    await saveTheWizard(wizard)

    expect(byId(TWELVE)?.step_type).toBe('twelve_month')
    const copies = inStep('q1').filter(r => r.title === 'Build Client Delivery Playbooks')
    expect(copies).toHaveLength(1)
    expect(copies[0].id).not.toBe(TWELVE)

    // After a reload, the 12-month list still has it and Q1 lists the copy.
    expect((await load('twelve_month')).map(i => i.id)).toEqual([TWELVE])
    expect((await load('q1')).map(i => i.title)).toEqual(['Generate New Leads', 'Build Client Delivery Playbooks'])
  })

  it('Step 3: an idea dragged onto the 12-month list stays among the ideas, and the 12-month list gets its own copy', async () => {
    const wizard = await loadTheWizard()
    // handleDropOnPriority: the idea object itself, marked selected.
    wizard.twelve_month = [...wizard.twelve_month, { ...wizard.strategic_ideas[0], selected: true, order: 1 }]
    await saveTheWizard(wizard)

    expect(byId(IDEA)?.step_type).toBe('strategic_ideas')
    const copies = inStep('twelve_month').filter(r => r.title === 'Hire a General Manager')
    expect(copies).toHaveLength(1)
    expect(copies[0].id).not.toBe(IDEA)
    expect((await load('strategic_ideas')).map(i => i.id)).toEqual([IDEA])
  })

  it('the next autosave before a reload still leaves one copy in the quarter, and the 12-month row where it was', async () => {
    const wizard = await loadTheWizard()
    wizard.q1 = [...wizard.q1, wizard.twelve_month[0]]
    await saveTheWizard(wizard)
    // Until a reload, Q1's list still holds the 12-month id.
    await saveTheWizard(wizard)

    expect(inStep('q1').filter(r => r.title === 'Build Client Delivery Playbooks')).toHaveLength(1)
    expect(inStep('twelve_month').map(r => r.id)).toEqual([TWELVE])
  })

  it('a rock already in the quarter is saved in place: its own id, no copy', async () => {
    const q1 = (await load('q1')).map(i => ({ ...i, assignedTo: 'owner-1' }))
    await save(q1, 'q1')

    expect(inStep('q1').map(r => r.id)).toEqual([ROCK])
    expect(byId(ROCK)?.assigned_to).toBe('owner-1')
    expect(fake.db.inserted).toBe(0)
  })

  it('a save of one step never writes a row of another step, whichever ids its list carries', async () => {
    const otherSteps = () => fake.db.rows.filter(r => r.step_type !== 'q1').map(r => ({ ...r }))
    const before = otherSteps()

    const q1 = [...(await load('q1')), ...(await load('twelve_month')), ...(await load('strategic_ideas'))]
    await save(q1, 'q1')

    expect(otherSteps()).toEqual(before)
    expect(inStep('q1').map(r => r.title)).toEqual([
      'Generate New Leads',
      'Build Client Delivery Playbooks',
      'Hire a General Manager',
    ])
  })

  it('an initiative added beside a rock the coach dropped still leaves the dropped rock alone (#611)', async () => {
    fake.db.rows.push(row(DROPPED, 'q1', 'Open a second site', { status: 'cancelled' }))
    // loadInitiatives leaves the Drop out of Q1's list.
    const q1 = [...(await load('q1')), ...(await load('twelve_month'))]
    await save(q1, 'q1')

    expect(fake.db.deleted).toEqual([])
    expect(byId(DROPPED)).toEqual(row(DROPPED, 'q1', 'Open a second site', { status: 'cancelled' }))
    expect(inStep('q1')).toHaveLength(3)
  })
})

describe('the owner\'s save and the coach\'s save leave the same plan', () => {
  /** Each row as step, title, and whether it is one of the plan's original rows or a copy. */
  const shape = () =>
    fake.db.rows
      .map(r => `${r.step_type} | ${r.title} | ${[IDEA, TWELVE, ROCK].includes(r.id) ? 'original' : 'copy'}`)
      .sort()

  it('an idea taken into the 12-month list and on into Q1', async () => {
    const wizard = await loadTheWizard()
    const picked = { ...wizard.strategic_ideas[0], selected: true, order: 1 }
    wizard.twelve_month = [...wizard.twelve_month, picked]
    wizard.q1 = [...wizard.q1, picked]

    await saveTheWizard(wizard)
    const viaService = shape()

    fake.db.rows = PLAN()
    fake.db.deleted = []
    fake.db.inserted = 0
    const res = await postInitiatives({
      strategicIdeas: wizard.strategic_ideas,
      twelveMonthInitiatives: wizard.twelve_month,
      q1: wizard.q1,
    })
    expect(res.status).toBe(200)

    expect(shape()).toEqual(viaService)
    expect(viaService).toEqual([
      'q1 | Generate New Leads | original',
      'q1 | Hire a General Manager | copy',
      'strategic_ideas | Hire a General Manager | original',
      'twelve_month | Build Client Delivery Playbooks | original',
      'twelve_month | Hire a General Manager | copy',
    ].sort())
  })
})

describe('a step whose saved rows could not be read is not written', () => {
  // Which ids are the step's own rows is what the save decides by. Read as
  // "none", every item in the list would be inserted again beside its row.

  it('the owner\'s save writes nothing to it, and says it failed', async () => {
    const wizard = await loadTheWizard()
    wizard.q1 = [...wizard.q1, wizard.twelve_month[0]]
    const before = fake.db.rows.map(r => ({ ...r }))

    fake.db.unreadable = 'q1'
    const result = await save(wizard.q1, 'q1')

    expect(result.success).toBe(false)
    expect(fake.db.rows).toEqual(before)
  })

  it('nor does the coach\'s: the other steps are saved, and the answer names the one that was not', async () => {
    const wizard = await loadTheWizard()
    wizard.q1 = [...wizard.q1, wizard.twelve_month[0]]

    fake.db.unreadable = 'q1'
    const res = await postInitiatives({ twelveMonthInitiatives: wizard.twelve_month, q1: wizard.q1 })

    expect(res.status).toBe(207)
    const body = await res.json()
    expect(body.successes).toEqual(['twelve_month'])
    expect(body.errors).toEqual([expect.stringMatching(/^q1 read: /)])
    expect(inStep('q1').map(r => r.id)).toEqual([ROCK])
    expect(fake.db.inserted).toBe(0)
  })
})
