# normalizedPct exposure audit

**Captured:** 2026-05-07T12:24:35.096Z

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

- Active forecasts scanned: **23**
- Forecasts with sub-1% percentage lines: **3**
- Total absolute Y1 delta across exposed tenants: **$133,275,034**
- Severity breakdown:
  - CRITICAL: 2
  - HIGH: 0
  - MEDIUM: 0
  - LOW: 0

## Exposed tenants

| Tenant | business_id | forecast_id | sub-1% COGS | sub-1% Comm. | wizard Y1 cogs | corrected Y1 cogs | Δ COGS | Δ Comm. | Total Δ | Severity |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Just Digital Signage | `900aa935-ae8c-4913-baf7-169260fa19ef` | `1a03be71-e6c8-4755-8a5b-1035128197dc` | 17 | 0 | $76,150,793 | $6,652,799.435 | $69,497,994 | $0 | $69,497,994 | CRITICAL |
| Just Digital Signage | `900aa935-ae8c-4913-baf7-169260fa19ef` | `58f5a43c-de8e-4a11-a9e4-4789dd4634de` | 17 | 0 | $6,075,420 | -$57,701,620.47 | $63,777,040 | $0 | $63,777,040 | CRITICAL |
| My Business | `2d9944f9-3ef4-483d-9e34-ede57632284a` | `b943025a-a018-4854-8c84-ba183cd6a0ac` | 17 | 0 | $0 | $0 | $0 | $0 | $0 | NONE |

## Per-tenant notes

### My Business (`2d9944f9-3ef4-483d-9e34-ede57632284a`)

- wizard_state.year1.revenue is missing or zero — delta computations are 0 by definition. Forecast may pre-date wizard_state persistence (operator never re-saved).

## All scanned forecasts

| Tenant | forecast_id | sub-1% COGS | sub-1% Comm. | Severity |
| --- | --- | ---: | ---: | --- |
| (unknown:47ddde06-1fdb-4a5c-894f-f9ffdbeaae6f) | `c51f32bf-ad45-4104-99c9-694489a408ae` | 0 | 0 | NONE |
| (unknown:946b6e4e-e676-420e-a335-db6a72a8444b) | `34a0b97a-35be-4222-9dc5-fc404188a5ff` | 0 | 0 | NONE |
| ABC Cleaning Services | `a0eebb09-afe1-44de-b449-601127ab63ce` | 0 | 0 | NONE |
| Digital Bond | `36063a02-cf50-4020-b08b-1ec1df7b799b` | 0 | 0 | NONE |
| Distinct Directions | `f9c0867b-55a2-43d5-bde0-410875e459dc` | 0 | 0 | NONE |
| Distinct Directions | `cd8a1a79-7d3e-426d-9e6e-246573089dc1` | 0 | 0 | NONE |
| Dragon Roofing | `102189f9-3d4d-4731-92be-bcf734d4d039` | 0 | 0 | NONE |
| Efficient Living | `d1e9134d-24ce-49cb-bfb6-af11cd6d3fd3` | 0 | 0 | NONE |
| Envisage Australia Pty Ltd | `9e9c3f8f-c9a7-4564-85ba-6b000742f169` | 0 | 0 | NONE |
| Envisage Australia Pty Ltd | `efff076b-676d-49a6-a78a-21c521050364` | 0 | 0 | NONE |
| Espresso Services Plus | `d9ed25c6-65bb-4126-8ae0-cb2c317905f2` | 0 | 0 | NONE |
| First Logistics | `c3669f26-7799-4feb-831f-f74d59644409` | 0 | 0 | NONE |
| Fit2Shine | `a781f35b-c12f-4809-a048-5aa57481bfe9` | 0 | 0 | NONE |
| Just Digital Signage | `1a03be71-e6c8-4755-8a5b-1035128197dc` | 17 | 0 | CRITICAL |
| Just Digital Signage | `58f5a43c-de8e-4a11-a9e4-4789dd4634de` | 17 | 0 | CRITICAL |
| JVJ Civil and Asphalt | `e24f1707-ea75-4d9a-ba09-b07349fa5eb2` | 0 | 0 | NONE |
| My Business | `b943025a-a018-4854-8c84-ba183cd6a0ac` | 17 | 0 | NONE |
| Oh Nine | `bfeb56c7-e2a1-4c07-8164-04809aadb9b3` | 0 | 0 | NONE |
| Precision Electrical Group | `dfebcb57-87fa-4d59-afe1-b08226f88331` | 0 | 0 | NONE |
| Precision Electrical Group | `e31c64f5-48c5-4de3-b6b2-06b41b8b8152` | 0 | 0 | NONE |
| Sydney Pressed Metal | `6dd15be2-643d-4331-b7b1-4d56dac098da` | 0 | 0 | NONE |
| Sydney Pressed Metal | `c9e5f284-f826-4056-b24f-949f50d8f85a` | 0 | 0 | NONE |
| WISDOM CFO | `a878a705-12e4-48c8-8c21-a5ecf34e71fc` | 0 | 0 | NONE |

## Next steps

- Run `scripts/force-resave-wizard-state.ts --business-id=<uuid> --dry-run` per CRITICAL/HIGH tenant to preview the correction.
- Re-run with `--confirm` after reviewing the dry-run output. Idempotent — re-running on the same tenant is safe.
- LOW severity tenants can be left to natural resave (no operator action required).
