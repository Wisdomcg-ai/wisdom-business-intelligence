import { describe, it, expect } from 'vitest'
import { dedupeKpiRowsByRecency } from '@/app/goals/services/kpi-dedupe'

const PROFILE = '61a7809f-c420-4300-b08c-c8fd2729ff8f' // canonical business_profiles.id
const BUSINESS = '78db3c56-b4e8-4241-b82b-f67d6f91ee75' // sibling businesses.id

describe('dedupeKpiRowsByRecency (dual-ID business_kpis)', () => {
  it('returns rows unchanged when there are no cross-id duplicates', () => {
    const rows = [
      { kpi_id: 'a', business_id: PROFILE, updated_at: '2026-01-01' },
      { kpi_id: 'b', business_id: PROFILE, updated_at: '2026-01-02' },
    ]
    const out = dedupeKpiRowsByRecency(rows, PROFILE)
    expect(out.map(r => r.kpi_id).sort()).toEqual(['a', 'b'])
  })

  it('keeps the MOST-RECENTLY-UPDATED row so a newer sibling-id save is not reverted', () => {
    // The newer edit landed under the businesses.id; the profile-id row is stale.
    const rows = [
      { kpi_id: 'rev', business_id: PROFILE, updated_at: '2026-01-28T00:00:00Z' },
      { kpi_id: 'rev', business_id: BUSINESS, updated_at: '2026-06-19T05:23:00Z' },
    ]
    const out = dedupeKpiRowsByRecency(rows, PROFILE)
    expect(out).toHaveLength(1)
    expect(out[0].business_id).toBe(BUSINESS) // newer wins, not the canonical
  })

  it('on an exact timestamp tie, prefers the canonical profile-id row', () => {
    const ts = '2026-06-19T00:00:00Z'
    const rows = [
      { kpi_id: 'x', business_id: BUSINESS, updated_at: ts },
      { kpi_id: 'x', business_id: PROFILE, updated_at: ts },
    ]
    const out = dedupeKpiRowsByRecency(rows, PROFILE)
    expect(out).toHaveLength(1)
    expect(out[0].business_id).toBe(PROFILE)
  })

  it('falls back to created_at when updated_at is missing', () => {
    const rows = [
      { kpi_id: 'y', business_id: PROFILE, updated_at: null, created_at: '2026-01-01' },
      { kpi_id: 'y', business_id: BUSINESS, updated_at: null, created_at: '2026-05-01' },
    ]
    const out = dedupeKpiRowsByRecency(rows, PROFILE)
    expect(out).toHaveLength(1)
    expect(out[0].created_at).toBe('2026-05-01')
  })

  it('collapses many duplicates down to one row per kpi_id', () => {
    const rows = [
      { kpi_id: 'a', business_id: PROFILE, updated_at: '2026-01-01' },
      { kpi_id: 'a', business_id: BUSINESS, updated_at: '2026-02-01' },
      { kpi_id: 'b', business_id: BUSINESS, updated_at: '2026-01-01' },
      { kpi_id: 'b', business_id: PROFILE, updated_at: '2026-03-01' },
      { kpi_id: 'c', business_id: PROFILE, updated_at: '2026-01-01' },
    ]
    const out = dedupeKpiRowsByRecency(rows, PROFILE)
    expect(out).toHaveLength(3)
    expect(out.find(r => r.kpi_id === 'a')?.business_id).toBe(BUSINESS) // newer
    expect(out.find(r => r.kpi_id === 'b')?.business_id).toBe(PROFILE) // newer
  })
})
