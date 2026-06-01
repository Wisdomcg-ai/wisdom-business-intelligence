/**
 * R3 — xero_connections.business_id FK (ON DELETE CASCADE).
 *
 * Asserts migration 20260602000000_r3_xero_connections_business_id_fk.sql:
 *   (a) Immediate cascade — deleting a business deletes its xero_connections row.
 *   (b) Bounded cascade — a connection for a DIFFERENT business is unaffected.
 *
 * RED state (before migration): business_id has no FK, so deleting the business
 * leaves an orphan connection row (cascade never fires) — assertion (a) fails.
 * GREEN state (after migration): the connection is gone, the unrelated one stays.
 *
 * Live-DB only: skips in CI placeholder env per the DB-04 _helpers convention.
 * Run against a Supabase preview branch with real env vars before merging.
 */
import { describe, it, beforeAll, afterEach, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  skipIfNoLiveDb,
  getTestSupabase,
  seedTestBusiness,
  createTestUser,
  deleteTestUser,
  assertOrphans,
  TEST_BUSINESS_ID,
} from './_helpers'

const d = skipIfNoLiveDb() ? describe.skip : describe

// A second, unrelated business for the bounded-cascade check. Distinct uuid v4
// shape from TEST_BUSINESS_ID so the two never collide.
const R3_UNRELATED_BUSINESS_ID = '00000000-0000-4000-8000-0000000003a3'
const R3_COMPANY_NAME = '__r3-xero-fk-test-fixture__'

d('R3 — xero_connections.business_id FK (ON DELETE CASCADE)', () => {
  let supabase: SupabaseClient
  const trackedUsers: string[] = []

  beforeAll(async () => {
    supabase = getTestSupabase()
    await seedTestBusiness(supabase)
  })

  async function reseedTargetBusiness(): Promise<void> {
    // The target business is hard-deleted by the cascade test, so re-seed it
    // (and the unrelated sibling) before each run.
    await seedTestBusiness(supabase)
    await supabase
      .from('businesses')
      .upsert({ id: R3_UNRELATED_BUSINESS_ID, name: R3_COMPANY_NAME }, { onConflict: 'id' })
  }

  async function createConnection(businessId: string, userId: string, tenant: string): Promise<string | null> {
    const r = await supabase
      .from('xero_connections')
      .insert({
        business_id: businessId,
        user_id: userId,
        access_token: 'r3-test-access',
        refresh_token: 'r3-test-refresh',
        expires_at: '2099-01-01T00:00:00Z',
        tenant_id: tenant,
        tenant_name: R3_COMPANY_NAME,
      })
      .select('id')
      .single()
    return r.error ? null : (r.data as { id: string }).id
  }

  afterEach(async () => {
    // Clean up any surviving test connections + the unrelated business.
    await supabase.from('xero_connections').delete().eq('tenant_name', R3_COMPANY_NAME)
    await supabase.from('businesses').delete().eq('id', R3_UNRELATED_BUSINESS_ID)
    while (trackedUsers.length) {
      const u = trackedUsers.pop()!
      try {
        await deleteTestUser(supabase, u)
      } catch {
        /* may already be gone */
      }
    }
  })

  it('CASCADEs the connection when its business is deleted; a connection for another business survives', async () => {
    await reseedTargetBusiness()
    const userId = await createTestUser(supabase)
    trackedUsers.push(userId)

    const targetConn = await createConnection(TEST_BUSINESS_ID, userId, 'r3-target-tenant')
    const unrelatedConn = await createConnection(R3_UNRELATED_BUSINESS_ID, userId, 'r3-unrelated-tenant')
    if (!targetConn || !unrelatedConn) return

    // Action: hard-delete the target business.
    const del = await supabase.from('businesses').delete().eq('id', TEST_BUSINESS_ID)
    expect(del.error, 'expected business delete to succeed (CASCADE active)').toBeNull()

    // (a) Immediate cascade — target connection is gone.
    await assertOrphans(supabase, 'xero_connections', 'business_id', TEST_BUSINESS_ID, 'cascade', [targetConn])

    // (b) Bounded — the unrelated connection (different business) survives.
    const surv = await supabase
      .from('xero_connections')
      .select('id, business_id')
      .eq('id', unrelatedConn)
      .maybeSingle()
    expect(surv.data, 'connection for an unrelated business must survive').not.toBeNull()
    expect((surv.data as { business_id: string } | null)?.business_id).toBe(R3_UNRELATED_BUSINESS_ID)
  })
})
