/**
 * The entity the pack names — rows shaped like prod on 14 Sep 2026.
 */
import { describe, it, expect } from 'vitest'
import { resolvePackEntityName, loadPackEntityName } from '../pack-entity-name'
import { fakeSupabase } from './fake-supabase'

const URBAN_ROAD_BIZ = '28d41193-38ae-4071-a2b1-0dbea90a38fd'
const URBAN_ROAD_PROFILE = 'aabd3c49-4dc8-4aa6-a9a6-75f62ab89ff5'

describe('resolvePackEntityName', () => {
  it('a set legal name wins', () => {
    expect(resolvePackEntityName({ legalName: 'Urban Road Pty Ltd', displayName: 'Urban Road', tenantNames: [] })).toBe('Urban Road Pty Ltd')
  })

  it("one Xero organisation: its name, which is what Calxa prints", () => {
    expect(resolvePackEntityName({ legalName: null, displayName: 'Urban Road', tenantNames: ['Urban Road Pty Ltd'] })).toBe('Urban Road Pty Ltd')
  })

  it('several organisations: never one of them, never all of them — the display name', () => {
    expect(resolvePackEntityName({
      legalName: null, displayName: 'Dragon Roofing', tenantNames: ['Dragon Roofing Pty Ltd', 'EASY HAIL CLAIM PTY LTD'],
    })).toBe('Dragon Roofing')
    expect(resolvePackEntityName({
      legalName: null, displayName: 'IICT Group', tenantNames: ['IICT (Aust) Pty Ltd', 'IICT Group Limited', 'IICT Group Pty Ltd'],
    })).toBe('IICT Group')
  })

  it('nothing to go on is null, so the caller keeps what it had', () => {
    expect(resolvePackEntityName({ legalName: '  ', displayName: '', tenantNames: [] })).toBeNull()
  })
})

describe('loadPackEntityName', () => {
  const tables = (connections: Record<string, unknown>[] | { error: { message: string } }) => ({
    business_profiles: [{ id: URBAN_ROAD_PROFILE, business_id: URBAN_ROAD_BIZ }],
    businesses: [{ id: URBAN_ROAD_BIZ, name: 'Urban Road', legal_name: null }],
    xero_connections: connections,
  })

  it("reads Urban Road's single connection, in either id-space", async () => {
    const underProfile = fakeSupabase(tables([
      { business_id: URBAN_ROAD_PROFILE, tenant_id: 't-ur', tenant_name: 'Urban Road Pty Ltd', is_active: true },
      { business_id: URBAN_ROAD_PROFILE, tenant_id: 't-old', tenant_name: 'Someone Else Pty Ltd', is_active: false },
    ]))
    expect(await loadPackEntityName(underProfile, URBAN_ROAD_BIZ)).toBe('Urban Road Pty Ltd')

    const underBusiness = fakeSupabase(tables([
      { business_id: URBAN_ROAD_BIZ, tenant_id: 't-ur', tenant_name: 'Urban Road Pty Ltd', is_active: true },
    ]))
    // Handed the profile id, as some callers are.
    expect(await loadPackEntityName(underBusiness, URBAN_ROAD_PROFILE)).toBe('Urban Road Pty Ltd')
  })

  it('a failed connections read falls back to the display name, not a guess', async () => {
    const sb = fakeSupabase(tables({ error: { message: 'permission denied' } }))
    expect(await loadPackEntityName(sb, URBAN_ROAD_BIZ)).toBe('Urban Road')
  })
})
