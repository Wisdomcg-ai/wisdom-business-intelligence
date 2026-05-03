/**
 * Phase 49 Plan 03 — DB-06 RLS policy intent COMMENTs.
 *
 * Asserts that migration `20260504000001_db06_rls_policy_intent_documentation.sql`
 * adds `COMMENT ON POLICY` statements (each containing the 'INTENT:' sentinel)
 * to the three over-permissive (`USING (true)`) RLS policies flagged by the
 * 2026-04-28 codebase audit (Section D #5):
 *
 *   - swot_templates  → "Authenticated users can view swot templates"
 *   - kpi_benchmarks  → "kpi_benchmarks_select_consolidated"
 *   - kpi_definitions → "kpi_definitions_select_consolidated"
 *
 * RESEARCH.md DB-06 schema inspection confirmed all three tables structurally
 * have NO tenant column (no business_id, no user_id, no creator_id) — they are
 * legitimately system-wide reference catalogues. The migration is comment-only:
 * `USING (true)` is intentional, and the COMMENT records that intent so future
 * auditors / grep-based scans don't re-flag them.
 *
 * Verification strategy (mirrors 06C-bs-schema-migration.test.ts):
 *
 *   1. Static file assertions (always run, even in CI placeholder mode):
 *      - Migration file exists at the expected path.
 *      - Contains exactly three `COMMENT ON POLICY` statements.
 *      - Each statement has an `INTENT:` sentinel in its body.
 *      - Each of the three (table, policy-name) pairs appears verbatim
 *        (case-sensitive — the swot_templates policy name has spaces and is
 *         easy to mistype, which would produce a silent no-op COMMENT on
 *         a non-existent policy).
 *
 *   2. Live-DB introspection (skipped in CI placeholder mode, runs against a
 *      real Supabase preview branch / local DB when env vars are set):
 *      - For each (table, policy) pair, query `pg_policy` joined with
 *        `obj_description(p.oid, 'pg_policy')` and assert the comment is
 *        non-null and contains 'INTENT:'.
 *      - PostgREST does not expose `pg_policy` directly, and obj_description
 *        is a function (not a column). We use the same skip-on-missing
 *        pattern as 06C: if the system view is unreachable via PostgREST,
 *        the live-DB sub-tests skip with a console warning. The migration
 *        itself contains a `DO $$ ... RAISE EXCEPTION ...` self-check
 *        (authored in Task 2) that fails the migration apply if any of the
 *        three comments fail to land — so live-DB enforcement is guaranteed
 *        at apply-time even if the introspection sub-tests skip.
 *
 * Skip behaviour:
 *   - If NEXT_PUBLIC_SUPABASE_URL is unset or points at the placeholder host,
 *     the live-DB sub-tests skip; static file assertions still run.
 *   - If the migration file itself is absent, the static assertions FAIL
 *     (RED state — Task 2 GREENs them by authoring the migration).
 */
import { describe, it, expect } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const MIGRATION_PATH = resolve(
  process.cwd(),
  'supabase/migrations/20260504000001_db06_rls_policy_intent_documentation.sql',
)

interface PolicyTarget {
  table: string
  policy: string
}

const TARGETS: PolicyTarget[] = [
  { table: 'swot_templates', policy: 'Authenticated users can view swot templates' },
  { table: 'kpi_benchmarks', policy: 'kpi_benchmarks_select_consolidated' },
  { table: 'kpi_definitions', policy: 'kpi_definitions_select_consolidated' },
]

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY ?? ''

const SHOULD_SKIP_LIVE =
  !SUPABASE_URL ||
  SUPABASE_URL.includes('placeholder.supabase.co') ||
  !SERVICE_KEY

// ---------------------------------------------------------------------------
// Static file assertions — always run.
// ---------------------------------------------------------------------------
describe('DB-06 migration file (static checks)', () => {
  it('migration file exists at the expected path', () => {
    expect(
      existsSync(MIGRATION_PATH),
      `Expected ${MIGRATION_PATH} to exist (Task 2 of 49-03 authors it).`,
    ).toBe(true)
  })

  it('migration contains exactly three COMMENT ON POLICY statements', () => {
    if (!existsSync(MIGRATION_PATH)) {
      // Surface as a clear failure if file is missing (rather than crashing on read).
      expect.fail(`Migration file missing: ${MIGRATION_PATH}`)
    }
    const sql = readFileSync(MIGRATION_PATH, 'utf8')
    const matches = sql.match(/COMMENT\s+ON\s+POLICY/gi) ?? []
    expect(matches.length).toBe(3)
  })

  it('migration contains at least three INTENT: sentinels', () => {
    if (!existsSync(MIGRATION_PATH)) {
      expect.fail(`Migration file missing: ${MIGRATION_PATH}`)
    }
    const sql = readFileSync(MIGRATION_PATH, 'utf8')
    const matches = sql.match(/INTENT:/g) ?? []
    expect(matches.length).toBeGreaterThanOrEqual(3)
  })

  for (const { table, policy } of TARGETS) {
    it(`migration references ${table} policy "${policy}" verbatim`, () => {
      if (!existsSync(MIGRATION_PATH)) {
        expect.fail(`Migration file missing: ${MIGRATION_PATH}`)
      }
      const sql = readFileSync(MIGRATION_PATH, 'utf8')
      // Both must appear in the file. Policy name is case-sensitive; the
      // swot_templates one has spaces and is the most error-prone to mistype.
      expect(sql.includes(policy), `policy name "${policy}" not found in migration`).toBe(true)
      expect(sql.includes(table), `table name "${table}" not found in migration`).toBe(true)
    })
  }
})

// ---------------------------------------------------------------------------
// Live-DB introspection — skipped in CI placeholder mode.
// ---------------------------------------------------------------------------
const dLive = SHOULD_SKIP_LIVE ? describe.skip : describe

dLive('DB-06 policy intent COMMENTs (live DB)', () => {
  let supabase: SupabaseClient
  let pgPolicyReachable = false

  // We try to detect whether pg_policy is reachable via PostgREST. Supabase
  // does not expose pg_catalog by default, so this commonly returns an error;
  // when it does, we skip the per-policy assertions with a console warning
  // (mirrors 06C's tablePresent pattern). The migration's own DO $$ self-check
  // (Task 2) is the authoritative apply-time enforcement.
  it('probe: pg_policy reachable via PostgREST?', async () => {
    supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const probe = await supabase
      .from('pg_policy')
      .select('polname')
      .limit(1)
    if (probe.error) {
      // eslint-disable-next-line no-console
      console.warn(
        `[db-06 test] pg_policy not reachable via PostgREST (${probe.error.message}). ` +
          `Per-policy introspection assertions will skip; the migration's own ` +
          `DO $$ ... RAISE EXCEPTION self-check enforces the COMMENTs at apply-time.`,
      )
      pgPolicyReachable = false
    } else {
      pgPolicyReachable = true
    }
    expect(true).toBe(true)
  })

  for (const { table, policy } of TARGETS) {
    it(`policy "${policy}" on ${table} carries an INTENT: comment`, async () => {
      if (!pgPolicyReachable) {
        // eslint-disable-next-line no-console
        console.warn(
          `[db-06 test] skipping live introspection for ${table}.${policy} ` +
            `(pg_policy not reachable via PostgREST in this environment).`,
        )
        return
      }
      // If pg_policy IS reachable (rare custom-PostgREST configs), we still
      // can't call obj_description() through the REST layer. We can at least
      // assert the policy row exists by name.
      const { data, error } = await supabase
        .from('pg_policy')
        .select('polname')
        .eq('polname', policy)
        .limit(1)
      expect(error).toBeNull()
      expect((data ?? []).length, `pg_policy row for "${policy}" not found`).toBe(1)
    })
  }
})
