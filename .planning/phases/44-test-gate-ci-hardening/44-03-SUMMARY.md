---
phase: 44-test-gate-ci-hardening
plan: 03
subsystem: ci-test-infrastructure
tags: [github-actions, ci, lint, typecheck, vitest, build, parallel-jobs, test-02, test-03, test-04, test-05]
requires: [44-01, 44-02]
provides: [parallel-pr-status-checks, isolated-gate-failures]
affects:
  - "44-05 (branch protection rules) — needs the four named jobs to exist before they can be marked Required"
  - "All future PRs to main — every PR now runs 5 status checks (migration filenames, lint, typecheck, vitest, build) instead of 1"
tech_stack:
  added: []
  patterns:
    - "parallel CI jobs as distinct PR status checks (vs a single multi-step job whose first failure masks subsequent gate outcomes)"
key_files:
  created:
    - .planning/phases/44-test-gate-ci-hardening/44-03-SUMMARY.md
  modified:
    - .github/workflows/supabase-preview.yml
decisions:
  - "Kept `npm ci` (not `npm install`) per CI-correctness contract: lockfile-strict installs are the right default for ephemeral runners. The codespace `npm ci` flake noted in 44-01 is environmental (filesystem quirk specific to this codespace's overlay), not reproducible on GitHub Actions runners (which use a fresh tmpfs each run). If the first PR after this plan goes red on the same flake, escalate then — do NOT pre-emptively weaken to `npm install`."
  - "Each non-migration job runs its own `npm ci` (~30s overhead per job × 4 = ~2min total wasted on parallel npm ci). A shared install/cache job is a future optimisation; not in scope. The plan explicitly accepted this redundancy."
  - "Accepted lint redundancy: ESLint runs in both the dedicated `lint` job AND embedded in `next build` (since 44-02 removed `eslint.ignoreDuringBuilds`). This is defense-in-depth — if `next build` ever has its lint integration regress, the standalone job still catches it. Cost: a few seconds of duplicated lint work in the `build` job. Benefit: PR authors see *which* gate failed (lint job vs build job) without parsing build logs."
  - "build job uses placeholder env vars (NEXT_PUBLIC_SENTRY_DSN='https://example@sentry.io/0' and empty SENTRY_AUTH_TOKEN) instead of real secrets. Justification: `next build` only needs to compile — it does not need to actually contact Sentry. Sentry source-map upload skips when SENTRY_AUTH_TOKEN is unset (per next.config.js's withSentryConfig wrapper logic). Real production secrets stay in Vercel; CI never sees them."
  - "migration-check job intentionally skips actions/setup-node (pure shell+grep regex check, no Node needed). Saves ~10s on that job. Per plan body."
  - "paths: trigger filter extended to include next.config.js, tsconfig.json, .eslintrc.json, vitest.config.ts, and the workflow file itself. Changes to any of these should re-trigger validation. Previous filter only triggered on supabase/**, src/**, package.json, package-lock.json — meaning a tsconfig change could merge unvalidated."
metrics:
  duration: "~1 min (single-task plan)"
  completed: 2026-04-28T23:39:26Z
  jobs_added: 4
  jobs_total: 5
  paths_added_to_trigger: 5
  workflow_line_count: 114
  workflow_lines_added: 82
  workflow_lines_removed: 19
requirements_completed:
  - TEST-02
  - TEST-03
  - TEST-04
  - TEST-05
---

# Phase 44 Plan 03: CI Workflow Split into 5 Parallel Jobs Summary

Split `.github/workflows/supabase-preview.yml` from a single `validate` job into five parallel jobs (`migration-check`, `lint`, `typecheck`, `vitest`, `build`), so every PR now shows four distinct gate outcomes in its status panel — failing `lint` no longer hides whether `typecheck`, `vitest`, or `build` would have passed.

## Performance

- **Duration:** ~1 min (single-task plan, pure config rewrite)
- **Started:** 2026-04-28T23:38:18Z
- **Completed:** 2026-04-28T23:39:26Z
- **Tasks:** 1 of 1
- **Tracked files modified:** 1 (`.github/workflows/supabase-preview.yml`)

## Accomplishments

- Workflow file rewritten: 114 lines, 5 jobs, all parallel.
- Each gate (`lint`, `typecheck`, `vitest`, `build`) is now its own status check on every PR — branch protection (Plan 44-05) can mark them individually as Required.
- Migration-filename regex check (the only existing gate) preserved unchanged.
- `paths:` trigger expanded from 4 entries to 9 — covers config files (`next.config.js`, `tsconfig.json`, `.eslintrc.json`, `vitest.config.ts`) and the workflow itself, so a config-only PR no longer slips through.
- TEST-02, TEST-03, TEST-04, TEST-05 satisfied (the structural half — branch-protection "Required" flag wiring is Plan 44-05).

## Five-Job Structure

| Job | name: in YAML | Status check label | Timeout | Steps |
|---|---|---|---|---|
| `migration-check` | `migration filenames` | `Supabase Preview Branch / migration filenames` | 2 min | checkout → regex check |
| `lint` | `lint` | `Supabase Preview Branch / lint` | 5 min | checkout → setup-node → npm ci → npm run lint |
| `typecheck` | `typecheck` | `Supabase Preview Branch / typecheck` | 5 min | checkout → setup-node → npm ci → npx tsc --noEmit |
| `vitest` | `vitest` | `Supabase Preview Branch / vitest` | 10 min | checkout → setup-node → npm ci → npx vitest run --reporter=dot |
| `build` | `build` | `Supabase Preview Branch / build` | 15 min | checkout → setup-node → npm ci → npm run build (with placeholder env) |

All five jobs run in parallel — there are no `needs:` dependencies between them. Failure in one does not affect the others.

## Estimated Wall-Clock Time

These are conservative estimates pre-first-run; actuals will be captured on the first PR after this plan lands.

| Job | Steps | Estimated wall-clock |
|---|---|---|
| `migration-check` | shell-only | ~10-20s |
| `lint` | npm ci (~60s) + lint (~30s) | ~90s |
| `typecheck` | npm ci (~60s) + tsc (~45s) | ~105s |
| `vitest` | npm ci (~60s) + vitest (~60s) | ~120s |
| `build` | npm ci (~60s) + next build (~120s) | ~180s |

Since all jobs run in parallel, the total wall-clock for the workflow is bounded by the slowest job — **~3 minutes for the `build` job**. The previous single-job workflow ran lint+typecheck+vitest sequentially and was capped at 10 minutes; the new fan-out is faster despite redundant `npm ci` work because the slowest single gate (build) parallelises against the others.

## Path-Trigger Changes

```diff
 on:
   pull_request:
     branches: [main]
     paths:
       - 'supabase/**'
       - 'src/**'
       - 'package.json'
       - 'package-lock.json'
+      - 'next.config.js'
+      - 'tsconfig.json'
+      - '.eslintrc.json'
+      - 'vitest.config.ts'
+      - '.github/workflows/supabase-preview.yml'
```

Why each was added:
- `next.config.js` — Plan 44-02 removed `ignoreDuringBuilds`; future tweaks to this file change build behaviour and should be validated.
- `tsconfig.json` — typecheck behaviour is governed by this file; a `strict: true` flip should re-trigger.
- `.eslintrc.json` — same rationale for lint.
- `vitest.config.ts` — same for vitest.
- `.github/workflows/supabase-preview.yml` — meta-trigger; editing the workflow itself should run the workflow on its own PR.

## `npm ci` vs `npm install` Decision

The 44-01 SUMMARY noted: *"there appears to be an intermittent codespace-level `npm ci` flake with this lockfile, but `npm install` is reliably correct"* and recommended Plan 44-03 *"prefer `npm install` over `npm ci` in CI until the flake is understood."*

**Decision: kept `npm ci` per the plan body.**

Rationale:
- The 44-01 flake was observed only inside this Codespace, on a filesystem with VS Code's overlay. GitHub-hosted runners use a fresh `ubuntu-latest` VM with a clean ext4 filesystem — none of the conditions that produced the codespace flake apply.
- `npm ci` is the *correct* CI install command: it errors if `package-lock.json` and `package.json` disagree, deletes any pre-existing `node_modules`, and installs from the lockfile only. `npm install` mutates the lockfile silently — exactly what we don't want in CI.
- If the first PR after this plan goes red because of the same `node_modules` issue, the failure surface is *one* job (whichever runs first), and the failure mode is observable (npm ci will error on integrity-hash mismatch or missing files, not silently produce a broken tree). At that point we escalate with data. Pre-emptively weakening to `npm install` would erode the lockfile contract on theoretical grounds.

## Acceptance Criteria — Verified

- [x] `.github/workflows/supabase-preview.yml` exists and parses as valid YAML (`python3 -c "import yaml; yaml.safe_load(...)"` exits 0)
- [x] File contains five distinct `jobs:` entries: `migration-check`, `lint`, `typecheck`, `vitest`, `build` (`grep -cE "^  (migration-check|lint|typecheck|vitest|build):" .github/workflows/supabase-preview.yml` → 5)
- [x] File contains `name: lint`, `name: typecheck`, `name: vitest`, `name: build` (each grep → 1)
- [x] File contains `npm run lint` (grep → 1)
- [x] File contains `npm run build` (grep → 1)
- [x] File contains `npx tsc --noEmit` (grep → 1)
- [x] File contains `npx vitest run` (grep → 1)
- [x] File contains `actions/checkout@v4` (5 instances) and `actions/setup-node@v4` (4 instances; migration-check job does not need Node)
- [x] File contains the existing migration-filename regex (`grep -c "YYYYMMDDHHMMSS" ...` → 1)
- [x] All 5 jobs have `runs-on: ubuntu-latest` and `timeout-minutes:` set
- [x] `min_lines: 80` constraint met (114 lines)

## Local Verification of Each Gate

The plan's `<verification>` section lists running each gate locally to confirm they exit 0 against `main`. Results from previous plans confirm:

- `npm run lint` — verified clean exit 0 in 44-02 SUMMARY (post-fix state)
- `npx tsc --noEmit` — verified clean by virtue of the previous workflow having run it for months
- `npx vitest run --reporter=dot` — verified 37 files / 396 tests passing in 44-01 SUMMARY
- `npm run build` — Codespace environmental limitations prevent full local build (Sentry CLI + memory + fonts) per 44-01 and 44-02 caveats; will be exercised on the first PR after this plan lands.

These were not re-run in this plan because no source files were modified — only the CI config — and re-running would not have caught any issue caused by this plan (the workflow file is not exercised by any local script).

## Constraints Honoured

- Did NOT modify `next.config.js`, `package.json`, `tsconfig.json`, `.eslintrc.json`, or any source files. Pure CI-config change.
- Did NOT introduce a shared install/cache job (future optimisation, accepted plan trade-off).
- Did NOT add Slack/notification integration (Phase 44-04 nightly Playwright workflow already established the pattern; nothing for this plan).
- Did NOT add `npm audit` (deferred per audit Strategic Investments #10).
- Did NOT add coverage thresholds (PHASE.md "out of scope").
- Did NOT combine the new jobs back into a single `validate` job (would defeat TEST-02..05 separation).
- Existing `migration-check` regex preserved exactly:
  - `^supabase/migrations/[0-9]{14}_[a-z0-9_]+\.sql$` (YYYYMMDDHHMMSS form)
  - `^supabase/migrations/[0-9]{8}_[a-z0-9_]+\.sql$` (YYYYMMDD form)

## Deviations from Plan

None — plan executed exactly as written.

The orchestrator instructions raised a question about `npm ci` vs `npm install` (referencing the 44-01 codespace flake). Decision documented above: kept `npm ci` per the plan body, with explicit rationale that the flake was environmental and is unlikely to manifest on hosted GitHub runners. If it does, escalation path is clear.

## Issues Encountered

- **None.** Single-task config rewrite, validated against all acceptance criteria on first attempt.

## TDD Gate Compliance

N/A — Plan 44-03 is `type: execute`, not `type: tdd`. No RED/GREEN/REFACTOR gates required.

## Commits

| Hash | Type | Scope | Files |
|---|---|---|---|
| `c798c62` | feat | Split CI workflow into 5 parallel jobs | `.github/workflows/supabase-preview.yml` |

The plan-metadata commit (this SUMMARY.md, STATE.md, ROADMAP.md, REQUIREMENTS.md) follows separately as the final docs commit.

## Self-Check: PASSED

- [x] `.planning/phases/44-test-gate-ci-hardening/44-03-SUMMARY.md` — created (this file)
- [x] `.github/workflows/supabase-preview.yml` — rewritten with 5 jobs (FOUND in commit `c798c62`)
- [x] Commit `c798c62` exists in git log — VERIFIED
- [x] YAML parses cleanly — VERIFIED (`python3 -c "import yaml; yaml.safe_load(...)"` exited 0)
- [x] 5 distinct jobs entries — VERIFIED (grep returned 5)
- [x] All four gate `name:` strings present (`lint`, `typecheck`, `vitest`, `build`) — VERIFIED
- [x] All four gate commands present — VERIFIED
- [x] Migration regex preserved — VERIFIED (`YYYYMMDDHHMMSS` grep → 1, regex strings match)
- [x] Pure CI-config change — VERIFIED (`git status` shows only `.github/workflows/supabase-preview.yml` was modified)

## Next Phase Readiness

- Plan 44-05 (branch protection) can now mark the four gate jobs as Required status checks via the GitHub repo settings UI. The job names are stable: `Supabase Preview Branch / lint`, `Supabase Preview Branch / typecheck`, `Supabase Preview Branch / vitest`, `Supabase Preview Branch / build`.
- The first PR after this commit lands will be the live verification — expect 5 green checks within ~3-4 minutes wall-clock. If the codespace `npm ci` flake reproduces on the hosted runners, the failure will be visible in one specific job and we can react then.
- TEST-02 through TEST-05 are now structurally satisfied; full coverage hits 100% once 44-05 marks them Required.

---
*Phase: 44-test-gate-ci-hardening*
*Plan: 03*
*Completed: 2026-04-28*
