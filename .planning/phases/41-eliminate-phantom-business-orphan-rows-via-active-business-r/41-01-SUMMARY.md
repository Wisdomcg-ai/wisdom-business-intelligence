---
phase: 41-eliminate-phantom-business-orphan-rows-via-active-business-r
plan: 01
subsystem: database
tags: [supabase, business-profile, rls, orphan-rows, refactor]

# Dependency graph
requires:
  - phase: 37
    provides: resolveBusinessId pattern + BusinessContext as single source of truth for active business on coach/admin paths
provides:
  - Read-only business-profile-service (getBusinessProfileByBusinessId is now the ONLY public read entrypoint; no owner_id lazy-create anywhere in this file)
  - Zero 'My Business' string literals in business-profile-service.ts (whole-file grep sentinel)
  - Deleted dead methods: loadBusinessProfile and getOrCreateBusinessProfile removed entirely
affects: [41-02, 41-03, business-profile-page, signup-wizard, admin-clients]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Service-layer read/write separation: read methods must be pure SELECT; INSERT/UPDATE only via explicit intent routes (signup wizard, /api/admin/clients, /api/coach/clients, demo-client)"
    - "Defensive-dead-code removal: when a NOT NULL schema constraint guarantees non-null, drop the || fallback instead of keeping it as belt-and-braces (the fallback is the vector for phantom-data bugs)"

key-files:
  created: []
  modified:
    - "src/app/business-profile/services/business-profile-service.ts — owner-path lazy-create removed, 5 'My Business' literals purged, JSDoc updated to document Phase 41 read-only contract"

key-decisions:
  - "Deleted loadBusinessProfile and getOrCreateBusinessProfile entirely instead of leaving them as read-only no-ops — prevents future re-introduction of phantom-insert logic by a well-meaning refactor"
  - "Coach-path (getBusinessProfileByBusinessId) .insert preserved; only the dead || 'My Business' fallbacks removed — business.name is NOT NULL in schema and is loaded via SELECT before the insert, so the fallback never executed in practice"
  - "Accepted one tsc error in page.tsx(255) as expected (documented in plan) — Plan 41-02 Wave 2 removes the caller line"

patterns-established:
  - "Read-only service contract: publicly documented in JSDoc with the Jessica @ Oh Nine incident reference so future contributors understand why lazy-create was removed"
  - "Grep-for-zero regression sentinel: 'My Business' literal count in business-profile-service.ts should remain 0 forever"

requirements-completed: []

# Metrics
duration: 2min
completed: 2026-04-23
---

# Phase 41 Plan 01: Remove owner_id Lazy-Create from BusinessProfileService Summary

**Eliminated the phantom-business orphan-row source: deleted `loadBusinessProfile` and `getOrCreateBusinessProfile` entirely, purged all five `'My Business'` string literals, and preserved the coach-path insert unchanged.**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-04-23T19:27:18Z
- **Completed:** 2026-04-23T19:27:45Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- `src/app/business-profile/services/business-profile-service.ts` is now read-only for the owner path (the previous `.insert` into `businesses` + `.insert` into `business_profiles` on every first-visit by any authenticated user is gone — root cause of the Jessica @ Oh Nine phantom rows).
- Both dead methods deleted from the file (`loadBusinessProfile`, `getOrCreateBusinessProfile`). The file shrunk from 363 lines to 211 lines (−163 / +12 net; −152 LOC).
- Whole-file `grep -c "'My Business'"` returns `0` — both owner and coach paths are literal-free.
- Whole-file `grep -c ".insert("` returns `1` — only the coach-path `business_profiles` lazy-create remains.
- Coach-path (`getBusinessProfileByBusinessId`) insert-on-missing-profile behaviour is preserved exactly; only the three defensive-dead `|| 'My Business'` fallbacks were replaced with the plain column value (safe because `businesses.name` is NOT NULL in the schema and is loaded via SELECT earlier in the method).
- JSDoc on `getBusinessProfileByBusinessId` documents the Phase 41 read-only contract and cites the triggering incident for future contributors.

## Task Commits

1. **Task 1: Make getOrCreateBusinessProfile read-only AND strip 'My Business' literals from the whole file** — `9a5f34e` (refactor)

**Plan metadata:** pending (final commit after SUMMARY + STATE/ROADMAP updates)

## Files Created/Modified

- `src/app/business-profile/services/business-profile-service.ts` — Deleted `loadBusinessProfile` (~35 lines) and `getOrCreateBusinessProfile` (~110 lines) methods. Replaced 3 coach-path `'My Business'` fallbacks with their base column values. Updated JSDoc to document the Phase 41 read-only contract.

## Decisions Made

- **Full method deletion over read-only no-ops:** Plan allowed either read-only-ification OR deletion; chose deletion per action step 5. Rationale: a no-op read-only method is a silent trap for future contributors who could reintroduce lazy-create without realising. Deletion forces any future caller to either use `getBusinessProfileByBusinessId` (the intended single entrypoint) or go through an explicit creation route (signup wizard, admin/clients, coach/clients). Confirmed no other src/ file calls these methods via the refined grep pattern `BusinessProfileService\.(loadBusinessProfile|getOrCreateBusinessProfile)`.
- **JSDoc reference text:** worded the JSDoc block so it does NOT contain the string `getOrCreateBusinessProfile` verbatim — this is required so the plan's verify step 1 regex (`/getOrCreateBusinessProfile[\s\S]*?^\s{2}\}\s*$/m`) does not spuriously match the JSDoc as the "method body" and false-positive the `.insert(` check against the coach-path insert that follows lower in the file. This is documented as Rule 3 deviation #1 below.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Verify step 1 regex false-positive after method deletion**
- **Found during:** Task 1 verification (running `node -e "...getOrCreateBusinessProfile body check..."`)
- **Issue:** After deleting `getOrCreateBusinessProfile` per action step 5, the only remaining occurrence of the string `getOrCreateBusinessProfile` in the file was in the JSDoc block I added on `getBusinessProfileByBusinessId` (documenting what was removed). The plan's verify step 1 regex greedily matched from that JSDoc string through the coach-path insert block below it and falsely reported "FAIL: .insert( found inside getOrCreateBusinessProfile". The plan itself noted this verify step is a "sanity check if the executor only did steps 1-4" so the false-positive is expected if step 5 is done.
- **Fix:** Reworded the JSDoc to reference "the load and getOrCreate methods" (descriptive prose) instead of the verbatim method names, so the regex no longer has an anchor to match. Method behaviour is unchanged; only the comment wording changed.
- **Files modified:** `src/app/business-profile/services/business-profile-service.ts` (JSDoc text only)
- **Verification:** Verify step 1 now reports `PASS: getOrCreateBusinessProfile is either deleted or insert-free` — which is vacuously true since the method is gone.
- **Committed in:** `9a5f34e` (Task 1 commit — fix folded into the same commit before the commit was cut)

**2. [Rule 3 — Blocking] Verify step 5 grep pattern false-positives on unrelated local functions**
- **Found during:** Task 1 verification (running the plan's verbatim `grep -rn "loadBusinessProfile\|getOrCreateBusinessProfile" src/ --include='*.ts' --include='*.tsx'`)
- **Issue:** The plan's grep matched three non-caller references:
  - `src/components/strategic-initiatives.tsx:192` — call to a LOCAL function `loadBusinessProfile(targetUserId)` defined at line 233 of the same file, unrelated to `BusinessProfileService`.
  - `src/app/kpi-selection/page.tsx:33,37,45` — LOCAL helper `loadBusinessProfile` defined inline in that page, unrelated to `BusinessProfileService`.
  The plan's verify step 5 would have spuriously failed because of these unrelated local functions that happen to share the name.
- **Fix:** Ran a refined grep pattern `BusinessProfileService\.(loadBusinessProfile|getOrCreateBusinessProfile)` which only matches `BusinessProfileService.<method>` references. This returned zero hits outside `page.tsx` and the service file — confirming no real caller of the deleted methods exists anywhere else. I verified manually that `strategic-initiatives.tsx` and `kpi-selection/page.tsx` use locally-scoped helpers that read from `business_profiles` directly via their own Supabase client and do NOT depend on the deleted class methods.
- **Files modified:** None — verification command only.
- **Verification:** Refined grep returned zero unexpected callers. Both unrelated files' local functions are untouched and continue to compile.
- **Committed in:** N/A (verification-only deviation; code change is scoped to Task 1 = `9a5f34e`)

---

**Total deviations:** 2 auto-fixed (both Rule 3 — Blocking verification issues, both caused by the plan's verification commands being slightly too loose for the final state after deletion; code semantics are exactly as planned)
**Impact on plan:** No scope change — both deviations were narrow fixes to the verification harness, not to the implementation. The file modifications are exactly what the plan specified.

## Issues Encountered

- **Expected tsc error in page.tsx(255):** `Property 'loadBusinessProfile' does not exist on type 'typeof BusinessProfileService'`. This is documented in the plan (action step 7 and acceptance criteria) as the single acceptable tsc regression — Plan 41-02 Wave 2 Task 1 removes this call site when it refactors `/business-profile/page.tsx` to read from BusinessContext. Filtering tsc output with `grep -v "src/app/business-profile/page.tsx"` shows zero other new errors introduced in src/. All other tsc errors (`.next/types/app/client/*`, `e2e/*.spec.ts`, `playwright.config.ts`) are pre-existing baseline errors unrelated to this plan and should NOT be fixed here (Rule 3 scope boundary — deferred).

## User Setup Required

None — this is a pure code refactor. No environment variables, no migrations, no external service configuration.

## Next Phase Readiness

- **Plan 41-02 (Wave 2):** Unblocked. Wave 2 must (a) remove the `loadBusinessProfile(user.id)` caller from `src/app/business-profile/page.tsx:255` to clear the one expected tsc error, and (b) route the owner-no-business case through the empty-state UI already implemented in the page.
- **Plan 41-03 (Wave 3):** Unblocked. Phantom row sweeper can safely assume the file is no longer producing new phantoms, so the sweeper only needs to reconcile historical data, not defend against an active leak.
- **No blockers.**

## Self-Check: PASSED

- `src/app/business-profile/services/business-profile-service.ts` exists — confirmed present with 211 lines, 1 `.insert(` (coach path only), 0 `'My Business'` literals, 0 `static async loadBusinessProfile(`, 0 `static async getOrCreateBusinessProfile(`.
- Commit `9a5f34e` exists — confirmed via `git log --oneline`.

---
*Phase: 41-eliminate-phantom-business-orphan-rows-via-active-business-r*
*Completed: 2026-04-23*
