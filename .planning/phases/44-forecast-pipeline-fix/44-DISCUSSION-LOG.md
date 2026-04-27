# Phase 44: Forecast Pipeline End-to-End Fix — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in `44-CONTEXT.md` — this log preserves the alternatives considered.

**Date:** 2026-04-27
**Phase:** 44-forecast-pipeline-fix
**Areas discussed:** Strategy & scope envelope, Xero sync architecture, Wizard data materialization, Regression fence + sparse-tenant UX

---

## Strategy & Scope Envelope

### Posture

| Option | Description | Selected |
|--------|-------------|----------|
| Harden + retire reactive layer | Keep working architecture; replace ad-hoc safeguards with named invariants. ~3-5 plans. | |
| Rebuild sync + materializer cleanly | New canonical sync module that handles every Xero quirk by design; xero_pl_lines re-shaped if needed; new wizard read contract. ~6-10 plans. | ✓ |
| Surgical bug-fix only | Just close open bugs, add a couple tests, move on. | |

**User's choice:** Rebuild sync + materializer cleanly.
**Notes:** Confirms the phase title's "world-class" promise; matches the user's "go deep before shipping" principle.

### Scope (multi-select)

| Option | Description | Selected |
|--------|-------------|----------|
| Xero sync layer + xero_pl_lines invariants | New canonical sync module + DB-level constraints. Replaces sync-all/sync-forecast/refresh-pl ad-hoc logic. | ✓ |
| Wizard data flow + materialization contract | When forecast_pl_lines is written; draft vs published; single read API. | ✓ |
| Wizard UX (correct first time) | Sensible Xero defaults, sparse-data warnings, validation gates. | ✓ |
| Downstream consumers (monthly report + cashflow) | Update consumers to read via new contract. | ✓ |

**User's choice:** All four.
**Notes:** Full pipeline rebuild — 8-12 plans expected.

### Rollout

| Option | Description | Selected |
|--------|-------------|----------|
| Bottom-up, prove each layer on real tenants | Sync first, then materialization, then wizard UX, then consumers. Each layer ships before next starts. | ✓ |
| Big-bang behind a feature flag | Build new pipeline alongside old; cut over per business. | |
| Parallel workstreams, integrate at end | Sync, wizard UX, consumers in parallel. | |

**User's choice:** Bottom-up, prove each layer on real tenants.
**Notes:** Matches "go deep before shipping" memory.

### Truth oracle

| Option | Description | Selected |
|--------|-------------|----------|
| Xero P&L by Month report (per FY, all sections) | Reconcile to what Xero's own report shows. Coach can independently verify. | ✓ |
| Xero single-period totals | FY totals + monthly distribution backed out. Doesn't catch by-month vs totals divergence. | |
| Xero raw account transactions | Pull transaction lines, aggregate ourselves. Most accurate but heaviest. | |

**User's choice:** Xero P&L by Month report.
**Notes:** Single, unambiguous oracle a coach can independently verify.

---

## Xero Sync Architecture

### Query model

| Option | Description | Selected |
|--------|-------------|----------|
| One per FY: ProfitAndLoss by month, fromDate=FY start, toDate=FY end, periods=11, timeframe=MONTH | Mirrors Xero UI; avoids rolling-totals trap and sparse-base bug. | ✓ |
| One query per month (12 calls per FY) | Bulletproof but 12× API cost. | |
| Hybrid: by-month + single-period sanity check | Primary by-month, secondary totals for self-consistency. | |

**User's choice:** One per FY.
**Notes:** Sanity-check via single-period totals reappears as a separate "reconciliation contract" decision below.

### FY range

| Option | Description | Selected |
|--------|-------------|----------|
| Current FY YTD + prior FY (2 FYs) | Lightest API load; covers wizard prior-year + variance. | ✓ |
| 3 FYs (current + prior + prior-prior) | Negligible extra cost; useful for established tenants. | |
| Configurable per business | Default 2; coach can set 3-5. | |

**User's choice:** 2 FYs.
**Notes:** Configurable depth deferred.

### Race / concurrency

| Option | Description | Selected |
|--------|-------------|----------|
| pg_advisory_xact_lock per business_id | Cheap, drop-on-contend, no extra table. | |
| sync_jobs row with status state machine | Persists run history. | |
| Idempotency-key + ON CONFLICT upsert | Concurrent syncs converge. | |
| Combined: sync_jobs + advisory lock + ON CONFLICT upsert | All three layers. | ✓ |

**User's choice:** Combined pattern (after asking "what's best practice here?").
**Notes:** Engineering recommendation accepted: audit table + advisory lock + idempotent upsert. The dedup-after-the-fact code in sync-all (e337a42) is removed once natural-key uniqueness is enforced.

### Reconciliation contract

| Option | Description | Selected |
|--------|-------------|----------|
| Self-consistency check + fail-loud on mismatch | sum(monthly columns) == single-period total per account; failure writes to sync_jobs.error. | ✓ |
| Trust by-month, no reconciliation pass | Smaller surface; risks parser bug shipping silently. | |
| Reconcile by category subtotals only | Fast; catches section-level dropouts only. | |

**User's choice:** Self-consistency check, fail-loud.

### Multi-org per business

| Option | Description | Selected |
|--------|-------------|----------|
| Sync ALL orgs and aggregate into xero_pl_lines | Sum at write time. | |
| Sync ALL orgs, keep separate, sum at read time | xero_pl_lines stores per-tenant rows; tenant_id column. | ✓ |
| One "primary" org per business | Simplest; breaks consolidation. | |

**User's choice:** Per-tenant rows, aggregate at read.

### Sparse-tenant policy

| Option | Description | Selected |
|--------|-------------|----------|
| Treat partial as success, expose coverage to UI | Store what Xero returned + coverage record on sync_jobs. | ✓ |
| Fail sync if coverage < threshold | Brittle for legitimate new tenants. | |
| Zero-pad missing months silently | Loses signal — real $0 vs missing month indistinguishable. | |

**User's choice:** Partial = success, coverage exposed.

### Sync trigger

| Option | Description | Selected |
|--------|-------------|----------|
| Manual button + on-demand only | Coach triggers; no background. | |
| Manual + nightly Vercel cron | Always within 24h; cron heartbeats sync_jobs. | ✓ |
| Manual + cron + Xero webhook | Sub-hour staleness; larger surface. | |

**User's choice:** Manual + nightly cron at 02:00 AEST (after asking "which is best practice?").
**Notes:** Engineering recommendation accepted: manual + cron is the sweet spot at this scale (18 active businesses); Xero webhooks don't cover P&L events anyway.

---

## Wizard Data Materialization

### Materialization timing

| Option | Description | Selected |
|--------|-------------|----------|
| On every assumption change (debounced autosave) | Always-fresh; heaviest writes. | |
| On explicit Save / Generate only | Predictable; easy to forget — caused e337a42 bug. | |
| On assumption change + on-demand recompute API | Always-fresh + recovery hatch. | |
| Same-txn eager + recompute API + computed_at timestamp | Atomic; recovery; staleness-detection. | ✓ |

**User's choice:** Same-txn eager + recompute API + computed_at (after asking "what's best practice here?").
**Notes:** Engineering recommendation accepted: spreadsheet semantics — assumption save and forecast_pl_lines derivation in one transaction. computed_at column lets consumers detect staleness.

### Read API

| Option | Description | Selected |
|--------|-------------|----------|
| Single canonical composite endpoint | One endpoint serves all consumers. | |
| ForecastReadService + per-consumer endpoints | Service is canonical logic; thin handlers per consumer. | ✓ |
| Direct DB reads via shared helpers | Lightest abstraction; most drift risk. | |

**User's choice:** Service + per-consumer endpoints (after asking "what's best practice here?").
**Notes:** Engineering recommendation accepted: separate logic from transport. Three consumers (wizard, monthly report, cashflow) have genuinely different shape needs; one service backs all of them.

### Active forecast resolution

| Option | Description | Selected |
|--------|-------------|----------|
| Single is_active forecast per (business, FY) | Per unique_active_forecast_per_fy index. Drafts not visible downstream until activated. | ✓ |
| Most recent draft regardless of is_active | No publish step; coach can't experiment. | |
| Coach picks per-context | Adds UI surface. | |

**User's choice:** Single is_active per FY.

---

## Regression Fence + Sparse-Tenant UX

### Test strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Recorded Xero responses (HTTP fixtures) + parser unit tests | Deterministic, fast, captures wire shape. | ✓ |
| Live integration tests against Xero demo company | Most realistic; risk of demo-state drift. | |
| Both (fixtures + nightly demo-company E2E) | Highest cost. | |

**User's choice:** Recorded Xero responses.

### Fixture tenants (multi-select)

| Option | Description | Selected |
|--------|-------------|----------|
| Envisage Australia (sparse + duplicates + rolling-totals) | Empirically hardest case. | ✓ |
| Just Digital Signage (canonical happy path) | Baseline benchmark. | ✓ |
| Fit2Shine (extended period + new business) | Phase 43 driver. | |
| Synthetic "all edge cases" composite | Hand-crafted edge case coverage. | |

**User's choice:** Envisage + Just Digital Signage.

### Sparse-tenant UX (asked twice — needed clarification first time)

| Option | Description | Selected |
|--------|-------------|----------|
| Banner + per-month indicators + safe defaults | Coverage banner; — for missing months; defaults computed from known months. | ✓ |
| Banner + safe defaults but keep $0 in grid | Less surface change. | |
| Block wizard entry below threshold | Brittle for new tenants. | |
| Silent — defer UX to later phase | Smallest scope. | |

**User's choice:** Banner + per-month indicators + safe defaults.
**Notes:** First version of question was too compressed; user asked for explanation. Sparse-tenant means "Xero genuinely doesn't have enough data" (new business, mid-FY onboard, multi-org with one short-history entity, partial response). Different from rolling-totals/dedup bugs (wrong data that LOOKS complete) — sparse data is real but incomplete.

### Runtime invariants

| Option | Description | Selected |
|--------|-------------|----------|
| At every consumer boundary | assumptions.updated_at <= forecast_pl_lines.computed_at; sum reconciles to assumptions; coverage non-negative. | ✓ |
| Sync side only | Lighter. | |
| Skip — DB constraints + tests are enough | Smallest production surface. | |

**User's choice:** Every consumer boundary.
**Notes:** Mirrors Phase 39 runtime-invariant pattern.

---

## Claude's Discretion

- `ForecastReadService` class location, exact column types for `sync_jobs`, Sentry tag conventions, exact recompute endpoint route, fixture JSON shape.
- `xero_pl_lines.tenant_id` migration approach (nullable add + backfill vs versioned table).
- Cron auth mechanism (Vercel Cron Secret).
- Backoff/retry policy for Xero rate-limit hits.
- Whether to consolidate `sync-all` / `sync-forecast` / `refresh-pl` into one route or keep as thin shims around shared service.

## Deferred Ideas

- Webhook-driven sync (Xero invoice/contact webhooks).
- Per-business configurable FY depth (3-5 FYs).
- Synthetic edge-case composite fixture.
- What-if mode for monthly report (draft selection).
- Live demo-company E2E tests.
- Fit2Shine HTTP fixture.

---

## Recurring user pattern

User asked "what's best practice here?" / "which is best practice?" three times during discussion (race/concurrency, materialization timing, sync trigger). Interpret as: "give me the canonical industry pattern with reasoning, then I'll commit." Engineering judgement is welcomed when argued. All three engineering recommendations were accepted.
