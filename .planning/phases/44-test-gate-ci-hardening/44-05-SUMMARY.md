---
phase: 44-test-gate-ci-hardening
plan: 05
status: complete
date: 2026-05-03
---

# Phase 44 Plan 5 — Branch Protection Enforcement — Summary

## What shipped

- `PLAYWRIGHT_BASE_URL` repository secret provisioned (production URL: `https://wisdombi.ai`).
- First manual `playwright-nightly.yml` workflow run — **green**: https://github.com/Wisdomcg-ai/wisdom-business-intelligence/actions/runs/25263129837
- Branch protection rule on `main` already enforced from a prior session — verified via `gh api repos/.../branches/main/protection`. Configuration:
  ```
  required_status_checks: lint, typecheck, vitest, build  ✓
  strict (require branch up to date):                     ✓
  enforce_admins (no bypass):                             ✓
  allow_force_pushes:                                     false
  allow_deletions:                                        false
  required_pull_request_reviews: 0 approvers required (PR-required, no review gate)
  ```
  Path-filtered `migration filenames` check correctly NOT required. Cron-driven `playwright-nightly` correctly NOT required.
- 4 smoke PRs proved each gate independently blocks merging. All closed without merging; all branches deleted.

## Smoke evidence (4 throwaway PRs, now closed)

| Gate | Smoke PR | Break injected | Failed CI run |
|---|---|---|---|
| **lint**      | [#52](https://github.com/Wisdomcg-ai/wisdom-business-intelligence/pull/52) `phase-44/smoke-lint`           | `react-hooks/rules-of-hooks` violation (hook called after early return) | https://github.com/Wisdomcg-ai/wisdom-business-intelligence/actions/runs/25263257410/job/74073862959 |
| **typecheck** | [#53](https://github.com/Wisdomcg-ai/wisdom-business-intelligence/pull/53) `phase-44/smoke-typecheck`      | TS2322 — `string` literal assigned to `: number`                        | https://github.com/Wisdomcg-ai/wisdom-business-intelligence/actions/runs/25263258299/job/74073865556 |
| **build**     | [#54](https://github.com/Wisdomcg-ai/wisdom-business-intelligence/pull/54) `phase-44/smoke-build`          | `import './this-module-does-not-exist'` from a built page route        | https://github.com/Wisdomcg-ai/wisdom-business-intelligence/actions/runs/25264755018/job/74077402301 |
| **vitest**    | [#55](https://github.com/Wisdomcg-ai/wisdom-business-intelligence/pull/55) `phase-44/smoke-vitest`         | `expect(1).toBe(2)` in a new test file                                  | https://github.com/Wisdomcg-ai/wisdom-business-intelligence/actions/runs/25263260057/job/74073870608 |

Each broken PR showed the corresponding required check red AND the merge button greyed out. Confirmed visually + via `gh pr view --json statusCheckRollup`.

## Lessons for future smoke tests

1. **Next.js `build` runs lint and typecheck internally.** A pure lint break (PR #52) and a pure typecheck break (PR #53) BOTH also fail the `build` check. That's expected and fine — the acceptance criterion is each gate red on its own break, not "exactly one gate red per break."
2. **Folders prefixed with `_` are private routes in App Router.** Initial attempt at `src/app/__smoke-build/page.tsx` (double underscore) was silently ignored by Next, so the bad import never compiled. Renamed to `src/app/smoke-build/page.tsx` (no underscore) — Next picks it up and build correctly fails.
3. **Side-effect-only imports in non-route files get tree-shaken.** Initial attempt at `src/__smoke__/build-break.ts` with `import './nope'` succeeded build because nothing imported the file. The fix is to put the bad import inside a guaranteed-built file (a route page).

## TEST-* requirements satisfied

- **TEST-01** (vitest gate restored): plan 44-01 ✓
- **TEST-02** (lint as build-time gate): plan 44-02 ✓
- **TEST-03** (typecheck gate enforced): plan 44-03 ✓
- **TEST-04** (build gate enforced): plan 44-03 ✓
- **TEST-05** (vitest gate enforced): plan 44-03 ✓
- **TEST-06** (Playwright nightly with secret): plan 44-04 + this plan ✓

All 6 ticked at the **enforcement** layer (not just the run layer).

## Sign-off

> **Phase 44 (Test Gate & CI Hardening) — COMPLETE.** Four required status checks (`lint`, `typecheck`, `vitest`, `build`) are now enforced on `main`; each independently proven to block a deliberate break. Nightly Playwright workflow has been triggered manually once and went green. The CI gate is real, not informational.
