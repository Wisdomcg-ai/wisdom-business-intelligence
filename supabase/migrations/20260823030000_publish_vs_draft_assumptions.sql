-- Separate a forecast's LIVE working state from the record of what was PUBLISHED.
--
-- THE DEFECT (found 23 Aug 2026 while answering "if I open a forecast and click
-- through without changing anything, does it override anything?").
--
-- `financial_forecasts.assumptions` served two conflicting roles: the operator's
-- live working state (draft autosaves rewrite it constantly, by design — "a draft
-- saves WORK") AND the record of what produced the published forecast_pl_lines.
-- applyDraftPublishGuard protected revenue_goal/gross_profit_goal/net_profit_goal/
-- wizard_state/goal_source but NOT assumptions, and writes need no operator edit:
-- every step-bar click calls saveDraft unconditionally (ForecastWizardV4.tsx:2206)
-- and the autosave effect fires 3s after any tracked state settles (:1552-1590).
--
-- So merely opening a published forecast in the builder and clicking through
-- replaced its approved assumptions. Nothing broke immediately — drafts never
-- materialise — but three paths then read that column and rebuild the stored P&L
-- from it: POST /api/forecast/[id]/recompute, /api/forecast/seed-from-prior (which
-- also seeds NEXT year off it), and a re-Generate. The approved plan could be
-- silently replaced by half-finished state.
--
-- THE FIX — invert the ownership rather than adding a second publish column:
-- `assumptions` becomes PUBLISH-ONLY (the record of what produced the lines), and
-- in-progress work moves to `draft_assumptions`. This makes every existing reader
-- correct by construction instead of requiring each one to learn a new column, and
-- keeps the RPC on its existing 4-arg signature (no overload, no DROP, no re-grant
-- dance). Drafts still persist server-side, so work survives a reload on any
-- machine — strictly better than the localStorage-only fallback.
--
-- `assumptions_published_at` records when a materialisation last stamped the row.
-- It exists because the D-18 freshness invariant (forecast-read-service.ts:655-712)
-- compares forecast_pl_lines.computed_at against financial_forecasts.updated_at —
-- and updated_at moves on every draft autosave and every cashflow save. That
-- invariant fires today on perfectly healthy forecasts (verified in prod: Envisage
-- 30.6h "stale", Armstrong 7 days, both with byte-identical assumptions) and tells
-- the operator to run recompute, which is exactly the destructive path above.

alter table public.financial_forecasts
  add column if not exists draft_assumptions jsonb,
  add column if not exists assumptions_published_at timestamptz;

comment on column public.financial_forecasts.draft_assumptions is
  'In-progress wizard state from draft autosaves. NULL once published. Never materialised.';
comment on column public.financial_forecasts.assumptions_published_at is
  'When a materialisation last stamped `assumptions`. Basis for the D-18 freshness invariant — updated_at is not, because draft and cashflow saves move it.';

-- Backfill ONLY where derived lines prove a materialisation happened, using that
-- materialisation's own timestamp. Rows with no derived lines stay NULL: they were
-- never published, and inventing a publish time would launder unpublished state
-- into the published record. (Verified in prod 23 Aug: 37 forecasts, 11 with
-- derived lines. Four rows carry updated_at later than their newest computed_at —
-- i.e. their assumptions have already drifted past what produced their lines —
-- which is precisely why the timestamp comes from computed_at and not from
-- updated_at or now().)
update public.financial_forecasts f
set assumptions_published_at = l.max_computed_at
from (
  select forecast_id, max(computed_at) as max_computed_at
  from public.forecast_pl_lines
  where is_manual = false and deleted_at is null and computed_at is not null
  group by forecast_id
) l
where l.forecast_id = f.id
  and f.assumptions_published_at is null;

-- Re-declare the materialiser so publishing STAMPS atomically: it becomes
-- structurally impossible to write forecast_pl_lines without recording when the
-- assumptions behind them were published. Same 4-arg signature, so this is a true
-- CREATE OR REPLACE — no new overload, and the existing callers are untouched.
-- Body is byte-identical to 20260429000003 apart from the one added SET clause.
create or replace function "public"."save_assumptions_and_materialize"(
  "p_forecast_id" uuid,
  "p_assumptions" jsonb,
  "p_pl_lines" jsonb,
  "p_force_full_replace" boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = public
as $save_body$
DECLARE
  v_now timestamp with time zone := now();
  v_lines_count int := 0;
BEGIN
  -- 1. Verify forecast exists (ownership checked at API layer, mirrors 20260429000002).
  IF NOT EXISTS (
    SELECT 1 FROM "public"."financial_forecasts" WHERE "id" = p_forecast_id
  ) THEN
    RAISE EXCEPTION 'save_assumptions_and_materialize: forecast % not found', p_forecast_id
      USING ERRCODE = 'P0002';
  END IF;

  -- 2. Update assumptions + bump updated_at to v_now (single timestamp shared with computed_at
  --    so the freshness invariant cannot fire on millisecond skew).
  --    assumptions_published_at is stamped here and ONLY here: reaching this
  --    function is what makes an assumptions object the published one.
  UPDATE "public"."financial_forecasts"
  SET "assumptions" = p_assumptions,
      "assumptions_published_at" = v_now,
      "updated_at" = v_now
  WHERE "id" = p_forecast_id;

  -- 3. D-44.1-02 — legitimate clear operations (year-type switch, intentional reset).
  --    Caller must opt in via p_force_full_replace=true. is_manual=true rows still preserved.
  IF p_force_full_replace THEN
    DELETE FROM "public"."forecast_pl_lines"
    WHERE "forecast_id" = p_forecast_id
      AND "is_manual" = false;
  END IF;

  -- 4. D-44.1-01 — UPSERT keyed on (forecast_id, account_code) WHERE is_manual = false.
  --    Accounts not present in p_pl_lines survive untouched. Shorter input is safe.
  --    is_manual=true rows are NEVER touched here (the partial index excludes them, and
  --    we always set is_manual=false on inserted rows).
  INSERT INTO "public"."forecast_pl_lines" (
    "forecast_id",
    "account_name",
    "account_code",
    "account_type",
    "account_class",
    "category",
    "subcategory",
    "sort_order",
    "actual_months",
    "forecast_months",
    "is_from_xero",
    "is_manual",
    "is_from_payroll",
    "computed_at",
    "created_at",
    "updated_at"
  )
  SELECT
    p_forecast_id,
    line->>'account_name',
    line->>'account_code',
    line->>'account_type',
    line->>'account_class',
    line->>'category',
    line->>'subcategory',
    COALESCE((line->>'sort_order')::int, 0),
    COALESCE((line->'actual_months')::jsonb, '{}'::jsonb),
    COALESCE((line->'forecast_months')::jsonb, '{}'::jsonb),
    COALESCE((line->>'is_from_xero')::boolean, false),
    false,
    COALESCE((line->>'is_from_payroll')::boolean, false),
    v_now,
    v_now,
    v_now
  FROM jsonb_array_elements(p_pl_lines) AS line
  ON CONFLICT ("forecast_id", "account_code") WHERE "is_manual" = false
  DO UPDATE SET
    "account_name"     = EXCLUDED."account_name",
    "account_type"     = EXCLUDED."account_type",
    "account_class"    = EXCLUDED."account_class",
    "category"         = EXCLUDED."category",
    "subcategory"      = EXCLUDED."subcategory",
    "sort_order"       = EXCLUDED."sort_order",
    "actual_months"    = EXCLUDED."actual_months",
    "forecast_months"  = EXCLUDED."forecast_months",
    "is_from_xero"     = EXCLUDED."is_from_xero",
    "is_from_payroll"  = EXCLUDED."is_from_payroll",
    "computed_at"      = v_now,
    "updated_at"       = v_now;

  GET DIAGNOSTICS v_lines_count = ROW_COUNT;

  -- 5. Bump computed_at on rows NOT touched by the UPSERT (i.e., accounts in DB
  --    but NOT in p_pl_lines). Without this, those rows keep their old computed_at
  --    and the freshness invariant fires on legitimate carry-forward state.
  --    is_manual=true rows are excluded — they have their own lifecycle.
  UPDATE "public"."forecast_pl_lines"
  SET "computed_at" = v_now,
      "updated_at"  = v_now
  WHERE "forecast_id" = p_forecast_id
    AND "is_manual"   = false
    AND "computed_at" < v_now;

  RETURN jsonb_build_object(
    'forecast_id', p_forecast_id,
    'computed_at', v_now,
    'lines_count', v_lines_count
  );
END;
$save_body$;

-- CREATE OR REPLACE may reset default privileges — re-issue them (house rule).
revoke all on function "public"."save_assumptions_and_materialize"(uuid, jsonb, jsonb, boolean) from public;
grant execute on function "public"."save_assumptions_and_materialize"(uuid, jsonb, jsonb, boolean) to authenticated;
grant execute on function "public"."save_assumptions_and_materialize"(uuid, jsonb, jsonb, boolean) to service_role;

comment on function "public"."save_assumptions_and_materialize"(uuid, jsonb, jsonb, boolean) is
  'Atomic save + materialize. Stamps assumptions_published_at — reaching this function is what publishes an assumptions object. Pass p_force_full_replace=true for legitimate clear operations. is_manual=true rows preserved. Returns {forecast_id, computed_at, lines_count}.';
