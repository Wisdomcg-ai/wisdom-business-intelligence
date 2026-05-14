-- Phase 61: Selective List Sharing
-- Adds per-item sharing controls to daily_tasks and ideas.
--
-- Visibility model (CONTEXT.md decisions):
--   * Private:   shared_with_all=false AND shared_with='{}' (defaults — preserves current behavior)
--   * Team-wide: shared_with_all=true
--   * Specific:  array_length(shared_with, 1) > 0
--
-- Defaults are NON-NEGOTIABLE: every existing row becomes Private (no backfill).
-- RLS is added in a SEPARATE migration (61-02) so columns exist before policies reference them.
--
-- Idempotency: every statement uses IF NOT EXISTS so re-running this migration
-- is a no-op rather than an error. Wrapped in a transaction so all four columns
-- + both indexes land together or not at all.
--
-- Scope: STRICTLY daily_tasks and ideas. action_items, issues_list, and
-- ideas_filter are intentionally NOT touched (they have their own visibility
-- models that coexist with this new mechanism).

BEGIN;

-- daily_tasks --------------------------------------------------------------
ALTER TABLE public.daily_tasks
  ADD COLUMN IF NOT EXISTS shared_with_all boolean NOT NULL DEFAULT false;

ALTER TABLE public.daily_tasks
  ADD COLUMN IF NOT EXISTS shared_with uuid[] NOT NULL DEFAULT '{}'::uuid[];

CREATE INDEX IF NOT EXISTS idx_daily_tasks_shared_with
  ON public.daily_tasks USING GIN (shared_with);

COMMENT ON COLUMN public.daily_tasks.shared_with_all IS
  'Phase 61: when true, every active business_users member of the row''s business can SEE this task. UPDATE/DELETE remain owner-only.';
COMMENT ON COLUMN public.daily_tasks.shared_with IS
  'Phase 61: uuid[] of user ids explicitly shared with. SELECT allowed for auth.uid() = ANY(shared_with). Removed teammates may be left in array — RLS still blocks them via membership check.';

-- ideas --------------------------------------------------------------------
ALTER TABLE public.ideas
  ADD COLUMN IF NOT EXISTS shared_with_all boolean NOT NULL DEFAULT false;

ALTER TABLE public.ideas
  ADD COLUMN IF NOT EXISTS shared_with uuid[] NOT NULL DEFAULT '{}'::uuid[];

CREATE INDEX IF NOT EXISTS idx_ideas_shared_with
  ON public.ideas USING GIN (shared_with);

COMMENT ON COLUMN public.ideas.shared_with_all IS
  'Phase 61: when true, every active business_users member of the row''s business can SEE this idea. Coexists with the legacy business-wide ideas board (queries by business_id).';
COMMENT ON COLUMN public.ideas.shared_with IS
  'Phase 61: uuid[] of user ids explicitly shared with. ideas_filter (per-user evaluation) is NOT touched — each viewer scores independently.';

COMMIT;
