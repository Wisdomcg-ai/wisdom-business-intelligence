/**
 * Step 4.2's Available pool and an initiative the coach dropped.
 *
 * Available lists the plan's ideas and 12-month initiatives that no quarter
 * holds. It read neither of the two ways a Drop is saved (status 'cancelled',
 * never a delete — #609):
 *
 * 1. An initiative dropped from Available was listed again as a fresh 'keep'.
 *    syncInitiativeChanges writes a kept listing outside the planned quarter
 *    back by id as 'in_progress', so the next completion revived it: a dropped
 *    initiative back on the plan without anyone choosing it. It is now listed
 *    as Drop (listPoolRow), as #609 lists a dropped quarter row.
 *
 * 2. A quarter row the coach dropped still held its title, so the 12-month
 *    initiative it was the quarter's copy of never came back to Available.
 *    Under #605, Drop on a picked card drops the quarter's rock, not the
 *    initiative — "drop it in the Available pool for that" — and Available
 *    no longer showed it. Now only a live quarter row holds a title
 *    (availablePool), as the sync files a pick (quarterRowIndex).
 *
 * And "Distribute" spreads only what the coach has not dropped.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { InitiativeDecision } from '@/app/quarterly-review/types'
import {
  availablePool,
  listPoolRow,
  listingsToDistribute,
} from '@/app/quarterly-review/utils/reconcile-decisions'
import { plannedRockDecisions } from '@/app/quarterly-review/utils/rocks-from-decisions'

// The completion sync, recording what it writes to each row.
const writes = vi.hoisted(() => [] as Array<{ id: string; payload: Record<string, unknown> }>)
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({
      update: (payload: Record<string, unknown>) => {
        let id = ''
        const chain: any = {
          eq: (column: string, value: unknown) => {
            if (column === 'id') id = String(value)
            return chain
          },
          then: (resolve: (v: unknown) => unknown) => {
            writes.push({ id, payload })
            return Promise.resolve({ error: null }).then(resolve)
          },
        }
        return chain
      },
    }),
  }),
}))

import { StrategicSyncService } from '@/app/quarterly-review/services/strategic-sync-service'

const PLAYBOOKS = 'Build Client Delivery Playbooks'
const TWELVE_MONTH = '11111111-1111-4111-8111-111111111111'
const IDEA = '22222222-2222-4222-8222-222222222222'
const QUARTER_COPY = '33333333-3333-4333-8333-333333333333'

const pool = (over: Record<string, unknown> = {}) => ({
  id: TWELVE_MONTH,
  title: PLAYBOOKS,
  step_type: 'twelve_month',
  idea_type: 'strategic',
  status: 'not_started',
  ...over,
})

describe('Available offers a 12-month initiative whose quarter copy the coach dropped', () => {
  it('a dropped quarter copy no longer hides it', () => {
    const out = availablePool([pool()], [{ id: QUARTER_COPY, title: PLAYBOOKS, status: 'cancelled' }])
    expect(out.map(r => r.id)).toEqual([TWELVE_MONTH])
  })

  it('a live quarter copy still holds it — it is in that quarter, not Available', () => {
    expect(availablePool([pool()], [{ id: QUARTER_COPY, title: PLAYBOOKS, status: 'not_started' }])).toEqual([])
  })

  it('one live copy among dropped ones holds it', () => {
    // Efficient Living's shape: a rock kept once and dropped three times.
    const quarter = [
      { id: 'q-1', title: PLAYBOOKS, status: 'cancelled' },
      { id: 'q-2', title: PLAYBOOKS, status: 'not_started' },
      { id: 'q-3', title: PLAYBOOKS, status: 'cancelled' },
    ]
    expect(availablePool([pool()], quarter)).toEqual([])
  })

  it('titles match as the sync files them — whatever the case and spacing', () => {
    const quarter = [{ id: QUARTER_COPY, title: '  build client   delivery PLAYBOOKS ', status: 'in_progress' }]
    expect(availablePool([pool()], quarter)).toEqual([])
  })

  it('still one entry per initiative, strategic only', () => {
    const out = availablePool(
      [
        pool({ id: IDEA, step_type: 'strategic_ideas' }),
        pool(),
        pool({ id: 'op-1', title: 'Weekly team meeting', step_type: 'strategic_ideas', idea_type: 'operational' }),
      ],
      [],
    )
    expect(out.map(r => r.id)).toEqual([TWELVE_MONTH])
  })
})

describe('Available lists an initiative the coach dropped as Drop', () => {
  it('a pool row saved as cancelled is Drop — not a fresh keep', () => {
    expect(listPoolRow(pool({ status: 'cancelled' }))).toMatchObject({
      initiativeId: TWELVE_MONTH,
      decision: 'kill',
      currentStatus: 'cancelled',
      quarterAssigned: 'unassigned',
    })
  })

  it('every other pool row is listed exactly as before', () => {
    expect(
      listPoolRow({
        id: IDEA,
        title: 'Launch referral program',
        category: 'marketing',
        status: 'in_progress',
        progress_percentage: 20,
        assigned_to: 'Trent Greenshields',
        source: 'strategic_ideas',
        idea_type: 'strategic',
      }),
    ).toEqual({
      initiativeId: IDEA,
      title: 'Launch referral program',
      category: 'marketing',
      currentStatus: 'in_progress',
      progressPercentage: 20,
      decision: 'keep',
      notes: '[Assigned: Trent Greenshields]',
      quarterAssigned: 'unassigned',
      source: 'strategic_ideas',
      ideaType: 'strategic',
    })
  })

  it('a dropped pool listing is no rock', () => {
    expect(plannedRockDecisions([listPoolRow(pool({ status: 'cancelled' }))], 2)).toEqual([])
  })

  describe('and the completion after it does not bring it back', () => {
    beforeEach(() => {
      writes.length = 0
    })

    it('the listing saves the drop again — never "in progress"', async () => {
      const result = await new StrategicSyncService().syncInitiativeChanges(
        'profile-1',
        'user-1',
        [listPoolRow(pool({ status: 'cancelled' }))],
        'q2',
        '2026-09-23T22:07:59Z',
      )
      expect(result.success).toBe(true)
      expect(writes.map(w => [w.id, w.payload.status])).toEqual([[TWELVE_MONTH, 'cancelled']])
    })
  })
})

describe('Distribute places only what the coach has not dropped', () => {
  const listing = (over: Partial<InitiativeDecision>): InitiativeDecision => ({
    initiativeId: 'x',
    title: 'x',
    category: 'marketing',
    currentStatus: 'not_started',
    progressPercentage: 0,
    decision: 'keep',
    notes: '',
    quarterAssigned: 'unassigned',
    ...over,
  })

  it('Available listings, less the dropped ones', () => {
    const decisions = [
      listing({ initiativeId: 'available' }),
      listing({ initiativeId: 'dropped', decision: 'kill' }),
      listing({ initiativeId: 'in-q2', quarterAssigned: 'q2' }),
      listing({ initiativeId: 'no-quarter', quarterAssigned: undefined }),
      listing({ initiativeId: 'accelerated', decision: 'accelerate' }),
    ]
    expect(listingsToDistribute(decisions).map(d => d.initiativeId)).toEqual([
      'available',
      'no-quarter',
      'accelerated',
    ])
  })
})

describe('step 4.2 reads the pool through these rules', () => {
  const step = readFileSync(
    path.resolve(__dirname, '../../app/quarterly-review/components/steps/QuarterlyPlanStep.tsx'),
    'utf-8',
  )

  it('Available is what no live quarter row holds, each listed by listPoolRow', () => {
    expect(step).toMatch(/const unassignedPool = availablePool\(\(poolData \|\| \[\]\) as any\[\], \[/)
    expect(step).toMatch(/allDecisions\.push\(listPoolRow\(i as PlanQuarterRow\)\)/)
    // The loader builds no listing by hand: every row is listed by the rules.
    const loader = step.slice(step.indexOf('// Load initiatives by step_type'), step.indexOf('// Cross-reference Step 1.3'))
    expect(loader).not.toMatch(/decision:/)
    expect(loader).not.toMatch(/assignedTitles/)
  })

  it('Distribute, and its buttons, count only what is not dropped', () => {
    expect(step).toMatch(/const unassigned = listingsToDistribute\(decisions\);/)
    expect(step).toMatch(/\{listingsToDistribute\(decisions\)\.length > 0 && \(/)
  })
})
