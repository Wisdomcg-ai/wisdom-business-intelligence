# Phase 44: Test Gate & CI Hardening

**Milestone:** v1.1 — Codebase Hardening
**Status:** Not started
**Source:** `CODEBASE-AUDIT.md` Top-10 #1 (production readiness 55/100, written 2026-04-28)

## Goal

Every PR is automatically blocked on quality. Make the test gate real, then turn it on. This is the precondition for every other v1.1 phase — without an enforcing CI we cannot trust the changes shipped in Phases 45–49.

## Why first

- All subsequent phases (deletes, server hardening, validation, money arithmetic, DB changes) need a green test/build gate to ship safely.
- The audit confirms `npm test` fails locally on a clean checkout (`Cannot find module '@vitejs/plugin-react'`), and `eslint.ignoreDuringBuilds: true` in `next.config.js:4-6` means ESLint errors don't break builds. Net effect today: nothing is enforced on merge.
- This phase changes zero application code paths — pure CI/dev-experience work.

## Dependencies

- **None.** This is the precondition phase for v1.1. It must land before Phases 45-49.

## Blast Radius

**Zero — no source code changed, only CI gates added.** PRs that previously passed silently may now fail; that's the explicit goal. No production behaviour change.

## Requirements (1:1 from REQUIREMENTS.md)

- **TEST-01** — `npm test` runs successfully on a clean checkout (currently fails: `Cannot find module '@vitejs/plugin-react'`).
- **TEST-02** — CI workflow blocks merges on `next lint` passing (today: ESLint suppressed via `next.config.js:4-6`).
- **TEST-03** — CI workflow blocks merges on `tsc --noEmit` passing (already runs; confirm staying green).
- **TEST-04** — CI workflow blocks merges on `vitest run` passing (already configured but currently broken — see TEST-01).
- **TEST-05** — CI workflow blocks merges on `next build` succeeding.
- **TEST-06** — Nightly Playwright job runs `e2e/smoke.spec.ts` against a Vercel preview URL.

## Success Criteria (observable)

1. **Vitest green on `main`.** A fresh checkout + `npm install && npm test` exits 0 — proven by a CI run after the fix lands. (Validates TEST-01, TEST-04.)
2. **A no-source PR with a lint violation is blocked.** Open a throwaway PR that introduces an ESLint rule violation in (e.g.) a markdown-only file's accompanying TS — CI status check turns red and merge button is greyed out. (Validates TEST-02.)
3. **A no-source PR with a `tsc` error is blocked, and a PR with a failing `next build` is blocked.** Same throwaway-PR test, separate signals. (Validates TEST-03, TEST-05.)
4. **The four required checks (lint, typecheck, vitest, build) appear on every PR's status panel** and are configured as required in branch protection on `main`. (Validates TEST-02..05 collectively.)
5. **Nightly smoke run produces a green Playwright report against a Vercel preview URL** for at least 3 consecutive nights, visible in the GitHub Actions tab. (Validates TEST-06.)

## Evidence in audit

- `npm ls @vitejs/plugin-react` returns `(empty)` despite the package being declared (audit Top-10 #1).
- `next.config.js:4-6` — `eslint.ignoreDuringBuilds: true`.
- `.github/workflows/supabase-preview.yml:51` runs vitest but currently red.
- `e2e/smoke.spec.ts` exists from Phase 40 but no scheduled job.

## Out of scope for this phase

- Adding new tests beyond what's needed to keep existing suites green.
- Coverage thresholds (deferred — first ensure the gate runs at all).
- Pre-commit hooks / husky / prettier (deferred to a later DX milestone).

## Plans

TBD — to be drafted at `/gsd-plan-phase 44`.
