# R14 — Dual-ID Data Cleanse Plan (WisdomBI prod only)

**Status:** PLAN (read-only audit done; no mutations yet). Each per-table step is
gated on Matt's explicit prod-write approval.
**Target:** prod `uudfstpvndurzwnapibf`. **Fork:** inLIFE Pulse skips this entirely.
**Gating:** R1–R3 landed (done). R14 MUST precede the C-32 `auth.uid()::TEXT` RLS
mask removal (R2 data half) — that mask is the only thing keeping user-id-polluted
rows visible to their authors today.

## Canonical decision
Canonical `business_id` space for these app tables = **`business_profiles.id`**.
Rationale: it is the dominant existing space (see audit), it is what
`auth_get_accessible_business_ids()` returns (so RLS already filters on it), and
R1 fixed the money/Xero tables onto it. **`businesses ↔ business_profiles is 1:1`**
(27↔27, no multi-profile, no business-less profile — verified 2026-06-02), so the
`businesses.id → business_profiles.id` rewrite is **deterministic and unambiguous**:
`profile.id WHERE profile.business_id = <businesses.id>`.

## Live audit (2026-06-02, read-only)
| Table | total | →businesses | →profiles (canonical) | →user-ids | orphans |
|---|---|---|---|---|---|
| activity_log* | 2545 | 11 | 2503 | 31 | 0 |
| strategic_initiatives | 484 | 9 | 439 | 0 | 36 |
| business_kpis* | 86 | 41 | 43 | 2 | 0 |
| kpi_actuals | 73 | 69 | 4 | 0 | 0 |
| weekly_metrics_snapshots | 56 | 2 | 50 | 2 | 2 |
| weekly_reviews | 45 | 1 | 41 | 1 | 2 |
| financial_forecasts | 37 | 8 | 27 | 0 | 2 |
| swot_analyses | 27 | 1 | 0 | 23 | 3 |
| strategic_initiatives_backup* | 16 | 0 | 3 | 13 | 0 |
| business_financial_goals* | 16 | 1 | 14 | 1 | 0 |
| quarterly_snapshots | 3 | 2 | 1 | 0 | 0 |
| forecast_wizard_sessions | 2 | 1 | 1 | 0 | 0 |

`*` = `business_id` column is TEXT (no FK). The rest are UUID.
Totals: ~3,390 rows; ~3,135 already canonical (profiles); ~145 biz-keyed to rewrite;
~73 user-id-polluted; ~45 true orphans.

## Per-bucket strategy
1. **→profiles (canonical): leave.** ~3,135 rows. No action.
2. **→businesses: rewrite to the 1:1 profile.** `UPDATE t SET business_id =
   profile.id FROM business_profiles profile WHERE profile.business_id =
   t.business_id`. Deterministic. ~145 rows. (kpi_actuals is the bulk at 69.)
3. **→user-ids: role-based re-key, else quarantine.** For each polluted row whose
   `business_id` is an `auth.users.id`: if that user **owns exactly one business**
   (`businesses.owner_id`), re-key to that business's profile id. If the user owns
   zero or >1 businesses (e.g. a coach assigned to many), it is **ambiguous →
   quarantine** (do not guess). swot_analyses (23) + strategic_initiatives_backup
   (13, but see #5) dominate here.
4. **Orphans: quarantine, never delete.** ~45 rows whose `business_id` matches
   nothing. Move to a `data_cleanse_quarantine` table (or flag + leave) for manual
   review. strategic_initiatives (36) dominates.
5. **strategic_initiatives_backup: SKIP — it's a backup table.** Excluded from the
   cleanse; R15 drops it. (Its 13 user-ids + 3 profiles need no rewrite.)

## Special handling
- **financial_forecasts (DM-N4):** after rewriting biz→profile, **restore the
  `unique_active_forecast_per_fy` invariant** — two "active" forecasts for one real
  business (one keyed businesses.id, one profiles.id) currently both pass the
  partial unique index. Post-rewrite they collide on the same `business_id`;
  deterministically keep the most-recently-updated active forecast per (business,
  FY), demote the rest to inactive. This is the highest-care table (money).
- **activity_log / business_kpis / business_financial_goals (TEXT business_id):**
  rewrite works the same (compare/assign as text); no FK to satisfy.
- **swot_analyses:** 23/27 are user-ids → heaviest re-key; likely owner-authored
  (resolvable) but verify per-row before the role-based map.

## Execution model (per table, gated)
For EACH table, one idempotent migration, applied only on Matt's explicit go:
1. **Pre-count + snapshot:** record the bucket counts; copy every row about to
   change into a cleanse-backup (reuse `deleted_records_archive` with
   `entity_type='r14_cleanse:<table>'`, or a dedicated `r14_cleanse_backup`).
2. **Rewrite biz→profile** (deterministic 1:1).
3. **Re-key resolvable user-id rows**; **quarantine** ambiguous + orphan rows.
4. **Verify (read-only):** re-run the bucket audit → expect 0 biz-keyed, 0
   resolvable-user, only canonical + quarantined remain. For financial_forecasts,
   assert the unique-active invariant holds.
5. **Reconcile** the recorded migration version to the repo filename (per the
   established ledger discipline).

**Ordering:** smallest/safest first to rehearse the pattern, money table last:
`forecast_wizard_sessions, quarterly_snapshots` → `business_financial_goals,
weekly_reviews, weekly_metrics_snapshots` → `kpi_actuals, business_kpis` →
`strategic_initiatives` (orphan-heavy) → `swot_analyses` (user-id-heavy) →
`activity_log` (largest) → **`financial_forecasts` last** (money + invariant).
`strategic_initiatives_backup` excluded.

The 3-row `ORPHAN-REMEDIATION-PLAN` already executed is the rehearsal for this.

## Hard guardrails
- READ-ONLY audit complete; every mutating step needs Matt's explicit prod go.
- Snapshot-before-rewrite on every table (recoverable).
- Never delete a row — rewrite, re-key, or quarantine only.
- Idempotent migrations; read-only verify after each; ledger reconciled.
- R14 fully lands BEFORE the C-32 mask removal.

## Open decisions for Matt
1. Quarantine mechanism: dedicated `data_cleanse_quarantine` table vs reuse
   `deleted_records_archive` vs a `quarantined_at` column + leave in place.
2. Ambiguous user-id rows (coach-authored / multi-business owners): quarantine
   (recommended) vs best-effort assign.
3. Do this as a GSD phase (per-table execute-plans) or hand-authored gated
   migrations.
