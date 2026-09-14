/**
 * "Prepared on" — rows shaped like prod on 14 Sep 2026.
 *
 * Urban Road August 2026: snapshot status 'draft', generated_at 2026-09-11
 * 20:14 UTC, cycle 'draft' — so its pack is dated the day it is exported.
 * Envisage January 2026 is the one finalised snapshot in prod: generated_at
 * 2026-02-19 05:26 UTC — 19 February in Sydney.
 */
import { describe, it, expect } from 'vitest'
import { resolvePackPreparedOn, loadPackPreparedOn, formatPackPreparedOn } from '../pack-prepared-on'
import { fakeSupabase } from './fake-supabase'

const URBAN_ROAD_BIZ = '28d41193-38ae-4071-a2b1-0dbea90a38fd'
const URBAN_ROAD_PROFILE = 'aabd3c49-4dc8-4aa6-a9a6-75f62ab89ff5'

describe('resolvePackPreparedOn', () => {
  it('a finalised snapshot is dated when it was finalised', () => {
    expect(resolvePackPreparedOn({ snapshot: { status: 'final', generated_at: '2026-02-19 05:26:18.406+00' } }))
      .toEqual({ at: '2026-02-19 05:26:18.406+00', basis: 'finalised' })
  })

  it("a draft snapshot is not — Urban Road's August pack gets the export date", () => {
    expect(resolvePackPreparedOn({
      snapshot: { status: 'draft', generated_at: '2026-09-11 20:14:47.289+00' },
      cycle: { status: 'draft', approved_at: null, snapshot_taken_at: null },
    })).toBeNull()
  })

  it('an approved or sent cycle dates the pack at its frozen snapshot, then its approval', () => {
    expect(resolvePackPreparedOn({ cycle: { status: 'sent', approved_at: '2026-09-12T01:00:00Z', snapshot_taken_at: '2026-09-12T00:59:00Z' } }))
      .toEqual({ at: '2026-09-12T00:59:00Z', basis: 'approved' })
    expect(resolvePackPreparedOn({ cycle: { status: 'approved', approved_at: '2026-09-12T01:00:00Z', snapshot_taken_at: null } }))
      .toEqual({ at: '2026-09-12T01:00:00Z', basis: 'approved' })
  })

  it('a ready-for-review cycle, or an unreadable timestamp, is no claim at all', () => {
    expect(resolvePackPreparedOn({ cycle: { status: 'ready_for_review', approved_at: '2026-09-12T01:00:00Z' } })).toBeNull()
    expect(resolvePackPreparedOn({ snapshot: { status: 'final', generated_at: 'not a date' } })).toBeNull()
    expect(resolvePackPreparedOn({})).toBeNull()
  })
})

describe('formatPackPreparedOn', () => {
  it("prints Calxa's form, in Sydney — a finalise at 20:14 UTC is the next day there", () => {
    expect(formatPackPreparedOn({ at: '2026-02-19 05:26:18.406+00', basis: 'finalised' })).toBe('19 February 2026')
    expect(formatPackPreparedOn({ at: '2026-09-11T20:14:47.289Z', basis: 'finalised' })).toBe('12 September 2026')
  })

  it('no settled date: the moment of export', () => {
    expect(formatPackPreparedOn(null, new Date('2026-09-14T01:00:00Z'))).toBe('14 September 2026')
  })
})

describe('loadPackPreparedOn', () => {
  const tables = (cycle: Record<string, unknown>[] | { error: { message: string } }) => ({
    business_profiles: [{ id: URBAN_ROAD_PROFILE, business_id: URBAN_ROAD_BIZ }],
    cfo_report_status: cycle,
  })

  it('reads the cycle row in businesses-space, even when handed the profile id', async () => {
    const sb = fakeSupabase(tables([
      { business_id: URBAN_ROAD_BIZ, period_month: '2026-08-01', status: 'sent', approved_at: '2026-09-12T01:00:00Z', snapshot_taken_at: null },
      { business_id: URBAN_ROAD_BIZ, period_month: '2026-07-01', status: 'sent', approved_at: '2026-08-10T01:00:00Z', snapshot_taken_at: null },
    ]))
    expect(await loadPackPreparedOn(sb, URBAN_ROAD_PROFILE, '2026-08', { status: 'draft', generated_at: '2026-09-11T20:14:47Z' }))
      .toEqual({ at: '2026-09-12T01:00:00Z', basis: 'approved' })
  })

  it('a finalised snapshot needs no read', async () => {
    const sb = fakeSupabase(tables({ error: { message: 'should not be read' } }))
    expect(await loadPackPreparedOn(sb, URBAN_ROAD_BIZ, '2026-08', { status: 'final', generated_at: '2026-09-12T02:00:00Z' }))
      .toEqual({ at: '2026-09-12T02:00:00Z', basis: 'finalised' })
    expect(sb.calls.map((c) => c.table)).not.toContain('cfo_report_status')
  })

  it('a failed read is the export date, not an error', async () => {
    const sb = fakeSupabase(tables({ error: { message: 'permission denied' } }))
    expect(await loadPackPreparedOn(sb, URBAN_ROAD_BIZ, '2026-08', null)).toBeNull()
  })
})
