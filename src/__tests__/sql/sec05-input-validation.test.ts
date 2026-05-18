/**
 * Phase 46 Plan 46-03 — SEC-05 SECURITY DEFINER input validation.
 *
 * Tests two SECURITY DEFINER functions in baseline_schema.sql:
 *   - create_quarterly_swot(p_user_id, p_quarter, p_year)
 *   - create_test_user(p_email, p_role)
 *
 * Both are granted to anon/authenticated/service_role (lines 13394-13402 of
 * 00000000000000_baseline_schema.sql), so anyone with the anon key can call
 * them. Without input validation, callers can:
 *   - Pass quarter '7' or '0' (out-of-range) and silently insert a bad row.
 *   - Pass year 9999 and create a "year-9999 bomb".
 *   - Pass any role string into system_roles (the table CHECK constraint
 *     `system_roles_role_check` would catch unknown roles, but the error
 *     surface is a generic "violates check constraint" message instead of
 *     a clear "must be one of client/coach/super_admin").
 *
 * RED state (pre-migration): tests 1, 2, 3 fail because the original SQL
 *   silently accepts out-of-range quarter/year. Test 5 fails with a generic
 *   constraint-violation error rather than the explicit validation message.
 *
 * GREEN state (post-migration 20260503000000_sec05_security_definer_input_validation):
 *   all 5 non-skipped tests pass.
 *
 * Skip behaviour:
 *   - If NEXT_PUBLIC_SUPABASE_URL is unset or points at the placeholder host,
 *     the suite is skipped. CI does not have a live Supabase project.
 *   - If SUPABASE_SERVICE_ROLE_KEY is unset, also skip (anon key would also
 *     work for the validation tests since both functions are granted to anon,
 *     but service_role is consistent with the rest of the SQL test suite and
 *     avoids RLS surprises on the create_test_user happy-path test).
 *
 * Pre-flight grep results (recorded for the PR description):
 *   - system_roles.role CHECK constraint at baseline_schema.sql:5153 defines
 *     canonical list as ('super_admin', 'coach', 'client'). The migration in
 *     Task 2 mirrors this list exactly.
 *   - create_quarterly_swot defined at baseline_schema.sql:499.
 *   - create_test_user defined at baseline_schema.sql:515.
 *   - GRANT statements at baseline_schema.sql:13394-13402.
 */
import { describe, it, expect } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const SERVICE_KEY =
  process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY ?? ''

const SHOULD_SKIP =
  !SUPABASE_URL ||
  SUPABASE_URL.includes('placeholder.supabase.co') ||
  !SERVICE_KEY

const d = SHOULD_SKIP ? describe.skip : describe

// Sentinel UUID used for negative-path tests where the function is expected to
// raise BEFORE the INSERT happens, so RLS / auth.uid() / FK don't matter.
const ZERO_UUID = '00000000-0000-0000-0000-000000000000'

function makeClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

d('SEC-05: create_quarterly_swot input validation', () => {
  it('rejects quarter > 4 with explicit "must be 1..4" message', async () => {
    const supabase = makeClient()
    const { error } = await supabase.rpc('create_quarterly_swot', {
      p_user_id: ZERO_UUID,
      p_quarter: '7',
      p_year: 2025,
    })
    expect(error, 'expected an error from quarter=7').toBeTruthy()
    expect(error?.message ?? '').toMatch(/must be 1\.\.4/)
  })

  it('rejects quarter = 0 (zero-indexed mistake)', async () => {
    const supabase = makeClient()
    const { error } = await supabase.rpc('create_quarterly_swot', {
      p_user_id: ZERO_UUID,
      p_quarter: '0',
      p_year: 2025,
    })
    expect(error, 'expected an error from quarter=0').toBeTruthy()
    expect(error?.message ?? '').toMatch(/must be 1\.\.4/)
  })

  it('rejects p_year < 2020 with explicit "p_year must be 2020..2100" message', async () => {
    const supabase = makeClient()
    const { error } = await supabase.rpc('create_quarterly_swot', {
      p_user_id: ZERO_UUID,
      p_quarter: '2',
      p_year: 1999,
    })
    expect(error, 'expected an error from year=1999').toBeTruthy()
    expect(error?.message ?? '').toMatch(/p_year must be 2020\.\.2100/)
  })

  // The happy-path call inserts into public.swot_analyses with auth.uid() as
  // created_by. Running it from a service-role client makes auth.uid() NULL,
  // and the INSERT may fail on a NOT NULL / FK constraint downstream of the
  // validation guard. The validation tests above are sufficient to prove the
  // guard fires; happy-path regression is covered by the existing wizard
  // integration coverage in src/app/quarterly-review/.../SwotUpdateStep.tsx
  // (4 callers, all passing quarter values 1..4 — verified in RESEARCH.md).
  it.skip('happy path: quarter=2 year=2025 returns a UUID (covered by wizard integration)', async () => {
    // intentionally skipped — see comment above
  })
})

d('SEC-05: create_test_user input validation', () => {
  it('rejects unknown role with explicit "must be one of" message', async () => {
    const supabase = makeClient()
    const { error } = await supabase.rpc('create_test_user', {
      p_email: 'test@example.com',
      p_role: 'malicious_role',
    })
    expect(error, 'expected an error from unknown role').toBeTruthy()
    expect(error?.message ?? '').toMatch(/must be one of/)
  })

  it('accepts canonical role "client" and returns a UUID', async () => {
    const supabase = makeClient()
    const { data, error } = await supabase.rpc('create_test_user', {
      p_email: `test+sec05+${Date.now()}@example.com`,
      p_role: 'client',
    })
    expect(error).toBeNull()
    // RPC returns the new uuid as a string
    expect(typeof data).toBe('string')
    expect(data).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
  })
})
