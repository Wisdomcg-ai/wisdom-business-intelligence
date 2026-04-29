# Phase 47: Input Validation Rollout

**Milestone:** v1.1 — Codebase Hardening
**Status:** Not started
**Source:** `CODEBASE-AUDIT.md` Top-10 #3, Section A (Security), written 2026-04-28

## Goal

Every API boundary validates its input. Use **observe → enforce** to ship safely: log violations 1-2 weeks per route before rejecting, then flip enforcement on per-route via env var. End state: 120/120 API routes have a Zod schema and the `ZOD_ENFORCE_ROUTES` allowlist contains every route in the codebase.

## Why now

- 0 of 120 API routes validate request bodies today. Zod is already in `package.json` (`^4.0.17`) and unused. Auditors and Series-A diligence will flag this immediately.
- Phase 47 has two distinct success milestones: **observe-mode adoption** (every route has a schema, but parse failures still log-and-continue) and **enforce-mode adoption** (parse failures return 400). They are sequenced — observe lands first across all 120 routes, then routes flip to enforce in waves.
- Done after Phase 46 because the observe-mode `zod:would-reject` events use `Sentry.captureException` — that has to be the standard logging path before observe-mode logging is meaningful.

## Dependencies

- **Phase 44 (Test Gate & CI Hardening)** — needed so `withSchema` middleware refactors are caught by typecheck/test on PR.
- **Phase 46 (Server-Side Hardening)** — specifically SEC-07 (Sentry as the structured-logging sink). `zod:would-reject` events go to Sentry; without SEC-07 the observe-mode signal is invisible.

## Blast Radius

**Observe mode: zero — every parse failure is logged but the request continues with the raw body. Enforce mode: low — gated by per-route allowlist (`ZOD_ENFORCE_ROUTES` env var), flipped after 1-2 weeks of zero `zod:would-reject` events on that route.** Read-only routes flip to enforce first; admin write routes second; forecast/consolidation last. Any 400-reject regression is reversible by removing the route from the env-var list — no code change needed.

## Requirements (1:1 from REQUIREMENTS.md)

- **VALID-01** — Build `src/lib/api/with-schema.ts` middleware. `withSchema(schema, handler)` wrapper that, on parse failure, logs to Sentry as `zod:would-reject` and (in observe mode) continues with raw body, or (in enforce mode, gated by `ZOD_ENFORCE_ROUTES` env list) returns 400 with `error.flatten()`.
- **VALID-02** — Add Zod schemas (in observe mode) to the 5 highest-risk read-only routes: `/api/coach/stats`, `/api/notifications`, `/api/health`, `/api/admin/check-auth`, `/api/cfo/summaries`.
- **VALID-03** — Add Zod schemas (in observe mode) to the 8 highest-risk admin write routes: `/api/admin/clients` (POST/PATCH/DELETE), `/api/admin/coaches`, `/api/admin/reset-password`, `/api/admin/clients/resend-invitation`, `/api/team/invite`, `/api/team/remove-member`, `/api/clients/send-invitation`, `/api/coach/clients/[id]`.
- **VALID-04** — Add Zod schemas (in observe mode) to forecast/consolidation/Xero write routes (~25 routes including `/api/forecasts/*`, `/api/forecast/*`, `/api/Xero/sync*`, `/api/consolidation/*`, `/api/cfo/report-status`).
- **VALID-05** — Sweep the remaining ~80 API routes — any route with a request body gets a Zod schema (in observe mode).
- **VALID-06** — After 1-2 weeks of zero `zod:would-reject` events per route, flip routes to enforce mode by adding their paths to `ZOD_ENFORCE_ROUTES`. Read-only routes flip first; admin write routes second; forecast/consolidation last.

## Success Criteria (observable)

**Observe-mode adoption (VALID-01 through VALID-05):**

1. **`grep -rln "withSchema(" src/app/api/ | wc -l` reports 120 routes** — every route in the codebase has a schema attached. (Validates VALID-02..05 collectively; the `withSchema` middleware must exist per VALID-01.)
2. **Sentry's `zod:would-reject` events show baseline traffic across all 120 routes** within 7 days of full observe rollout — i.e. routes are wired up correctly (any genuine schema mismatches surface), and false-positive volume gives us the data needed to refine schemas before flipping to enforce.

**Enforce-mode adoption (VALID-06):**

3. **Every read-only route in VALID-02 reports zero `zod:would-reject` events for 7 consecutive days** before being added to `ZOD_ENFORCE_ROUTES` — proven by a Sentry saved-search per route.
4. **Every admin write route in VALID-03 is in `ZOD_ENFORCE_ROUTES`** with the same 7-days-zero-events evidence per route.
5. **`ZOD_ENFORCE_ROUTES` contains all 120 routes** by phase end — i.e. an unknown-shape body to any route returns 400 with a Zod `error.flatten()`, not a 500 or silent acceptance. (Validates VALID-06 fully.)

## Evidence in audit

- `grep -rn "from 'zod'" src/app/api/` returns 0 matches despite Zod `^4.0.17` in `package.json` (audit Top-10 #3).
- `/api/team/invite/route.ts:42-53` accepts `email`, `role`, `businessId` typed as `any` — representative of the pattern across all 120 routes (audit Top-10 #3).
- Audit `.audit-tmp/correctness.md` finding #1 lists 120 routes with no input validation.

## Out of scope for this phase

- CSRF token validation (deferred — VALID-01's `withSchema` is the right hook to add CSRF later, but not in this phase).
- Output schema validation (request validation only; response-side schemas deferred).
- GraphQL or any new transport — REST routes only.
- Any route refactor beyond adding the wrapper (no signature changes, no auth-pattern changes).

## Plans

TBD — to be drafted at `/gsd-plan-phase 47`.
