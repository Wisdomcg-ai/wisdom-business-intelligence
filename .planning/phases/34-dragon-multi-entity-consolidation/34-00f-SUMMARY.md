---
phase: 34
plan: 00f
subsystem: consolidation-admin
tags: [admin-ui, fx-rates, tenant-settings, api, consolidation, tenant-model]
requires:
  - phase: 34-00a
    provides: "fx_rates table + unique index (currency_pair, rate_type, period)"
  - phase: 34-00c
    provides: "FX translation engine (loadFxRates + translatePLAtMonthlyAverage)"
  - phase: 34-00e
    provides: "FXRateMissingBanner that deep-links to /admin/consolidation"
provides:
  - POST /api/consolidation/fx-rates — upsert by (currency_pair, rate_type, period)
  - GET /api/consolidation/fx-rates — list with optional currency_pair filter
  - DELETE /api/consolidation/fx-rates/[id] — delete by UUID
  - PATCH /api/consolidation/tenants/[connectionId] — update xero_connections settings
  - /admin/consolidation — index page listing multi-tenant businesses
  - /admin/consolidation/[businessId] — tenant settings + FX entry + rules diagnostic
  - Layout guard mirroring /cfo/layout.tsx (coach + super_admin)
  - Pure admin-guards helpers + 19 unit tests
affects:
  - FXRateMissingBanner deep-link (onAddRate CTA) now lands on a functional page
  - CoachLayoutNew + AdminLayout gained Consolidation nav entry
  - /api/monthly-report/consolidated FX flow is now user-completable end-to-end

tech-stack:
  added: []
  patterns:
    - Dual-client route pattern (createRouteHandlerClient for auth + SUPABASE_SERVICE_KEY for data)
    - Pure-validator helpers unit-tested independently of the route (admin-guards.ts)
    - Per-row optimistic "dirty" draft state — PATCH only on explicit Save
    - Tenant model adaptation — `xero_connections` rows ARE the tenants (post-pivot)

key-files:
  created:
    - src/lib/consolidation/admin-guards.ts
    - src/lib/consolidation/admin-guards.test.ts
    - src/app/api/consolidation/fx-rates/route.ts
    - src/app/api/consolidation/fx-rates/[id]/route.ts
    - src/app/api/consolidation/tenants/[connectionId]/route.ts
    - src/app/admin/consolidation/layout.tsx
    - src/app/admin/consolidation/page.tsx
    - src/app/admin/consolidation/[businessId]/page.tsx
  modified:
    - src/components/layouts/CoachLayoutNew.tsx
    - src/components/admin/AdminLayout.tsx

key-decisions:
  - "Post-pivot adaptation: the plan's original 'consolidation_groups / members' model is replaced by the tenant model throughout. Multi-tenant detection = 2+ active xero_connections with include_in_consolidation=true for the same business_id. consolidation_elimination_rules continue to exist but are scoped by business_id + tenant_a_id/tenant_b_id."
  - "Two routes for fx-rate CRUD rather than one: POST+GET on /api/consolidation/fx-rates, DELETE on /api/consolidation/fx-rates/[id] (idiomatic REST, matches the pivot-era objective spec)."
  - "Index page heuristic for 'FX missing' indicator: check monthly_average rates for last 3 calendar months against all foreign-currency tenants on the business. This is a coarse signal — exact per-report completeness is still driven by /api/monthly-report/consolidated fx_context.missing_rates."
  - "Tenant display list INCLUDES inactive rows so coaches can re-enable them. The index page filters to is_active + include_in_consolidation; the detail page shows everything."
  - "Elimination rules are READ-ONLY in this plan. Creating / editing rules remains a future iteration (plan referenced 34.3+). The detail page shows a clear 'Read-only — edit via migration for now' notice."
  - "Dual-client pattern uses SUPABASE_SERVICE_KEY (not SUPABASE_SERVICE_ROLE_KEY) to match every other route under /api/cfo and /api/monthly-report in this codebase. Service key is read server-side only."
  - "Nav entry added to BOTH CoachLayoutNew and AdminLayout under the main navigation list. Layout guard on /admin/consolidation enforces the actual role check — the nav entry is purely cosmetic."

patterns-established:
  - "Pure validator extraction: admin-guards.ts holds format/shape validators exercised by a dedicated unit-test file. Routes remain thin wiring layers that call validators + Supabase. This keeps test runtime fast (no Next.js handler harness) while still giving real coverage of the error paths."
  - "Role gate helper colocated inline in each route — requireCoachOrSuperAdmin returns a discriminated union so the route can switch on {allowed, status, error}. Avoids a shared util that would import authSupabase at module scope (incompatible with Next.js route handler cookies)."

requirements-completed: [MLTE-01, MLTE-02]

duration: ~10min
completed: 2026-04-20
---

# Phase 34 Plan 00f: Consolidation Admin UI + FX Entry Summary

Ships the admin surface for the post-pivot multi-tenant consolidation: coaches and super_admins can now add / delete HKD/AUD FX rates, tweak per-tenant display settings, and inspect active elimination rules — closing the loop so the amber FXRateMissingBanner from plan 34-00e deep-links to a working page instead of a 404.

## Performance

- **Duration:** ~10 min
- **Started:** 2026-04-20T03:16:20Z
- **Completed:** 2026-04-20T03:24:00Z (approx)
- **Tasks committed:** 3 atomic commits (API, UI, nav)
- **Files created:** 8
- **Files modified:** 2

## Accomplishments

### 1. API routes (commit `50f0b30`)

Three routes under `/api/consolidation/` wired via the existing dual-client pattern:

| Method | Path | Behaviour |
|--------|------|-----------|
| POST | `/api/consolidation/fx-rates` | Upserts on `(currency_pair, rate_type, period)` unique constraint; always writes `source='manual'` |
| GET | `/api/consolidation/fx-rates` | Lists all rates (optional `?currency_pair=` filter) ordered pair asc / period desc |
| DELETE | `/api/consolidation/fx-rates/[id]` | Deletes by UUID; 400 on invalid UUID |
| PATCH | `/api/consolidation/tenants/[connectionId]` | Partial update of `display_name`, `display_order`, `functional_currency`, `include_in_consolidation`, `is_active`; 404 if not found |

All routes:
- Call `requireCoachOrSuperAdmin` — returns 401 (no session) or 403 (wrong role)
- Validate payloads via pure helpers in `src/lib/consolidation/admin-guards.ts`
- Use `stage` tracking for error observability (matches `/api/monthly-report/consolidated` convention)

Validation coverage (19 unit tests in `admin-guards.test.ts`):
- `CURRENCY_PAIR_REGEX`: accepts `HKD/AUD`; rejects `hkd/aud`, `HKD-AUD`, `HKDAUD`, `HK/AUD`
- `validateFxRatePayload`: missing fields, bad currency_pair, invalid rate_type, non-finite / non-positive rate, unparseable period, null/non-object bodies
- `validateTenantPatchPayload`: empty body, single-field patches, multi-field patches, unknown currency, empty display_name (trim), non-integer display_order, non-boolean toggles, non-object bodies, display_name trim

### 2. Admin UI (commit `9d129ba`)

**`/admin/consolidation/layout.tsx`** — role gate mirroring `/cfo/layout.tsx`. Null role → `/login`, client → `/dashboard`, coach / super_admin → render.

**`/admin/consolidation/page.tsx` (index)** — three stat cards (multi-tenant count, foreign-currency count, missing-FX count) plus a table:

| Column | Source |
|--------|--------|
| Business | `businesses.business_name` (sorted A–Z) |
| Tenants | count of active xero_connections with include_in_consolidation=true |
| FX rates | green "Up to date" / amber "N missing" / grey "— AUD only" based on last-3-month monthly_average coverage across the business's foreign currencies |
| Manage | link to detail page |

Businesses with fewer than 2 consolidation-eligible tenants are filtered out — the page is explicitly for *consolidation*, not the general integrations list.

**`/admin/consolidation/[businessId]/page.tsx` (detail)** — three sections:

1. **Per-tenant settings** — editable draft state per row. Save button becomes active only when the draft differs from the server snapshot. PATCH sends only the changed fields; the page reloads after a successful save.
2. **FX rates** — entry form (currency_pair dropdown seeded from the business's foreign currencies, rate_type selector, month picker, rate input) + a table of existing rates filtered to the business's relevant currency pairs. Delete button per row.
3. **Elimination rules** — read-only table joined against tenant_id → display_name for human-friendly "Tenant A / Tenant B" columns. Includes a clear "Read-only" annotation.

### 3. Navigation (commit `e7a2c51`)

Layers icon + "Consolidation" entry added to:
- `CoachLayoutNew` — inserted after "Reports" in the main nav
- `AdminLayout` — inserted after "All Users" in the main nav

Layout guard on the target route is what actually enforces the role — the nav entries just make the page discoverable.

## Verification

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` | clean |
| `npx vitest run` | 182/182 passing (13 test files, includes 19 new admin-guards cases) |
| All 10 expected files present on disk | verified |
| All 3 atomic commits present in git log | `50f0b30`, `9d129ba`, `e7a2c51` |

**Commands run:**
- `npx vitest run src/lib/consolidation/admin-guards.test.ts` (new tests only)
- `npx tsc --noEmit` (after each commit)
- `npx vitest run --reporter=dot` (full suite — 182 tests)

## Deviations from Plan

### Rule 2 — Adapt to post-pivot tenant model (not a bug, prompt-specified)

The plan file (`34-00f-admin-fx-entry-PLAN.md`) was written against the `consolidation_groups` / `consolidation_group_members` / `consolidation_elimination_rules` schema. Those group/member tables were dropped in the pivot (migration 20260423). This executor prompt explicitly directed adaptation to the tenant model:

- **Index page** — lists every business with 2+ `xero_connections` rows (is_active + include_in_consolidation=true) rather than `consolidation_groups` rows. No diagnostic view of "groups → members" — replaced by a per-business detail page.
- **Detail page** — shows per-tenant settings (the xero_connections ARE the tenants) with inline PATCH, plus FX entry and read-only elimination rules.
- **API surface** — added PATCH /api/consolidation/tenants/[connectionId] (not in original plan). DELETE moved from query-string (`?id=`) to dynamic segment (`[id]`) to match the objective spec.

### Rule 2 — Added admin-guards unit tests (not in plan's test skeleton)

The plan's task 1 test file contained skipped placeholder tests and a note that full harness tests were out of scope. Rather than leave the validation layer untested, I extracted the validators into pure helpers and added 19 unit tests exercising every error path. The routes themselves remain thin Supabase wiring — the interesting logic is now covered.

## Deferred Items (tracked for future plans)

1. **Elimination rule CRUD UI** — the detail page only displays rules. Creating new rules still requires a migration. Original plan flagged this as 34.3+.
2. **Inline FX rate editing** — the current UI is create + delete only. Editing an existing rate requires delete + re-create. Low-priority polish; acceptable for admin-only surface.
3. **Per-business FX rate scoping** — `fx_rates` has no `business_id` column (rates are global by design — one HKD/AUD rate serves every consolidation). The UI filters visually to the business's relevant currency pairs, but any coach editing a rate affects every business that uses that currency.
4. **Task 3 human-verify checkpoint** — the plan defines Task 3 as a Matt-driven E2E verification (add HKD/AUD rate → banner disappears). Auto mode skipped this per the "auto mode is active" directive in the objective.

## Iteration 34.0 Status

With plan 00f shipped, **Iteration 34.0 (Consolidated P&L)** is functionally complete:
- 00a Foundation (schema + fixtures) ✓
- 00b Engine core (account alignment + aggregation) ✓
- 00c FX translation (IAS 21 monthly-average) ✓
- 00d Eliminations + seed ✓ (scope later rewritten in pivot)
- 00e API + UI (consolidated tab + FX banner) ✓
- 00f Admin UI + FX entry ✓ ← this plan

**Remaining iterations:**
- **34.1** — Consolidated Balance Sheet (plan `34-01a-consolidated-balance-sheet-PLAN.md`). Introduces closing-spot FX, translation reserve equity line, intercompany loan eliminations.
- **34.2** — Consolidated Cashflow Forecast (plan `34-02a-consolidated-cashflow-PLAN.md`). Per-entity actuals + forecast, combined opening/closing bank balances.

## Self-Check: PASSED

- [x] `src/lib/consolidation/admin-guards.ts` exists
- [x] `src/lib/consolidation/admin-guards.test.ts` exists (19 tests, all green)
- [x] `src/app/api/consolidation/fx-rates/route.ts` exports POST + GET
- [x] `src/app/api/consolidation/fx-rates/[id]/route.ts` exports DELETE
- [x] `src/app/api/consolidation/tenants/[connectionId]/route.ts` exports PATCH
- [x] `src/app/admin/consolidation/layout.tsx` uses getUserSystemRole gate
- [x] `src/app/admin/consolidation/page.tsx` exists
- [x] `src/app/admin/consolidation/[businessId]/page.tsx` exists
- [x] `CoachLayoutNew.tsx` + `AdminLayout.tsx` both include Consolidation nav entry
- [x] Commits `50f0b30`, `9d129ba`, `e7a2c51` all present in `git log`
- [x] `npx tsc --noEmit` clean
- [x] `npx vitest run` — 182/182 pass
