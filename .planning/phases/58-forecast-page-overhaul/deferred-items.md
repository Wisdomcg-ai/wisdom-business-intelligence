# Deferred items — Phase 58

## Pre-existing test failure (not caused by 58-01)

- **File:** `src/__tests__/goals/plan-period-banner.test.tsx` (line 78)
- **Failure:** `expected '2026-03-31' to be '2026-04-01'` — date input renders as 2026-03-31 instead of 2026-04-01
- **Likely cause:** AU DST boundary (Apr 1 = clock change) causing a timezone-induced day rollback when serialising a `Date` to a `<input type="date">` value
- **Verified pre-existing:** Reproduces on `origin/main` with no changes from 58-01 applied
- **Owner:** Phase 42 (PlanPeriodAdjustModal) — out of scope for 58-01
