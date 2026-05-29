---
phase: 68-step-4-wizard-mvp-improvements-armstrong-co-plan-data-refresh
plan: 01
status: complete
completed: 2026-05-29
---

# Plan 68-01 — Pre-write snapshot of Armstrong tenant — SUMMARY

## What was built

`scripts/68-01-snapshot-armstrong.mjs` — read-only snapshot script. Captures all Armstrong-affected tables to a timestamped JSON file under `scripts/snapshots/`. No write flag; idempotent (refuses to overwrite existing snapshot files).

Also created `scripts/snapshots/.gitkeep`.

## Snapshot result

- **File:** `scripts/snapshots/68-armstrong-pre-write-2026-05-28T20-52-17-794Z.json`
- **Total rows captured:** 107
- **Table queries:** 14

| Query | Rows |
|---|---|
| businesses (id=eq.<businesses.id>) | 1 |
| business_profiles (id=eq.<business_profiles.id>) | 1 |
| business_financial_goals (business_id=eq.<business_profiles.id>) | 1 |
| business_kpis (business_id=eq.<businesses.id>) | **1** (Completed Jobs) |
| business_kpis (business_id=eq.<business_profiles.id>) | 0 |
| strategic_initiatives (business_id=eq.<business_profiles.id>) | 70 |
| strategy_data (business_id=eq.<business_profiles.id>) | 0 |
| swot_analyses (id=eq.<swot_analyses.id>) | 1 |
| swot_items (swot_analysis_id=eq.<swot_analyses.id>) | 30 |
| plan_snapshots (business_id=eq.<business_profiles.id>) | 0 |
| plan_snapshots (business_id=eq.<businesses.id>) | 0 |
| strategy_data (user_id=eq.<user_id>) | 1 |
| plan_snapshots (user_id=eq.<user_id>) | 0 |
| business_financial_goals (user_id=eq.<user_id>) | 1 |

## Deviations from PLAN

Two adjustments during execution, both for correctness:

### Deviation 1 — Env var name updated

PLAN referenced `SUPABASE_SERVICE_KEY` (legacy convention from `scripts/onboard-fit2shine.mjs`). The legacy keys were **disabled in Supabase on 2026-05-19** ("Legacy API keys are disabled" response). Script updated to prefer the new `SUPABASE_SECRET_KEY` env var with fallback to legacy for backward compat:

```js
const KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY;
```

**Impact for subsequent A-workstream plans (68-02..68-08):** Use the same `SUPABASE_SECRET_KEY` env var. Update `scripts/onboard-fit2shine.mjs` reference pattern accordingly.

### Deviation 2 — Dual-ID convention captured under BOTH keys

PLAN's table list filtered every business-scoped table by `business_id=eq.${BUSINESS_PROFILES_ID}`. Discovered at runtime that **`business_kpis` actually stores `businesses.id` in its `business_id` column** (the dual-ID drift documented in `docs/BUSINESS_ID_PATTERNS.md`). Snapshot under only one key would miss the existing "Completed Jobs" KPI — making the rollback artifact incomplete.

**Fix applied:** snapshot under BOTH keys for tables where the convention is ambiguous (`business_kpis`, `plan_snapshots`). Downstream code uses whichever matches.

**Confirmed conventions (for downstream plans):**

| Table | `business_id` column stores | Used by plan |
|---|---|---|
| `business_financial_goals` | `business_profiles.id` | 68-02 (ramp split already applied), 68-06, 68-08 |
| `business_kpis` | **`businesses.id`** | 68-05 (new KPIs MUST use `businesses.id`) |
| `strategic_initiatives` | `business_profiles.id` | 68-02 (dedupe), 68-03 (ideas), 68-07 (notes), 68-08 (read) |
| `strategy_data` | (none — filtered by `user_id`) | 68-06, 68-08 (read by user_id) |
| `swot_items` | (joined via `swot_analysis_id`) | 68-06, 68-08 (read) |
| `plan_snapshots` | TBD — neither convention has rows yet for Armstrong | 68-08 (write); need to confirm before write |

**Action required before 68-05 (KPIs):** Hardcode `BUSINESSES_ID = 'a0bf1b0a-663e-4636-8c0d-eef62972dcbc'` in the script and use it for the KPI `business_id` value, not `BUSINESS_PROFILES_ID`.

**Action required before 68-08 (plan_snapshots baseline):** Inspect `plan_snapshots` schema or read another tenant's existing snapshot to confirm which key is the convention before writing.

## Acceptance criteria

### Static (all pass)
- ✓ `scripts/68-01-snapshot-armstrong.mjs` exists
- ✓ `scripts/snapshots/.gitkeep` exists
- ✓ `node --check` exits 0
- ✓ Contains all three required UUIDs (`a0bf1b0a-…`, `678ae542-…`, `cb6d1358-…`)
- ✓ Contains `'68-armstrong-pre-write-'`
- ✓ Does NOT contain `'--apply'` substring
- ✓ Contains `fetchTable(` (1 match)

### Live (all pass)
- ✓ Script exits 0
- ✓ Snapshot JSON file created under `scripts/snapshots/`
- ✓ `tables` key has all expected sub-keys (14 — note: 5 more than the original 9 due to dual-ID coverage)
- ✓ Total rows captured (107) > 0; all expected tenant rows present

## Files created

| Path | Purpose |
|---|---|
| `scripts/68-01-snapshot-armstrong.mjs` | Read-only snapshot script |
| `scripts/snapshots/.gitkeep` | Directory placeholder |
| `scripts/snapshots/68-armstrong-pre-write-2026-05-28T20-52-17-794Z.json` | Rollback artifact (NOT committed — gitignored) |

## Next plan

**Plan 68-02** — Dedupe parking-lot + fix q2/q4 duplicate (Option 3 hybrid). Use `SUPABASE_SECRET_KEY` env var; preserve Matt's wizard q1-q4 assignments; do NOT modify `quarter_assigned` column.

## Self-Check

PASSED. All static + live acceptance criteria pass. Two scope-preserving deviations (env var name + dual-ID coverage) documented for downstream plans.
