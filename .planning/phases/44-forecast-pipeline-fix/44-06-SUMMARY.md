---
phase: 44-forecast-pipeline-fix
plan: 06
status: complete
wave: 6
deployed: prod
completed_at: 2026-04-27
sub_phase: B
---

# Plan 44-06 — Sub-phase B Materialization Foundation: SUMMARY

**Status:** Complete (deployed to prod). `forecast_pl_lines.computed_at` column is live and backfilled; `save_assumptions_and_materialize` RPC is callable by the `authenticated` role with atomic save+materialize semantics.

## Outcome

| Artifact | Status | Detail |
|----------|--------|--------|
| `forecast_pl_lines.computed_at timestamptz NOT NULL DEFAULT now()` | ✅ live | All 298 existing rows backfilled from `updated_at` |
| Index `forecast_pl_lines_forecast_computed_at_idx` | ✅ live | `(forecast_id, computed_at DESC)` for staleness queries |
| `save_assumptions_and_materialize(uuid, jsonb, jsonb)` RPC | ✅ live | SECURITY DEFINER; GRANT EXECUTE TO authenticated; throws on bogus forecast_id |

## Commits

- `2cd5b83` — feat(44-06): forecast_pl_lines.computed_at column + idempotent backfill
- `85bebd8` — feat(44-06): save_assumptions_and_materialize RPC (atomic single-transaction)
- `0fd558c` — fix(44-06): IF EXISTS in place of SELECT INTO (Studio compat)

## Verification (post-application)

| Check | Result |
|-------|--------|
| `forecast_pl_lines.computed_at` column exists | ✅ Yes; type `timestamptz`, default `now()` |
| Rows with NULL `computed_at` | ✅ 0 / 298 (backfill complete) |
| RPC `save_assumptions_and_materialize` exists with SECURITY DEFINER | ✅ Yes |
| `authenticated` has EXECUTE | ✅ Yes |
| `service_role` has EXECUTE | ✅ Yes |
| Bogus forecast_id raises clear error (atomicity guard) | ✅ `RAISE EXCEPTION 'save_assumptions_and_materialize: forecast 00000000-... not found'` |

## Important deviation: no `forecast_assumptions` table

The plan's `<interfaces>` block depicted a `forecast_assumptions` table; baseline_schema.sql contains no such table and no migration creates one. The wizard's actual write target is `financial_forecasts.assumptions` (jsonb column at `00000000000000_baseline_schema.sql:2599`).

The RPC was implemented to mirror the **actual** wizard write surface: it `UPDATE financial_forecasts SET assumptions = p_assumptions, updated_at = v_now WHERE id = p_forecast_id`. The D-12 atomic contract is preserved (single transaction, single `v_now` captured at function entry, used for both `financial_forecasts.updated_at` AND every `forecast_pl_lines.computed_at`). 44-07's wizard wiring is now a one-line refactor — replace the existing two-step `update assumptions; insert pl_lines` with `supabase.rpc('save_assumptions_and_materialize', { p_forecast_id, p_assumptions, p_pl_lines })`.

## Studio compatibility hardening (carried over from 44-02/44-05)

Both migrations follow the patterns proven in Sub-phase A:
- Uniquely-tagged dollar quote `$save_body$` (not bare `$$`)
- No `SELECT INTO variable` (uses `GET DIAGNOSTICS ... ROW_COUNT` instead)
- No explicit `BEGIN/COMMIT` (Studio implicit transaction)
- Re-runnable: `CREATE OR REPLACE FUNCTION` + `ADD COLUMN IF NOT EXISTS`
- `is_manual = true` rows in forecast_pl_lines are PRESERVED (coach manual overrides not nuked); only `is_from_xero` / derived rows are replaced

## Goal-backward must-haves (D-12 contract)

| D-12 sub-claim | Status |
|----------------|--------|
| Atomic write — assumption + derivation in single transaction | ✅ RPC body wraps both steps |
| Single `v_now` shared across both writes (Pitfall 3 fix) | ✅ `v_now := now()` captured at entry |
| Derivation failure rolls back assumptions write | ✅ PostgREST RPC = single txn = automatic |
| Manual override rows (is_manual=true) preserved | ✅ DELETE filters `is_manual=false` only |
| Returns `{forecast_id, computed_at, lines_count}` | ✅ jsonb_build_object return |
| `computed_at` always set on every materialized row | ✅ INSERT explicitly sets `computed_at = v_now` |

## Next: Plan 44-07 (Sub-phase B wiring)

Migrate the wizard's autosave from "two serial Supabase calls + non-fatal error swallowing" (the e337a42 reactive layer) to one atomic `supabase.rpc('save_assumptions_and_materialize')`. Add `POST /api/forecast/{id}/recompute` recovery endpoint. Retire the legacy non-fatal save paths and the legacy `sync-forecast` route's body. After 44-07, Sub-phase B is COMPLETE.
