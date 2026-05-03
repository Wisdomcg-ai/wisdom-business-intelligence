---
phase: 46-server-side-hardening
plan: 01
status: complete
date: 2026-05-02
branch: feat/46-01-deletions
requirements:
  - SEC-01
  - SEC-06
  - SEC-07 (prep — delete unused logger.ts only)
---

# 46-01 — Deletions (SEC-01 + SEC-06 + SEC-07 prep) — Summary

## Inputs read

- `.planning/phases/46-server-side-hardening/PHASE.md`
- `.planning/phases/46-server-side-hardening/RESEARCH.md`
- `.planning/phases/46-server-side-hardening/46-01-PLAN.md`
- `.planning/phases/46-server-side-hardening/46-PLAN-CHECK.md` (PASS WITH NOTES — 46-01 had no blocking notes)
- Source files targeted by deletions: `src/app/api/migrate/route.ts`, `src/app/api/migrate/opex-fields/route.ts`, `src/middleware.ts`, `src/lib/utils/logger.ts`

## What shipped

Pure-deletion PR. Closes SEC-01 (two dead `/api/migrate/*` routes that called non-existent Supabase RPCs `exec_sql` / `exec`), closes SEC-06 (commented-out onboarding-gate branch in `src/middleware.ts`), and removes the unused `src/lib/utils/logger.ts` so SEC-07's Sentry sweep starts from a clean baseline. One regression test pins all three deletions in place.

Net: **312 lines deleted**, **60 lines added** (regression test), zero behavior change for any live caller.

## Per-task delivery

| Task | What | Commit |
|---|---|---|
| 1 — Delete `/api/migrate/*` (SEC-01) | Pre-flight greps confirmed zero callers (`grep -rln "/api/migrate" src/`) and zero `vercel.json` cron entries. `git rm` both route files; removed empty `src/app/api/migrate/opex-fields/` and `src/app/api/migrate/` directories. | `0207e46` |
| 2 — Delete dead onboarding branch (SEC-06) | Removed lines 173-203 of `middleware.ts` (the `// TEMPORARILY DISABLED` block plus the 25 lines of commented onboarding logic plus the trailing `// Allow access to all routes` comment). Surrounding `try { ... } catch` retained — the catch still absorbs unexpected role-lookup errors. Coach/super_admin role bypass at lines 161-171 preserved verbatim. Per RESEARCH.md SEC-06 (Option A) and PLAN-CHECK confirmation. | `fc8cb7d` |
| 3 — Delete unused `lib/utils/logger.ts` (SEC-07 prep) | Pre-flight greps confirmed zero importers across `@/lib/utils/logger`, `../utils/logger`, `../../lib/utils/logger`, and substring patterns. `git rm` the file. The unrelated `src/app/finances/forecast/utils/logger.ts` (page-scoped forecast debugger, actively used) was NOT touched. | `6d03f47` |
| 4 — Regression test | New file `src/__tests__/security/dead-code-deleted.test.ts`. 9 assertions across 3 `describe` blocks: route files + directory absent (3), middleware free of all 3 dead-branch sentinels AND still references `system_roles` + coach/super_admin (4), `lib/utils/logger.ts` deleted while forecast logger preserved (2). All 9 pass. | `bd7ce7f` |

## Acceptance criteria (from PHASE.md success criteria + plan must-haves)

| # | Criterion | Status | How verified |
|---|---|---|---|
| 1 | `GET /api/migrate` and `GET /api/migrate/opex-fields` return 404 | ✅ | Files deleted; `next build` output contains no `/api/migrate` route. Post-deploy `curl` is the canonical prod check. |
| 2 | `src/middleware.ts` contains zero "TEMPORARILY DISABLED" / "TODO: Re-enable" / "onboarding checks disabled" sentinels | ✅ | `grep -n` returns zero hits; regression test asserts. |
| 3 | Coach/super_admin role bypass preserved | ✅ | `grep -c "system_roles" src/middleware.ts` = 2; regression test asserts both `system_roles` and `coach.*super_admin` patterns present. |
| 4 | `src/lib/utils/logger.ts` deleted with zero importers in repo | ✅ | All grep variants returned zero. Forecast logger (different file) preserved. |
| 5 | Regression test asserts deletions stay deleted | ✅ | 9/9 vitest assertions pass in `src/__tests__/security/dead-code-deleted.test.ts`. |
| 6 | CI green (lint + typecheck + vitest + build) | ✅ | See "Local CI status" below. |

## Local CI status (mirrors GitHub gate)

| Gate | Result | Notes |
|---|---|---|
| `npx tsc --noEmit` | PASS (exit 0) | Clean. |
| `npx next lint` | PASS (exit 0) | Warnings only — all pre-existing react-hooks/exhaustive-deps in components I did not touch. |
| `npx vitest run` (full suite) | 1 pre-existing failure | `src/__tests__/goals/plan-period-banner.test.tsx > "renders three date inputs initialised from props"` expects `'2026-04-01'` but gets `'2026-03-31'`. **Verified: this test also fails on `main`** (checked out the test from `main`, ran in isolation, same failure). Today is 2026-05-02 / fiscal-year edge — it's a date-relative test that's drifted off-by-one. Out of scope for 46-01. All other 627 tests pass; 13 skipped, 4 todo. New regression test contributes 9/9 passes. |
| `npx next build` | PASS (exit 0) | Build succeeds. No `/api/migrate` routes appear in the generated route table — confirms deletions took effect. |

## Deviations from plan

None — all 4 tasks executed exactly as written. No need for a `46-01-DEVIATION.md`.

## Out-of-scope discoveries (logged for later, NOT fixed in this plan)

1. **Next.js 16 `middleware.ts` → `proxy.ts` rename.** A skill/hook recommendation surfaced during the Task 2 edit. Renaming the middleware file is a framework migration unrelated to SEC-01/SEC-06 and would need its own plan (touches `src/middleware.ts` filename, build config, possibly route matchers). Logging here for visibility — not in scope for SEC-01/SEC-06.
2. **Pre-existing date-sensitive test failure** in `src/__tests__/goals/plan-period-banner.test.tsx` (failing on `main` since at least the date this branch was cut). Worth a separate small plan to make the test today-relative-safe.
3. **15+ pre-existing `react-hooks/exhaustive-deps` lint warnings** across components — pre-existing, unrelated to 46-01.

## Files changed

```
 src/__tests__/security/dead-code-deleted.test.ts |  60 ++++++++++++
 src/app/api/migrate/opex-fields/route.ts         |  60 ------------
 src/app/api/migrate/route.ts                     | 102 --------------------
 src/lib/utils/logger.ts                          | 118 -----------------------
 src/middleware.ts                                |  32 ------
 5 files changed, 60 insertions(+), 312 deletions(-)
```

## Risk for the verifier to scrutinize hardest

**Whether the surviving `try { ... } catch` shell in `middleware.ts:158-177` is still doing useful work, or whether it's now dead-equivalent.** After SEC-06's deletion, the `try` block contains exactly: a `system_roles` lookup → an early-return for coach/super_admin → fall through to nothing. For a regular client user, the `try` runs the lookup and then exits the inner `if (!isExemptRoute)` block silently — the `catch` would only fire if the `system_roles` lookup itself throws. That's still a meaningful guard (DB transient errors), but a verifier might reasonably argue the entire `if (!isExemptRoute) { try { ... } }` could collapse to a simpler shape now that the gate is gone. I deliberately kept the catch because (a) PLAN Task 2 explicitly preserved it, (b) removing it would change error-swallowing behavior for the role lookup, and (c) the regression test would still pass either way. The verifier should decide whether the shell stays as a future-resilience pattern or gets collapsed in a follow-up. Keeping it is the conservative choice.

## Self-Check

**Files:**
- FOUND: `src/__tests__/security/dead-code-deleted.test.ts`
- MISSING (intentional): `src/app/api/migrate/route.ts`, `src/app/api/migrate/opex-fields/route.ts`, `src/lib/utils/logger.ts`

**Commits (all on `feat/46-01-deletions`):**
- FOUND: `0207e46` (Task 1 — delete migrate routes)
- FOUND: `fc8cb7d` (Task 2 — delete onboarding branch)
- FOUND: `6d03f47` (Task 3 — delete logger.ts)
- FOUND: `bd7ce7f` (Task 4 — regression test)

## Self-Check: PASSED
