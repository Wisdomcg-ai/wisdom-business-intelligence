---
phase: 61-selective-list-sharing
plan: 06
subsystem: api+ui
tags: [coach-dashboard, ideas, sharing, breakdown, regression-pinned, headline-preservation, sentry-fallback]

# Dependency graph
requires:
  - "61-01: ideas.shared_with_all + ideas.shared_with columns exist"
  - "61-02: RLS broadened so coach reads pick up shared rows"
provides:
  - "/api/coach/client-completion response now includes ideas_total, ideas_private, ideas_team_shared, ideas_breakdown per client"
  - "coach/clients/[id] page renders conditional 'X private · Y shared with team' sub-line under the Total Ideas counter"
  - "Regression test pins the headline ideas_total against the pre-phase business-wide count"
affects:
  - "Future coach-dashboard work that wants to surface sharing nuance can read ideas_breakdown directly"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Headline-preservation pattern: extend the API response with a decomposition object (ideas_breakdown) WITHOUT shrinking the existing aggregate (ideas_total). The two are pinned by a regression test."
    - "Conditional UI sub-line: hide the breakdown when team_shared === 0 so single-user clients see no clutter (zero regression on visual surface)."
    - "Sentry-fallback for new derived fields: when the underlying SELECT errors, zero the breakdown and continue (degraded, not 500)."

key-files:
  created:
    - "src/app/api/coach/client-completion/__tests__/route.test.ts"
  modified:
    - "src/app/api/coach/client-completion/route.ts"
    - "src/app/coach/clients/[id]/page.tsx"
    - "src/components/coach/tabs/OverviewTab.tsx"

key-decisions:
  - "PRESERVE-HEADLINE semantics (option 'a' in PLAN-CHECK). ideas_total equals the pre-phase business-wide count — sharing does NOT shrink it. ideas_private + ideas_team_shared === ideas_total is a deterministic invariant pinned by Group D."
  - "Field-name reconciliation: the prompt-level <critical_constraints> named ideas_total/ideas_private/ideas_team_shared (top-level) while the plan's must-haves used ideas_breakdown.{owned, team_shared, total}. We emit BOTH — prompt names are primary, breakdown is an alias where owned===private and total===ideas_total. This satisfies both contracts without forcing one to win."
  - "Coach client page does NOT consume /api/coach/client-completion today — it runs its own direct ideas query. Rather than refactor the page onto the API (out of scope), we extended the page's own query to fetch shared_with_all + shared_with and split inline. The API route still emits the breakdown so future callers + the test suite can pin the contract."
  - "Recipient-visibility filter (Group D in the plan's behavior spec — 'teammate idea NOT shared with client-A is excluded') is NOT applied because Phase 61-02 RLS already filters the coach's read of ideas to rows the coach can see. The breakdown counts the rows that arrived, deferring visibility to RLS (single source of truth)."

patterns-established:
  - "Coach-dashboard pattern: when an aggregate gains a decomposition, expose both the aggregate (headline-preserving) AND a nested {owned, team_shared, total} alias. Pin both via regression tests."
  - "Conditional UI pattern for sharing: render the sub-line only when the shared count is > 0. Pre-phase clients see no visual change."

requirements-completed: []

# Metrics
duration: ~30min
completed: 2026-05-14
tasks-total: 4
tasks-completed: 3 (Task 4 deferred — user-side visual verification)
files-created: 1
files-modified: 3
tests-added: 14
tests-passing: 14
---

# Phase 61 Plan 06: Coach Ideas Breakdown — Summary

**Coach dashboard idea counter gains a private-vs-team-shared decomposition without shrinking the headline total, pinned by a regression test and rendered conditionally so single-user clients see no UI change.**

## Performance

- **Duration:** ~30 min
- **Started:** 2026-05-14
- **Completed:** 2026-05-14
- **Tasks:** 3 of 4 completed (Task 4 is a `checkpoint:human-verify` deferred to user — see below)
- **Files created:** 1 test file
- **Files modified:** 3 (route + page + OverviewTab)
- **Tests added:** 14
- **Tests passing:** 14/14

## Accomplishments

1. **API contract extended.** `/api/coach/client-completion` now emits `ideas_total`, `ideas_private`, `ideas_team_shared`, and `ideas_breakdown: { owned, team_shared, total }` on each client object. Pre-existing fields (`modules`, `engagement`, `alerts`, `businessId`, `businessName`, `ownerId`) are unchanged — pinned by Group F regression tests.

2. **Headline-preservation pinned.** Group D test asserts that a fixture of 12 ideas with mixed visibility (private + team-wide + specific) returns `ideas_total === 12`. Future attempts to "improve" the route by filtering the headline based on visibility will fail this test loudly.

3. **Sentry fallback path.** When the ideas SELECT errors, the route returns 200 with `{ ideas_total: 0, ideas_private: 0, ideas_team_shared: 0, ideas_breakdown: { owned: 0, team_shared: 0, total: 0 } }` instead of 500. Group E pins this.

4. **Coach client page rendering.** The page's existing direct supabase query (lines ~606-619) was extended to fetch `shared_with_all` and `shared_with`, compute `private` + `teamShared` inline, and thread both through `IdeasStats` to `OverviewTab`. `OverviewTab` renders a small sub-line "X private · Y shared with team" under the Total Ideas counter, but **only when `teamShared > 0`** — so pre-Phase-61 clients see no visual change.

5. **Test coverage.** 14 tests across 8 groups:
   - Group A (2): pre-phase shape preserved when all ideas are private
   - Group B (2): private vs team-shared split (team-wide flag and specific share)
   - Group C (2): specific-share semantics + null shared_with handling
   - Group D (1): headline-total regression pin (12-idea mixed fixture)
   - Group E (1): Sentry fallback
   - Group F (3): pre-existing fields + IDs unchanged + modules.ideas orthogonal to sharing
   - Group G (1): zero-ideas client
   - Group H (2): auth gates (401, 403) still in place

## Task Commits

1. **Task 1: RED tests** — `c13015fc` (test) — 14 failing tests pinning the new contract
2. **Task 2: GREEN route impl** — `425c7841` (feat) — route emits the breakdown
3. **Task 3: Page + OverviewTab rendering** — `b775298f` (feat) — conditional sub-line wired in

**Plan metadata commit:** _will be created after this SUMMARY lands._

## Files Created/Modified

- `src/app/api/coach/client-completion/__tests__/route.test.ts` (created) — 14 tests, ~372 lines, chainable supabase mock following the pattern from `src/app/api/todos/[id]/share/__tests__/route.test.ts`.
- `src/app/api/coach/client-completion/route.ts` (modified) — `ClientCompletion` type extended; ideas SELECT now pulls `shared_with_all`/`shared_with`; per-client mapping computes the breakdown with dedup on idea id (prevents double-counting when an idea matches both `user_id IN ownerIds` and `business_id IN businessIds` in the OR filter).
- `src/app/coach/clients/[id]/page.tsx` (modified) — `IdeasStats` shape widened with `private`/`teamShared`; direct ideas query extended; inline computation feeds both new fields into the existing prop pipeline.
- `src/components/coach/tabs/OverviewTab.tsx` (modified) — `IdeasStats` interface gains optional `private`/`teamShared`; conditional sub-line rendered under "Total Ideas" cell.

## Decisions Made

1. **Headline preservation over visibility-filtering.** The PLAN-CHECK flagged a semantics ambiguity between (a) "preserve pre-phase total" and (b) "adopt new visibility-filtered total". The prompt's `<critical_constraints>` resolved this in favor of (a): `ideas_total` equals the pre-phase business-wide count. Group D pins this with a 12-idea mixed-visibility fixture.

2. **Field-name reconciliation.** Prompt asked for `ideas_total/ideas_private/ideas_team_shared`; plan asked for `ideas_breakdown.{owned, team_shared, total}`. We emit both. `ideas_breakdown.owned === ideas_private` and `ideas_breakdown.total === ideas_total`. Test Group A pins the equivalence.

3. **Dedup by idea id in the per-client mapping.** The pre-phase ideas SELECT used an OR filter (`user_id IN ownerIds, business_id IN businessIds`) which could return the same idea twice when both clauses match. The route's pre-phase code grouped by `user_id` and by `business_id` separately and summed the buckets — a row matching both would have been double-counted. The new breakdown dedups by `row.id` before counting, which is a small **correctness fix** (Rule 1) for `ideas_total` reporting at the per-client level. Acknowledged in deviations below.

4. **Page consumes its own query, not the API.** The plan assumed `coach/clients/[id]/page.tsx` lines 606-621 rendered fields from `/api/coach/client-completion`. It doesn't — those lines are a direct supabase fetch. Refactoring the page onto the API was out of scope. The page was extended in place; the API contract was honored and tested as a separate artifact.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Plan's API/UI wiring assumption did not match the codebase.**
- **Found during:** Task 1 (initial code reconnaissance for the test file).
- **Issue:** PLAN.md describes the coach client page as consuming `/api/coach/client-completion` and rendering "existing idea counters at lines 606-621". In reality, the response from that route only contains `modules`/`engagement`/`alerts` — no idea counts. The page runs its own direct supabase query at the cited line range. The plan's task descriptions and the prompt's `<critical_constraints>` field names (`ideas_total/ideas_private/ideas_team_shared` top-level) diverge from the plan's must-have field names (`ideas_breakdown.{owned, team_shared, total}` nested).
- **Fix:** Honored both contracts. Route emits both shapes simultaneously. Page consumes its own extended query, so the breakdown reaches the UI without a refactor of the page onto the API. Tests pin both contracts.
- **Files modified:** route.ts, page.tsx, OverviewTab.tsx, route.test.ts.
- **Verification:** 14/14 tests pass; type-check on changed files clean.
- **Committed in:** `425c7841`, `b775298f`.

**2. [Rule 1 — Bug] Per-client `ideas_total` could double-count rows matched by both legs of the OR filter.**
- **Found during:** Task 2 (implementing the per-client mapping).
- **Issue:** The pre-phase code built `ideasByUser` and `ideasByBusiness` group-by maps and summed the bucket sizes for the `modules.ideas` boolean. An idea where `user_id === ownerId AND business_id === bizId` would have been counted in both groups. The `modules.ideas` boolean wasn't sensitive to this (any positive count flips to "completed"), but the new `ideas_total` IS sensitive.
- **Fix:** Dedup by `row.id` before counting at the per-client level. Group A test (which uses 3 owner-owned business-tagged ideas) confirms `ideas_total === 3`, not 6.
- **Files modified:** route.ts.
- **Verification:** Group A + Group D tests pass.
- **Committed in:** `425c7841`.

---

**Total deviations:** 2 auto-fixed (1 blocking field-name + wiring mismatch, 1 dedup correctness fix).
**Impact on plan:** No scope creep. Both deviations were required to satisfy the prompt's `<critical_constraints>` and produce correct counts.

## Authentication Gates

None.

## Issues Encountered

None blocking. One minor note: the project-wide `npx tsc --noEmit` surfaces pre-existing errors in unrelated files (parallel work in `src/app/finances/forecast/components/wizard-v4/ForecastWizardV4 2.tsx`, scripts, etc.). Confirmed none of those errors are in the four files touched by this plan.

## Task 4 (Human Verification) — Deferred to User

Task 4 is a `checkpoint:human-verify` requiring a logged-in coach session and a dev server. Because this executor runs in parallel within Wave 3 with no continuation path back to a human, the visual verification is deferred to the user. **Recommended verification steps when convenient:**

1. Start the dev server (`npm run dev` or `vercel dev`).
2. Log in as a coach who has ≥2 clients.
3. Pick a client whose business has at least one team-shared idea (create one via the share dialog from 61-05 if needed). Navigate to `/coach/clients/[id]`. Confirm the Ideas Journal card now shows "X private · Y shared with team" under the "Total Ideas" cell, and the headline total matches the pre-phase number.
4. Pick a client whose business has zero shared ideas. Confirm the same card renders the headline total alone — no sub-line.
5. Open the Network tab and inspect `/api/coach/client-completion` — confirm each client object carries `ideas_total`, `ideas_private`, `ideas_team_shared`, `ideas_breakdown`.

If any of these reveals a problem, the most likely culprit is the field-name reconciliation between the API and the page: the API returns snake_case but the page reads from its own direct query, so a future change that pivots the page onto the API will need a name mapping.

## Deferred Items

None beyond Task 4.

## User Setup Required

None.

## Next Phase Readiness

**Phase verification readiness (after 61-05 lands):**

A verifier can now confirm the full Phase 61 story end-to-end:
- DB columns + RLS (61-01, 61-02) — verifier checks migration applied.
- Service layer (61-03) — verifier runs `npx vitest run src/lib/services/__tests__/*.share.test.ts` (56 tests).
- API routes (61-04 in parallel Wave 3) — verifier runs the 61-04 test suite.
- UI share dialog + recipient badges (61-05) — verifier opens the share dialog on a todo and an idea.
- Coach breakdown (this plan, 61-06) — verifier opens a coach client page and confirms the sub-line renders, then inspects `/api/coach/client-completion` response for the new fields.

Cross-cutting verifier check: with all 5 plans landed, a coach viewing a client whose teammate has shared an idea with the entire team should see (a) the idea in the client's view, (b) "Shared by …" badge per 61-05, (c) breakdown sub-line per 61-06. The Group D test from this plan is the load-bearing regression — any future change that touches the headline count will need to keep it passing.

## Self-Check: PASSED

- `src/app/api/coach/client-completion/__tests__/route.test.ts` — FOUND, 14 tests pass
- `src/app/api/coach/client-completion/route.ts` — FOUND, modified
- `src/app/coach/clients/[id]/page.tsx` — FOUND, modified
- `src/components/coach/tabs/OverviewTab.tsx` — FOUND, modified
- Commit `c13015fc` (test RED) — FOUND in `git log`
- Commit `425c7841` (feat GREEN route) — FOUND in `git log`
- Commit `b775298f` (feat page + OverviewTab) — FOUND in `git log`

---
*Phase: 61-selective-list-sharing*
*Completed: 2026-05-14*
