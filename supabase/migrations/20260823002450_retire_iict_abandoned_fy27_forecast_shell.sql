-- Wave 0 of the 21 Aug 2026 forecast validity audit — data repair (finding XVAL-4).
--
-- IICT Group's is_active FY2027 forecast is an ABANDONED wizard session from
-- 22 May 2026: is_completed = false, wizard_completed_at = null, created
-- pre-#350 (before drafts were prevented from activating and materialising).
-- It materialised 48 lines whose FY27 revenue sums to $20,000 against a
-- revenue_goal of $5,000,000 — AU-org accounts only, with no representation of
-- the HK org's dominant membership revenue or the second AU org's $3.67M.
--
-- Every consumer reading IICT's active forecast (consolidated monthly report
-- budget column, budget tracker, dashboards) therefore compares a ~$5M+ group's
-- actuals against a $20k budget. This is the documented root of the long-running
-- "IICT budget = 0" symptom.
--
-- Deactivating is strictly better than leaving it: consumers fall back to
-- "no budget set" instead of silently reporting a false one. Nothing is deleted
-- — the row and its 48 lines remain for reference, and a real forecast (which
-- the wizard has never yet produced for this 3-org, multi-currency shape) can be
-- generated later. Reversible by setting is_active = true.
--
-- Scoped to the one verified id. IICT's only other forecast row is already
-- is_active = false and carries 0 lines, so no other row is affected and none
-- is promoted in its place. Verified post-apply: IICT active forecasts = 0,
-- 48 lines preserved, 16 businesses still hold an active forecast, and no
-- business has two active forecasts for one fiscal year.

update public.financial_forecasts
set is_active = false,
    updated_at = now()
where id = '88199866-030d-4c01-8626-0ab1a4617cc1'
  and is_active = true;
