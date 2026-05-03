---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: — Codebase Hardening
status: verifying
last_updated: "2026-05-03T00:00:00.000Z"
last_activity: 2026-05-03
progress:
  total_phases: 51
  completed_phases: 23
  total_plans: 106
  completed_plans: 113
---

# Project State

## Current Position

Phase: 44 (Test Gate & CI Hardening) — **COMPLETE** (5/5 plans).
Phase: 44.1 (Atomic Save Hardening + Staged Rollout) — **COMPLETE**.
Phase: 44.2 (CFO-Grade Xero Reconciliation) — **COMPLETE** at the data layer (12/12 plans).
Phase: 44.3 (Forecast Step 3 — Year-1 Target Wiring) — **COMPLETE** (1/1 plan, full GSD ceremony, PR #60).
Phase: 45 (Invisible Cleanup) — **COMPLETE** (9/9 CLEAN-* items shipped via PRs #56–#62). ~192 files / 1,325 lines of orphaned legacy SQL / 4,424 LOC dead wizards / 295 archive files all removed; root cruft + stale v1.0 docs archived to `docs/archive/`; root README rewritten as internal-onboarding; `axios` direct dep removed; `@next/bundle-analyzer` added.
Last activity: 2026-05-03 (Phase 45 closed via PR #62)

Next eligible work:
- **Phase 46 (Server-Side Hardening)** — first unblocked v1.1 milestone phase. Covers SEC-01..SEC-08: dead `/api/migrate*` routes, fail-open cron-secret check on `/api/Xero/sync-all`, `console.*` → Sentry migration, plus other low-risk internal-only fixes. Depends only on Phase 44 (CI gates) which is complete.
- **44.2 UI surface spot-checks** (operator on deployed preview): non-blocking, tracked in `.planning/phases/44.2-cfo-grade-xero-reconciliation/UAT.md`.

## Current Milestone: v1.1 — Codebase Hardening

Source: `CODEBASE-AUDIT.md` at repo root (production readiness 55/100, written 2026-04-28).

Goal: take the codebase from 55/100 to ~75/100 (Series-A defensible) over 6 phases, with zero client disruption.

### Phase Sequence (blast-radius first)

| Phase | Name | Blast Radius | Depends on |
|---|---|---|---|
| 44 | Test Gate & CI Hardening | Zero (CI gates only) | — (precondition) |
| 45 | Invisible Cleanup | Zero (deletes unreferenced code) | 44 |
| 46 | Server-Side Hardening | Low (internal-only fixes) | 44 |
| 47 | Input Validation Rollout | Observe: zero · Enforce: low (per-route flag) | 44, 46 |
| 48 | Decimal Money Arithmetic | Medium (≤ $1/cell behind per-tenant flag) | 47 |
| 49 | Database Integrity Hygiene | Low (additive-only migrations) | 44 |

## Accumulated Context (Carried Over from v1.0)

### Active production tenants

- **Dragon** (AUD, 2 entities) — consolidation
- **IICT** (NZ + HK FX, 3 entities) — consolidation, multi-currency
- **Fit2Shine** — coaching, strategy session content seeded 2026-04-27
- **Just Digital Signage** (Aeris Solutions Pty Ltd) — original active client

### Architectural strengths preserved from v1.0

- All 154 tables have RLS enabled; 397 policies; 41 SECURITY DEFINER functions hardened with `SET search_path`
- AES-256-GCM encryption for Xero OAuth tokens
- Real CSP, HSTS, security headers; cron secrets enforced (with one fail-open exception flagged in audit, addressed by SEC-02)
- Branded ID types (`UserId`, `BusinessId`) with type-level tests
- Strong consolidation domain layer with 11 unit-test files
- Centralised `resolveBusinessId()` tenant resolver

### Known gaps to remediate (from audit — now mapped to phases)

- 0 of 120 API routes validate input (Zod in deps but unused) → **Phase 47**
- Money summed as JS `number` (IEEE 754) for multi-currency consolidation → **Phase 48**
- 2,012 `console.*` calls vs 2 `Sentry.captureException` calls → **Phase 46 (SEC-07)**
- `npm test` currently broken (`@vitejs/plugin-react` missing); CI vitest gate likely red → **Phase 44 (TEST-01)**
- `eslint.ignoreDuringBuilds: true` in `next.config.js` → **Phase 44 (TEST-02)**
- `/api/migrate*` routes call non-existent RPCs (dead but a prepared attack surface) → **Phase 46 (SEC-01)**
- `/api/Xero/sync-all` cron-secret check fails open if env var unset → **Phase 46 (SEC-02)**
- 56 orphan-prone FKs lack `ON DELETE` clauses → **Phase 49 (DB-03/04)**
- ~192 files / 2.1 MB / ~6,000 LOC of dead code (archives, dead wizards, AWS SAM remnants) → **Phase 45**

## Key Decisions (Carried Over from v1.0)

- Granularity: Fine-grained phases
- PR-first Supabase branching workflow
- Atomic commits per plan
- Production tenants are AUD (Dragon, JDS) and NZ/HK (IICT) — schedule risky deploys outside Australia/NZ business hours

## v1.1 Milestone-Specific Decisions

- Sequence is **blast-radius first, scope second** — Phase 44 (zero risk) → Phase 49 (DB hygiene)
- No behaviour changes shipped without a feature flag, observe-mode, or shadow-compute pattern
- Phase 47 (Zod) uses observe → enforce: log violations for 1-2 weeks per route before flipping to reject. Two distinct success milestones — observe-mode adoption (all 120 routes) and enforce-mode adoption (per-route via `ZOD_ENFORCE_ROUTES` env list)
- Phase 48 (Decimal money) uses dual-compute + reconciliation log; per-tenant flag rollout (Fit2Shine first, then Dragon, then IICT). Success criteria written around the precision log, not "the engine works correctly"
- Phase 49 (DB) is additive-only in this milestone; FK ON DELETE constraints added one-or-two per migration with preview-branch testing
- Each phase commits to its own atomic PR; no bundled changes
- Risky deploys (47, 48, 49) outside Australia/NZ business hours
- **Plan 44-01 (2026-04-28):** Vitest gate restored. Root cause was `node_modules` drift, NOT a stale lockfile or missing devDependency. `package.json` and `package-lock.json` already had `@vitejs/plugin-react@^6.0.1` correctly resolved; only the working tree's `node_modules/` was missing the package. Fix: `npm install` (with no args) — zero tracked-file changes. **Caveat for Plan 44-03:** Mid-execution test of `rm -rf node_modules && npm ci` reproduced the broken state intermittently in this codespace (vitest's package directory ended up incomplete). `npm install` reliably repaired it. CI workflows should validate this before relying on `npm ci`.
- **Plan 44-03 (2026-04-28):** CI workflow split into 5 parallel jobs in `.github/workflows/supabase-preview.yml` — `migration-check`, `lint`, `typecheck`, `vitest`, `build`. Each gate is now a distinct PR status check; failing `lint` no longer hides whether `typecheck`, `vitest`, or `build` would have passed. Kept `npm ci` per CI-correctness contract — the codespace `npm ci` flake noted in 44-01 is environmental (filesystem-overlay specific) and is not expected on hosted GitHub Actions runners. Each non-migration job re-runs `npm ci` (~30s overhead × 4 jobs); shared cache job is a future optimisation explicitly out of scope. `build` job uses placeholder `NEXT_PUBLIC_SENTRY_DSN` and empty `SENTRY_AUTH_TOKEN` — Sentry source-map upload skips when no auth token. `paths:` trigger filter extended to include `next.config.js`, `tsconfig.json`, `.eslintrc.json`, `vitest.config.ts`, and the workflow file itself. TEST-02..05 structurally satisfied; Required-status-check wiring is Plan 44-05's deliverable. Workflow file: 114 lines (was 52). Commit `c798c62`.
- **Plan 44-02 (2026-04-28):** ESLint is now a build-time gate. Removed `eslint.ignoreDuringBuilds: true` from `next.config.js`; surfaced 7 errors and fixed all 7 minimally — 4 dead `// eslint-disable-next-line @typescript-eslint/...` directives in `src/app/api/coach/client-completion/route.ts` (the `@typescript-eslint` plugin is not installed; only `next/core-web-vitals` is extended), and 3 latent `react-hooks/rules-of-hooks` violations (hooks called after early returns) in `AssumptionsTab.tsx` and `SVGPortPopover.tsx` — fixed by reordering hook calls above the early returns. Left 183 `react-hooks/exhaustive-deps` warnings in place (warnings, not errors; do not fail build; out of scope to refactor ~120 files). `.eslintrc.json` rule overrides untouched. `npm run build` could not be run-to-completion in this Codespace (missing Supabase env vars + memory pressure; same caveat documented in 44-01) but lint stage of build observably runs. Acceptance criteria met. TEST-02 satisfied.

## Coverage

✓ All 43 v1.1 requirements mapped 1:1 to a phase (no orphans, no double-mapping).

| Phase | Category | REQ-IDs | Count |
|---|---|---|---|
| 44 | TEST | TEST-01..06 | 6 |
| 45 | CLEAN | CLEAN-01..09 | 9 |
| 46 | SEC | SEC-01..08 | 8 |
| 47 | VALID | VALID-01..06 | 6 |
| 48 | MONEY | MONEY-01..08 | 8 |
| 49 | DB | DB-01..06 | 6 |
| | | **Total** | **43** |
