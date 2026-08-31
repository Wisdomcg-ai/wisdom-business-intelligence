-- WD.3 — standing commentary lines, declared per pack.
--
-- The Calxa packs carry standing "refer to ..." bullets ("Wages — refer to
-- the Payroll Analysis page") that appear every month regardless of variance
-- triggers. They are pack configuration, not monthly data — so they live on
-- monthly_report_settings next to the layout, as
-- [{"label":"Wages","refer_to":"Wages Analysis"}].
--
-- NULL = no standing lines (every existing business). The render gate:
-- a standing line pointing at a page not in the pack renders WITH a warning
-- marker — visible, never silent.

alter table public.monthly_report_settings
  add column standing_commentary jsonb;

comment on column public.monthly_report_settings.standing_commentary is
  'WD.3 — standing "refer to ..." commentary bullets rendered under the Budget-vs-Actual statement every month: [{label, refer_to}]. NULL = none.';
