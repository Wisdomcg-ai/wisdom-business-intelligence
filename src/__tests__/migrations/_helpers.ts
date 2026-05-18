/**
 * Phase 49 DB-04 — Shared migration-test helpers.
 *
 * Reused by:
 *   - src/__tests__/migrations/db-04-set-null-batch-1.test.ts (plan 49-04)
 *   - src/__tests__/migrations/db-04-set-null-batch-2.test.ts (plan 49-05)
 *   - src/__tests__/migrations/db-04-cascade.test.ts            (plan 49-06)
 *   - src/__tests__/migrations/db-04-restrict.test.ts           (plan 49-07)
 *
 * Per RESEARCH.md DB-04 lines 421-446 and PLAN 49-04 Task 1.
 *
 * Skip behaviour mirrors the 06C convention: if NEXT_PUBLIC_SUPABASE_URL is
 * unset, points at the placeholder host, or SUPABASE_SERVICE_ROLE_KEY is
 * missing, every test calling `skipIfNoLiveDb()` returns early. This keeps CI
 * green (where env vars are stubs) while letting the operator run the suite
 * against a Supabase preview branch with real env vars before merging the PR.
 *
 * The `'block'` mode of `assertOrphans` does NOT call `deleteTestUser` itself —
 * the calling test wraps `deleteTestUser` in try/catch and asserts the catch
 * fired, then calls this helper to confirm both sides survived. This keeps
 * RESTRICT-specific knowledge out of the generic helper.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { describe, it, expect } from 'vitest'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const SERVICE_KEY =
  process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY ?? ''

/**
 * Returns true when the test should be skipped because no live Supabase project
 * is reachable (CI placeholder env vars). Tests use `if (skipIfNoLiveDb()) return`
 * at the top of each `it()` block.
 */
export function skipIfNoLiveDb(): boolean {
  return (
    !SUPABASE_URL ||
    SUPABASE_URL.includes('placeholder.supabase.co') ||
    !SERVICE_KEY
  )
}

/**
 * Returns a Supabase service-role client (bypasses RLS for test setup/teardown).
 * Throws if env vars are missing — call `skipIfNoLiveDb()` first to gate.
 */
export function getTestSupabase(): SupabaseClient {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    throw new Error(
      'getTestSupabase() called without NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY set. ' +
        'Use skipIfNoLiveDb() to gate tests before invoking this helper.',
    )
  }
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

/**
 * Deterministic test fixture business_id, matching the 06C convention
 * (uuid-v4 shape derived from a static namespace tag). Used by
 * `seedTestBusiness` and per-FK tests that need a parent business row.
 */
export const TEST_BUSINESS_ID = '00000000-0000-4000-8000-000000490401'

/**
 * Deterministic test fixture business_profile_id (separate from
 * `TEST_BUSINESS_ID` because the project's dual-id system has both
 * `businesses.id` and `business_profiles.id`).
 */
export const TEST_BUSINESS_PROFILE_ID = '00000000-0000-4000-8000-000000490402'

const TEST_COMPANY_NAME = '__phase-49-db04-test-fixture__'

/**
 * Idempotent insert of the test business + business_profile rows. Safe to call
 * multiple times in the same suite. Uses upsert with onConflict on the PK so
 * concurrent runs don't collide.
 */
export async function seedTestBusiness(supabase: SupabaseClient): Promise<void> {
  const { error: bpErr } = await supabase
    .from('business_profiles')
    .upsert(
      { id: TEST_BUSINESS_PROFILE_ID, company_name: TEST_COMPANY_NAME },
      { onConflict: 'id' },
    )
  if (bpErr) {
    throw new Error(
      `seedTestBusiness: failed to upsert business_profiles: ${bpErr.message}`,
    )
  }
  const { error: bErr } = await supabase
    .from('businesses')
    .upsert(
      { id: TEST_BUSINESS_ID, name: TEST_COMPANY_NAME },
      { onConflict: 'id' },
    )
  if (bErr) {
    throw new Error(
      `seedTestBusiness: failed to upsert businesses: ${bErr.message}`,
    )
  }
}

/**
 * Creates a test user via Supabase Admin API. Returns the new user's UUID.
 * Uses a unique email per call (timestamp + random suffix) so concurrent runs
 * never collide on email-uniqueness.
 */
export async function createTestUser(supabase: SupabaseClient): Promise<string> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const email = `phase49-fk-test-${suffix}@example.com`
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    email_confirm: true,
    password: `phase49-${suffix}-Pwd!`,
  })
  if (error || !data?.user?.id) {
    throw new Error(
      `createTestUser failed: ${error?.message ?? 'no user returned'}`,
    )
  }
  return data.user.id
}

/**
 * Deletes a test user via Supabase Admin API. May throw if the FK under test
 * has ON DELETE NO ACTION / RESTRICT and a dependent row references the user
 * — this is the expected RED state of DB-04 tests before the migration applies.
 */
export async function deleteTestUser(
  supabase: SupabaseClient,
  userId: string,
): Promise<void> {
  const { error } = await supabase.auth.admin.deleteUser(userId)
  if (error) {
    throw new Error(`deleteTestUser(${userId}) failed: ${error.message}`)
  }
}

/**
 * Asserts the post-deletion state of a dependent row that referenced a now-deleted
 * parent (user or other parent record).
 *
 * Modes:
 *   - `'null'`   (Bucket A — SET NULL): the dependent row still exists; the FK
 *     column equals NULL. Queries for rows where `<fkColumn> IS NULL` and
 *     `id IN (<dependentRowIds>)` and asserts the count equals
 *     `dependentRowIds.length`.
 *   - `'cascade'` (Bucket B — CASCADE): the dependent row is gone. Queries
 *     `id IN (<dependentRowIds>)` and asserts zero rows remain.
 *   - `'block'`  (Bucket C — RESTRICT): does NOT call `deleteTestUser` itself.
 *     The test wraps `deleteTestUser` in try/catch first and confirms the catch
 *     fired; this helper then asserts the dependent row is unchanged
 *     (FK column still equals the parent id, and the parent's row count > 0
 *     can be verified by the caller separately).
 *
 * @param supabase service-role client
 * @param table public schema table name
 * @param fkColumn the FK column under test
 * @param parentId the id of the deleted (or attempted-deleted) parent row
 * @param expected behaviour mode
 * @param dependentRowIds the ids of the dependent rows that referenced the parent
 *                        (required for 'null' and 'cascade' modes; optional for 'block')
 */
export async function assertOrphans(
  supabase: SupabaseClient,
  table: string,
  fkColumn: string,
  parentId: string,
  expected: 'null' | 'cascade' | 'block',
  dependentRowIds: string[] = [],
): Promise<void> {
  if (expected === 'null') {
    if (dependentRowIds.length === 0) {
      throw new Error(
        `assertOrphans('null') requires dependentRowIds to verify SET NULL behaviour on ${table}.${fkColumn}`,
      )
    }
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .in('id', dependentRowIds)
    if (error) {
      throw new Error(
        `assertOrphans('null') select on ${table}: ${error.message}`,
      )
    }
    const rows = (data ?? []) as Array<Record<string, unknown>>
    expect(
      rows.length,
      `expected ${dependentRowIds.length} dependent rows of ${table} to survive parent deletion`,
    ).toBe(dependentRowIds.length)
    for (const row of rows) {
      expect(
        row[fkColumn],
        `expected ${table}.${fkColumn} to be NULL after parent ${parentId} deleted`,
      ).toBeNull()
    }
    return
  }

  if (expected === 'cascade') {
    if (dependentRowIds.length === 0) {
      throw new Error(
        `assertOrphans('cascade') requires dependentRowIds to verify CASCADE behaviour on ${table}.${fkColumn}`,
      )
    }
    const { data, error } = await supabase
      .from(table)
      .select('id')
      .in('id', dependentRowIds)
    if (error) {
      throw new Error(
        `assertOrphans('cascade') select on ${table}: ${error.message}`,
      )
    }
    expect(
      data?.length ?? 0,
      `expected dependent rows of ${table} to be CASCADE-deleted with parent ${parentId}`,
    ).toBe(0)
    return
  }

  if (expected === 'block') {
    // RESTRICT: dependent row should be unchanged, FK column still equals parentId.
    if (dependentRowIds.length === 0) {
      // Caller didn't track ids; just confirm at least one row exists with that fk.
      const { data, error } = await supabase
        .from(table)
        .select('id')
        .eq(fkColumn, parentId)
        .limit(1)
      if (error) {
        throw new Error(
          `assertOrphans('block') select on ${table}: ${error.message}`,
        )
      }
      expect(
        data?.length ?? 0,
        `expected ${table}.${fkColumn} = ${parentId} row to survive blocked deletion`,
      ).toBeGreaterThan(0)
      return
    }
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .in('id', dependentRowIds)
    if (error) {
      throw new Error(
        `assertOrphans('block') select on ${table}: ${error.message}`,
      )
    }
    const rows = (data ?? []) as Array<Record<string, unknown>>
    expect(
      rows.length,
      `expected dependent rows of ${table} to survive blocked deletion of parent ${parentId}`,
    ).toBe(dependentRowIds.length)
    for (const row of rows) {
      expect(
        row[fkColumn],
        `expected ${table}.${fkColumn} to still equal ${parentId} after blocked delete`,
      ).toBe(parentId)
    }
    return
  }

  throw new Error(`assertOrphans: unknown expected mode '${expected as string}'`)
}

// --- smoke test ----------------------------------------------------------
// Runs in CI placeholder env to confirm skipIfNoLiveDb() correctly gates.
describe('Phase 49 DB-04 helpers — smoke', () => {
  it('skipIfNoLiveDb() returns true in CI placeholder mode', () => {
    if (
      !SUPABASE_URL ||
      SUPABASE_URL.includes('placeholder.supabase.co') ||
      !SERVICE_KEY
    ) {
      expect(skipIfNoLiveDb()).toBe(true)
    } else {
      // On a live preview branch, the helper should NOT skip.
      expect(skipIfNoLiveDb()).toBe(false)
    }
  })

  it('TEST_BUSINESS_ID is a valid uuid v4 shape', () => {
    expect(TEST_BUSINESS_ID).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    )
  })
})
