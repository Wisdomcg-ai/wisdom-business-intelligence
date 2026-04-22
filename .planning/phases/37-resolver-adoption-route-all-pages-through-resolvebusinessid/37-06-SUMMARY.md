---
phase: 37-resolver-adoption
plan: 06
status: complete
completed: 2026-04-22
merge_commit: 5664522
---

# Plan 37-06 — Summary (build + preview + smoke test + merge)

## Outcome

**PR #10 merged to main.** Phase 37 complete.

## Build / typecheck

- `npx tsc --noEmit` — clean, zero errors
- `npm run build` — clean, all 127 routes compiled

## Vercel preview smoke test results

Run by Matthew Malouf (only coach). Results:

| Scenario | Result |
|---|---|
| Coach login → coach view → client business loaded | ✅ resolver set active business correctly |
| Forecast, cashflow, USP pages in coach view | ✅ loaded client data (pre-existing Xero 500 + marketing_data 406 errors unrelated to Phase 37 and documented as out-of-scope) |
| Client login → dashboard | ✅ login worked, dashboard loaded |
| Monthly Report layout redirects non-coach | ✅ pre-existing, intentional (product decision) |
| **Coach with no active client → `/finances/monthly-report` empty state** | ✅ **key test** — "No client selected" empty state rendered. Before Phase 37 (and pre-ed9dfa7) this URL silently pinned to the coach's "My Business" landing pad. |
| `[resolveBusinessId] INVARIANT VIOLATED` | ✅ never fired during any test |

Untested surfaces (architectural risk assessed as low given consistent resolver adoption pattern):
- Sessions page writes
- Messages page writes
- Settings → Team (the ResolveResult.reason-dependent upsert side-effect)
- Weekly Review writes
- Quarterly Review workshop flow

Agreement reached: the four hot paths tested cover the architectural risk. Merge approved.

## Acceptance criteria — all 5 pass

1. ✅ `grep -rE "\.eq\('owner_id', user\.id\)" src/app src/hooks` returns 0 in-scope matches
2. ✅ All 21 in-scope files import from `@/lib/business/resolveBusinessId`
3. ✅ `npm run build` passes
4. ✅ Vercel preview exercised coach→client, finances pages, Scenario C empty state
5. ✅ Runtime invariant never fired

## Phase 37 goal — achieved

> Eliminate the ~20 duplicated `businessId` resolution blocks in the codebase by routing them through `src/lib/business/resolveBusinessId.ts`. Makes the "coach saves to my business" bug class structurally impossible to reintroduce — there becomes one and only one place where a page decides which business it operates on.

Met. 21 files, 5 plans, zero regressions found in smoke test.

## Git history (main branch)

- `ed9dfa7` — original bug fix (shipped straight to main, degradation-safe)
- `9d33a74` — Phase A hardening (toast, admin next, branded types, invariant, landing-pad neutralized)
- `af5966a` — Phase 37 planning artifacts
- `5733d2e` — Plan 01 (3 files)
- `a090589` — Plan 02 (3 files)
- `c7db32b` — Plan 03 (6 files)
- `f9b5216` — Plan 04 (6 files)
- `e2fbf00` — Plan 05 (3 files)
- `5664522` — merge commit for PR #10

## Follow-ups (from original 9/10 plan, not blockers)

- Item 2: Adopt branded types across the codebase (foundation in `src/lib/types/ids.ts`)
- Item 3: Playwright E2E test infrastructure + coach-flow spec
- Item 8: Xero OAuth escape hatch audit
- Clean up pre-existing `.eq('owner_id', user.id)` matches in `/client/*` routes + `/api/actions/route.ts` (coach-safe, just for consistency)
- Fix pre-existing Xero `chart-of-accounts-full` 500 and `marketing_data` 406 (separate tickets)
