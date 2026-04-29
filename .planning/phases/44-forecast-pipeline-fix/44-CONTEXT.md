# Phase 44: Forecast Pipeline End-to-End Fix — Context

**Gathered:** 2026-04-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Make the pipeline `Xero → xero_pl_lines → forecast wizard → forecast_pl_lines → monthly report → cashflow forecast` **100% reflective of Xero, deterministic, resilient, and correct first-time without coach intervention.** Rebuild the sync layer and the wizard's materialization contract cleanly with named, tested invariants, and retire the ad-hoc 24-hour reactive fix layer (e337a42, 9faa902, 8305eee, 5d0c792) by replacing it with principled architecture.

In scope: (a) Xero sync layer + `xero_pl_lines` invariants, (b) wizard data flow + materialization contract, (c) wizard UX correct first-time, (d) downstream consumers (monthly report + cashflow) updated to read via the new contract.

Out of scope: MYOB connector (Phase 30), wizard UI rebuild from scratch, new categorisation logic, webhook-driven sync, configurable FY depth, what-if forecast selection.

</domain>

<decisions>
## Implementation Decisions

### Strategy & Scope Envelope

- **D-01 — Posture: rebuild sync + materializer cleanly.** Not a tactical patch, not a surgical bugfix. The 24h reactive fixes are correct in spirit but ad-hoc; this phase makes them principled with named invariants.
- **D-02 — Full-pipeline scope.** All four layers in scope: sync + invariants, materialization contract, wizard UX, downstream consumers.
- **D-03 — Rollout: bottom-up, prove each layer on real tenants.** Sync first (validate against fixture tenants), then materialization contract, then wizard UX, then downstream consumers. Each layer ships before the next begins. No big-bang behind a flag.
- **D-04 — Authoritative oracle: Xero's "Profit & Loss by Month" report** for the relevant FY, including Other Income / Other Expenses. If wizard, monthly report, or cashflow disagrees with what the coach sees in Xero's own report, we're wrong.

### Xero Sync Architecture

- **D-05 — Canonical query: one per FY, ProfitAndLoss by month.** Params: `fromDate=FY start`, `toDate=FY end` (or current month-end for current-FY YTD), `periods=11`, `timeframe=MONTH`. Mirrors what Xero's UI shows; avoids both the rolling-totals trap and the sparse-base-period bug discovered in 5d0c792.
- **D-06 — Sync window: current FY YTD + prior FY (2 FYs).** Businesses younger than 2 FYs get best-effort partial data with a coverage warning. FY-2 dropped from 9faa902's design to keep API cost down — most consumers don't use it.
- **D-07 — Race / concurrency / idempotency: combined pattern.**
  - `sync_jobs` audit table (per-run row: `business_id`, `started_at`, `finished_at`, `status`, `error`, `fy_range`, `rows_inserted`, `rows_updated`, `xero_request_count`) — non-negotiable for debuggability and post-incident inspection.
  - `pg_advisory_xact_lock(hashtext(business_id::text))` at the top of the sync routine — single-flight per business.
  - `ON CONFLICT (business_id, tenant_id, account_code, period_month) DO UPDATE` on all `xero_pl_lines` writes — idempotent re-runs.
  - The dedup-after-the-fact code in `sync-all` (e337a42) gets removed once natural-key uniqueness is enforced.
- **D-08 — Reconciliation contract: self-consistency check, fail loud on mismatch.** After parsing the by-month report, fetch Xero's single-period FY total. Assert `sum(monthly columns) == single-period total` per account (tolerance $0.01). Failures write to `sync_jobs.error`; coach is alerted.
- **D-09 — Multi-org per business: sync ALL connected orgs, store per-tenant rows, aggregate at read.** `xero_pl_lines` gains a `tenant_id` column; unique key becomes `(business_id, tenant_id, account_code, period_month)`. Wizard sees consolidated view; debugging tools can drill in. Matches Phase 23 consolidation work.
- **D-10 — Sparse-tenant policy: partial = success, coverage exposed to UI.** Sync stores whatever Xero returned plus a coverage record (`months_covered`, `first_period`, `last_period`) on `sync_jobs`. No silent zero-padding, no fake months. Real `$0` and "no data" must be distinguishable downstream.
- **D-11 — Sync trigger: manual + nightly Vercel cron at 02:00 AEST.** Coach can still manually refresh in-session via the existing `XeroSyncButton` / `refresh-pl` endpoint. Cron also acts as a heartbeat for the `sync_jobs` audit table.

### Wizard Data Flow + Materialization

- **D-12 — Materialization timing: same-transaction eager write + recompute API + `computed_at` timestamp.**
  - Assumption save and `forecast_pl_lines` derivation happen atomically in one DB transaction. Spreadsheet semantics — inputs and outputs move together. If derivation fails, the assumption save fails.
  - `POST /api/forecast/{id}/recompute` endpoint as recovery hatch (data migrations, derivation logic changes, pre-existing forecasts created before this phase).
  - `forecast_pl_lines.computed_at` timestamp column. Consumers assert `assumptions.updated_at <= forecast_pl_lines.computed_at` and refuse to render if violated.
  - Structurally extinguishes the e337a42 bug class.
- **D-13 — Read API: `ForecastReadService` (canonical domain logic) + per-consumer endpoints (thin handlers).** Service exposes `getMonthlyComposite(forecastId)`, `getCategorySubtotalsForMonth(forecastId, month)`, `getCashflowProjection(forecastId)`. Wizard, monthly report, cashflow each have their own endpoint that delegates to the service. One tested service, three thin handlers. Phase 36 client portal becomes a fourth endpoint with same backing.
- **D-14 — Active forecast resolution for downstream: single `is_active` forecast per (`business_id`, `fiscal_year`).** Enforced by the `unique_active_forecast_per_fy` partial index added in e337a42. Drafts for the same FY remain editable but are NOT visible downstream until generate flips `is_active`. Wizard generate continues to deactivate prior actives within the same transaction.

### Wizard UX (Correct First Time)

- **D-15 — Sparse-tenant UX: banner + per-month indicators + safe defaults.**
  - Top banner: "Xero data covers Mar 2025 – Apr 2026 (14 months)."
  - Missing months render as `—`, never `$0`. Distinguishes "no data" from "real zero month".
  - Assumption defaults computed only from months with data (not zero-padded averages).
  - Coach can override.

### Regression Fence

- **D-16 — Test strategy: recorded Xero HTTP fixtures + parser unit tests.** Fixtures stored as JSON in repo; parser/reconciliation tests run against them in CI. New production edge case → record fixture, add test, fix. Deterministic and fast.
- **D-17 — Initial fixture set: Envisage Australia + Just Digital Signage.** Envisage covers the empirical hardest case (sparse + multi-org + dedup + rolling-totals all bit it). JDS covers the canonical happy path. Two fixtures cover most regressions; add Fit2Shine or synthetic only if real tenants produce uncovered edge cases.
- **D-18 — Runtime invariants at every consumer boundary.** Each downstream read asserts: `assumptions.updated_at <= forecast_pl_lines.computed_at`; `sum(forecast_pl_lines monthly columns)` reconciles to assumptions; `xero_pl_lines` coverage is non-negative. Throw structured errors + Sentry tag on violation. Mirrors the Phase 39 runtime-invariant pattern.

### Post-Research Clarifications (locked 2026-04-27 after RESEARCH.md surfaced ambiguities)

- **D-05 (clarification) — Canonical query is one-month base period + `periods=11`.** The original prose "fromDate=FY start, toDate=FY end + periods=11" was loose. Xero treats a wide base period as cumulative-from-fromDate (the rolling-totals trap discovered in commit `5d0c792`). Correct shape: `fromDate = base month start`, `toDate = base month end`, `periods = 11`, `timeframe = MONTH`. Returns 12 single-month columns. Matches what Xero's UI report uses. The base month for current-FY YTD = current month; for prior FY = the last month of that FY.
- **D-09 (clarification) — `xero_pl_lines` storage is LONG format.** One row per `(business_id, tenant_id, account_code, period_month)`. The current wide format with JSONB `monthly_values` is replaced. Unique key enforced at DB level. Industry-canonical time-series shape; idempotent upserts via `ON CONFLICT (business_id, tenant_id, account_code, period_month)` are trivial. The `tenant_id` column already exists in baseline schema; this phase adds the unique constraint and migrates storage shape. Existing ~10 readers (wizard pl-summary, monthly report, cashflow, dashboard, etc.) migrate to `ForecastReadService` (D-13) in the same phase — the service exposes wide-shaped DTOs to UI consumers, decoupling storage shape from presentation shape. Adds ~2-3 plans on top of the prior estimate; embraces the "rebuild cleanly" posture (D-01) over the tactical option.

### Claude's Discretion

- Specific names and paths: `ForecastReadService` class location, `sync_jobs` table column types, Sentry tag conventions, exact recompute endpoint route, exact fixture JSON shape.
- Migration approach for `xero_pl_lines.tenant_id`: nullable add + backfill vs versioned new table. Pick based on existing migration patterns (Phase 28 added tables; Phase 1/14 extended columns; either is fine if downstream readers handle the transition).
- Cron job auth mechanism: Vercel Cron Secret standard.
- Exponential backoff policy for Xero rate-limit hits during sync.
- Whether to consolidate `sync-all` / `sync-forecast` / `refresh-pl` into one canonical route or keep them as thin shims around a shared sync service.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Strategy & Prior Art

- `.planning/PROJECT.md` — vision, primary users, tech stack, AU market context
- `.planning/REQUIREMENTS.md` — R1.1 OpEx double-counting, R2.x forecast wizard requirements
- `.planning/STATE.md` — full Phase 1 → 43 decision log; especially Phase 21 (resolveBusinessIds), Phase 39 (branded types + runtime invariants), Phase 42 (auto-save flow), Phase 43 (plan period explicit state)
- `.planning/codebase/ARCHITECTURE.md` — overall app architecture
- `.planning/codebase/STACK.md` — Next.js 14 App Router + Supabase + Vercel
- `.planning/codebase/STRUCTURE.md` — directory layout conventions
- `.planning/codebase/INTEGRATIONS.md` — Xero integration patterns
- `.planning/codebase/CONVENTIONS.md` — code conventions
- `.planning/codebase/TESTING.md` — test conventions

### The 24h Reactive Fix Layer (this phase retires)

- Commit `e337a42` — `fix(forecast): repair forecast wizard data integrity end-to-end` — introduced `unique_active_forecast_per_fy`, dedup in sync-forecast, materialise-on-draft-save
- Commit `9faa902` — `fix(xero-sync): pull full FY-1 + current FY YTD + reconcile 100%` — added reconciliation pass; broke Envisage when it switched away from `periods=11`
- Commit `8305eee` — `fix(xero-sync): revert to periods=11 + gate reconciliation by coverage` — current production sync architecture
- Commit `5d0c792` — `fix(xero-sync): older window must use 1-month base period` — Xero rolling-totals trap discovery
- Commit `2feea70` — `feat(xero): per-business manual refresh endpoint /api/Xero/refresh-pl` — manual refresh entry point

### Existing Code Touchpoints

- `src/app/api/Xero/sync-all/route.ts` — current 2-window pull + reconciliation
- `src/app/api/Xero/sync-forecast/route.ts` — writes `forecast_pl_lines` from Xero on generate
- `src/app/api/Xero/refresh-pl/route.ts` — per-business manual refresh
- `src/app/api/Xero/pl-summary/route.ts` — wizard's actuals read API
- `src/app/api/Xero/reconciliation/route.ts` — existing reconciliation surface
- `src/app/finances/forecast/` — wizard hooks/services/components (ForecastWizardV4 et al.)
- `src/lib/xero/token-manager.ts`, `src/lib/api/xero-client.ts` — Xero auth + HTTP client
- `src/app/api/forecast/cashflow/xero-actuals/route.ts` — cashflow consumer
- `src/lib/utils/resolve-xero-business-id.ts` — Xero business-ID resolver (Phase 21+ pattern)

### Diagnostic Scripts (accumulated artefacts)

- `scripts/diag-envisage.ts`, `scripts/diag-envisage-deep.ts`, `scripts/diag-envisage-deeper.ts`, `scripts/diag-envisage-active.ts` — diagnostic queries from the 24h fire-fighting
- `scripts/dedupe-envisage-xero-pl-lines.ts` — one-off dedup remediation
- `scripts/audit-multiple-active-forecasts.ts` — multi-active-forecast audit
- `scripts/remediate-duplicate-active-forecasts.ts` — one-off active-forecast remediation
- `scripts/check-envisage-monthly.ts`, `scripts/show-snapshot.ts`, `scripts/show-status.ts` — health-check utilities

### Auto-Memory Constraints

- `~/.claude/projects/-Users-mattmalouf-Desktop-business-coaching-platform/memory/feedback_testing.md` — "Go deep before deploying fixes — plan before coding, don't ship incremental patches"
- `~/.claude/projects/.../memory/project_dual_id.md` — `businesses.id` vs `business_profiles.id` lookup constraints
- `~/.claude/projects/.../memory/feedback_git_remote.md` — only push to `wisdom-business-intelligence`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- `unique_active_forecast_per_fy` partial unique index (e337a42) — the active-forecast contract is already enforced at DB level
- `resolveBusinessIds` (Phase 21+) — multi-format business-ID lookup, must be at every API boundary
- Branded `BusinessId` / `BusinessProfileId` types (Phase 39) — compile-time guard
- `useDebouncedCallback` hook (`src/lib/hooks/use-debounced-callback.ts`, Phase 42) — assumption autosave debounce
- `useAutoSaveReport` (Phase 42) — auto-save with retry pattern
- Sentry integration — runtime invariant violations route here
- Existing Vercel Cron infra patterns (config in `vercel.json` / `vercel.ts` migration available)

### Established Patterns

- Migration files: `YYYYMMDDHHMMSS_*.sql` in `supabase/migrations/`
- Supabase RLS + service-role bypass for cron jobs
- ON CONFLICT upserts for idempotency (already used in Phase 28 cashflow_settings)
- Phase 39 runtime-invariant pattern (assert + structured error + Sentry tag)
- Phase 42 auto-save flow (debounce + retry + queue)

### Integration Points

- Wizard read path: `pl-summary` → migrate to `ForecastReadService.getMonthlyComposite`
- Monthly report read path: monthly-report endpoints → migrate to `ForecastReadService`
- Cashflow read path: `cashflow/xero-actuals` + assumptions endpoints → migrate to `ForecastReadService`
- Sync triggers: existing `XeroSyncButton` (Phase 21-03), `/api/Xero/refresh-pl`, plus new `/api/cron/sync-all` (Phase 44)
- Phase 36 (client portal, future) will be a fourth `ForecastReadService` consumer

</code_context>

<specifics>
## Specific Ideas

- "World-class best practice" in the goal means: source-from-canonical (Xero P&L by Month report), named-and-documented invariants, recoverable, observable. The user is a CFO-level consumer — numerical accuracy is non-negotiable.
- Three real-world fixture tenants are the de-facto regression suite: Envisage Australia (the bug source), Fit2Shine (extended-period planning, Phase 43 driver), Just Digital Signage (happy path). Phase 44 records two as HTTP fixtures (Envisage + JDS); Fit2Shine remains in the Phase 43 test suite for the goals/wizard side.
- The user repeatedly asked "what's best practice here?" during discussion — interpret as "give me the canonical industry pattern with reasoning, then I'll commit". Engineering judgement is welcomed when argued.
- Memory carry-forward: "Go deep before deploying fixes — trace root cause fully, plan before coding, don't ship incremental patches." This phase IS the deep one.

</specifics>

<deferred>
## Deferred Ideas

- **Webhook-driven sync** (Xero invoice/contact/credit-note webhooks). Only justified if a use case demands sub-hour freshness. Defer to Phase 45+. (Out of D-11.)
- **Per-business configurable FY range** (3–5 FYs of history). Current scope is 2 FYs. Becomes its own phase if a heavy-history client needs it. (Out of D-06.)
- **Synthetic "all edge cases" composite fixture** (currency rounding, account renames, accounts-only-in-totals). Add when a real tenant produces an edge case existing fixtures don't cover. (Out of D-17.)
- **What-if mode for monthly report** (coach picks a draft forecast for variance comparison). Current contract: single `is_active` forecast per FY. Becomes a separate UX phase. (Out of D-14.)
- **Live demo-company E2E tests.** Fixtures cover the wire format; live integration would catch auth/connection regressions. Add when fixtures stop being enough. (Out of D-16.)
- **Fit2Shine HTTP fixture.** Extended-period angle is covered by Phase 43's existing test suite on the wizard/goals side; revisit if sync-side regressions emerge. (Out of D-17.)

</deferred>

---

*Phase: 44-forecast-pipeline-fix*
*Context gathered: 2026-04-27*
