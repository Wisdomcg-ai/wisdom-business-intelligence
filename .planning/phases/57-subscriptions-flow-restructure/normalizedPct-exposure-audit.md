# normalizedPct exposure audit

**Captured:** 2026-05-07T21:27:52.155Z

**Note:** Forecasts whose `updated_at` is before 2026-05-07T04:02:31.000Z are skipped because the normalizedPct bug post-dates them — sub-1% percentages on those rows are legitimate, not corruption. 22 forecast(s) skipped under this filter for this run.

## Background

PR #126 (commit `917d3267`) added a `pct > 1 ? pct : pct * 100` normalization guard at two sites in the wizard rollup (`useForecastWizard.ts`):

- COGS variable lines (~lines 1430–1442)
- Commissions (~lines 1555–1570)

The guard inflates legitimate sub-1% percentages 100×. PR #134 reverts the guard. Existing `financial_forecasts.wizard_state` rows on prod remain corrupted until the operator triggers a resave naturally. This audit measures the blast radius.

## Method

For every `financial_forecasts` row with `is_active=true`, walk `assumptions.cogs.lines[]` and `assumptions.team.commissions[]` looking for `percentOfRevenue` values strictly between 0 and 1.

For affected COGS lines, the bug added `revenue × pct × 0.99` to Y1 cogs (buggy contribution `revenue × pct`, correct contribution `revenue × pct / 100`). Y1 revenue is read from `wizard_state.year1.revenue` (not corrupted by the bug).

For commissions, the same delta is computed against the linked revenue line's Y1 total (or total Y1 revenue as upper bound when the linked line is unresolvable). The commission delta lives in `teamCosts`, not COGS.

## Severity tiers

Severity is keyed off `|cogsDelta| + |commissionDelta|`:

- **CRITICAL** — total delta > $1,000,000
- **HIGH** — total delta $100,000 – $1,000,000
- **MEDIUM** — total delta $10,000 – $100,000
- **LOW** — total delta < $10,000
- **NONE** — no sub-1% lines (not exposed)

## Summary

- Forecasts skipped (pre-PR-#126 saves): **22**
- Active forecasts scanned: **1**
- Forecasts with sub-1% percentage lines: **1**
- Total absolute Y1 delta across exposed tenants: **$69,497,994**
- Severity breakdown:
  - CRITICAL: 1
  - HIGH: 0
  - MEDIUM: 0
  - LOW: 0

## Exposed tenants

| Tenant | business_id | forecast_id | sub-1% COGS | sub-1% Comm. | wizard Y1 cogs | corrected Y1 cogs | Δ COGS | Δ Comm. | Total Δ | Severity |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Just Digital Signage | `900aa935-ae8c-4913-baf7-169260fa19ef` | `1a03be71-e6c8-4755-8a5b-1035128197dc` | 17 | 0 | $6,652,799 | -$62,845,194.565 | $69,497,994 | $0 | $69,497,994 | CRITICAL |

## All scanned forecasts

| Tenant | forecast_id | sub-1% COGS | sub-1% Comm. | Severity |
| --- | --- | ---: | ---: | --- |
| Just Digital Signage | `1a03be71-e6c8-4755-8a5b-1035128197dc` | 17 | 0 | CRITICAL |

## Next steps

- Run `scripts/force-resave-wizard-state.ts --business-id=<uuid> --dry-run` per CRITICAL/HIGH tenant to preview the correction.
- Re-run with `--confirm` after reviewing the dry-run output. Idempotent — re-running on the same tenant is safe.
- LOW severity tenants can be left to natural resave (no operator action required).
