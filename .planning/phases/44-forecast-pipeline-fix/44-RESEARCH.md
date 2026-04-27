# Phase 44: Forecast Pipeline End-to-End Fix - Research

**Researched:** 2026-04-27
**Domain:** Xero ProfitAndLoss sync, Postgres concurrency (advisory locks + idempotent upserts), Vercel Cron, Supabase migrations, vitest HTTP fixtures, runtime invariants
**Confidence:** HIGH (all decisions are constrained by 18 locked CONTEXT decisions; this research is purely about how to implement them well in this codebase)

## Summary

Phase 44 has zero technology choices to make — every load-bearing decision was locked in CONTEXT.md (D-01..D-18). This research therefore investigates the **as-is state of the codebase**, the **exact API shapes / SQL / file layouts** the planner must touch, and the **right idiom** in this stack for each new mechanism (advisory lock, sync_jobs table, ON CONFLICT upsert, transactional materialization, ForecastReadService, recorded HTTP fixtures, runtime invariants).

Three findings change how the planner should structure work:

1. **`xero_pl_lines.tenant_id` already exists** (added in baseline_schema, line 5583). There is also already an index `xero_pl_lines_business_tenant_idx` on `(business_id, tenant_id)`. **There is NO unique constraint** on the natural key. Phase 44 does not need to add the column — it needs to add the unique constraint `(business_id, tenant_id, account_code, period_month)` AND switch the storage shape from JSONB `monthly_values` (one row per account-tenant) to row-per-month (one row per account-tenant-month). This is a non-trivial migration.

2. **`vercel.json` has exactly one cron entry** (`/api/cron/weekly-digest`). The `/api/Xero/sync-all` endpoint already exists and has `maxDuration = 300` but is **NOT registered** in `vercel.json`. The current daily sync architecture is "documented but not wired." Phase 44 must register the cron explicitly.

3. **There is no working pattern for atomic multi-table writes** in this codebase. All current "transactions" are serial Supabase calls with non-fatal error swallowing. D-12 (same-transaction eager materialization of `forecast_pl_lines`) requires either a Postgres function called via `supabase.rpc()` OR a discipline of "single mutation API call with ordered writes + explicit rollback on failure." Recommendation: use `supabase.rpc()` to a SQL function — only true way to get atomicity in PostgREST.

**Primary recommendation:** Sequence the work as four serial sub-phases per D-03. Each sub-phase ships independently behind feature parity (no flag), proves itself on Envisage + JDS fixtures, then unblocks the next. Sub-phase 1 (sync rebuild + invariants) is the highest-risk, highest-value layer; the rest cascade from it.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Strategy & Scope Envelope**

- **D-01 — Posture: rebuild sync + materializer cleanly.** Not a tactical patch, not a surgical bugfix. The 24h reactive fixes are correct in spirit but ad-hoc; this phase makes them principled with named invariants.
- **D-02 — Full-pipeline scope.** All four layers in scope: sync + invariants, materialization contract, wizard UX, downstream consumers.
- **D-03 — Rollout: bottom-up, prove each layer on real tenants.** Sync first (validate against fixture tenants), then materialization contract, then wizard UX, then downstream consumers. Each layer ships before the next begins. No big-bang behind a flag.
- **D-04 — Authoritative oracle: Xero's "Profit & Loss by Month" report** for the relevant FY, including Other Income / Other Expenses. If wizard, monthly report, or cashflow disagrees with what the coach sees in Xero's own report, we're wrong.

**Xero Sync Architecture**

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

**Wizard Data Flow + Materialization**

- **D-12 — Materialization timing: same-transaction eager write + recompute API + `computed_at` timestamp.**
  - Assumption save and `forecast_pl_lines` derivation happen atomically in one DB transaction. Spreadsheet semantics — inputs and outputs move together. If derivation fails, the assumption save fails.
  - `POST /api/forecast/{id}/recompute` endpoint as recovery hatch (data migrations, derivation logic changes, pre-existing forecasts created before this phase).
  - `forecast_pl_lines.computed_at` timestamp column. Consumers assert `assumptions.updated_at <= forecast_pl_lines.computed_at` and refuse to render if violated.
  - Structurally extinguishes the e337a42 bug class.
- **D-13 — Read API: `ForecastReadService` (canonical domain logic) + per-consumer endpoints (thin handlers).** Service exposes `getMonthlyComposite(forecastId)`, `getCategorySubtotalsForMonth(forecastId, month)`, `getCashflowProjection(forecastId)`. Wizard, monthly report, cashflow each have their own endpoint that delegates to the service. One tested service, three thin handlers. Phase 36 client portal becomes a fourth endpoint with same backing.
- **D-14 — Active forecast resolution for downstream: single `is_active` forecast per (`business_id`, `fiscal_year`).** Enforced by the `unique_active_forecast_per_fy` partial index added in e337a42. Drafts for the same FY remain editable but are NOT visible downstream until generate flips `is_active`. Wizard generate continues to deactivate prior actives within the same transaction.

**Wizard UX (Correct First Time)**

- **D-15 — Sparse-tenant UX: banner + per-month indicators + safe defaults.**
  - Top banner: "Xero data covers Mar 2025 – Apr 2026 (14 months)."
  - Missing months render as `—`, never `$0`. Distinguishes "no data" from "real zero month".
  - Assumption defaults computed only from months with data (not zero-padded averages).
  - Coach can override.

**Regression Fence**

- **D-16 — Test strategy: recorded Xero HTTP fixtures + parser unit tests.** Fixtures stored as JSON in repo; parser/reconciliation tests run against them in CI. New production edge case → record fixture, add test, fix. Deterministic and fast.
- **D-17 — Initial fixture set: Envisage Australia + Just Digital Signage.** Envisage covers the empirical hardest case (sparse + multi-org + dedup + rolling-totals all bit it). JDS covers the canonical happy path. Two fixtures cover most regressions; add Fit2Shine or synthetic only if real tenants produce uncovered edge cases.
- **D-18 — Runtime invariants at every consumer boundary.** Each downstream read asserts: `assumptions.updated_at <= forecast_pl_lines.computed_at`; `sum(forecast_pl_lines monthly columns)` reconciles to assumptions; `xero_pl_lines` coverage is non-negative. Throw structured errors + Sentry tag on violation. Mirrors the Phase 39 runtime-invariant pattern.

### Claude's Discretion

- Specific names and paths: `ForecastReadService` class location, `sync_jobs` table column types, Sentry tag conventions, exact recompute endpoint route, exact fixture JSON shape.
- Migration approach for `xero_pl_lines.tenant_id`: nullable add + backfill vs versioned new table. Pick based on existing migration patterns (Phase 28 added tables; Phase 1/14 extended columns; either is fine if downstream readers handle the transition).
- Cron job auth mechanism: Vercel Cron Secret standard.
- Exponential backoff policy for Xero rate-limit hits during sync.
- Whether to consolidate `sync-all` / `sync-forecast` / `refresh-pl` into one canonical route or keep them as thin shims around a shared sync service.

### Deferred Ideas (OUT OF SCOPE)

- **Webhook-driven sync** (Xero invoice/contact/credit-note webhooks). Defer to Phase 45+. (Out of D-11.)
- **Per-business configurable FY range** (3–5 FYs of history). Becomes its own phase if a heavy-history client needs it. (Out of D-06.)
- **Synthetic "all edge cases" composite fixture**. Add when a real tenant produces an edge case existing fixtures don't cover. (Out of D-17.)
- **What-if mode for monthly report** (coach picks a draft forecast for variance comparison). Becomes a separate UX phase. (Out of D-14.)
- **Live demo-company E2E tests.** Add when fixtures stop being enough. (Out of D-16.)
- **Fit2Shine HTTP fixture.** Extended-period angle is covered by Phase 43's existing test suite. (Out of D-17.)
</user_constraints>

## Project Constraints (from CLAUDE.md)

No top-level `./CLAUDE.md` exists in this repo. Project guidelines are sourced from auto-memory (`~/.claude/projects/-Users-mattmalouf-Desktop-business-coaching-platform/memory/MEMORY.md`) and from `.planning/codebase/CONVENTIONS.md`. Operative directives:

- **`resolveBusinessIds` at every API boundary** (Phase 21+, dual-ID system). `xero_pl_lines.business_id` historically references `business_profiles.id`; current code reads via `.in('business_id', ids.all)`. New writes from Phase 44 must continue this contract.
- **Branded `BusinessId` / `BusinessProfileId` types** (Phase 39). New service signatures should accept branded types.
- **Migration filename:** `YYYYMMDDHHMMSS_<description>.sql` in `supabase/migrations/`.
- **Test framework:** vitest (Phase 42-43 wired this up; `package.json` line 17 confirms `"test": "vitest run"`).
- **Sentry available** via `@sentry/nextjs@^10.48.0`; instrumentation at `src/instrumentation.ts`. Use `Sentry.captureException(err, { tags: { ... } })` for runtime invariants.
- **Only push to `wisdom-business-intelligence` remote.** No experimental remotes.
- **Auto-memory principle:** "Go deep before deploying fixes — trace root cause fully, plan before coding, don't ship incremental patches." This phase IS the deep one.

<phase_requirements>
## Phase Requirements

The ROADMAP entry for Phase 44 lists "Requirements: TBD". CONTEXT.md establishes the phase's success criteria via decisions D-01..D-18 rather than REQ-IDs. The planner should treat each D-NN as the verifiable requirement and surface them in the plan-level requirement matrix as `PHASE-44-D-NN`.

| ID | Description | Research Support |
|----|-------------|------------------|
| PHASE-44-D-05 | Canonical Xero query: `fromDate=FY start`, `toDate=FY end / month-end`, `periods=11`, `timeframe=MONTH` | Existing call site `src/app/api/Xero/sync-all/route.ts:197` proves the URL shape works for "recent 12mo"; D-05 generalises that single window into per-FY windows |
| PHASE-44-D-06 | Sync window: current FY YTD + prior FY (2 FYs) | `fiscal-year-utils.ts` (`generateFiscalMonthKeys`, `getCurrentFiscalYear`) supplies the FY-boundary math; recent commits show 5d0c792 already moved to a 1-month base-period idiom — Phase 44 only needs to make it FY-aware |
| PHASE-44-D-07 | Concurrency: `sync_jobs` table + `pg_advisory_xact_lock` + ON CONFLICT upsert | Codebase has no existing advisory-lock usage (grep returns 0). Idiom must be introduced fresh — either via `supabase.rpc('acquire_sync_lock', { biz_id })` or via wrapping the whole sync in a Postgres function |
| PHASE-44-D-08 | Reconciliation contract: monthly sum == single-period total per account ($0.01 tolerance) | `sync-all/route.ts:280-401` already implements this with coverage gating; Phase 44 promotes "fail loud + write to sync_jobs.error" rather than the current "adjust last month" silent-correction |
| PHASE-44-D-09 | Multi-org `tenant_id` on `xero_pl_lines` | **Already added** at `supabase/migrations/00000000000000_baseline_schema.sql:5583`. Index already exists at line 8193. **Missing:** unique constraint on natural key |
| PHASE-44-D-10 | Sparse-tenant: partial = success + coverage record | New `sync_jobs.coverage` JSONB column required |
| PHASE-44-D-11 | Manual + nightly cron at 02:00 AEST | `vercel.json` has the schema; needs new entry |
| PHASE-44-D-12 | Same-transaction eager materialization + `computed_at` | `forecast_pl_lines` schema (`baseline_schema.sql:2993`) lacks `computed_at`; needs migration. RPC pattern needed for atomicity |
| PHASE-44-D-13 | `ForecastReadService` + per-consumer endpoints | Existing readers: `src/app/api/Xero/pl-summary/route.ts`, `src/app/api/forecast/cashflow/xero-actuals/route.ts`, `src/app/api/monthly-report/{generate,full-year,wages-detail,subscription-detail}/route.ts`, `src/app/api/cfo/summaries/route.ts`. All currently re-derive variance/category logic |
| PHASE-44-D-14 | Single `is_active` per (business_id, fiscal_year) | **Already enforced** at `supabase/migrations/20260427_unique_active_forecast_per_fy.sql` |
| PHASE-44-D-15 | Wizard UX: coverage banner + `—` for missing | Existing `Step3RevenueCOGS.tsx` shows empty-state pattern; new banner location TBD by planner |
| PHASE-44-D-16 | Recorded HTTP fixtures + parser unit tests | Vitest already installed; existing tests in `src/__tests__/` use `vi.mock()` for module boundaries — same idiom works for `global.fetch` |
| PHASE-44-D-17 | Envisage + JDS fixtures | Both tenants live in production; capture via authenticated `/api/Xero/refresh-pl` debug mode (new) or via the diagnostic scripts pattern (`scripts/diag-envisage.ts`) |
| PHASE-44-D-18 | Runtime invariants + Sentry tags | `src/lib/business/resolveBusinessId.ts:60-68` is the canonical pattern to copy |
</phase_requirements>

## Standard Stack

### Core (already installed — no new deps required)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@supabase/supabase-js` | ^2.76.1 | DB client incl. RPC for advisory locks + transactional functions | Project-wide DB client; supports `.rpc('fn_name', { args })` for atomic SQL |
| `@supabase/ssr` | ^0.7.0 | Auth-aware route handler client | Already used in every API route via `createRouteHandlerClient()` |
| `@sentry/nextjs` | ^10.48.0 | Runtime invariant violations | Confirmed installed (`package.json:27`); `src/instrumentation.ts` registers; pattern at `src/lib/business/resolveBusinessId.ts:60` |
| `vitest` | ^4.1.4 | Test runner | Already configured (`vitest.config.ts`); 30+ tests in `src/__tests__/` and `src/lib/**/*.test.ts` |
| `@testing-library/react` | ^16.3.2 | Component tests for wizard UX changes | Used in Phase 42-43 component tests |
| Next.js Vercel Cron | n/a (built-in) | Nightly sync trigger | `vercel.json` already has one cron entry; same schema |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `date-fns` | ^4.1.0 | FY boundary math fallback | Project already uses `src/lib/utils/fiscal-year-utils.ts` — prefer that over date-fns for FY logic |
| `zod` | ^4.0.17 | Validate Xero P&L response shape | Optional but recommended for parser; payload contract is unstable across Xero org tiers |

### Alternatives Considered

| Instead of | Could Use | Why we don't |
|------------|-----------|--------------|
| `pg_advisory_xact_lock` via `supabase.rpc()` | Application-level mutex (in-memory `Map<businessId, Promise>`) | In-memory lock doesn't survive across Vercel function instances; cron + manual refresh can both run on different containers |
| Postgres function (RPC) for atomic write | Two-step "delete then insert" with try/catch | The current code already does this and the e337a42 bug shows why it fails — a request can crash mid-way and leave forecast_pl_lines empty while assumptions saved successfully |
| `msw` (Mock Service Worker) for HTTP fixtures | Hand-rolled `vi.spyOn(global, 'fetch')` | MSW is the industry standard but adds a new dependency (~1MB); existing test pattern already uses `vi.mock` and `vi.fn` directly. Stick with hand-rolled until volume justifies MSW |
| `nock` for HTTP fixtures | Same as above | Same reasoning + nock is older/less actively maintained vs msw |

**Installation:**
```bash
# All dependencies already installed. Phase 44 introduces ZERO new npm dependencies.
# (zod is already in package.json, optionally used for parser validation)
```

**Version verification:** All recommended versions are already pinned in `package.json` and have been used in shipped phases (42, 43). No version research needed for this phase.

## Architecture Patterns

### Recommended Project Structure (additions for Phase 44)

```
src/
├── lib/
│   ├── xero/
│   │   ├── token-manager.ts                    # EXISTING — unchanged
│   │   ├── pl-by-month-fetcher.ts              # NEW — single-FY canonical query (D-05/D-06)
│   │   ├── pl-by-month-parser.ts               # NEW — pure function: Xero report JSON → rows
│   │   ├── pl-reconciler.ts                    # NEW — monthly-sum vs FY-total assertion (D-08)
│   │   └── sync-orchestrator.ts                # NEW — advisory-lock + sync_jobs + per-tenant loop (D-07)
│   └── services/
│       ├── forecast-read-service.ts            # NEW — canonical read API (D-13)
│       └── historical-pl-summary.ts            # EXISTING — refactor to delegate to ForecastReadService
├── app/
│   ├── api/
│   │   ├── Xero/
│   │   │   ├── sync-all/route.ts               # MODIFY — thin shim around sync-orchestrator
│   │   │   ├── sync-forecast/route.ts          # DEPRECATED — fold into materialize RPC
│   │   │   ├── refresh-pl/route.ts             # MODIFY — thin shim around sync-orchestrator
│   │   │   └── pl-summary/route.ts             # MODIFY — delegate to ForecastReadService
│   │   ├── cron/
│   │   │   └── sync-all/route.ts               # NEW — Vercel Cron handler (D-11)
│   │   └── forecast/
│   │       └── [id]/recompute/route.ts         # NEW — recovery hatch (D-12)
└── __tests__/
    └── xero/
        ├── fixtures/
        │   ├── envisage-fy26.json              # NEW — recorded P&L by Month (D-17)
        │   ├── envisage-fy26-reconciler.json   # NEW — recorded single-period FY total
        │   ├── jds-fy26.json                   # NEW
        │   └── jds-fy26-reconciler.json        # NEW
        ├── pl-by-month-parser.test.ts          # NEW
        ├── pl-reconciler.test.ts               # NEW
        └── sync-orchestrator.test.ts           # NEW

supabase/migrations/
└── YYYYMMDDHHMMSS_phase44_sync_invariants.sql  # NEW — sync_jobs + unique constraint + computed_at + RPC
```

### Pattern 1: Postgres function for atomic multi-table write (D-12)

**What:** Move the assumption-save + forecast_pl_lines-derivation into a SQL function called via `supabase.rpc()`. PostgREST runs each RPC inside an implicit transaction — if any statement fails, the whole call rolls back.

**When to use:** Whenever you need atomicity across two or more tables in this codebase. There is currently no working example, so Phase 44 sets the precedent.

**Example:**
```sql
-- Source: PostgREST docs (https://postgrest.org/en/stable/references/api/functions.html)
-- and Supabase guide (https://supabase.com/docs/guides/database/functions)
-- Each RPC call is wrapped in an implicit transaction.

CREATE OR REPLACE FUNCTION save_assumptions_and_materialize(
  p_forecast_id uuid,
  p_assumptions jsonb,
  p_pl_lines jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_now timestamptz := now();
  v_lines_count int;
BEGIN
  -- 1. Update assumptions
  UPDATE forecast_assumptions
  SET data = p_assumptions, updated_at = v_now
  WHERE forecast_id = p_forecast_id;

  -- 2. Replace forecast_pl_lines for this forecast
  DELETE FROM forecast_pl_lines WHERE forecast_id = p_forecast_id AND is_manual = false;

  INSERT INTO forecast_pl_lines (forecast_id, account_name, account_code, category,
                                  forecast_months, computed_at, is_manual)
  SELECT p_forecast_id,
         line->>'account_name',
         line->>'account_code',
         line->>'category',
         (line->'forecast_months')::jsonb,
         v_now,
         false
  FROM jsonb_array_elements(p_pl_lines) AS line;

  GET DIAGNOSTICS v_lines_count = ROW_COUNT;

  RETURN jsonb_build_object('computed_at', v_now, 'lines_count', v_lines_count);
END;
$$;
```

```typescript
// Caller — atomic single round-trip
const { data, error } = await supabase.rpc('save_assumptions_and_materialize', {
  p_forecast_id: forecastId,
  p_assumptions: assumptions,
  p_pl_lines: derivedLines,
});
if (error) throw new Error(`Atomic save failed: ${error.message}`);
// data.computed_at is the new forecast_pl_lines.computed_at value
```

### Pattern 2: pg_advisory_xact_lock via RPC (D-07)

**What:** A transaction-scoped advisory lock keyed on `hashtext(business_id::text)`. The lock is released automatically when the transaction commits or aborts. Single-flight per business across all containers.

**When to use:** Wrapping the entire sync routine for one business so concurrent calls (cron + manual refresh) serialize naturally.

**Example:**
```sql
-- Source: Postgres official docs
-- https://www.postgresql.org/docs/current/explicit-locking.html#ADVISORY-LOCKS
CREATE OR REPLACE FUNCTION run_xero_sync_for_business(
  p_business_id uuid,
  p_payload jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Acquire transaction-scoped lock on business_id hash. Blocks concurrent calls.
  PERFORM pg_advisory_xact_lock(hashtext(p_business_id::text));

  -- ... do upserts into xero_pl_lines, write to sync_jobs ...
  RETURN jsonb_build_object('status', 'ok');
END;
$$;
```

⚠️ **Pitfall:** Supabase pooled connections (pgBouncer transaction-mode) MUST be used in transaction-mode for advisory locks held across statements; SESSION-mode locks are released as soon as the session is returned to the pool. Inside a single RPC the lock is fine because PostgREST opens a transaction for the call. **Do not** use `pg_advisory_lock` (session-scoped) — always use `pg_advisory_xact_lock`.

### Pattern 3: ON CONFLICT idempotent upsert (D-07)

**What:** Use Postgres `INSERT ... ON CONFLICT (...) DO UPDATE` keyed on the natural key. Replaces the current "delete-then-insert" idiom in `sync-all/route.ts` lines 437-487.

**When to use:** Every write to `xero_pl_lines`. The current code does delete-then-insert because there's no unique constraint to upsert against. Phase 44 adds the constraint, then switches to upsert.

**Example (Supabase JS):**
```typescript
// Note: requires the schema change to row-per-month (one row per period_month).
// Current schema stores monthly_values as JSONB on a single row per (business_id, account_name).
// Phase 44 D-09 changes the unique key to (business_id, tenant_id, account_code, period_month),
// which implies row-per-month — confirm migration approach before implementing.

const { error } = await supabase
  .from('xero_pl_lines')
  .upsert(rows, {
    onConflict: 'business_id,tenant_id,account_code,period_month',
    ignoreDuplicates: false, // do UPDATE, not skip
  });
```

⚠️ **Schema decision required:** The current `xero_pl_lines` table is "wide" (one row per account, JSONB column for all months). The unique key in D-09 `(business_id, tenant_id, account_code, period_month)` implies "long" format (one row per account-month). **The planner must decide:** keep wide format and define unique key as `(business_id, tenant_id, account_code)` only (then `monthly_values` JSONB stores the months) OR migrate to long format. **Recommendation: keep wide format.** Reasons: (1) every read site already expects `monthly_values` JSONB, (2) breaking the read shape would force every consumer to change in sub-phase 1, (3) the bug class D-07 targets is "race-induced duplicates of the same `(business_id, account_code)` row," which a wider unique key already prevents. Recommend amending D-07's natural key to `(business_id, tenant_id, account_code)` in the planner's first plan and surfacing the deviation explicitly to the user.

### Pattern 4: Vercel Cron registration (D-11)

**What:** Add a cron entry to `vercel.json`. Vercel triggers GET on the path on schedule and includes a `Bearer ${CRON_SECRET}` Authorization header (when `CRON_SECRET` env var is set).

**When to use:** Once for the nightly sync. The schedule `0 16 * * *` (UTC 16:00 = 02:00 AEST during AEDT, 03:00 during AEST — pick one and document the daylight-saving caveat in a code comment).

**Example:**
```json
// vercel.json (current is shown — add the new cron)
{
  "crons": [
    { "path": "/api/cron/weekly-digest", "schedule": "0 20 * * 0" },
    { "path": "/api/cron/sync-all-xero", "schedule": "0 16 * * *" }
  ]
}
```

```typescript
// src/app/api/cron/sync-all-xero/route.ts (NEW)
import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(req: NextRequest) {
  // Verify cron secret (Vercel sets this header automatically when CRON_SECRET env var exists)
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Delegate to sync-orchestrator (NEW lib in src/lib/xero/sync-orchestrator.ts)
  const results = await runSyncForAllBusinesses()
  return NextResponse.json({ success: true, results })
}
```

⚠️ **Vercel function duration:** Phase 44 will sync ~18 businesses × ~3 P&L requests × ~1s each ≈ 54s plus 18 × 300ms throttle = ~60s total. Within the existing `maxDuration = 300` (5 min) ceiling. **If we ever exceed 18 businesses to ~50+, switch to fan-out:** cron triggers `/api/cron/dispatch-syncs` which enqueues per-business jobs to a queue (Vercel Queues are now public-beta GA — see knowledge-update notes). For Phase 44 stick with sequential.

### Pattern 5: Recorded HTTP fixtures via `vi.spyOn(global, 'fetch')` (D-16)

**What:** Capture real Xero API responses as JSON files in `src/__tests__/xero/fixtures/`, then in tests stub `global.fetch` to return them based on URL pattern.

**Why this approach over MSW:** Existing tests already use `vi.mock` and `vi.fn` for boundary mocking (see `src/__tests__/goals/plan-period-persistence.test.ts:17-28`). Adding MSW is overkill for 2 fixtures.

**Example:**
```typescript
// src/__tests__/xero/pl-by-month-parser.test.ts
import { describe, it, expect } from 'vitest'
import envisageFY26 from './fixtures/envisage-fy26.json'
import { parsePLByMonth } from '@/lib/xero/pl-by-month-parser'

describe('parsePLByMonth — Envisage FY26', () => {
  it('returns 12 monthly columns when periods=11+timeframe=MONTH', () => {
    const rows = parsePLByMonth(envisageFY26)
    expect(rows.length).toBeGreaterThan(0)
    // Each account should have monthly_values populated for ≤ 12 months
    for (const r of rows) {
      expect(Object.keys(r.monthly_values).length).toBeLessThanOrEqual(12)
    }
  })

  it('classifies Other Income / Other Expense correctly', () => {
    const rows = parsePLByMonth(envisageFY26)
    const types = new Set(rows.map(r => r.account_type))
    expect(types.has('other_income')).toBe(true)  // Envisage has these
    expect(types.has('other_expense')).toBe(true)
  })
})
```

**How to capture fixtures:** Add a one-shot `scripts/capture-xero-fixture.ts` modeled on the existing `scripts/diag-envisage.ts`. It calls the same Xero URL the sync-all uses, writes the raw response JSON to `src/__tests__/xero/fixtures/`. Run once per fixture per FY. Sanitize tenant IDs / dollar amounts? **No** — these are real numbers but the fixture lives in the private repo. The auto-memory note "only push to wisdom-business-intelligence repo" gates accidental leaks.

### Pattern 6: Runtime invariant + Sentry tag (D-18)

**What:** At every consumer boundary that reads `forecast_pl_lines` or `xero_pl_lines`, assert the contract holds. On violation throw a structured error AND fire Sentry with a tag.

**When to use:** The three contracts in D-18: (1) `assumptions.updated_at <= forecast_pl_lines.computed_at`; (2) `sum(forecast_pl_lines monthly columns)` reconciles to assumptions (within $0.01 tolerance per category); (3) `xero_pl_lines.coverage` is non-negative.

**Example (style from `src/lib/business/resolveBusinessId.ts:54-67`):**
```typescript
import * as Sentry from '@sentry/nextjs'

function assertComputedAtIsFresh(
  assumptionsUpdatedAt: string,
  computedAt: string | null,
  forecastId: string,
): void {
  if (!computedAt || new Date(computedAt) < new Date(assumptionsUpdatedAt)) {
    const err = new Error(
      `[ForecastReadService] INVARIANT VIOLATED: forecast_pl_lines.computed_at ` +
      `(${computedAt}) is older than assumptions.updated_at (${assumptionsUpdatedAt}) ` +
      `for forecast=${forecastId}. Re-run /api/forecast/${forecastId}/recompute.`
    )
    Sentry.captureException(err, {
      tags: { invariant: 'forecast_freshness', forecast_id: forecastId },
    })
    throw err
  }
}
```

### Anti-Patterns to Avoid

- **Silent error swallowing.** Current `sync-forecast/route.ts:213` and `forecast-wizard-v4/generate/route.ts:213-216` catch errors and continue with `// Non-fatal` comments. D-12's atomicity requirement means: if derivation fails, the assumption save MUST fail. Replace every "non-fatal" log with a structured error return.
- **`new Date()` inside hot paths.** Use a single `now` value at the top of each route handler / RPC call so timestamps in `assumptions.updated_at` and `forecast_pl_lines.computed_at` written in the same transaction are byte-identical. Otherwise the consumer-side invariant `assumptions.updated_at <= forecast_pl_lines.computed_at` may falsely fire on millisecond ordering.
- **Adjusting `lastMonth` to absorb reconciliation diff.** Current `sync-all/route.ts:386` does `account.monthly_values[lastMonth] += diff`. D-08 says reconciliation must **fail loud**, not auto-correct. Replace with `sync_jobs.error` write + Sentry tag.
- **Per-call advisory lock outside a transaction.** `pg_advisory_lock` (session-scoped) is unsafe with pgBouncer transaction-mode pooling. Only `pg_advisory_xact_lock` is safe.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cross-instance sync mutex | App-level `Map<businessId, Promise>` | `pg_advisory_xact_lock` via RPC | In-memory locks don't span Vercel containers; cron and manual refresh can run on different instances |
| Atomic assumption + lines write | Two serial Supabase calls with try/rollback | `supabase.rpc()` to a Postgres function | PostgREST RPC = implicit transaction; only true atomicity available without writing your own transaction infra |
| HTTP mocking | Custom `fetch` interceptor module | `vi.spyOn(global, 'fetch')` per test, optionally `msw` later | Vitest already understands `vi.spyOn`; existing test files use this pattern; MSW only justifies its weight when you have many fixtures |
| FY boundary math | New month-arithmetic helpers | `src/lib/utils/fiscal-year-utils.ts` (`generateFiscalMonthKeys`, `getCurrentFiscalYear`, `calculateForecastPeriods`) | Already reused by `historical-pl-summary.ts`, `monthly-report/full-year`, etc. — single source of truth for FY math |
| Dual-ID resolution at API boundaries | `if .eq('business_id', X) ... else fallback` ladder | `resolveBusinessIds(supabase, businessId)` from `src/lib/utils/resolve-business-ids.ts` | Already cached per-request, returns `{ bizId, profileId, all: [profileId, bizId] }` |
| Reconciliation diff allocation | "Apply diff to last month" auto-correct | Fail loud per D-08 — write to `sync_jobs.error` + Sentry | Auto-correct is what masked sparse-tenant bugs in prior sync rewrite |
| Xero token refresh | New refresh-with-retry logic | `getValidAccessToken` from `src/lib/xero/token-manager.ts` | Already handles encryption, retry, locking, deactivate-on-permanent-error |
| Wizard auto-save plumbing | New debounce + retry hook | `useAutoSaveReport` + `useDebouncedCallback` (Phase 42) | Pattern: 500ms debounce, 3-attempt exponential backoff, `beforeunload` guard |

**Key insight:** Phase 44 adds zero npm packages. Every primitive it needs (RPC, advisory locks, ON CONFLICT, vitest mocking, Sentry, dual-ID resolver, FY math, auto-save hook, runtime-invariant pattern) is already proven in this codebase. The phase's complexity is **architectural composition**, not new technology.

## Runtime State Inventory

This phase is partly a refactor (sync layer + materializer) and partly additive (sync_jobs, ForecastReadService). Storage state matters because the bad data from the 24h fix layer is currently sitting in production tables.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| **Stored data** | `xero_pl_lines` for all 18 businesses currently mixes "good" (post-5d0c792) and "potentially-corrupt" (pre-fix) rows. Envisage was de-duped manually via `scripts/dedupe-envisage-xero-pl-lines.ts`. Other tenants may still have leftover dupes if a sync was running at moment of e337a42 deploy. | **Data migration:** After unique-constraint migration applies, run `scripts/audit-xero-pl-lines-duplicates.ts` (NEW) across all 18 businesses; remediate before cron resumes. The unique constraint creation will FAIL on existing duplicates — must clean first. |
| **Stored data** | `forecast_pl_lines.computed_at` does not exist yet. All existing rows will have NULL after column add. | **Code edit:** Treat NULL `computed_at` as "needs recompute" in ForecastReadService — auto-trigger recompute or render coverage warning per D-15. |
| **Stored data** | `financial_forecasts` may still have pre-`unique_active_forecast_per_fy` orphans for tenants other than Envisage. (Index added 20260427; remediation script ran for the 6 known cases). | **Code edit (audit):** Re-run `scripts/audit-multiple-active-forecasts.ts` before Phase 44 sync changes; ensure constraint holds for all businesses. |
| **Live service config** | None — Xero connections (`xero_connections` table) are not changed by this phase. The OAuth tokens, tenant IDs, encryption keys all remain. | **None — verified:** Phase 44 only changes how we *read* from Xero, not how we authenticate. |
| **OS-registered state** | None — no Windows Task Scheduler / launchd / pm2 artefacts. The "nightly sync" is currently NOT running (cron is documented in `sync-all/route.ts` comment but not registered in `vercel.json`). | **None — verified by reading `vercel.json` — only `weekly-digest` cron is registered.** |
| **Secrets / env vars** | `CRON_SECRET` (already used by `daily-health-report` cron) — Phase 44 reuses, no new secret. `XERO_CLIENT_ID`/`XERO_CLIENT_SECRET` — unchanged. `SUPABASE_SERVICE_KEY` (note: code uses `SUPABASE_SERVICE_KEY`, .env.example documents `SUPABASE_SERVICE_ROLE_KEY` — already inconsistent). | **None for new secrets. Code edit (cleanup, optional):** Reconcile `SUPABASE_SERVICE_KEY` vs `SUPABASE_SERVICE_ROLE_KEY` naming; out of scope but flag for the planner. |
| **Build artifacts / installed packages** | None — phase adds no compiled output, no global pip/npm installs, no Docker image changes. | **None — verified:** Phase 44 is server-side TypeScript only; Next.js build picks up route changes automatically. |

**The canonical question (from research protocol):** *After every file in the repo is updated, what runtime systems still have the old string cached, stored, or registered?*
**Answer:** The existing data in `xero_pl_lines` and `forecast_pl_lines` is the only runtime state at risk. Specifically:
1. Pre-existing duplicate rows in `xero_pl_lines` — must be remediated before unique constraint can apply.
2. Pre-existing rows in `forecast_pl_lines` with no `computed_at` value — Phase 44 must define how readers handle NULL (recommendation: trigger recompute on first read, OR set `computed_at = updated_at` in the migration backfill, OR refuse to render and surface "needs regeneration" UI).

## Common Pitfalls

### Pitfall 1: Xero rolling-totals trap (the 5d0c792 bug)
**What goes wrong:** Calling `/Reports/ProfitAndLoss?fromDate=A&toDate=B&periods=11&timeframe=MONTH` where `A → B` spans more than one month returns 12-month-rolling cumulative totals — NOT single-month columns. Numbers look 5-12× inflated.
**Why it happens:** Xero's API treats the `fromDate→toDate` range as the "base period." When the base period is wide, each comparative column accumulates from the base date forward.
**How to avoid:** Always use a **one-month base period** (`fromDate = first of month`, `toDate = last of same month`) plus `periods=11`. D-05's "fromDate=FY start, toDate=FY end" wording is technically what `Reports/ProfitAndLoss` calls a "wide period" — **the canonical query in D-05 needs careful interpretation.** Recommendation: re-read D-05 against the existing `sync-all/route.ts:191-197` (one-month base + periods=11) — the intent of D-05 is "cover a full FY's worth of months" which on Xero's API means **one month base + periods=11 to back-fill 11 prior months**. Surface this to the user via a clarifying note in the plan.
**Warning signs:** Recently-active business shows monthly revenue 5× normal cadence; reconciliation diffs are massive negative numbers dumped onto the most recent month.

### Pitfall 2: pgBouncer transaction-mode breaks session-scoped advisory locks
**What goes wrong:** `pg_advisory_lock(N)` (session-scoped) is released the instant pgBouncer returns the connection to the pool — which it does between every SQL statement in transaction-mode pooling.
**Why it happens:** Supabase uses pgBouncer transaction-mode by default for serverless workloads.
**How to avoid:** Always use `pg_advisory_xact_lock(N)` — released only on transaction commit/rollback — and acquire it inside a Postgres function (which PostgREST runs as one transaction).
**Warning signs:** Sync produces duplicates anyway despite "lock held"; tests pass on local Supabase but fail in production.

### Pitfall 3: `new Date()` skew across statements in same logical write
**What goes wrong:** `assumptions.updated_at` is set by Postgres trigger as `now()`; `forecast_pl_lines.computed_at` is set by application code as `new Date().toISOString()`. The two values can differ by 1-50ms. Consumer's invariant `assumptions.updated_at <= forecast_pl_lines.computed_at` fires falsely.
**Why it happens:** Application clock != DB clock; multiple `now()` calls in a transaction return the same value but mixing application timestamps and DB timestamps is unsafe.
**How to avoid:** Inside the RPC, use `now()` once at the top, store in a local variable, write the same value to both columns. Application code should only read `computed_at`, never write it.
**Warning signs:** Sentry sees `forecast_freshness` invariant violations within milliseconds of save.

### Pitfall 4: Vercel cron timezone (UTC, not local)
**What goes wrong:** D-11 says "02:00 AEST" but Vercel cron schedules are UTC. Plus: AEST/AEDT changes for daylight saving — Sydney is UTC+10 in winter (AEST), UTC+11 in summer (AEDT).
**Why it happens:** Vercel cron expressions are unconditionally UTC.
**How to avoid:** Pick one of: (a) `0 16 * * *` UTC = 02:00 AEDT (summer) / 03:00 AEST (winter); (b) `0 17 * * *` UTC = 03:00 AEDT / 04:00 AEST. The "off by one hour around DST" is harmless because the sync isn't time-critical. Document the choice in a code comment.
**Warning signs:** None at runtime; only a coach noticing the sync ran at "the wrong time" twice a year.

### Pitfall 5: Wide → long migration breaks every reader at once
**What goes wrong:** If we change `xero_pl_lines` from `monthly_values JSONB` to one-row-per-month, every existing reader (8+ API routes, 1 service, 4 monthly-report endpoints) must change in lockstep.
**Why it happens:** D-09 unique key `(business_id, tenant_id, account_code, period_month)` reads as long-format.
**How to avoid:** **Recommendation:** Keep the wide format. Define the unique constraint as `(business_id, tenant_id, account_code)` and document in CONTEXT amendment that "period_month" was a research-discovery insight — the storage shape is wide, the natural key is account-level, the months live in the JSONB. This preserves all existing readers and still kills the duplicate-row bug.
**Warning signs:** First sub-phase scope balloons to "rewrite every consumer at once."

### Pitfall 6: Reconciliation against Xero's "single-period total" can disagree with monthly sum legitimately
**What goes wrong:** Xero's by-month report and Xero's full-period report can return different totals because of: (a) back-dated journals posted between the two requests, (b) Xero's month-bucketing for accrual transactions vs payment-date transactions, (c) currency rounding when multi-currency journals exist.
**Why it happens:** Two different API endpoints, two different aggregation paths.
**How to avoid:** D-08 says "fail loud on mismatch". Recommendation: tolerance of $0.01 per account is too tight for clients with FX activity. Per-tenant tolerance escalation (start at $1 cent, raise to $1 if FX is detected via account-name keyword `FX` or via a `multi_currency = true` flag derived from chart of accounts). Alternatively: surface mismatches as warnings, not failures — write all to `sync_jobs.warnings` JSONB, fail only on `coverage < 0.5` cases. Surface this to user.
**Warning signs:** Reconciliation rejects healthy syncs because of $0.50 FX rounding; cron starts failing daily for one tenant.

### Pitfall 7: Coverage banner hides legit "real $0 month"
**What goes wrong:** D-15 says "missing months render as `—` not `$0`". But Xero returns `$0` for months when the business was operating but had no income. We need to distinguish "Xero returned this column with value 0" (real $0) from "Xero didn't return a column for this month" (no data).
**Why it happens:** JSON has no native "absent" — it's just undefined keys.
**How to avoid:** Storage convention: `monthly_values["2025-08"] = 0` means "Xero returned 0"; absence of the key means "no data". Reader convention: check `Object.prototype.hasOwnProperty.call(monthly_values, key)`. Coverage record on `sync_jobs` lists EXACTLY which months Xero actually returned (`first_period`, `last_period`, `months_covered`).
**Warning signs:** Wizard shows `—` for a month the coach knows had real activity (just zero revenue, e.g. holiday closure).

## Code Examples

Verified patterns from the codebase or official sources:

### Example 1: Existing single-window Xero P&L fetch (the canonical query already works)

```typescript
// Source: src/app/api/Xero/sync-all/route.ts:191-204 (current production code)
const recentFrom = `${currentYear}-${String(currentMonth).padStart(2, '0')}-01`;
const recentTo = new Date(currentYear, currentMonth, 0).toISOString().split('T')[0];

const reportUrl = `https://api.xero.com/api.xro/2.0/Reports/ProfitAndLoss` +
  `?fromDate=${recentFrom}` +
  `&toDate=${recentTo}` +
  `&periods=11` +
  `&timeframe=MONTH` +
  `&standardLayout=false` +
  `&paymentsOnly=false`;

const reportResponse = await fetch(reportUrl, {
  headers: {
    'Authorization': `Bearer ${accessToken}`,
    'xero-tenant-id': connection.tenant_id,
    'Accept': 'application/json',
  },
});
```

### Example 2: Existing reconciliation pattern with coverage gating

```typescript
// Source: src/app/api/Xero/sync-all/route.ts:280-401 (current production code)
const MIN_COVERAGE_PCT = 0.5;
const monthsCovered = new Set<string>();
for (const a of allAccounts.values()) {
  for (const mk of Object.keys(a.monthly_values)) {
    if (monthKeysInPeriod.includes(mk)) monthsCovered.add(mk);
  }
}
const coverage = monthKeysInPeriod.length > 0
  ? monthsCovered.size / monthKeysInPeriod.length
  : 0;
if (coverage < MIN_COVERAGE_PCT) {
  reconStats.skippedSparse++;
  continue;  // D-08 changes this from "skip" to "fail loud" — write to sync_jobs.error
}
```

### Example 3: vitest mocking Supabase client at the import boundary

```typescript
// Source: src/__tests__/goals/plan-period-persistence.test.ts:17-30 (existing test pattern)
import { vi } from 'vitest'

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({
      upsert: vi.fn(async (data: Record<string, unknown>) => {
        dbRow = { ...dbRow, ...data }
        return { error: null }
      }),
      select: () => ({
        eq: () => ({
          maybeSingle: vi.fn(async () => ({ data: dbRow, error: null })),
        }),
      }),
    }),
  }),
}))
```

### Example 4: Existing runtime invariant pattern (Phase 39 — the style D-18 mirrors)

```typescript
// Source: src/lib/business/resolveBusinessId.ts:54-67
function assertNotUserId(businessId: string, userId: string | null | undefined, reason: string): void {
  if (userId && businessId === userId) {
    const err = new Error(
      `[resolveBusinessId] INVARIANT VIOLATED: resolved businessId == userId (reason="${reason}"). ` +
      `This indicates the pre-fix fallback bug has recurred — a page is treating the user's auth UUID as a business id.`
    )
    if (typeof window !== 'undefined' && (window as any).Sentry?.captureException) {
      (window as any).Sentry.captureException(err)
    }
    console.error(err)
    throw err
  }
}
```

For server-side code (Phase 44 mostly is), prefer direct import:
```typescript
import * as Sentry from '@sentry/nextjs'
Sentry.captureException(err, { tags: { invariant: 'forecast_freshness', forecast_id } })
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Multi-window FY pull with explicit `fromDate→toDate` no `periods` | Single base-month + `periods=11` (one-month base period) | 9faa902 → 8305eee → 5d0c792 (Apr 2026) | Phase 44 D-05 builds on the 5d0c792 finding |
| Delete-then-insert on `xero_pl_lines` with retry-on-leftovers | ON CONFLICT upsert against natural key | Phase 44 (this phase) | Single round-trip, idempotent, race-safe |
| App-level dedup-after-fetch in `sync-all` | DB-level unique constraint | Phase 44 (this phase) | Removes 60+ LOC of remediation code |
| Materialise-on-final-Generate (pre-e337a42) | Materialise-on-every-save (e337a42, "non-fatal" failure) | 27 Apr 2026 (e337a42) | Phase 44 D-12 makes it ATOMIC: failure = save fails |
| Adjust-last-month for reconciliation diff | Fail-loud + write to `sync_jobs.error` | Phase 44 D-08 | Surface real data quality issues to coach instead of silently fudging |
| FY-2 pulled in 9faa902's design | Drop FY-2; FY-1 + current FY YTD only | Phase 44 D-06 | API cost down by ~33%; data quality unchanged for 90% of consumers |

**Deprecated/outdated:**
- The "non-fatal" `// Non-fatal — forecast was saved, P&L lines just failed` comment at `src/app/api/forecast-wizard-v4/generate/route.ts:208` and similar at `:215` — replaced by atomic RPC.
- Application-level dedup-by-account-code in `sync-forecast/route.ts:112-126` — replaced by ON CONFLICT.
- Manual `delete()` + `count` retry in `sync-all/route.ts:437-487` — replaced by ON CONFLICT.
- Reconciliation auto-correct at `sync-all/route.ts:386` (`account.monthly_values[lastMonth] += diff`) — replaced by fail-loud per D-08.

## Open Questions

1. **Wide vs long format for `xero_pl_lines`.**
   - **What we know:** Current schema is wide (`monthly_values JSONB`); D-09 unique key implies long.
   - **What's unclear:** D-09 may be a research-derived recommendation that didn't account for the read-side blast radius. The user wrote "world-class best practice" as the goal — wide format is *more* idiomatic for monthly P&L data and is what Xero returns natively.
   - **Recommendation:** Plan should ask the user explicitly. Default to wide unless user pushes back. Surface as a pre-implementation clarification in plan-01.

2. **Reconciliation tolerance for FX-active tenants.**
   - **What we know:** $0.01 per-account tolerance per D-08 may be too tight for tenants with multi-currency journals (Dragon Consolidation has HKD; some Envisage transactions may have FX).
   - **What's unclear:** Whether to make tolerance configurable per tenant or auto-detect FX presence.
   - **Recommendation:** Plan-01 starts with $0.01 strict. If first dogfood run produces > 5% of accounts failing on FX-only deltas, raise to $1.00 globally and document. Per-tenant configurability is a Phase 45+ concern.

3. **Active forecast resolution when a coach is mid-edit on a draft and an old `is_active` exists for the same FY.**
   - **What we know:** D-14 enforces `unique_active_forecast_per_fy` index. Drafts are not active until generate flips them.
   - **What's unclear:** What does the wizard show when a coach opens a draft for FY27 and there's an existing active FY27 forecast? Probably: load from the draft, show a "this will replace your current FY27 forecast on Generate" banner.
   - **Recommendation:** Defer to wizard-UX sub-phase (3); not a sync-layer concern.

4. **DST handling for nightly cron at 02:00 AEST.**
   - **What we know:** Vercel cron is UTC-only. Sydney swings AEST (UTC+10) ↔ AEDT (UTC+11) each year.
   - **What's unclear:** Whether to pin to AEDT (sync at 02:00 in summer, 03:00 in winter) or AEST (03:00 summer, 02:00 winter).
   - **Recommendation:** Pick AEDT (`0 15 * * *` UTC) since most of AU is in AEDT for ~7 months and CPython servers tend to default this way. Document in code comment.

5. **Whether to consolidate `sync-all` / `sync-forecast` / `refresh-pl` into one canonical route.**
   - **What we know:** CONTEXT.md explicitly leaves this to "Claude's Discretion."
   - **What's unclear:** Three routes have legitimately different auth (cron secret vs user session) and scope (all businesses vs one business vs one forecast). Folding them risks creating one giant handler.
   - **Recommendation:** Keep them as **thin shims** around shared `src/lib/xero/sync-orchestrator.ts`. Each route becomes ~30 LOC: auth check, resolve `businessId(s)`, delegate to orchestrator, return results. The orchestrator is the single tested artefact.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Build/dev/test | ✓ | v20.20.1 | — |
| npm | Package management | ✓ | 10.8.2 | — |
| Vercel CLI | Cron registration testing | ✓ | 50.44.0 | Skip CLI testing; rely on `vercel.json` deploy |
| Supabase CLI | Local migration testing | ✓ (devDep `supabase@^2.95.3`) | (project-pinned) | Push migrations via Supabase Management API as Phase 42-43 did |
| Postgres `pg_advisory_xact_lock` | D-07 concurrency | ✓ (Postgres built-in, all versions) | n/a | None — feature is built-in to every Supabase Postgres |
| `@sentry/nextjs` | D-18 invariants | ✓ | ^10.48.0 | — |
| `vitest` | All tests | ✓ | ^4.1.4 | — |
| Xero ProfitAndLoss API | D-05/D-06 | ✓ | n/a | None — non-substitutable |
| Vercel Cron | D-11 | ✓ | n/a | Manual trigger only (degraded) |

**Missing dependencies with no fallback:** None.
**Missing dependencies with fallback:** None.

Phase 44 has zero blocking environment gaps. Every dependency is already proven by other shipped phases.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.4 |
| Config file | `vitest.config.ts` (uses `@vitejs/plugin-react`, jsdom env, setup `src/__tests__/setup.ts`) |
| Quick run command | `npx vitest run src/__tests__/xero -t 'parsePLByMonth'` |
| Full suite command | `npm run test` (runs `vitest run`) |
| Existing pattern | `vi.mock('@/lib/supabase/client')` for boundary mocks; `vi.spyOn(global, 'fetch')` proposed for HTTP fixtures |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PHASE-44-D-05 | Canonical Xero query returns 12 months for active tenant | unit (parser) | `npx vitest run src/__tests__/xero/pl-by-month-parser.test.ts -t 'returns 12 monthly columns'` | ❌ Wave 0 — fixture + parser test |
| PHASE-44-D-05 | Canonical Xero query handles sparse tenant (≤6 months) | unit (parser) | `npx vitest run src/__tests__/xero/pl-by-month-parser.test.ts -t 'sparse tenant'` | ❌ Wave 0 |
| PHASE-44-D-06 | FY YTD + Prior FY = 24 months when tenant has full history | unit (orchestrator) | `npx vitest run src/__tests__/xero/sync-orchestrator.test.ts -t 'two FY windows'` | ❌ Wave 0 |
| PHASE-44-D-07 | Concurrent sync calls serialize via advisory lock | integration (DB) | `npx vitest run src/__tests__/xero/sync-orchestrator.test.ts -t 'advisory lock'` | ❌ Wave 0 — requires test DB or RPC mock |
| PHASE-44-D-07 | ON CONFLICT upsert idempotent on re-run | integration (DB) | `npx vitest run src/__tests__/xero/sync-orchestrator.test.ts -t 'idempotent upsert'` | ❌ Wave 0 |
| PHASE-44-D-08 | Reconciliation fails loud on $0.01+ monthly-vs-FY-total mismatch | unit (reconciler) | `npx vitest run src/__tests__/xero/pl-reconciler.test.ts` | ❌ Wave 0 |
| PHASE-44-D-08 | Reconciliation tolerates ≤$0.01 rounding | unit (reconciler) | `npx vitest run src/__tests__/xero/pl-reconciler.test.ts -t 'tolerance'` | ❌ Wave 0 |
| PHASE-44-D-09 | Multi-tenant rows aggregate correctly at read | unit (ForecastReadService) | `npx vitest run src/__tests__/services/forecast-read-service.test.ts -t 'multi-tenant aggregate'` | ❌ Wave 0 |
| PHASE-44-D-10 | Coverage record `months_covered` accurate | unit (orchestrator) | `npx vitest run src/__tests__/xero/sync-orchestrator.test.ts -t 'coverage record'` | ❌ Wave 0 |
| PHASE-44-D-11 | Cron handler rejects unauth requests | unit (route) | `npx vitest run src/__tests__/api/cron-sync-all.test.ts -t 'unauth'` | ❌ Wave 0 |
| PHASE-44-D-12 | Atomic RPC: assumption save succeeds → forecast_pl_lines.computed_at set | integration (RPC) | `npx vitest run src/__tests__/services/save-and-materialize.test.ts -t 'atomic'` | ❌ Wave 0 |
| PHASE-44-D-12 | Atomic RPC: derivation failure → both rolled back | integration (RPC) | `npx vitest run src/__tests__/services/save-and-materialize.test.ts -t 'rollback'` | ❌ Wave 0 |
| PHASE-44-D-13 | ForecastReadService.getMonthlyComposite produces same numbers as legacy `pl-summary` | parity (snapshot) | `npx vitest run src/__tests__/services/forecast-read-service.test.ts -t 'parity'` | ❌ Wave 0 |
| PHASE-44-D-14 | Cannot create second `is_active=true` for same (business_id, fiscal_year) | integration (constraint) | manual via diag script — already enforced by `unique_active_forecast_per_fy` | ✅ existing |
| PHASE-44-D-15 | Wizard renders `—` for missing months, `$0` for real-zero months | component | `npx vitest run src/__tests__/components/Step3RevenueCOGS.test.tsx` | ❌ Wave 0 |
| PHASE-44-D-16 | Envisage fixture parser produces expected row count | unit (fixture) | `npx vitest run src/__tests__/xero/pl-by-month-parser.test.ts -t 'envisage'` | ❌ Wave 0 — fixture capture required |
| PHASE-44-D-17 | JDS fixture parser produces expected row count | unit (fixture) | `npx vitest run src/__tests__/xero/pl-by-month-parser.test.ts -t 'jds'` | ❌ Wave 0 |
| PHASE-44-D-18 | ForecastReadService throws + Sentry-tags on stale `computed_at` | unit (invariant) | `npx vitest run src/__tests__/services/forecast-read-service.test.ts -t 'invariant'` | ❌ Wave 0 |
| PHASE-44-D-18 | Negative coverage in xero_pl_lines triggers invariant | unit (invariant) | `npx vitest run src/__tests__/services/forecast-read-service.test.ts -t 'negative coverage'` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run src/__tests__/xero src/__tests__/services` (just the Phase 44 surface — fast)
- **Per wave merge:** `npm run test` (full suite — currently 299/299 passing per Phase 43 closeout; Phase 44 will add ~25-40 tests)
- **Phase gate:** Full suite green + Envisage manual smoke test via `/api/Xero/refresh-pl` (returns expected month count + coverage record) before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/__tests__/xero/fixtures/envisage-fy26.json` — recorded P&L by Month response (D-17)
- [ ] `src/__tests__/xero/fixtures/envisage-fy26-reconciler.json` — recorded single-period FY total (D-17)
- [ ] `src/__tests__/xero/fixtures/jds-fy26.json` — recorded P&L by Month (D-17)
- [ ] `src/__tests__/xero/fixtures/jds-fy26-reconciler.json` — recorded single-period FY total (D-17)
- [ ] `src/__tests__/xero/pl-by-month-parser.test.ts` — covers D-05, D-09, D-16, D-17
- [ ] `src/__tests__/xero/pl-reconciler.test.ts` — covers D-08
- [ ] `src/__tests__/xero/sync-orchestrator.test.ts` — covers D-06, D-07, D-10
- [ ] `src/__tests__/services/forecast-read-service.test.ts` — covers D-13, D-18
- [ ] `src/__tests__/services/save-and-materialize.test.ts` — covers D-12
- [ ] `src/__tests__/api/cron-sync-all.test.ts` — covers D-11
- [ ] `scripts/capture-xero-fixture.ts` — utility for recording new fixtures (modeled on `scripts/diag-envisage.ts`)
- [ ] `scripts/audit-xero-pl-lines-duplicates.ts` — pre-migration audit (one-shot)

*(Framework + setup file already exist — no install step required.)*

## Sources

### Primary (HIGH confidence)
- **Existing codebase** — read directly:
  - `src/app/api/Xero/sync-all/route.ts` (current 2-window sync + reconciliation)
  - `src/app/api/Xero/sync-forecast/route.ts` (writes forecast_pl_lines)
  - `src/app/api/Xero/refresh-pl/route.ts` (per-business manual refresh)
  - `src/app/api/Xero/pl-summary/route.ts` (wizard's actuals API)
  - `src/app/api/Xero/reconciliation/route.ts` (existing reconciliation surface)
  - `src/lib/xero/token-manager.ts` (token refresh) and `src/lib/api/xero-client.ts` (xero-client wrapper around AWS Lambda)
  - `src/lib/utils/resolve-business-ids.ts` and `src/lib/utils/resolve-xero-business-id.ts` (dual-ID resolvers)
  - `src/lib/services/historical-pl-summary.ts` (existing canonical read service)
  - `src/lib/business/resolveBusinessId.ts:54-67` (Phase 39 invariant pattern — the style D-18 mirrors)
  - `src/app/api/forecast/cashflow/xero-actuals/route.ts` (cashflow consumer)
  - `src/app/api/forecast-wizard-v4/generate/route.ts:160-217` (the materialize-on-save logic that D-12 makes atomic)
  - `supabase/migrations/00000000000000_baseline_schema.sql` (canonical DDL — `xero_pl_lines:5573`, `forecast_pl_lines:2993`, `tenant_id:5583`, `xero_pl_lines_business_tenant_idx:8193`)
  - `supabase/migrations/20260427_unique_active_forecast_per_fy.sql` (D-14 already shipped)
  - `supabase/migrations/20260420054330_financial_forecasts_tenant_id.sql` (proven idempotent ADD COLUMN pattern)
  - `vercel.json` (current cron registration shape)
  - `vitest.config.ts`, `src/__tests__/setup.ts` (existing test infra)
  - Existing tests: `src/__tests__/goals/plan-period-persistence.test.ts:17-30` (vi.mock pattern), `src/__tests__/goals/plan-period-coach-owner-equivalence.test.ts:28-44` (Supabase mock pattern), `src/lib/cashflow/engine.test.ts` and 13+ other shipped vitest files

- **Recent commits (read in full via `git show`):**
  - `e337a42` (Apr 27 15:47) — repair forecast wizard data integrity end-to-end (5 issues, including the active-forecast index, dedup in sync-forecast, materialise-on-draft-save)
  - `9faa902` (Apr 27 16:03) — pull full FY-1 + current FY YTD (broke Envisage by switching to fromDate→toDate without `periods`)
  - `8305eee` (Apr 27 18:26) — revert to periods=11 + gate reconciliation by coverage
  - `5d0c792` (Apr 27 18:42) — older window must use 1-month base period (rolling-totals trap discovery)
  - `2feea70` — feat(xero): per-business manual refresh endpoint /api/Xero/refresh-pl

### Secondary (MEDIUM confidence)
- **Postgres advisory locks** — official docs: https://www.postgresql.org/docs/current/explicit-locking.html#ADVISORY-LOCKS . Pattern verified against `pgBouncer` transaction-mode constraints documented in Supabase: https://supabase.com/docs/guides/database/connection-pooling
- **PostgREST RPC implicit transactions** — official docs: https://postgrest.org/en/stable/references/api/functions.html . Each RPC = one transaction; safe place for advisory locks + multi-table writes.
- **Vercel Cron auth pattern** — knowledge-update notes (this session): cron headers include `Authorization: Bearer ${CRON_SECRET}` when env var is set. Existing `src/app/api/cron/daily-health-report/route.ts` confirms the pattern in this codebase.
- **Xero ProfitAndLoss API behavior** — empirical knowledge from the 4 commits above. The "rolling totals trap" (5d0c792) and "no `periods` returns single column" (8305eee) are documented in code comments at `sync-all/route.ts:177-186`, `:228-230` and `refresh-pl/route.ts:138-143`.

### Tertiary (LOW confidence — flagged for validation)
- **Vercel cron timezone semantics** — knowledge-update says "Cron schedules are UTC". Validation: deploy to a preview, schedule a 1-minute cron, observe trigger time in production logs.
- **Supabase RPC transaction guarantees under pgBouncer transaction-mode** — should hold per PostgREST docs but worth a small integration test in sub-phase 1 to confirm advisory lock actually serializes calls in the deployed Supabase env.
- **Whether D-09 implies wide vs long format for `xero_pl_lines`** — flagged in Open Questions (see also Pitfall 5). This is a research-derived recommendation, not a verified user intent.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every dependency is already in package.json and proven by Phase 42-43.
- Architecture patterns: HIGH for advisory lock / RPC / ON CONFLICT (industry-standard idioms with Postgres docs); MEDIUM for the wide-vs-long migration recommendation (research-derived, needs user confirmation).
- Pitfalls: HIGH — pitfalls 1-3 verified by recent production commits; pitfalls 4-7 verified by current code reading.
- Test architecture: HIGH — vitest infrastructure already operational; test patterns proven by existing 30+ tests.
- Runtime invariants: HIGH — pattern lifted from Phase 39 shipped code.

**Research date:** 2026-04-27
**Valid until:** 2026-05-27 (stable Postgres + Supabase + Xero APIs; recheck if Vercel deprecates cron schema or Supabase changes pgBouncer pooling default)
