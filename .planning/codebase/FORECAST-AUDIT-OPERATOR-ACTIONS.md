# Forecast audit — Wave 0 data repair: DONE (23 Aug 2026)

Both production data repairs are **applied and verified**. One operator action
remains (Dragon regenerate), and it genuinely needs a human in the wizard.

## DONE — applied to prod via MCP apply_migration, verified by query

### 1. Digital Bond zombie lines retired
`20260823002251_retire_null_code_zombie_forecast_lines.sql`

Removed $274,399.92/yr of wages+super that no one planned — pre-#350 NULL-code
generated team lines that SYS-coded twins had superseded but could never
replace (NULLs never match the (forecast_id, account_code) upsert key).

Post-apply verification:
- zombies remaining fleet-wide: **0**
- rows soft-deleted: exactly **2**, Digital Bond only
- Digital Bond FY27 team cost: **$175,735.44** — to the cent, the approved
  `wizard_state.year1.teamCosts`
- **CONTROL HELD:** Armstrong & Co's active forecast still has its 2 NULL-code
  lines, Envisage FY2026 still has its 1. Their code-less lines have no SYS
  twin — they are those forecasts' ONLY team lines, so deleting them would have
  removed real cost. The self-verifying predicate ("code-less twin of a SYS
  line on the same forecast") spared them by construction, and this control is
  the proof it did not over-reach.

Soft-delete, so reversible: clear `deleted_at` on the 2 rows.

### 2. IICT abandoned FY27 shell retired
`20260823002450_retire_iict_abandoned_fy27_forecast_shell.sql`

An abandoned 22 May 2026 wizard session (never completed, created pre-#350) was
IICT's live budget feed: 48 lines summing to $20,000 FY27 revenue against a
$5,000,000 goal, AU-org accounts only. This was the root of "IICT budget = 0".

Post-apply verification:
- IICT active forecasts: **0** — consumers now show "no budget set" instead of
  a false $20k one
- the 48 lines are **preserved**, nothing deleted; reversible via is_active
- 16 businesses still hold an active forecast; no business has two active for
  one fiscal year

A real IICT forecast remains its own piece of work — the wizard has never
produced a valid one for the 3-org, multi-currency shape.

### Ledger reconciliation — note a deliberate deviation from CLAUDE.md

CLAUDE.md says to make the ledger row's version match the repo filename. Here
the repo filenames were renamed to match the **ledger** instead: `apply_migration`
assigns its own timestamp, and rewriting `supabase_migrations.schema_migrations`
would have required either an arbitrary-SQL write (deliberately not granted) or
a third migration whose own row would then drift in turn. Renaming the repo
files reaches the same invariant — names match the ledger — with zero extra
production writes and full PR review. Repo and prod both now read
`20260823002251` and `20260823002450`.

## STILL TO DO — Matt

**Regenerate Dragon Roofing's forecast.** Open the forecast wizard and click
through to Generate. This restores the ~$435,481/yr "Virtual Contractors" line
that the old keyword rule deleted. Regeneration is required because the fix is
on the WRITE path — stored lines don't change until a Generate runs.

While in Step 5, the new blue panel lists every account moved to Team Costs
**with its dollar value** and a "keep in OpEx" button. Worth a glance to confirm
the remaining exclusions are genuinely covered by Step 4 — that panel is what
would have made the $435k obvious months ago.

## What to watch

- **Sentry `invariant: summary-parity`** — now runs for Y2 and Y3, not just Y1.
  Anything here is a real divergence between what a coach approved and what was
  stored; it was invisible before.
- **`invariant: forecast_business_mismatch`** — should never fire. If it does, a
  client-side bug paired one business's id with another's forecast.
- **`invariant: forecast_headline_publish_failed`** — a Generate that stored its
  lines but failed to publish the headline. Retry the Generate.
