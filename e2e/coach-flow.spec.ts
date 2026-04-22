import { test, expect } from '@playwright/test'

/**
 * Coach-save-to-correct-business flow.
 *
 * This spec protects against regressions of the "coach saves to my business"
 * bug class fixed in commits ed9dfa7, 9d33a74, and Phase 37 (resolver
 * adoption).
 *
 * ─────────────────────────────────────────────────────────────────────
 * SKIPPED UNTIL a seeded test Supabase project is available. To un-skip:
 * ─────────────────────────────────────────────────────────────────────
 *
 * 1. Provision a Supabase test project separate from production.
 *    Seed it with:
 *      - One test coach user (email: test-coach@example.com)
 *      - Two test client businesses owned by different auth users
 *      - Assign both to the test coach (businesses.assigned_coach_id)
 *    Seed SQL can live in supabase/seed-test.sql.
 *
 * 2. Create a .env.test file with:
 *      NEXT_PUBLIC_SUPABASE_URL=<test-project-url>
 *      NEXT_PUBLIC_SUPABASE_ANON_KEY=<test-project-anon-key>
 *      PLAYWRIGHT_TEST_COACH_EMAIL=test-coach@example.com
 *      PLAYWRIGHT_TEST_COACH_PASSWORD=<...>
 *      PLAYWRIGHT_TEST_CLIENT_A_ID=<businesses.id for client A>
 *      PLAYWRIGHT_TEST_CLIENT_B_ID=<businesses.id for client B>
 *
 * 3. Remove `test.skip(...)` below. Run: `npm run test:e2e`
 *
 * The implemented tests WILL:
 *   - Log in as coach
 *   - Open client A → save a goal → verify goal.business_id === clientA.id
 *   - Switch to client B → save goal → verify goal.business_id === clientB.id
 *     (confirms no bleed between clients)
 *   - Hit /finances/monthly-report directly with no active client →
 *     verify empty state renders (NOT coach's own business data)
 *   - Simulate session expiry mid-flow (clear Supabase cookie) →
 *     re-login → verify return to client B's file, not coach dashboard
 *
 * Each of the above would have failed on the pre-ed9dfa7 codebase and
 * pass after Phase 37.
 */

test.describe('coach flow — saves land on correct business', () => {
  test.skip('coach writes to correct client business', async () => {
    // Implement when test Supabase project is provisioned.
    // See block comment above for the exact assertions this must make.
    expect(true).toBe(true)
  })

  test.skip('coach with no active client sees empty state (not own business)', async () => {
    // Scenario C from the manual smoke test — automate when test env exists.
    expect(true).toBe(true)
  })

  test.skip('invariant fires if resolver returns businessId == userId', async () => {
    // Requires a malformed DB row that would force the invariant path.
    // resolveBusinessId already throws + Sentry-reports — this test would
    // verify the throw reaches the UI layer as a detectable error.
    expect(true).toBe(true)
  })

  test.skip('session expiry preserves coach client context through re-login', async () => {
    // Regression test for middleware + auth/login next-param handling.
    expect(true).toBe(true)
  })
})
