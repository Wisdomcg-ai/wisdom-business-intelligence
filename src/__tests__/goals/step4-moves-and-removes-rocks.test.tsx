/**
 * Goals wizard Step 4: moving a quarter's rock, and removing it (27 Sep 2026).
 *
 * Since 13 Mar 2026 every Goals save goes through POST /api/goals/save, which
 * saves each step's list whole. An item whose id is not already one of that
 * step's rows is INSERTED, and a row the list no longer holds is deleted. So a
 * quarter rock is a same-title COPY of its 12-month initiative under another
 * id, and Step 4 matches the two by title.
 *
 * Two handlers still assumed the model before that, where a quarter rock WAS
 * its 12-month row:
 *
 * 1. Dragging a rock to another quarter called "remove", then "add". Each set
 *    the plan to an object built from the same render, so React kept the
 *    second: the rock stayed in its quarter AND appeared in the new one, and
 *    the save inserted the copy. Dropping a rock on Available kept it in its
 *    quarter and added an 'unassigned' bucket to the plan. "+ Add" threw before
 *    it added anything.
 * 2. Remove put the rock back in the 12-month list unless that list held its
 *    ID. After a reload a quarter rock's id is never there, so every Remove
 *    appended it. The save then inserted a second same-title 12-month row, and
 *    Available listed the initiative twice.
 *
 * The harness keeps the plan in React state and hands Step 4 React's own
 * setters. useStrategicPlanning does the same: its setters pass the value
 * straight to setState and mark the plan dirty. So the lists these tests read
 * are the lists the hook sends to the save.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { StrictMode, useState } from 'react'
import { render, screen, fireEvent, within, act } from '@testing-library/react'
import type { StrategicInitiative } from '@/app/goals/types'

const { supabaseClient } = vi.hoisted(() => ({
  // No signed-in user, so Step 4 takes its team from localStorage and never
  // queries a table.
  supabaseClient: { auth: { getUser: async () => ({ data: { user: null } }) } },
}))
vi.mock('@/lib/supabase/client', () => ({ createClient: () => supabaseClient }))

import Step4AnnualPlan from '@/app/goals/components/Step4AnnualPlan'
import { titleKey, hasTwelveMonthTwin } from '@/app/goals/utils/initiative-titles'

/** What the loader puts on a row: Step 5's sprint detail rides along untyped. */
type Rock = StrategicInitiative & {
  why?: string
  outcome?: string
  tasks?: Array<{ id: string; task: string }>
  startDate?: string
  endDate?: string
}
type Plan = Record<string, Rock[]>

const rock = (id: string, title: string, extra: Partial<Rock> = {}): Rock => ({
  id,
  title,
  source: 'strategic_ideas',
  category: 'marketing',
  priority: 'high',
  ideaType: 'strategic',
  ...extra,
})

// The 12-month list after a reload: each row has its own id.
const TWELVE_MONTH: Rock[] = [
  rock('tm-marketing', 'Marketing Machine'),
  rock('tm-ops', 'Hire an operations manager'),
  rock('tm-dashboard', 'Build the KPI dashboard'),
]

// Q1's copy of "Marketing Machine", with the sprint detail Step 5 gave it.
const Q1_MARKETING = rock('q1-marketing', 'Marketing Machine', {
  assignedTo: 'owner-1',
  why: 'Leads have been flat for a year',
  outcome: '40 qualified leads a month',
  tasks: [{ id: 'task-1', task: 'Brief the agency' }],
  startDate: '2026-07-01',
  endDate: '2026-09-30',
})

const planOf = (overrides: Partial<Plan> = {}): Plan => ({
  q1: [Q1_MARKETING],
  q2: [rock('q2-ops', 'Hire an operations manager')],
  q3: [],
  q4: [],
  ...overrides,
})

const financialData = {
  revenue: { current: 1_000_000, year1: 1_200_000, year2: 1_400_000, year3: 1_600_000 },
  grossProfit: { current: 400_000, year1: 480_000, year2: 560_000, year3: 640_000 },
  grossMargin: { current: 40, year1: 40, year2: 40, year3: 40 },
  netProfit: { current: 100_000, year1: 120_000, year2: 140_000, year3: 160_000 },
  netMargin: { current: 10, year1: 10, year2: 10, year3: 10 },
  customers: { current: 0, year1: 0, year2: 0, year3: 0 },
  employees: { current: 0, year1: 0, year2: 0, year3: 0 },
}

/** Renders Step 4 over state the tests can read after each interaction. */
async function renderStep4(twelveMonth: Rock[], plan: Plan) {
  const state = { twelveMonth, plan }
  function Harness() {
    const [twelve, setTwelve] = useState<StrategicInitiative[]>(twelveMonth)
    const [quarters, setQuarters] = useState<Record<string, StrategicInitiative[]>>(plan)
    state.twelveMonth = twelve as Rock[]
    state.plan = quarters as Plan
    return (
      <Step4AnnualPlan
        twelveMonthInitiatives={twelve}
        setTwelveMonthInitiatives={setTwelve}
        annualPlanByQuarter={quarters}
        setAnnualPlanByQuarter={setQuarters}
        quarterlyTargets={{}}
        setQuarterlyTargets={() => {}}
        financialData={financialData}
        kpis={[]}
        yearType="FY"
        businessId="profile-1"
        planYear={2027}
      />
    )
  }
  // StrictMode runs every state updater twice, as the dev server does.
  render(<StrictMode><Harness /></StrictMode>)
  // Let the team load (localStorage) settle inside act.
  await act(async () => {})
  return state
}

const quarter = (id: string) => screen.getByTestId(`quarter-${id}`)
const pool = () => screen.getByTestId('available-pool')
const ids = (items: Rock[] | undefined) => (items ?? []).map(i => i.id)
// The tests' own copy of the rule, so they do not grade the helper by itself.
const norm = (title: string) => title.trim().replace(/\s+/g, ' ').toLowerCase()
const countTitle = (items: Rock[], title: string) =>
  items.filter(i => norm(i.title) === norm(title)).length
const inAnyQuarter = (plan: Plan, title: string) =>
  Object.values(plan).reduce((n, items) => n + countTitle(items, title), 0)

function drag(card: HTMLElement, target: HTMLElement) {
  fireEvent.dragStart(card)
  fireEvent.dragOver(target)
  fireEvent.drop(target)
  fireEvent.dragEnd(card)
}

let alertSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 7, 15)) // 15 Aug 2026: FY27 Q1, no remainder column
  localStorage.clear()
  alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('Step 4: dragging a rock to another quarter moves it', () => {
  it('leaves the first quarter, lands in the second once, and leaves the 12-month list alone', async () => {
    const state = await renderStep4(TWELVE_MONTH, planOf())

    drag(within(quarter('q1')).getByText('Marketing Machine'), quarter('q3'))

    expect(ids(state.plan.q1)).toEqual([])
    expect(ids(state.plan.q3)).toEqual(['q1-marketing'])
    expect(inAnyQuarter(state.plan, 'Marketing Machine')).toBe(1)
    expect(ids(state.twelveMonth)).toEqual(['tm-marketing', 'tm-ops', 'tm-dashboard'])
    expect(within(quarter('q1')).queryByText('Marketing Machine')).toBeNull()
    expect(within(quarter('q3')).getAllByText('Marketing Machine')).toHaveLength(1)
  })

  it('takes its sprint detail with it: owner, why, outcome, tasks and dates', async () => {
    const state = await renderStep4(TWELVE_MONTH, planOf())

    drag(within(quarter('q1')).getByText('Marketing Machine'), quarter('q3'))

    expect(state.plan.q3[0]).toEqual(Q1_MARKETING)
  })

  it('two moves in a row both land', async () => {
    const state = await renderStep4(TWELVE_MONTH, planOf())

    drag(within(quarter('q1')).getByText('Marketing Machine'), quarter('q3'))
    drag(within(quarter('q2')).getByText('Hire an operations manager'), quarter('q4'))

    expect(ids(state.plan.q1)).toEqual([])
    expect(ids(state.plan.q2)).toEqual([])
    expect(ids(state.plan.q3)).toEqual(['q1-marketing'])
    expect(ids(state.plan.q4)).toEqual(['q2-ops'])
  })

  it('a quarter already holding five rocks refuses a sixth, and the rock stays put', async () => {
    const full = Array.from({ length: 5 }, (_, n) => rock(`q4-${n}`, `Q4 rock ${n}`))
    const state = await renderStep4(TWELVE_MONTH, planOf({ q4: full }))

    drag(within(quarter('q1')).getByText('Marketing Machine'), quarter('q4'))

    expect(alertSpy).toHaveBeenCalledTimes(1)
    expect(ids(state.plan.q1)).toEqual(['q1-marketing'])
    expect(ids(state.plan.q4)).toEqual(full.map(r => r.id))
  })

  it('a quarter that already holds the same initiative refuses it, and says so', async () => {
    // Production has initiatives filed in all four quarters (the old drag
    // copied), so a move can meet its own twin.
    const state = await renderStep4(
      TWELVE_MONTH,
      planOf({ q3: [rock('q3-marketing', 'marketing machine ')] }),
    )

    drag(within(quarter('q1')).getByText('Marketing Machine'), quarter('q3'))

    expect(alertSpy).toHaveBeenCalledTimes(1)
    expect(String(alertSpy.mock.calls[0][0])).toContain('Marketing Machine')
    expect(ids(state.plan.q1)).toEqual(['q1-marketing'])
    expect(ids(state.plan.q3)).toEqual(['q3-marketing'])
  })
})

describe('Step 4: dropping on Available, and "+ Add"', () => {
  it('a rock dropped on Available leaves its quarter and shows in Available once', async () => {
    const state = await renderStep4(TWELVE_MONTH, planOf())

    drag(within(quarter('q1')).getByText('Marketing Machine'), pool())

    expect(Object.keys(state.plan).sort()).toEqual(['q1', 'q2', 'q3', 'q4'])
    expect(ids(state.plan.q1)).toEqual([])
    expect(ids(state.twelveMonth)).toEqual(['tm-marketing', 'tm-ops', 'tm-dashboard'])
    expect(within(pool()).getAllByText('Marketing Machine')).toHaveLength(1)
  })

  it('an Available card dropped back on Available stays there, and the plan is unchanged', async () => {
    const state = await renderStep4(TWELVE_MONTH, planOf())
    const before = state.plan

    drag(within(pool()).getByText('Build the KPI dashboard'), pool())

    expect(state.plan).toEqual(before)
    expect(within(pool()).getByText('Build the KPI dashboard')).toBeInTheDocument()
  })

  it('"+ Add" puts the chosen initiative in that quarter', async () => {
    const state = await renderStep4(TWELVE_MONTH, planOf())

    fireEvent.change(within(quarter('q2')).getByRole('combobox'), { target: { value: 'tm-dashboard' } })

    expect(ids(state.plan.q2)).toEqual(['q2-ops', 'tm-dashboard'])
    expect(within(pool()).queryByText('Build the KPI dashboard')).toBeNull()
  })

  it('dragging an Available card into a quarter still works', async () => {
    const state = await renderStep4(TWELVE_MONTH, planOf())

    drag(within(pool()).getByText('Build the KPI dashboard'), quarter('q4'))

    expect(ids(state.plan.q4)).toEqual(['tm-dashboard'])
    expect(within(pool()).queryByText('Build the KPI dashboard')).toBeNull()
  })
})

describe('Step 4: Remove never duplicates the 12-month initiative', () => {
  it('a rock whose 12-month initiative is listed goes back to Available without a second copy', async () => {
    const state = await renderStep4(TWELVE_MONTH, planOf())

    fireEvent.click(within(quarter('q1')).getByTitle('Remove from quarter'))

    expect(ids(state.plan.q1)).toEqual([])
    expect(ids(state.twelveMonth)).toEqual(['tm-marketing', 'tm-ops', 'tm-dashboard'])
    expect(within(pool()).getAllByText('Marketing Machine')).toHaveLength(1)
  })

  it('matches titles by the quarterly review\'s rule: case and spacing do not count', async () => {
    const state = await renderStep4(
      TWELVE_MONTH,
      planOf({ q1: [rock('q1-marketing', '  marketing   MACHINE ')] }),
    )
    expect(within(pool()).queryByText('Marketing Machine')).toBeNull()

    fireEvent.click(within(quarter('q1')).getByTitle('Remove from quarter'))

    expect(ids(state.twelveMonth)).toEqual(['tm-marketing', 'tm-ops', 'tm-dashboard'])
    expect(within(pool()).getAllByText('Marketing Machine')).toHaveLength(1)
  })

  it('a rock with no 12-month initiative (a row the old save moved) is put back, once', async () => {
    const legacy = rock('q4-referrals', 'Launch the referral program')
    const state = await renderStep4(TWELVE_MONTH, planOf({ q4: [legacy] }))

    fireEvent.click(within(quarter('q4')).getByTitle('Remove from quarter'))

    expect(ids(state.plan.q4)).toEqual([])
    expect(countTitle(state.twelveMonth, 'Launch the referral program')).toBe(1)
    expect(within(pool()).getAllByText('Launch the referral program')).toHaveLength(1)
  })

  it('removing such a rock from two quarters puts it back once, not twice', async () => {
    const state = await renderStep4(TWELVE_MONTH, planOf({
      q3: [rock('q3-referrals', 'Launch the referral program')],
      q4: [rock('q4-referrals', 'Launch the referral program')],
    }))

    fireEvent.click(within(quarter('q3')).getByTitle('Remove from quarter'))
    fireEvent.click(within(quarter('q4')).getByTitle('Remove from quarter'))

    expect(ids(state.plan.q3)).toEqual([])
    expect(ids(state.plan.q4)).toEqual([])
    expect(countTitle(state.twelveMonth, 'Launch the referral program')).toBe(1)
  })

  it('every title the 12-month list holds is held once after a round of edits', async () => {
    const state = await renderStep4(TWELVE_MONTH, planOf())

    drag(within(quarter('q1')).getByText('Marketing Machine'), quarter('q2'))
    fireEvent.click(within(quarter('q2')).getAllByTitle('Remove from quarter')[0])
    fireEvent.click(within(quarter('q2')).getByTitle('Remove from quarter'))
    drag(within(pool()).getByText('Marketing Machine'), quarter('q4'))

    const keys = state.twelveMonth.map(i => norm(i.title))
    expect(new Set(keys).size).toBe(keys.length)
    expect(inAnyQuarter(state.plan, 'Marketing Machine')).toBe(1)
    expect(ids(state.plan.q4)).toEqual(['tm-marketing'])
  })
})

describe('the title rule Step 4 matches a rock to its 12-month initiative by', () => {
  it('is the quarterly review\'s rule: case, surrounding and repeated spaces do not count', () => {
    expect(titleKey('  Marketing   MACHINE ')).toBe('marketing machine')
    expect(hasTwelveMonthTwin(' marketing  machine', TWELVE_MONTH)).toBe(true)
  })

  it('finds no twin for a title the 12-month list lacks', () => {
    expect(hasTwelveMonthTwin('Launch the referral program', TWELVE_MONTH)).toBe(false)
    expect(hasTwelveMonthTwin('Marketing Machine', [])).toBe(false)
  })

  it('a blank title matches nothing, not every untitled 12-month item', () => {
    const withBlank = [...TWELVE_MONTH, rock('tm-blank', '  ')]
    expect(hasTwelveMonthTwin('', withBlank)).toBe(false)
    expect(hasTwelveMonthTwin(undefined, withBlank)).toBe(false)
  })
})
