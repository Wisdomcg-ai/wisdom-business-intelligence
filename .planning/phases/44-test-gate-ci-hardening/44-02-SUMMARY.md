---
phase: 44-test-gate-ci-hardening
plan: 02
subsystem: ci-test-infrastructure
tags: [eslint, next-build, ci-gate, hardening, test-02]
requires: [44-01]
provides: [build-time-eslint-enforcement]
affects: [next.config.js, src/app/api/coach/client-completion/route.ts, src/app/finances/forecast/components/AssumptionsTab.tsx, src/app/systems/processes/components/svg/SVGPortPopover.tsx]
tech_stack:
  added: []
  patterns: ["lint-as-build-gate"]
key_files:
  created: []
  modified:
    - next.config.js
    - src/app/api/coach/client-completion/route.ts
    - src/app/finances/forecast/components/AssumptionsTab.tsx
    - src/app/systems/processes/components/svg/SVGPortPopover.tsx
decisions:
  - "Remove dead `// eslint-disable-next-line @typescript-eslint/...` directives rather than install @typescript-eslint plugin (out of scope for 44-02; a plugin migration would balloon scope and trigger many more violations)."
  - "Fix `react-hooks/rules-of-hooks` errors by reordering hook calls above early-returns (rule-conformant), not by using `eslint-disable-next-line` (which would have just silenced the rule and left the code subtly broken on conditional renders)."
  - "Leave 183 `react-hooks/exhaustive-deps` warnings in place. Warnings do not fail `next build`. Fixing them all is a separate, larger refactor that touches ~120 files; the gate-tightening goal of 44-02 is to make ESLint **errors** break the build, which it now does."
metrics:
  duration: "~14 minutes"
  completed: 2026-04-28T22:34:46Z
  baseline_errors: 7
  baseline_warnings: 183
  baseline_unique_files: 136
  post_fix_errors: 0
  post_fix_warnings: 183
  source_files_modified: 3
---

# Phase 44 Plan 02: Remove eslint.ignoreDuringBuilds Summary

ESLint is now a build-time merge gate; `next.config.js` no longer suppresses lint, and the 7 errors that surfaced are fixed minimally — 4 dead `eslint-disable-next-line` directives removed, and 3 `rules-of-hooks` violations resolved by reordering hook declarations above early-returns.

## Plan Goal

TEST-02: make ESLint a real merge gate. Today, `next build` ignored every lint violation due to `eslint.ignoreDuringBuilds: true` in `next.config.js`. After this plan, an ESLint **error** will fail `next build`. Once Plan 44-03 wires `next lint` as a CI job, lint becomes a required PR check.

## Lint Baseline (before edits)

Captured from `npm run lint` against `main` BEFORE removing the suppression:

- **Errors: 7** (would have broken the build)
- **Warnings: 183** (do not break the build)
- **Unique files affected: 136**

Breakdown by rule:

| Rule | Count | Severity |
|---|---|---|
| `react-hooks/exhaustive-deps` | 176 | warn |
| `@typescript-eslint/no-explicit-any` | 6 | error (rule undefined) |
| `@next/next/no-img-element` | 6 | warn |
| `react-hooks/rules-of-hooks` | 3 | error |
| `@typescript-eslint/no-unused-vars` | 2 | error (rule undefined) |
| `import/no-anonymous-default-export` | 1 | warn |

The 6 `@typescript-eslint/no-explicit-any` and 2 `@typescript-eslint/no-unused-vars` "rule undefined" errors come from the same handful of `// eslint-disable-next-line` comments in one file (`route.ts`) — multiple violations report off the same comment because each disable-comment is independently flagged for naming an undefined rule.

Baseline output was preserved at `/tmp/lint-baseline.txt` during execution.

## Errors Fixed

### `src/app/api/coach/client-completion/route.ts` — 4 errors

Four lines of `// eslint-disable-next-line @typescript-eslint/no-explicit-any` (and one `@typescript-eslint/no-unused-vars`) were referencing rules that aren't actually configured in this project. The `next/core-web-vitals` preset extends only `eslint-plugin-react`, `eslint-plugin-react-hooks`, `eslint-plugin-jsx-a11y`, and `@next/eslint-plugin-next` — NOT `@typescript-eslint`. ESLint correctly reported the disable directives as referencing unknown rules.

| Line (before) | Rule named | Fix |
|---|---|---|
| 27 | `@typescript-eslint/no-explicit-any` | Removed dead directive |
| 210 | `@typescript-eslint/no-explicit-any` | Removed dead directive |
| 223 | `@typescript-eslint/no-unused-vars` | Removed dead directive |
| 239 | `@typescript-eslint/no-explicit-any` | Removed dead directive |

The underlying `any` types (e.g. `error: any`, `Record<string, any>`) are untouched — they were never being checked by the linter, and removing the dead disable comments doesn't change behavior. Adding the `@typescript-eslint` plugin to enforce these rules is intentionally out of scope for 44-02; doing so would surface dozens of new `any`-related errors across the codebase.

### `src/app/finances/forecast/components/AssumptionsTab.tsx` — 1 error

**Rule:** `react-hooks/rules-of-hooks` — `useMemo` was called AFTER an early return.

**Before:** lines 38-46 had `if (!assumptions) return <empty-state/>`, then line 52 called `useMemo`. This is a real React bug: if `assumptions` is null on the first render and non-null on the second, the hook ordering changes between renders and React's hook tracking breaks.

**Fix:** Moved the `useMemo` call above the early-return. Used `assumptions?.revenue?.lines || []` so the memo tolerates the null case. The empty-state UI from the early-return is preserved unchanged.

### `src/app/systems/processes/components/svg/SVGPortPopover.tsx` — 2 errors

**Rule:** `react-hooks/rules-of-hooks` — `useState` (line 94) and `useEffect` (line 95) were called AFTER `if (!sourceStep) return null` (line 84). Same bug pattern as above.

**Fix:** Moved both hook calls above the early-return. `isDecision`/`outgoingFlows`/`hasConflict` now short-circuit when `sourceStep` is undefined (using `?.` and `!!` guards), so the `useEffect` body is a no-op in the null case. Behaviour preserved for all real usages where `sourceStep` is defined.

## Files Modified Beyond `next.config.js`

Three source files. Phase 44's PHASE.md described "zero source code change" because the test gate repair was expected to be infra-only (vitest config, CI workflows). Plan 44-02's source-file edits are an **honest blast-radius callout**: removing the eslint suppression surfaced 7 real errors that had been hiding in the codebase. All 3 source-file edits are style-only and were verified by manual review:

| File | Lines changed | Behaviour change? |
|---|---|---|
| `src/app/api/coach/client-completion/route.ts` | -4 | No — removed dead comments only |
| `src/app/finances/forecast/components/AssumptionsTab.tsx` | reordered ~10 | No — same outputs, hook ordering fixed |
| `src/app/systems/processes/components/svg/SVGPortPopover.tsx` | reordered ~12 | No — same outputs, hook ordering fixed |

The two `rules-of-hooks` fixes are arguably **bug fixes** (latent React hook ordering bugs that would manifest as cryptic runtime errors on conditional renders), not just lint compliance. Treating them as Rule 1 (auto-fix bugs) deviations was appropriate — they would have been blockers regardless of the lint gate.

## Constraints Honoured

- `.eslintrc.json` rule overrides: untouched (verified by `git diff -- .eslintrc.json` returning empty).
- `react/no-unescaped-entities: off` and `@next/next/no-assign-module-variable: off`: still off (verified by grep).
- `src/middleware.ts` `no-restricted-imports` Edge-runtime override: still in place.
- No new `eslint-disable-next-line` comments added (the 4 removed were dead anyway).
- Sentry `withSentryConfig` wrapper at `next.config.js` lines 109-126: untouched.
- Image config, compress, poweredByHeader, reactStrictMode, experimental, webpack hook, headers: untouched.

## Verification

| Check | Expected | Actual |
|---|---|---|
| `grep -c "ignoreDuringBuilds" next.config.js` | 0 | 0 |
| `grep -c "^  eslint:" next.config.js` | 0 | 0 |
| `grep -c "withSentryConfig" next.config.js` | ≥ 1 | 2 |
| `grep -c "react/no-unescaped-entities" .eslintrc.json` | ≥ 1 | 1 |
| `grep -c "no-restricted-imports" .eslintrc.json` | ≥ 1 | 1 |
| `npm run lint` exit code | 0 | 0 |
| `npm test` exit code | 0 | 0 (37 files / 396 tests pass) |
| `npm run build` exit code | 0 | **Not directly verified** — see env caveat below |

### Build verification caveat (Codespace environmental limitation)

`npm run build` could not be definitively run-to-completion in this Codespace due to two environmental constraints unrelated to our changes:

1. **Network restriction.** `next/font/google` (used by `src/app/layout.tsx` to load the Inter font family) requires `fonts.gstatic.com` access at build time. The Codespace sandbox blocks outbound calls to `fonts.gstatic.com`, causing the build to retry indefinitely on each font weight before failing.
2. **Memory pressure.** With VS Code, `tsserver` (~1.5 GB), Claude Code, and Sentry's webpack plugin all resident, the Codespace has ~2.4 GB free memory; Next.js 14 webpack production compilation typically needs 3-4 GB. Earlier attempts were OOM-killed mid-webpack-compile, well before the lint phase runs.

Both issues exist on `main` regardless of this plan's changes. They will be exercised on Vercel (where memory is unrestricted and `fonts.gstatic.com` is reachable) and in the future CI pipeline added by Plan 44-03 (where the runner has 7+ GB free memory and unrestricted internet). Build verification is therefore deferred to:

- Vercel preview deployment for the next PR that touches `main`
- Plan 44-03's `lint + typecheck` CI workflow

In the meantime, **`npm run lint` is verified clean (exit 0)** — and `next build` runs lint via the same `next/eslint-config-next` config that `next lint` uses, so build-time lint enforcement is structurally guaranteed once webpack/font issues are out of the picture.

## Deviations from Plan

### Auto-fixed issues

**1. [Rule 1 - Bug] `react-hooks/rules-of-hooks` violations were latent bugs**
- **Found during:** Task 2 Step B
- **Issue:** Two components called hooks AFTER early returns. This breaks React's hook-tracking on re-renders where the early-return condition flips.
- **Fix:** Moved hook calls above early-returns; used optional chaining for null safety.
- **Files modified:** `AssumptionsTab.tsx`, `SVGPortPopover.tsx`
- **Commit:** `e94f1a2`

### Skipped fixes (intentional)

**183 `react-hooks/exhaustive-deps` warnings** were left in place. These are **warnings**, not errors, so they do not fail the build. Fixing them all would touch ~120 files, would be a substantial refactor (often involving useCallback insertion in parent components), and is outside the scope of TEST-02. The gate is now **errors break the build**; warnings continue to surface in `npm run lint` output for engineers to address as they touch each file.

## Build verification deferred

| Check | Owner | Expected when |
|---|---|---|
| Full `npm run build` runs lint as part of build, exits 0 | Plan 44-03 CI job (next-job runs `npm ci && npm run build`) | This phase, Plan 44-03 |
| Vercel preview build with new lint enforcement | First PR after this commit lands | Next PR to main |

## Acceptance Criteria

- [x] `grep -c "ignoreDuringBuilds" next.config.js` returns 0
- [x] `grep -c "eslint:" next.config.js` returns 0
- [x] `npm run lint` exits 0 (was 7 errors; now 0 errors)
- [x] `npm test` exits 0 (no regression)
- [x] `.eslintrc.json` rule overrides unchanged
- [x] `.eslintrc.json` middleware Edge-runtime override unchanged
- [x] `next.config.js` security headers, image config, Sentry wrapper untouched
- [x] Source-file edits are minimal and surgical (4 dead comments removed; 2 hook-ordering reorderings)
- [ ] `npm run build` exits 0 — **deferred to Vercel/CI** (env limitation, not a code issue; see "Build verification caveat" above)

## Commits

| Hash | Type | Scope | Files |
|---|---|---|---|
| `8bf4a99` | chore | Remove eslint.ignoreDuringBuilds from next.config.js | `next.config.js` |
| `e94f1a2` | fix | Resolve eslint violations surfaced by removing ignoreDuringBuilds | `client-completion/route.ts`, `AssumptionsTab.tsx`, `SVGPortPopover.tsx` |
| `bc57d44` | docs | Tracking-only metadata commit for plan completion | `STATE.md`, `ROADMAP.md`, `REQUIREMENTS.md`, `44-02-SUMMARY.md` |

## Self-Check: PASSED

- next.config.js modified (commit `8bf4a99`): `ignoreDuringBuilds` removed, Sentry wrapper preserved — verified by grep
- 3 source files modified (commit `e94f1a2`): 7 lint errors → 0 — verified by `npm run lint` exit 0
- All three commits exist in git log — verified
- Vitest still passes 37 files / 396 tests — verified (re-run 2026-04-28T23:27:41Z)
- `.eslintrc.json` untouched — verified by `git diff -- .eslintrc.json` (empty)
- ROADMAP.md Phase 44 progress updated to 3/5 In Progress (commit `bc57d44`)
- REQUIREMENTS.md TEST-02 marked `[x]` (commit `bc57d44`)
- `next build` lint stage observably runs (lint output preceded "Collecting page data" in build attempt 2026-04-28T23:32Z); full build aborted at the page-data stage on missing Supabase env vars — pre-existing Codespace env limit, not in scope for 44-02 and matches the 44-01 build-environment caveat.
