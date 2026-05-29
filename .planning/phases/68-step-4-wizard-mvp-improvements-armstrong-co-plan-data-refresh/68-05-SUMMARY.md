---
phase: 68-step-4-wizard-mvp-improvements-armstrong-co-plan-data-refresh
plan: 05
status: complete
completed: 2026-05-29
---

# Plan 68-05 — Armstrong KPIs (2-tier insert) — SUMMARY

## What was built

`scripts/68-05-armstrong-kpis.mjs` — inserts 8 KPIs into Armstrong's KPI catalog. Two-tier insert: each KPI gets one row in `custom_kpis_library` (the definition) AND one row in `business_kpis` (the tracking row with year targets), linked via `business_kpis.kpi_id → custom_kpis_library.id`. Idempotent.

## Apply result

- **`custom_kpis_library`:** 0 → 8 (existing "Completed Jobs" library row preserved at unknown count — only Armstrong-scoped rows counted)
- **`business_kpis`:** 1 → 9 (existing "Completed Jobs" untouched + 8 new)
- **Idempotency confirmed:** second `--apply` reports "Nothing to do" ✓

### 8 KPIs added

| KPI | Category | Frequency | Unit | Y1 | Y2 | Y3 |
|---|---|---|---|---|---|---|
| Revenue Invoiced | DELIVER | monthly | dollar | $7.5M | $10M | $12M |
| Gross Margin % per Job | DELIVER | per-job | percentage | 20 | 20 | 20 |
| Quote-to-Win Conversion | CONVERT | monthly | percentage | 80 | 80 | 80 |
| Home Warranty Headroom | DELIVER | monthly | dollar | (track) | (track) | (track) |
| Active Jobs in Pipeline | DELIVER | monthly | number | (track) | (track) | (track) |
| Variations Captured & Invoiced | DELIVER | per-job | percentage | 95 | 95 | 95 |
| Client Feedback Score | DELIGHT | per-job | number | 9 | 9 | 9 |
| Luke Hours on Tools per Week | PEOPLE | monthly | number | 20 | 5 | 0 |

Existing "Completed Jobs" KPI (`cee3adf3-…` / `b8e24b40-…`) was untouched.

## Deviations from PLAN

### Deviation 1 — Two-tier schema discovered at runtime

PLAN specified a single insert into `business_kpis`. First `--apply` attempt failed with `null value in column "kpi_id" violates not-null constraint`. Inspection of the existing "Completed Jobs" row revealed the two-tier model:

- **`custom_kpis_library`** — the KPI definition (name, friendly_name, category, frequency, unit, description, status). FK key: `business_id = business_profiles.id`. Each KPI must have a row here first.
- **`business_kpis`** — the per-tenant tracking instance (year targets, current value, is_active, notes). References the library via `kpi_id` (NOT NULL FK). FK key: `business_id = businesses.id`.

Dual-ID drift extends to this pair: library uses `business_profiles.id`, tracking uses `businesses.id`. Both rows are required.

Script rewritten to insert library first, capture the new `id`, then insert tracking row referencing it. No partial inserts landed during the failed first attempt.

### Deviation 2 — Category enum remapping (from earlier analysis)

| KPI | PLAN category | Applied category | Reason |
|---|---|---|---|
| Quote-to-Win Conversion | ATTRACT | CONVERT | Literally a conversion metric; CONVERT exists in the live enum |
| Client Feedback Score | DELIVER | DELIGHT | Wisdom framework places client satisfaction in DELIGHT; DELIGHT exists |
| Luke Hours on Tools per Week | LEAD | PEOPLE | LEAD does not exist in any tenant's `business_kpis`; PEOPLE matches Wisdom framework |

### Deviation 3 — `created_by` attribution

Library rows use `created_by = USER_ID` (Luke's user_id). Existing "Completed Jobs" library row uses `created_by = 8d214349-…` (looks like Matt's coach user_id). For consistency with the script-driven origin we attributed to Luke. Matt can re-attribute later if desired by patching the library rows.

`custom_kpis_library.status = 'pending'` (matches existing convention).

## Acceptance criteria

### Static (all pass)
- ✓ Script exists, `node --check` passes
- ✓ Contains `'a0bf1b0a-663e-4636-8c0d-eef62972dcbc'` (BUSINESSES_ID for business_kpis)
- ✓ Contains `'678ae542-7f0b-43d1-8784-e7341767c250'` (BUSINESS_PROFILES_ID for custom_kpis_library)
- ✓ Contains all 8 KPI names + their Y1 targets
- ✓ Contains `is_active: true`, `is_universal: false`

### Live (all pass)
- ✓ Dry-run reports 8 library inserts + 8 tracking inserts + 0 patches
- ✓ First `--apply` inserted all 16 rows (8 library + 8 tracking) successfully
- ✓ Second `--apply` reports "Nothing to do (idempotent)" ✓
- ✓ Post-query: `business_kpis` for Armstrong has 9 rows (1 Completed Jobs + 8 new)

## Files

| Path | Status |
|---|---|
| `scripts/68-05-armstrong-kpis.mjs` | Created (2-tier insert) |
| (Armstrong production data) | 8 rows in `custom_kpis_library`, 8 rows in `business_kpis` |

## Next plan

**Plan 68-06** — Values polish (5 buzzwords → 9 "we" statements), mission statement final wording, SWOT touch-ups (flexible/adaptable both strength+weakness; new strength "Marrickville 7-weeks-ahead"; new threat "Trade cost inflation"). All in `strategy_data` and `swot_items`.

## Self-Check

PASSED. Schema discovery, enum remapping, and credit attribution all documented. Idempotency confirmed. 9 KPIs now active for Armstrong (1 prior + 8 new), spanning DELIVER / CONVERT / DELIGHT / PEOPLE categories.
