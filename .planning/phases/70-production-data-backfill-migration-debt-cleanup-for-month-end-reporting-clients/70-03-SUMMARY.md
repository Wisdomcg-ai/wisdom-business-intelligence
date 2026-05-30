---
phase: 70-production-data-backfill-migration-debt-cleanup-for-month-end-reporting-clients
plan: 03
subsystem: forecasts
tags: [supabase, forecast-payroll-summary, backfill, super-policy, au-sg, no-schema-change]

# Dependency graph
requires:
  - phase: 70-production-data-backfill-migration-debt-cleanup-for-month-end-reporting-clients
    plan: 01
    provides: Pre-write rollback snapshot capturing forecast_payroll_summary baseline (1 row) and forecast_employees baseline (22 rows) for full restoration if needed
  - phase: 70-production-data-backfill-migration-debt-cleanup-for-month-end-reporting-clients
    plan: 02
    provides: Confirmation that the active-forecast set is clean — every active forecast has a unique (business_id, fiscal_year, forecast_type) key, so one-row-per-forecast upsert keyed on forecast_id is safe
provides:
  - scripts/70-03-A2-payroll-summary-backfill.mjs (two-mode dry-run / --apply cross-client forecast_payroll_summary backfill — preserved for future re-runs as new clients/forecasts onboard)
  - 2 forecast_payroll_summary rows populated in production: Envisage Australia FY26 (INSERT) + Precision Electrical Group FY26 (UPDATE — recomputed at 12% super)
  - A locked AU SG super-rate policy (0.12 hardcoded; per-forecast overrides ignored) backed by an in-script warning system that names every stale value it skips
provides:
  - The unblocked input for the cashflow engine's wages line and the wages tab roll-up for both clients (was zero-fallback before this backfill)
affects: [70-04-renewal-month-backfill, 70-05-envisage-cleanup, 70-06-jds-cleanup, 70-07-iict-cleanup, code-fixes-phase-deferred-super-rate-ui]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Hardcoded statutory-rate constant with operator-visible warning when source data disagrees: rather than silently overriding `financial_forecasts.superannuation_rate=0.115`, the script prints `⚠ Forecast {name} has stale forecast.superannuation_rate=0.115; using 0.12 per Matt 2026-05-31` for every such row, so operators always see what was overruled"
    - "Two-mode --apply discipline (continued from 70-02): every upsert gated by `if (APPLY)`, idempotency check via map equality before deciding to write, per-forecast try/catch so a single failure does not nuke the batch"
    - "Idempotency proven by post-apply dry-run: re-running after --apply reported `needing backfill: 0 / skipped (already correct): 2`, confirming deterministic compute"

key-files:
  created:
    - scripts/70-03-A2-payroll-summary-backfill.mjs
    - .planning/phases/70-production-data-backfill-migration-debt-cleanup-for-month-end-reporting-clients/70-03-SUMMARY.md
  modified:
    - .planning/STATE.md
    - .planning/ROADMAP.md

key-decisions:
  - "SUPER RATE POLICY LOCK (Matt 2026-05-31): super is always 0.12 across all employees and all forecasts. Both `forecast_employees.super_rate` (whole-percent units-mismatch column) AND `financial_forecasts.superannuation_rate` overrides are IGNORED. Reasoning: the AU SG statutory rate is 12% from 2025-07-01 (FY26+); the only non-0.12 override observed in production (Precision Electrical FY26 = 0.115) is a stale operator artifact from FY25 when the statutory rate was 11.5%. The next statutory bump is 12.5% from 2027-07-01."
  - "Deferred (not blocking 70-03): a coach/admin UI setting to change the super rate when the next statutory bump lands (12.5% on 2027-07-01). This is a code-fixes phase item. Until then, every super-rate change is a one-line edit to `DEFAULT_SUPER_RATE` in this backfill script + the equivalent constant in the forecast wizard's compute path."
  - "Schema-correctness override on the plan text (Rule 1 — bug): plan text said `super = wages × E.super_rate (default 0.12)`. `forecast_employees.super_rate` is `numeric(5,2) DEFAULT 11.0` (whole-percent, snapshot confirms current rows hold 11.5 / 11). Multiplying wages by this column directly would produce ~10× nonsense values. The script ignores this column entirely and uses the hardcoded 0.12 instead."
  - "Empty --apply commit (--allow-empty) used to record the production-write event (same pattern as 70-02). `--apply` mutates production DB only; nothing changes on disk after the script update commit. Future audit-trail readers can `git log --grep 70-03` and see all three commits in order: script build (prior agent), policy lock (this agent), apply event, summary."
  - "23 of 25 active forecasts skipped (no forecast_employees) is the expected/correct outcome — onboarding-data cleanup for JDS, IICT, Distinct Directions, etc. is the explicit subject of 70-05/06/07 and is OUT OF SCOPE for 70-03"

patterns-established:
  - "When backfill compute rules diverge from existing per-row override columns, prefer a HARDCODED constant with operator-visible warnings over silently respecting stale data. The warning system means no override is ever overridden invisibly."
  - "Statutory-rate changes (AU SG, payroll tax bands, etc.) should be a one-constant edit at the top of the script + a sympathetic edit in the forecast wizard compute path. UI-driven configurability is a deferred future feature, not a prerequisite for backfilling."

# Metrics
metrics:
  duration: 35 minutes total (initial build 25 min + policy-lock continuation 10 min)
  tasks: 2 (build + apply)
  files: 1 created (script) + 1 created (this SUMMARY) + 2 modified (STATE, ROADMAP)
  completed: 2026-05-31
  forecasts-examined: 25
  forecasts-upserted: 2 (1 INSERT + 1 UPDATE)
  forecasts-skipped-already-correct: 0 (initial run) → 2 (idempotency re-run)
  forecasts-skipped-no-employees: 23
  warnings-emitted: 1 (Precision Electrical stale 0.115 override skipped)
  failures: 0
---

# Phase 70 Plan 03: Payroll-Summary Backfill Summary

Cross-business `forecast_payroll_summary` backfill: built two-mode dry-run/--apply script, locked super rate to 0.12 per Matt's policy lock, ran apply against production, verified idempotency. 2 forecasts populated (Envisage Australia FY26 INSERT, Precision Electrical FY26 UPDATE). Wages tab + cashflow engine now have a non-zero budget side to compare against for both clients.

## What shipped

### scripts/70-03-A2-payroll-summary-backfill.mjs

Two-mode (default dry-run / `--apply` commits) backfill script. For every active forecast in production, reads its `forecast_employees` rows, computes the seven monthly maps the wages tab + cashflow engine consume, and upserts one row per forecast keyed on `forecast_id`.

**Compute rules (locked per CONTEXT A2 + Matt 2026-05-31):**

| Field | Formula | Notes |
|---|---|---|
| `wages` | `monthly_cost ?? (annual_salary / 12)` | Per-employee, per-month |
| `super` | `wages × 0.12` | HARDCODED — AU SG statutory rate FY26+ |
| `payg` | `wages × 0.32` | Default AU fallback (per-employee `payg_per_period` conversion deferred) |
| `payroll_tax` | `wages × 0.0485` | NSW rate (multi-state out of scope) |
| `net_wages` | `wages_admin + wages_cogs − payg` | Per Matt's confirm |
| `pay_runs_per_month` | `count(active employees in month)` | Per Matt's confirm |
| `classification` split | `'cogs' → wages_cogs`; else `wages_admin` | |

**Active-in-month check:** `start_date <= month <= end_date` using `YYYY-MM` lexicographic prefix comparison (works because DB dates are ISO-prefixed).

**Idempotency:** map equality (with 0.005 float-drift tolerance) on all seven output maps before deciding to write. Re-running on already-backfilled rows produces 0 mutations.

## Production outcome

```
Active forecasts examined: 25
Forecasts needing backfill: 2
Forecasts upserted: 2
Failures: 0
Warnings emitted: 1
Forecasts skipped (no employees): 23
```

### Forecast 1 — Envisage Australia Pty Ltd FY26 (INSERT)

- Forecast window: 2026-03 .. 2026-06 (4 months — correct per forecast's own start/end; not a Jul-Jun fiscal-year window)
- 6 valid employees (6 opex, 0 cogs)
- Super rate applied: 0.12 (forecast row already held 0.12 — no override skipped)

**Year totals (across the 4-month window):**
- wages_admin: $98,626
- wages_cogs: $0
- super: $11,835
- payroll_tax: $4,783
- payg: $31,560

### Forecast 2 — Precision Electrical Group FY26 (UPDATE)

- Forecast window: 2026-03 .. 2026-06 (4 months)
- 14 valid employees (4 opex, 10 cogs)
- Super rate applied: **0.12** (forecast row held stale 0.115 — overridden per policy, warning emitted)

**Year totals (across the 4-month window):**
- wages_admin: $137,833
- wages_cogs: $246,500
- super: $46,120 (would have been ~$44,200 at the stale 0.115)
- payroll_tax: $18,640
- payg: $122,987

The previously-existing row was the production baseline's lone `forecast_payroll_summary` row (count=1 at 70-01 snapshot). All seven monthly maps were updated to reflect the corrected 12% super computation.

### 23 forecasts skipped (no employees)

Expected outcome — these forecasts have no `forecast_employees` rows yet because onboarding never completed Step 4. They belong to:

- Sydney Pressed Metal, Armstrong & Co, My Business, Fit2Shine, Distinct Directions (×2), Dragon Roofing, Efficient Living, Just Digital Signage (×2), Envisage FY27, IICT FY27, Precision Electrical FY27, and ~10 others.

Onboarding cleanup (populating Step 4 for these clients) is the explicit subject of:

- **70-05** — Envisage cleanup
- **70-06** — JDS cleanup
- **70-07** — IICT cleanup

It is out of scope for 70-03. Re-running this backfill after each of those plans lands will populate `forecast_payroll_summary` for those clients incrementally.

## Idempotency verification

After `--apply` completed, re-ran dry-run. Result:

```
Forecasts needing backfill: 0
Forecasts skipped (already correct): 2
```

Both rows now match the script's computed payload byte-for-byte. The warning for Precision Electrical's stale 0.115 still fires (informational, not a write trigger).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] Schema deviation on super-rate source column**

- **Found during:** initial script build (prior agent)
- **Issue:** Plan text read `super = wages × E.super_rate (default 0.12)`, but `forecast_employees.super_rate` is `numeric(5,2) DEFAULT 11.0` (whole-percent — snapshot confirms rows hold 11.5 / 11, i.e. percentages not fractions). Multiplying wages by this directly produces ~10× nonsense values (e.g. $5,000 wages × 11.5 = $57,500 super).
- **Fix:** Ignored `forecast_employees.super_rate` entirely. Initial build read from `financial_forecasts.superannuation_rate` (decimal numeric(5,4) DEFAULT 0.12); continuation re-locked to a hardcoded 0.12 (see deviation 2).
- **Files modified:** scripts/70-03-A2-payroll-summary-backfill.mjs
- **Commit:** (prior agent's build commit)

**2. [Rule 2 — Missing critical correctness] Super rate hardcoded to 0.12 + per-forecast overrides ignored (Matt 2026-05-31 policy lock)**

- **Found during:** Task 2 (--apply checkpoint review by Matt)
- **Issue:** Initial build read super rate from `financial_forecasts.superannuation_rate` with a 0.12 fallback. Dry-run showed Precision Electrical FY26 held `superannuation_rate = 0.115` — a stale FY25 operator artifact (when the AU SG statutory rate was 11.5%; it stepped to 12% on 2025-07-01 and will step to 12.5% on 2027-07-01). Applying the stale 0.115 would have under-allocated Precision Electrical's super by ~$1,920/year and embedded a wrong-rate cascade into the wages tab + cashflow forecast.
- **Fix:** Changed `forecastSuperRate` from `(F.superannuation_rate ?? 0.12)` to always `0.12`. Added in-script warning that prints for every forecast where `superannuation_rate != 0.12`, naming the stale value so operators always see what was overruled. Added policy comment at top of script.
- **Files modified:** scripts/70-03-A2-payroll-summary-backfill.mjs
- **Commit:** ce9d0cd8 `fix(70-03): super rate hardcoded to 0.12 per Matt — per-forecast overrides ignored`

## Matt's confirms (resolved at apply checkpoint, 2026-05-31)

These were ambiguities flagged by the agent at the --apply checkpoint and resolved by Matt before the apply ran. Recording them here for future operators:

| Question | Matt's answer | Status |
|---|---|---|
| Envisage employee count on FY26 | 6 (audit's "FY27" framing was off-by-one) | confirmed |
| PAYG rate | flat 32% acceptable for now | confirmed |
| NSW payroll tax | 4.85% acceptable | confirmed |
| `net_wages` formula | `wages − payg` (i.e. `wages_admin + wages_cogs − payg`) | confirmed |
| `pay_runs` semantic | active employee count per month | confirmed |
| 4-month window for Envisage FY26 | correct — uses forecast's own start/end (2026-03..2026-06), not a Jul-Jun FY window | confirmed |
| Super rate policy | flat 12% across ALL employees; per-forecast overrides IGNORED as stale FY25 artifacts; admin UI deferred | **POLICY LOCK** |

## Deferred items (out of scope for 70-03)

- **Coach/admin-level super-rate UI** (next statutory bump: 12.5% from 2027-07-01). Until this ships, super-rate changes are a one-line edit to `DEFAULT_SUPER_RATE` in this script + the equivalent constant in the forecast wizard's compute path. Belongs in the code-fixes phase.
- **Per-employee `payg_per_period` conversion** (currently using flat 32%). Belongs in the code-fixes phase.
- **Multi-state payroll tax** (currently NSW-only at 4.85%). Belongs in the code-fixes phase.
- **Onboarding cleanup for the 23 skipped forecasts** — explicit subject of 70-05/06/07.

## Commits

| # | Hash | Type | Description |
|---|------|------|-------------|
| 1 | (prior) | build | scripts/70-03-A2-payroll-summary-backfill.mjs initial two-mode script |
| 2 | ce9d0cd8 | fix | super rate hardcoded to 0.12 per Matt — per-forecast overrides ignored |
| 3 | 99a3b8a3 | chore | apply A2 payroll-summary backfill — 2 forecasts upserted (Envisage + Precision) |
| 4 | (next) | docs | complete payroll-summary backfill plan (this SUMMARY + STATE + ROADMAP) |

## Self-Check: PASSED

- scripts/70-03-A2-payroll-summary-backfill.mjs — FOUND
- .planning/phases/70-.../70-03-SUMMARY.md — FOUND (this file)
- commit ce9d0cd8 (super-rate policy lock) — FOUND in `git log`
- commit 99a3b8a3 (apply event) — FOUND in `git log`
- production state: re-ran dry-run after apply → "needing backfill: 0 / already correct: 2" → idempotency verified
- production write target: `https://uudfstpvndurzwnapibf.supabase.co` (matches `.env.local`)
