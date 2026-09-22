-- B1 (22 Sep 2026 system diagnostic) — Ideas → evaluation could never be saved.
--
-- ideas_filter_decision_trigger (AFTER INSERT OR UPDATE OF decision ON
-- public.ideas_filter) runs update_idea_status_on_filter(), which reads
-- NEW.filter_status and assigns NEW.status. ideas_filter has neither column
-- (its decision lives in `decision`), so every insert — and every update that
-- sets `decision`, which upsertIdeasFilter always does — failed with
--   record "new" has no field "filter_status"
-- Prod logs show a failed save on 21 Sep 2026; the newest ideas_filter row is
-- from 10 Dec 2025. Even with the right column the function could do nothing:
-- it is an AFTER trigger assigning to NEW, on a table with no status column.
--
-- Idea status is set by public.mark_idea_status() (SECURITY DEFINER RPC,
-- Phase 61-02), not by this trigger. Dropping both is a pure fix: nothing
-- that worked stops working.

drop trigger if exists ideas_filter_decision_trigger on public.ideas_filter;
drop function if exists public.update_idea_status_on_filter();
