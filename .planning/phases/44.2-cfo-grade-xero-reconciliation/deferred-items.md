# Deferred items found during 44.2-06B execution

## Pre-existing test failure (out of scope for 06B)

`src/__tests__/goals/plan-period-banner.test.tsx:78` —
expected '2026-04-01' but received '2026-03-31'. Date-boundary flakiness
in the PlanPeriodBanner test from Phase 42-03 (commit a8ad838).
Unrelated to the Path A sync orchestrator changes; the failure reproduces
on main. Track for a small follow-up commit (likely a UTC vs local-tz
issue in the date construction).

# Deferred items found during 44.2-06C execution

## Pre-existing test failures (out of scope for 06C)

Re-confirmed during 06C full-suite run on `feat/44.2-06C-bs-schema`:

1. `src/__tests__/goals/plan-period-banner.test.tsx` — same failure as
   the one logged for 06B above. Still pre-existing on main, unchanged
   by 06C.
2. `src/app/api/cfo/report-status/__tests__/route.test.ts > Test 6:
   approve_and_send from draft → writes approved first, sends, flips to
   sent with log` — fromEmail expected `mattmalouf@wisdomcg.com.au` but
   received a different value. Pre-existing on main (file last touched
   2 commits ago, before 06C branched). Unrelated to BS schema work.

Both failures are tracked here so subsequent phases don't re-investigate
them. Neither is caused by the BS migrations or the schema test suite.

## Pending production migration apply (06A pattern)

Migrations `20260430000010_xero_bs_lines.sql` and
`20260430000011_xero_bs_lines_wide_compat.sql` ship in this branch but
will NOT auto-apply to Supabase production on PR merge — same gap
documented in `44.2-06A-SUMMARY.md` (architectural debt #1). Operator
must paste each migration into the Supabase Studio SQL Editor in order
after merging. The new schema test suite (`src/__tests__/migrations/06C-
bs-schema-migration.test.ts`) detects the table's absence and gracefully
skips its assertions until the operator has applied the migrations,
giving an unambiguous re-run signal afterward.
