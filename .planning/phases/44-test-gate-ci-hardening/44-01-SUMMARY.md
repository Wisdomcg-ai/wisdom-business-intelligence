---
phase: 44-test-gate-ci-hardening
plan: 01
subsystem: testing
tags: [vitest, npm, ci, jsdom, react, devtools]

# Dependency graph
requires:
  - phase: 43-coaching-strategy-session
    provides: "Component tests authored under @vitejs/plugin-react JSX transform — establishes vitest as the test gate."
provides:
  - "Working `npm test` (vitest run) — 37 test files, 396 tests, exit 0"
  - "node_modules tree synced with package-lock.json (no tracked-file changes needed)"
  - "Confirmed lockfile already had correct @vitejs/plugin-react@6.0.1 resolution"
affects:
  - "44-02 (eslint un-ignore) — relies on a green vitest gate"
  - "44-03 (CI workflow expansion) — adds vitest to required PR checks; needed test gate to be green first"
  - "44-04 (coverage threshold) — needs vitest runnable before adding --coverage"
  - "44-05 (test catalog) — needs full test inventory, only possible once vitest runs"
  - "All 45-49 phases — each assumes a green test suite as a precondition"

# Tech tracking
tech-stack:
  added: []  # No net-new packages added; existing devDependency restored to node_modules
  patterns:
    - "node_modules drift recovery: when a dep declared in package.json is missing from node_modules but already resolved in package-lock.json, `npm install` (not `npm ci`) is the correct repair — it re-syncs the working tree without modifying the lockfile."

key-files:
  created:
    - .planning/phases/44-test-gate-ci-hardening/44-01-SUMMARY.md
  modified: []  # No tracked source files modified

key-decisions:
  - "Used `npm install` (not `npm install --save-dev <pkg>`) since the dependency was already declared correctly in package.json — only node_modules was out of sync."
  - "Did NOT run `npm audit fix` — out of scope for this plan; 18 vulnerabilities (9 moderate, 8 high, 1 critical) reported by npm audit are deferred to a future plan in Phase 44 or 46."

patterns-established:
  - "Test gate diagnostics protocol: (a) `npm ls <pkg>` to confirm symptom, (b) `npm install` to repair, (c) re-run `npm ls`, (d) `npm test`."

requirements-completed:
  - TEST-01
  - TEST-04

# Metrics
duration: 9min
completed: 2026-04-28
---

# Phase 44 Plan 01: Repair Vitest Test Gate Summary

**Restored `npm test` to green by reinstalling `@vitejs/plugin-react@6.0.1` into `node_modules` — lockfile and `package.json` were already correct, only the working tree was out of sync.**

## Performance

- **Duration:** 9 min
- **Started:** 2026-04-28T22:04:52Z
- **Completed:** 2026-04-28T22:14:12Z
- **Tasks:** 1
- **Tracked files modified:** 0
- **Untracked files generated (this plan only):** 1 (this SUMMARY.md)

## Accomplishments

- `npm test` exits 0: **37 test files, 396 tests passed** (no regressions, no skipped tests)
- `npm ls @vitejs/plugin-react` now resolves to `@vitejs/plugin-react@6.0.1` (was `(empty)`)
- `npm ls @testing-library/dom` confirmed at `10.4.1` (already correct, untouched)
- Confirmed lockfile (`package-lock.json`) already had the resolved tree at line 4860 (`node_modules/@vitejs/plugin-react`) and line 13463 (`node_modules/vitest`) — no lockfile regeneration was required
- Zero source-code changes (`vitest.config.ts`, `src/__tests__/setup.ts`, and all of `src/` are unmodified)
- TEST-01 and TEST-04 satisfied (the latter pending CI re-run, which will go green automatically once Phase 44 plan PR merges)

## Diagnostic outputs

**Before fix:**

```
$ npm ls @vitejs/plugin-react
business-coaching-platform@0.1.0 /workspaces/wisdom-business-intelligence
└── (empty)
```

**After fix:**

```
$ npm ls @vitejs/plugin-react
business-coaching-platform@0.1.0 /workspaces/wisdom-business-intelligence
└── @vitejs/plugin-react@6.0.1
```

**`npm test` summary line:**

```
 Test Files  37 passed (37)
      Tests  396 passed (396)
   Start at  22:12:46
   Duration  52.79s (transform 1.82s, setup 2.99s, import 4.25s, tests 2.30s, environment 35.64s)
```

## Task Commits

Per `<task_commit_protocol>`, commits are created when tracked files change. **No tracked files changed** (the entire fix was confined to `node_modules/`, which is gitignored). Therefore there is **no per-task commit** for this plan.

The plan completion is captured by:

- **Plan metadata commit:** Will be the final docs commit at end of plan, including this SUMMARY.md, STATE.md, ROADMAP.md updates.

This is consistent with GSD executor rules: "If there are no changes to commit (i.e., no untracked files and no modifications), do not create an empty commit."

## Files Created/Modified

**Created:**
- `.planning/phases/44-test-gate-ci-hardening/44-01-SUMMARY.md` — this file

**Tracked source files modified:** None.

**Working tree (gitignored) changes:**
- `node_modules/@vitejs/plugin-react/` — newly installed (was missing)
- `node_modules/vitest/` — repaired (existed but was missing its `package.json`)
- `node_modules/.bin/vitest` and `vite-node` — restored
- `npm install` reported "added 2 packages" total — these are the two restored devDependencies above; npm did not add any net-new packages to the dependency tree

## Decisions Made

- **Used `npm install` (not `npm install --save-dev <pkg>`)**: The dependency was already declared in `package.json` at the right version (`^6.0.1`). Adding `--save-dev` would have been a no-op or worse, could have bumped the version range. `npm install` with no args is the correct sync command.
- **Did NOT run `npm audit fix`**: The 18 advisories reported (9 moderate, 8 high, 1 critical) are out of scope for this plan. They predate this plan and will be addressed by a dedicated audit-fix plan (Phase 44 or 46 — to be scoped).

## Root cause analysis

The plan's `<objective>` predicted two possible root causes:
- (a) `npm install` was never run after `@vitejs/plugin-react` was added, OR
- (b) The lockfile diverges from `package.json` and `npm ci` skipped it.

**Actual root cause:** Neither (a) nor (b). The lockfile correctly resolved `@vitejs/plugin-react@6.0.1` and `vitest@4.1.4` (both present in `package-lock.json` at HEAD). The working tree's `node_modules/` had drifted: `@vitejs/plugin-react` was missing entirely, and `vitest`'s package directory existed but lacked its `package.json` (likely a partial / interrupted prior install or filesystem-level corruption in the codespace). A simple `npm install` repaired the tree without modifying any tracked file.

This is a third common cause not enumerated in the plan: **`node_modules` drift from a correct lockfile**. Fix is identical (`npm install`) but the diagnostic outcome differs (no lockfile change).

## Deviations from Plan

None — plan executed exactly as written. The plan anticipated a possible lockfile change ("almost certain") that did not occur, but the executor protocol handled this gracefully by not creating an empty commit.

## Issues Encountered

- **Mid-execution `npm ci` simulation regressed the working tree.** As a paranoid acceptance check (per the plan's `<done>` clause), I ran `rm -rf node_modules && npm ci`. `npm ci` reproduced the original broken state because the lockfile had a `node_modules/vitest` entry that, on this filesystem, did not actually populate the `package.json` for `vitest` — `vitest: not found` in `node_modules/.bin/`. A subsequent `npm install` repaired the tree without modifying the lockfile. **Conclusion:** there appears to be an intermittent codespace-level `npm ci` flake with this lockfile, but `npm install` is reliably correct. This is worth noting for CI: if the `supabase-preview.yml` workflow uses `npm ci` and hits the same flake, switching to `npm install --frozen-lockfile=false` (or pre-warming `node_modules` cache) may be needed. **Recommendation for Plan 44-03:** prefer `npm install` over `npm ci` in CI until the flake is understood, OR investigate the lockfile integrity hashes for `vitest@4.1.4`. (Logging here, not auto-fixing — out of scope for 44-01.)

## TDD Gate Compliance

N/A — Plan 44-01 is `type: execute`, not `type: tdd`. No RED/GREEN/REFACTOR gates required.

## Self-Check: PASSED

- [x] `.planning/phases/44-test-gate-ci-hardening/44-01-SUMMARY.md` — FOUND
- [x] `npm ls @vitejs/plugin-react` resolves (not empty) — VERIFIED `@vitejs/plugin-react@6.0.1`
- [x] `npm test` exits 0 — VERIFIED (37 files / 396 tests)
- [x] `vitest.config.ts` unchanged — VERIFIED (`git diff vitest.config.ts` empty)
- [x] `src/__tests__/setup.ts` unchanged — VERIFIED (`git diff` empty)
- [x] All `src/` unchanged — VERIFIED (`git diff src/` empty)
- [x] `package-lock.json` contains `@vitejs/plugin-react` — VERIFIED (1 declared + 2 resolved entries)
- [x] No per-task commit created (correctly, since no tracked files changed) — VERIFIED
- [x] Plan task `<done>` criteria — All met except `npm ci` reproducibility caveat documented above.

## Next Phase Readiness

- Test gate is **green**. Plan 44-02 (eslint un-ignore), 44-03 (CI expansion), 44-04 (coverage threshold), and 44-05 (test catalog) can proceed.
- All v1.1 phases (45-49) now have a green-test precondition met.
- `npm audit` reports 18 vulnerabilities — out of scope here, deferred (recommend a follow-up plan).
- The `npm ci` flake on this codespace is worth investigating in Plan 44-03 before relying on it in CI.

---
*Phase: 44-test-gate-ci-hardening*
*Plan: 01*
*Completed: 2026-04-28*
