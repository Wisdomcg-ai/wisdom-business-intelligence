-- Which SOURCE a client's monthly-report budget column comes from.
--
-- budget_versions.effective_from answers "which version is the baseline for
-- this month" — an accounting fact, and the reason a revision applies
-- prospectively instead of restating a period already reported.
--
-- This column answers a different question: "is WisdomBI reading the budget
-- store for this client yet" — a software rollout fact. Overloading
-- effective_from with both would make an import a switch-over. Distinct
-- Directions' v1 is already effective_from '2026-07' and locked, so an ungated
-- effective-date resolver would flip it the moment the code deploys, and
-- POST /api/budgets/import would become a switch-over primitive. A client moves
-- deliberately, one at a time, at a period boundary — and the switch has to be
-- reversible so a report can be diffed both ways before it is adopted.
-- (.planning/BUDGET-STORE-PLAN.md §7, §9.3.)
--
-- READ IT POSITIVELY: `budget_source === 'budget_version'`. 19 of the 31
-- businesses have no monthly_report_settings row at all, so on that path the
-- value arrives as undefined rather than 'forecast'; a `!== 'forecast'` test
-- would switch every one of them on their first import.

begin;

alter table public.monthly_report_settings
  add column if not exists budget_source text not null default 'forecast'
    check (budget_source in ('forecast', 'budget_version'));

comment on column public.monthly_report_settings.budget_source is
  'Where the monthly report''s budget column comes from: ''forecast'' (the legacy forecast_pl_lines cascade) or ''budget_version'' (budget_versions/budget_lines, resolved by effective month). Defaults to ''forecast''; flipping it is a deliberate per-client act at a period boundary.';

-- 20260908000000 said writes to the budget tables were service-role only, but
-- issued no REVOKE — so anon and authenticated still hold full DML on both.
-- RLS blocks those writes today (neither table has a non-SELECT policy for
-- them), so this is not a live hole; it is the grant matching the claim, and
-- the defence-in-depth rule from the 23-24 Aug remediation: never leave a write
-- grant standing on the strength of a policy that could later be widened.
-- REVOKE does not trip check-migration-security rule A, which keys on GRANT.
revoke insert, update, delete, truncate on public.budget_versions from anon, authenticated;
revoke insert, update, delete, truncate on public.budget_lines from anon, authenticated;

commit;

-- Direct-SQL DDL leaves PostgREST's schema cache stale, and a stale cache makes
-- the new column invisible to the API until it reloads.
notify pgrst, 'reload schema';
