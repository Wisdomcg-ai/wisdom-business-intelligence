import { test, expect } from '@playwright/test'

/**
 * Coach-save-to-correct-business flow.
 *
 * This spec protects against regressions of the "coach saves to my business"
 * bug class fixed in commits ed9dfa7, 9d33a74, and Phase 37 (resolver
 * adoption). It also covers the Phase 42 auto-save-on-blur flow.
 *
 * ─────────────────────────────────────────────────────────────────────
 * STATUS: Most tests are `test.fixme(...)` — actively tracked,
 * not currently runnable. Phase 42 un-skipped them from `test.skip`
 * (silent) → `test.fixme` (visible failure on infra ready) so they
 * appear in every Playwright run as "fixme" markers.
 * ─────────────────────────────────────────────────────────────────────
 *
 * To make these pass:
 *
 * 1. Provision a Supabase test project separate from production.
 *    Seed it with:
 *      - One test coach user (email: test-coach@example.com)
 *      - Two test client businesses owned by different auth users
 *      - Assign both to the test coach (businesses.assigned_coach_id)
 *      - For Phase 42 test: a generated monthly_report_snapshot row
 *        for client A's current month
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
 * 3. Convert the relevant `test.fixme(...)` to `test(...)`. Run:
 *      npm run test:e2e
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
 *   - Phase 42: type into a coach-note textarea → wait debounce →
 *     SaveIndicator shows "All changes saved" → reload → note persists
 *
 * Each of the above would have failed on the pre-ed9dfa7 codebase and
 * pass after Phase 37 + Phase 42.
 */

test.describe('coach flow — saves land on correct business', () => {
  // Phase 42: Un-skipped from test.skip → test.fixme so the marker is
  // visible in the Playwright report. The body is now a no-op assertion;
  // the real implementation lives in the comment block above and will be
  // wired when the test Supabase project is provisioned. Manual UAT
  // (.planning/phases/42-monthly-report-save-flow-consolidation/42-UAT.md)
  // is the authoritative gate for Phase 42 until then.
  test.fixme('coach writes to correct client business', async () => {
    // Implement when test Supabase project is provisioned.
    // See block comment above for the exact assertions this must make.
    expect(true).toBe(true)
  })

  test.fixme('coach with no active client sees empty state (not own business)', async () => {
    // Scenario C from the manual smoke test — automate when test env exists.
    expect(true).toBe(true)
  })

  test.fixme('invariant fires if resolver returns businessId == userId', async () => {
    // Requires a malformed DB row that would force the invariant path.
    // resolveBusinessId already throws + Sentry-reports — this test would
    // verify the throw reaches the UI layer as a detectable error.
    expect(true).toBe(true)
  })

  test.fixme('session expiry preserves coach client context through re-login', async () => {
    // Regression test for middleware + auth/login next-param handling.
    expect(true).toBe(true)
  })

  // ───────────────────────────────────────────────────────────────────
  // Phase 42: monthly-report auto-save on blur (D-01, D-02, D-08, D-15)
  // ───────────────────────────────────────────────────────────────────
  // test.fixme: requires the same test Supabase project + a seeded
  // monthly_report_snapshots row for client A's current month.
  // Manual UAT (42-UAT.md, Scenarios A–I) covers this end-to-end until
  // the test infra is provisioned.
  test.fixme('Phase 42: auto-save commentary on monthly-report page', async ({ page }) => {
    // 1. Auth — log in as the seeded test coach.
    await page.goto('/coach/login')
    await page
      .getByLabel(/email/i)
      .fill(process.env.PLAYWRIGHT_TEST_COACH_EMAIL ?? '')
    await page
      .getByLabel(/password/i)
      .fill(process.env.PLAYWRIGHT_TEST_COACH_PASSWORD ?? '')
    await page.getByRole('button', { name: /sign in/i }).click()
    await page.waitForURL(/\/coach(\/|$)/, { timeout: 10_000 })

    // 2. Pick a seeded test client → navigate to monthly-report.
    const clientId = process.env.PLAYWRIGHT_TEST_CLIENT_A_ID ?? ''
    await page.goto(`/coach/clients/${clientId}/finances/monthly-report`)

    // 3. Wait for the SaveIndicator (proves auto-save hook mounted).
    await page.waitForSelector('[data-testid="save-indicator"]', {
      timeout: 15_000,
    })

    // 4. Type into a commentary textarea.
    const textarea = page
      .locator('[data-testid^="commentary-textarea-"]')
      .first()
    const testNote = `Phase 42 E2E ${Date.now()}`
    await textarea.fill(testNote)

    // 5. Wait for debounce (500ms) + save round-trip.
    await page.waitForTimeout(700)

    // 6. SaveIndicator settles on "All changes saved".
    await expect(page.locator('[data-testid="save-indicator"]')).toContainText(
      /all changes saved/i,
      { timeout: 5_000 },
    )

    // 7. Reload — note must persist (proves DB write actually happened).
    await page.reload()
    await page.waitForSelector('[data-testid^="commentary-textarea-"]', {
      timeout: 10_000,
    })
    await expect(
      page.locator('[data-testid^="commentary-textarea-"]').first(),
    ).toHaveValue(testNote)
  })
})
