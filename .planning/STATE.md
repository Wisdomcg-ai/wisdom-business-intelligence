---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: — Codebase Hardening
status: executing
last_updated: "2026-04-28T22:07:54.810Z"
last_activity: 2026-04-28
progress:
  total_phases: 49
  completed_phases: 17
  total_plans: 69
  completed_plans: 66
  percent: 96
---

# Project State

## Current Position

Phase: 44 (Test Gate & CI Hardening) — EXECUTING
Plan: 2 of 5
Status: Ready to execute
Last activity: 2026-04-28

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
