-- Wave 0 of the 21 Aug 2026 forecast validity audit — data repair.
--
-- THE DEFECT (audit finding XVAL-1). Before PR #350 the wizard's materialiser
-- emitted generated team lines with a NULL account_code. NULLs never match in
-- the (forecast_id, account_code) upsert key, so when #350's SYS-coded lines
-- superseded them the old rows could not be updated or replaced — they simply
-- sat alongside forever, and every consumer that sums forecast_pl_lines
-- (quarterly summary, cashflow, dashboards, the monthly report's budget
-- column) read the doubled figure.
--
-- Digital Bond's live active FY2027 forecast is the proven case:
--   NULL-code  "Wages & Salaries"  $244,999.92/yr  +  "Superannuation" $29,400
--   SYS-TEAM-* twins               $163,228.08/yr  +                   $12,507.36
-- The SYS pair sums to $175,735.44, which is EXACTLY the approved
-- wizard_state.year1.teamCosts of $175,735 — proof that the SYS lines are the
-- approved forecast and the NULL-code pair was never planned by anyone.
-- Overstatement: $274,399.92/yr.
--
-- THE PREDICATE, and why it is written this way rather than by id:
-- a NULL-code, non-manual line is only a zombie if the SAME forecast also
-- carries a SYS-coded line of the same name — i.e. something superseded it.
-- That condition is self-verifying and, checked against prod on 23 Aug 2026,
-- selects exactly the two Digital Bond rows and nothing else. In particular it
-- correctly SPARES:
--   * Armstrong & Co FY2027 — has NULL-code wages/super but NO SYS twin, so
--     those rows are its only team lines; deleting them would remove real cost.
--   * Envisage FY2026 — same, on a closed year.
-- Rows are soft-deleted (deleted_at), so this is reversible.
--
-- The code-side backstop ships with this migration: the converter now retires
-- a non-manual code-less line whose category+name the current payload also
-- generates (assumptions-to-pl-lines.ts, "code-less twins"), so a future
-- Generate cannot recreate this state.

update public.forecast_pl_lines l
set deleted_at = now(),
    updated_at = now()
where l.deleted_at is null
  and l.account_code is null
  and l.is_manual = false
  and exists (
    select 1
    from public.forecast_pl_lines s
    where s.forecast_id = l.forecast_id
      and s.deleted_at is null
      and s.account_code like 'SYS-%'
      and s.account_name = l.account_name
  );
