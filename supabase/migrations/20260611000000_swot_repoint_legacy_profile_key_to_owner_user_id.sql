-- Repoint legacy SWOT analyses from business_profiles.id to the owner user_id.
--
-- Context (dual-ID bug): swot_analyses.business_id is intended to hold the
-- business OWNER's auth user_id (see src/app/swot/page.tsx getSwotBusinessId and
-- the create_quarterly_swot RPC, which passes p_user_id = owner user_id). Legacy
-- rows were written keyed by business_profiles.id instead, so the SWOT page —
-- which reads by owner user_id — could not find them and rendered blank grids,
-- silently auto-creating empty drafts on each visit. Reported via "Efficient
-- Living" but it affected every client with pre-existing SWOT data (14 clients,
-- 15 analyses, ~320 items).
--
-- Current application code already writes the correct (owner user_id) key, so no
-- code change is required — this is a one-time data backfill. Already applied to
-- prod via MCP on 2026-06-11; this file keeps the repo/fork in sync and is
-- idempotent (safe to re-run).
--
-- NOTE: rows whose business_profiles row has a NULL user_id (e.g. the unowned
-- "My Business" demo profile) cannot be repointed and are intentionally skipped.

begin;

-- 1. Remove empty quarterly drafts (no items AND no action items). These are the
--    auto-created blanks spawned by the read-by-owner-id path; deleting them stops
--    an empty current-quarter draft from masking a populated prior quarter.
delete from swot_analyses s
where s.type = 'quarterly'
  and not exists (select 1 from swot_items       si where si.swot_analysis_id = s.id)
  and not exists (select 1 from swot_action_items ai where ai.swot_analysis_id = s.id);

-- 2. Repoint legacy profile-keyed analyses onto the owner user_id. Also backfill
--    user_id where it was left NULL. The unique index unique_quarterly_swot
--    (business_id, quarter, year, type) is preserved — verified no collisions.
update swot_analyses s
set business_id = bp.user_id,
    user_id     = coalesce(s.user_id, bp.user_id)
from business_profiles bp
where bp.id = s.business_id
  and bp.user_id is not null;

commit;
