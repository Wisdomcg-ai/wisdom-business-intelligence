-- D4 (22 Sep 2026 system diagnostic) — forecast_pl_lines is hard-delete only.
--
-- forecast_pl_lines carries a deleted_at column (DB-01 audit columns, 4 May
-- 2026) but ~20 readers never filter on it — there is no shared read helper,
-- and the RLS policy doesn't filter it. When 20260823002251 "retired" Digital
-- Bond's NULL-code wages/super twins by setting deleted_at, every consumer
-- (forecast page, cashflow, dashboard, quarterly summary, exports, the monthly
-- report's budget column) kept summing them: +$274,399.92 of team costs for a
-- month. The rows were archived and hard-deleted on 22 Sep 2026 (Matt-approved).
--
-- Rather than teach ~20 readers (and every future one) to filter, make a soft
-- delete impossible: any attempt now fails loudly instead of silently
-- double-counting. The Generate/recompute routes already HARD-delete retired
-- rows (findRetiredExistingLines), and no app code or database function sets
-- deleted_at on this table (checked 22 Sep 2026). 0 rows had deleted_at set.

alter table public.forecast_pl_lines
  add constraint forecast_pl_lines_hard_delete_only check (deleted_at is null);

comment on constraint forecast_pl_lines_hard_delete_only on public.forecast_pl_lines is
  'Soft delete is not supported: readers do not filter deleted_at. Delete rows (archive first via deleted_records_archive). See 20260922020000.';
