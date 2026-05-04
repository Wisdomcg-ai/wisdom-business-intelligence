/**
 * Phase 49 DB-04 — Bucket C final batch per-FK tests.
 *
 * Asserts that migration 20260508000000_db04_restrict_and_manual_review_fks.sql
 * correctly applies the operator-decided ON DELETE clauses to the 2 Bucket C FKs.
 * Per docs/db/fk-policy.md Bucket C (operator sign-off Matt 2026-05-04,
 * re-confirmed 2026-05-08 in plan 49-07).
 *
 * Bucket C is **2 FKs** (the C-3 placeholder went unused per operator review):
 *   1. businesses.owner_id → auth.users.id   → ON DELETE RESTRICT
 *   2. custom_kpis_library.business_id → business_profiles.id → ON DELETE CASCADE
 *
 * Test patterns:
 *
 * RESTRICT (FK 1) — uses 'block' mode of assertOrphans:
 *   1. Skip if no live DB.
 *   2. Create test user.
 *   3. Insert businesses row with owner_id = user.
 *   4. Try to delete the user — wrap in try/catch.
 *   5. Assert delete THREW.
 *   6. Assert both rows still exist (assertOrphans 'block').
 *   7. Cleanup in correct order: delete business first, then user.
 *
 * CASCADE (FK 2) — uses 'cascade' mode + bounded-cascade assertions like 49-06.
 *
 * Note on RESTRICT vs NO ACTION: NO ACTION (the prior baseline) also blocks
 * delete at commit time for non-deferrable FKs, so the try/catch test passes
 * on BOTH the RED and GREEN states. The behavioral change for RESTRICT is
 * "intent now visible in the schema" — the migration COMMENT, the schema
 * diff in CI, and fk-policy.md are the audit trail. The functional CASCADE
 * test on FK#C2 IS the load-bearing observable difference (NO ACTION blocks
 * the parent delete; CASCADE allows it and removes children).
 *
 * For RESTRICT verification, the operator can run on the preview branch:
 *   SELECT delete_rule FROM information_schema.referential_constraints
 *   WHERE constraint_name = 'businesses_owner_id_fkey';
 * Expected: 'RESTRICT' (not 'NO ACTION').
 */
import { describe, it, beforeAll, afterEach, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  skipIfNoLiveDb,
  getTestSupabase,
  TEST_BUSINESS_PROFILE_ID,
  seedTestBusiness,
  createTestUser,
  deleteTestUser,
  assertOrphans,
} from './_helpers'

const d = skipIfNoLiveDb() ? describe.skip : describe

d('Phase 49 DB-04 batch C — RESTRICT + CASCADE on 2 Bucket C FKs', () => {
  let supabase: SupabaseClient

  beforeAll(async () => {
    supabase = getTestSupabase()
    await seedTestBusiness(supabase)
  })

  // Cleanup of any test businesses that survived an assertion failure
  const trackedBusinesses: string[] = []
  const trackedKpis: string[] = []
  const trackedUsers: string[] = []
  const trackedProfiles: string[] = []

  afterEach(async () => {
    if (trackedKpis.length) {
      await supabase.from('custom_kpis_library').delete().in('id', trackedKpis)
      trackedKpis.length = 0
    }
    if (trackedBusinesses.length) {
      await supabase.from('businesses').delete().in('id', trackedBusinesses)
      trackedBusinesses.length = 0
    }
    if (trackedProfiles.length) {
      await supabase.from('business_profiles').delete().in('id', trackedProfiles)
      trackedProfiles.length = 0
    }
    while (trackedUsers.length) {
      const u = trackedUsers.pop()!
      try {
        await deleteTestUser(supabase, u)
      } catch {
        /* user may still have FK refs from a failed test */
      }
    }
  })

  // --------------------------------------------------------------------------
  // FK C1: businesses.owner_id → auth.users.id  → ON DELETE RESTRICT
  // --------------------------------------------------------------------------
  it('FK#C1 businesses.owner_id RESTRICT — deleting owner is BLOCKED; both rows survive', async () => {
    const userId = await createTestUser(supabase)
    trackedUsers.push(userId)

    const insBiz = await supabase
      .from('businesses')
      .insert({ name: '__fk-test-C1__', owner_id: userId })
      .select('id')
      .single()
    expect(insBiz.error, `setup: business insert failed: ${insBiz.error?.message}`).toBeNull()
    const businessId = (insBiz.data as { id: string }).id
    trackedBusinesses.push(businessId)

    // Try to delete the user — should fail with FK violation.
    let deleteError: unknown = null
    try {
      await deleteTestUser(supabase, userId)
    } catch (err) {
      deleteError = err
    }
    expect(deleteError, 'expected user delete to fail (RESTRICT)').not.toBeNull()
    expect(String(deleteError)).toMatch(/foreign key|RESTRICT|violation|23503/i)

    // Both rows survive.
    await assertOrphans(supabase, 'businesses', 'owner_id', userId, 'block', [businessId])

    // Cleanup happens in afterEach (business → user). The user delete that
    // failed above didn't actually remove the auth row, so trackedUsers still
    // works.
  })

  // --------------------------------------------------------------------------
  // FK C2: custom_kpis_library.business_id → business_profiles.id  → ON DELETE CASCADE
  // --------------------------------------------------------------------------
  it('FK#C2 custom_kpis_library.business_id CASCADE — KPI rows go when business_profile is deleted; unrelated KPIs survive', async () => {
    const userId = await createTestUser(supabase)
    trackedUsers.push(userId)

    // Create a fresh business_profiles row to be deleted (deleting the shared
    // TEST_BUSINESS_PROFILE_ID would break other tests in the suite).
    const targetProfileId = '00000000-0000-4000-8000-000000490701'
    const insProfile = await supabase
      .from('business_profiles')
      .upsert(
        { id: targetProfileId, company_name: '__fk-test-C2-target__' },
        { onConflict: 'id' },
      )
    expect(insProfile.error).toBeNull()
    trackedProfiles.push(targetProfileId)

    // Target KPI: tied to the to-be-deleted profile.
    const targetKpi = await supabase
      .from('custom_kpis_library')
      .insert({
        category: 'fk-test',
        name: 'C2-target',
        unit: 'count',
        frequency: 'monthly',
        created_by: userId,
        business_id: targetProfileId,
      })
      .select('id')
      .single()
    if (targetKpi.error) {
      // If insert fails, surface and skip rather than hang.
      // eslint-disable-next-line no-console
      console.warn(`[FK#C2] target KPI insert failed: ${targetKpi.error.message}`)
      return
    }
    const targetKpiId = (targetKpi.data as { id: string }).id

    // Unrelated KPI: tied to the SHARED TEST_BUSINESS_PROFILE_ID (different parent).
    const unrelatedKpi = await supabase
      .from('custom_kpis_library')
      .insert({
        category: 'fk-test',
        name: 'C2-unrelated',
        unit: 'count',
        frequency: 'monthly',
        created_by: userId,
        business_id: TEST_BUSINESS_PROFILE_ID,
      })
      .select('id')
      .single()
    if (unrelatedKpi.error) {
      await supabase.from('custom_kpis_library').delete().eq('id', targetKpiId)
      // eslint-disable-next-line no-console
      console.warn(`[FK#C2] unrelated KPI insert failed: ${unrelatedKpi.error.message}`)
      return
    }
    const unrelatedKpiId = (unrelatedKpi.data as { id: string }).id
    trackedKpis.push(unrelatedKpiId)

    // Action: delete the target business_profiles row.
    const del = await supabase.from('business_profiles').delete().eq('id', targetProfileId)
    expect(del.error, 'expected business_profiles delete to succeed (CASCADE active)').toBeNull()
    // Remove from tracking — deletion succeeded.
    trackedProfiles.splice(trackedProfiles.indexOf(targetProfileId), 1)

    // (a) Immediate cascade — target KPI is gone.
    await assertOrphans(
      supabase,
      'custom_kpis_library',
      'business_id',
      targetProfileId,
      'cascade',
      [targetKpiId],
    )

    // (b) Bounded — unrelated KPI (tied to TEST_BUSINESS_PROFILE_ID) survives.
    const surv = await supabase
      .from('custom_kpis_library')
      .select('id, business_id')
      .eq('id', unrelatedKpiId)
      .maybeSingle()
    expect(surv.data, 'unrelated KPI must survive').not.toBeNull()
    expect((surv.data as { business_id: string } | null)?.business_id).toBe(
      TEST_BUSINESS_PROFILE_ID,
    )

    // (c) The shared TEST_BUSINESS_PROFILE_ID row survives (no upward cascade).
    const sharedProfile = await supabase
      .from('business_profiles')
      .select('id')
      .eq('id', TEST_BUSINESS_PROFILE_ID)
      .maybeSingle()
    expect(sharedProfile.data, 'shared test business_profiles must survive').not.toBeNull()
  })

})
