# Forecast audit — the two actions that still need Matt (23 Aug 2026)

PR #390 shipped all four waves of code fixes. These two touch PRODUCTION DATA
and cannot be done from a deploy. Verified still pending as at merge time:
2 zombie lines, 1 active IICT shell.

---

## 1. Apply the zombie-line migration

`supabase/migrations/20260823060000_retire_null_code_zombie_forecast_lines.sql`

This is what actually removes **Digital Bond's $274,399.92/yr** of wages+super
that nobody planned. (A direct prod write was attempted during the session and
was correctly BLOCKED by the permission classifier — hence the migration route,
which is also the project's documented channel per CLAUDE.md.)

Apply via MCP `apply_migration` (never `db push`), then make the ledger row's
version match the repo filename `20260823060000`.

**Why the predicate is safe.** It retires a line only when it is
non-manual, code-less, AND the same forecast carries a SYS-coded line of the
same name — i.e. something demonstrably superseded it. Checked against prod, it
selects exactly Digital Bond's two rows and correctly SPARES:

- **Armstrong & Co FY2027** — NULL-code wages ($284,440) + super ($34,133) with
  NO SYS twin. Those are its ONLY team lines; deleting them removes real cost.
- **Envisage FY2026** — same shape, on a closed year. Duplication is not proven
  there, so it is deliberately left alone.

Soft-delete (`deleted_at`), so it is reversible.

### Verify after applying

```sql
-- Expect 0 rows.
select count(*) from forecast_pl_lines l
where l.deleted_at is null and l.account_code is null and l.is_manual = false
  and exists (
    select 1 from forecast_pl_lines s
    where s.forecast_id = l.forecast_id and s.deleted_at is null
      and s.account_code like 'SYS-%' and s.account_name = l.account_name
  );

-- Digital Bond FY27 team cost should now equal the approved 175,735.
select round(sum((t.v)::numeric), 2)
from forecast_pl_lines l
join financial_forecasts f on f.id = l.forecast_id
join business_profiles bp on bp.id = f.business_id
cross join lateral jsonb_each_text(coalesce(l.forecast_months, '{}'::jsonb)) t(k, v)
where bp.business_name = 'Digital Bond' and f.fiscal_year = 2027 and f.is_active
  and f.deleted_at is null and l.deleted_at is null
  and l.account_name in ('Wages & Salaries', 'Superannuation')
  and t.k between '2026-07' and '2027-06';
```

Armstrong must still have its 2 NULL-code lines after this runs — that is the
control proving the predicate did not over-reach.

---

## 2. Regenerate Dragon, retire the IICT shell

**Dragon Roofing** — open the forecast wizard and Generate. The code fix
(coverage-aware team exclusion) restores the ~$435,481/yr "Virtual Contractors"
line that the old keyword rule deleted. Regeneration is needed because the fix
is on the WRITE path; stored lines don't change until a Generate runs.

While you are in there, Step 5 now shows a blue panel listing every account
moved to Team Costs **with its dollar value** and a "keep in OpEx" button —
worth a glance to confirm the remaining exclusions are genuinely covered by
Step 4.

**IICT Group** — its active FY2027 forecast is an abandoned May wizard session:
$20,000 of revenue against a $5,000,000 goal, AU-org accounts only, no HK org.
It is the root of the "IICT budget=0" symptom across the consolidated report and
dashboards. Retire it so consumers show "no budget set" rather than a false one:

```sql
update financial_forecasts
set is_active = false, updated_at = now()
where id = '88199866-030d-4c01-8626-0ab1a4617cc1';
```

A real IICT forecast is its own piece of work — the wizard has never produced a
valid one for the 3-org, multi-currency shape (that gap is documented in the
audit as an open constraint, not something #390 fixed).

---

## What to watch afterwards

- **Sentry**, tag `invariant: summary-parity` — now fires for Y2 and Y3 as well
  as Y1. Anything appearing there is a real divergence between what a coach
  approved and what got stored; it was invisible before.
- **`invariant: forecast_business_mismatch`** — should never fire. If it does,
  a client-side bug paired one business's id with another's forecast.
- **`invariant: forecast_headline_publish_failed`** — a Generate that stored its
  lines but failed to publish the headline. Retry the Generate.
