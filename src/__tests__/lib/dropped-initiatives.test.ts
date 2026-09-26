/**
 * An initiative the coach dropped is not on the plan.
 *
 * The quarterly review never deletes a strategic_initiatives row: Drop in step
 * 4.2, and a rock removed in Sprint Planning after the background sync filed
 * it, are saved as status 'cancelled' (#609). Almost no reader looked at the
 * status, so a dropped initiative stayed on the Goals wizard, the One-Page
 * Plan's 12-Month Initiatives, the dashboard's rocks, the coach's goal counts,
 * the session rock picker, 4.1's progress bar, the readiness signals and the
 * forecast's "From your plan" list.
 *
 * Latent in production, 26 Sep 2026: 537 rows, none cancelled. The first Drop
 * a completed review saves would have shown on all of them.
 *
 * One rule (src/lib/initiatives/dropped-initiatives.ts); each reader is pinned
 * to it below. What stays deliberately unchanged: the engagement checks
 * (client completion, onboarding) still count a dropped row — the work was
 * done — and the counts of COMPLETED initiatives (coach reports, Coaching ROI)
 * never counted one.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import {
  isDroppedInitiative,
  livePlanRows,
  pickableRows,
  removedFromList,
} from '@/lib/initiatives/dropped-initiatives'
import { liveQuarterRows, quarterRowIndex } from '@/app/quarterly-review/utils/quarter-rows'

const read = (rel: string) => readFileSync(path.resolve(__dirname, '../../', rel), 'utf-8')

describe('what a dropped initiative is', () => {
  it('a row saved as cancelled — and only that', () => {
    expect(isDroppedInitiative({ status: 'cancelled' })).toBe(true)
    for (const status of ['not_started', 'in_progress', 'completed', 'on_hold', null, undefined]) {
      expect(isDroppedInitiative({ status })).toBe(false)
    }
  })

  it('the plan is every other row, in its order — a row with no status is live', () => {
    const rows = [
      { id: '1', status: 'not_started' },
      { id: '2', status: 'cancelled' },
      { id: '3', status: 'completed' },
      { id: '4', status: null },
      { id: '5', status: 'on_hold' },
      { id: '6' },
    ]
    expect(livePlanRows(rows).map(r => r.id)).toEqual(['1', '3', '4', '5', '6'])
  })

  it('a quarter\'s rocks are read by the same rule', () => {
    const rows = [{ id: 'a', status: 'cancelled' }, { id: 'b', status: 'in_progress' }]
    expect(liveQuarterRows(rows)).toEqual(livePlanRows(rows))
    // …and a dropped row is never the row a rock of its name is filed under.
    const index = quarterRowIndex([{ id: 'dropped', title: 'Hire a GM', status: 'cancelled' }])
    expect(index.rowFor({ title: 'Hire a GM' })).toBeUndefined()
  })
})

describe('a picker offers live initiatives, and still shows what is linked', () => {
  const rocks = [
    { id: 'live', status: 'not_started' },
    { id: 'dropped-linked', status: 'cancelled' },
    { id: 'dropped-other', status: 'cancelled' },
  ]

  it('nothing dropped is offered to link to', () => {
    expect(pickableRows(rocks, null).map(r => r.id)).toEqual(['live'])
    expect(pickableRows(rocks).map(r => r.id)).toEqual(['live'])
  })

  it('the rock an action is already linked to stays, dropped or not', () => {
    expect(pickableRows(rocks, 'dropped-linked').map(r => r.id)).toEqual(['live', 'dropped-linked'])
  })
})

describe('a list save never deletes a dropped initiative', () => {
  const existing = [
    { id: 'kept', status: 'not_started' },
    { id: 'removed', status: 'in_progress' },
    { id: 'dropped', status: 'cancelled' },
  ]

  it('deletes what the list removed, and only that', () => {
    expect(removedFromList(existing, ['kept'])).toEqual(['removed'])
  })

  it('the wizard\'s own list, saved back, deletes nothing — the dropped row is left out, not removed', () => {
    expect(removedFromList(existing, new Set(['kept', 'removed']))).toEqual([])
  })

  it('an empty list deletes the live rows only', () => {
    expect(removedFromList(existing, [])).toEqual(['kept', 'removed'])
  })

  it('a row with no status is a live one: removing it deletes it', () => {
    expect(removedFromList([{ id: 'legacy', status: null }], [])).toEqual(['legacy'])
  })
})

// Each reader, pinned to the rule. A reader that leaves this module behind goes
// back to showing a dropped initiative as live.
describe('every reader of the plan reads through the rule', () => {
  it('the Goals wizard loads the live plan and never deletes what it left out', () => {
    const service = read('app/goals/services/strategic-planning-service.ts')
    expect(service).toMatch(/const initiatives: StrategicInitiative\[\] = livePlanRows\(data \|\| \[\]\)\.map\(/)
    const save = service.slice(service.indexOf('static async saveInitiatives('), service.indexOf('static async loadInitiatives('))
    expect(save).toMatch(/\.select\('id, status'\)/)
    expect(save).toMatch(/const idsToDelete = removedFromList\(existingData \|\| \[\], newIds\)/)
    expect(save).not.toMatch(/existingIds/)

    const route = read('app/api/goals/save/route.ts')
    expect(route).toMatch(/\.select\('id, status'\)/)
    expect(route).toMatch(/const toRemove = removedFromList\(existing \?\? \[\], currentIds\)/)
  })

  it('the One-Page Plan: 12-Month Initiatives, and which quarter it shows', () => {
    const assembler = read('app/one-page-plan/services/plan-data-assembler.ts')
    expect(assembler).toMatch(/strategicInitiatives: livePlanRows\(initiatives \|\| \[\]\)\.map\(/)
    // A next quarter whose rocks were all dropped is not the one to show.
    expect(assembler).toMatch(/if \(liveQuarterRows\(nextQuarterRows \|\| \[\]\)\.length > 0\)/)
    expect(assembler).not.toMatch(/select\('id', \{ count: 'exact', head: true \}\)\s*\.eq\('business_id', tryId\)\s*\.eq\('step_type', nextQKey\)/)
  })

  it('the dashboard\'s rocks', () => {
    const hook = read('app/dashboard/hooks/useDashboardData.ts')
    expect(hook).toMatch(/return livePlanRows\(data\)\.map\(rock => \(/)
  })

  it('the coach\'s client page: "x/y complete" counts neither side of a dropped initiative', () => {
    const page = read('app/coach/clients/[id]/page.tsx')
    expect(page).toMatch(/const onPlan = livePlanRows\(initiatives\)/)
    expect(page).toMatch(/completedGoals = onPlan\.filter\(/)
    expect(page).toMatch(/activeGoals = onPlan\.filter\(/)
  })

  it('the session rock picker offers live rocks and labels a linked dropped one', () => {
    const page = read('app/coach/sessions/[id]/page.tsx')
    expect(page).toMatch(/\.select\('id, title, step_type, status'\)/)
    expect(page).toMatch(/const rockChoices = \(linkedId: string \| null\) => pickableRows\(rocks, linkedId\)/)
    // Both pickers — previous actions and this session's — and both gates.
    expect(page.match(/const qtRocks = rockChoices\(action\.strategic_initiative_id\)\.filter\(/g)).toHaveLength(2)
    expect(page.match(/\{rockChoices\(action\.strategic_initiative_id\)\.length > 0 && \(/g)).toHaveLength(2)
    expect(page).not.toMatch(/rocks\.filter\(r => r\.step_type === qt\)/)
    expect(page).toMatch(/isDroppedInitiative\(rock\) \? `\$\{rock\.title\} \(dropped\)` : rock\.title/)
  })

  it('4.1\'s initiative progress: a dropped rock is not "deferred", and not in the total', () => {
    const step = read('app/quarterly-review/components/steps/ConfidenceRealignmentStep.tsx')
    expect(step).toMatch(/const quarterInitiatives = liveQuarterRows\(yearFiltered\.filter\(/)
    expect(step).toMatch(/deferred: arr\.filter\(i => \['deferred', 'on_hold'\]\.includes\(i\.status\)\)/)
  })

  it('the readiness signals: prior rocks are the rocks 1.3 will review', () => {
    const hook = read('app/quarterly-review/hooks/useReviewReadiness.ts')
    expect(hook).toMatch(/return liveQuarterRows\(data \?\? \[\]\)\.length;/)
    const page = read('app/quarterly-review/readiness/page.tsx')
    expect(page).toMatch(/gather\('strategic_initiatives', 'business_id, status', r => !isDroppedInitiative\(r\)\)/)
  })

  it('the forecast\'s "From your plan" list', () => {
    const route = read('app/api/strategic-initiatives/route.ts')
    expect(route).toMatch(/const COLUMNS =\s*'[^']*\bstatus'/)
    // Every answer goes through planInitiatives; none maps the rows directly.
    expect(route.match(/initiatives: planInitiatives\(/g)).toHaveLength(3)
    expect(route.match(/\.map\(mapInitiative\)/g)).toHaveLength(1)
    expect(route).toMatch(/return livePlanRows\(rows\)\.map\(mapInitiative\)/)
  })
})
