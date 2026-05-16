# 66-01 Deviation — migration scope expanded to fix table DEFAULTs

**Date:** 2026-05-17
**Authorized by:** Matt (operator decision after audit results)

## What changed

Plan 66-01 / decision D-03 scoped the migration as **data backfill only — no DDL**,
and the plan's Task 2 acceptance criteria explicitly asserted the migration contains
no `ALTER COLUMN ... SET DEFAULT`.

After the audit ran, the operator authorized expanding the migration to also correct
the column DEFAULTs. The migration `20260516000000_phase66_backfill_finances_section_key.sql`
now additionally runs:

```sql
ALTER TABLE public.business_users
  ALTER COLUMN section_permissions SET DEFAULT '{... "finances": true ...}'::jsonb;
ALTER TABLE public.team_invites
  ALTER COLUMN section_permissions SET DEFAULT '{... "finances": false ...}'::jsonb;
```

The legacy `financials` key is dropped from both DEFAULTs (Phase 65 verification —
`65-01-SECTION-KEY-VERIFICATION.md` — confirmed no TS/UI/Postgres-function code
reads `financials`).

## Why

The data backfill alone fixes existing rows but leaves the baseline table DEFAULTs
emitting the legacy `financials` key. Any future INSERT that omits
`section_permissions` would reintroduce the gap. Fixing the DEFAULT closes the
latent trap permanently. It is a one-line-per-table change, naturally idempotent.

## Audit result that informed this

Production audit (`scripts/audit-section-permissions-legacy-key.ts`, 2026-05-17):
- `business_users`: 23 rows missing canonical `finances` key — **all 23 are
  owner/active (21) or admin/active (2); zero member rows.**
- `team_invites`: 0 rows affected.
- Conflicting rows: 0.

Because owner/admin bypass the section-key check entirely in
`requireSectionPermission`, the legacy-key gap created **no live ENFORCE-cutover
security exposure**. Consequence: 66-01 is no longer a hard blocker for Phase 65
Wave 65-04 — that cutover is unblocked and can proceed on its own timeline. The
migration is now hygiene + future-proofing rather than a security gate.

## Verification impact

The 66-01-PLAN.md Task 2 acceptance criterion `! grep -q "...ALTER COLUMN .* SET
DEFAULT..."` is intentionally no longer satisfied. This deviation note is the
record of that authorized override.
