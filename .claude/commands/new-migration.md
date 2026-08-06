---
description: Scaffold a new Supabase migration that follows the project's idempotency + safety conventions
argument-hint: <short description of the change>
---

Scaffold a new migration in `supabase/migrations/` for the change described in
`$ARGUMENTS`. Do NOT invent schema — ask the user for the exact tables/columns
if the description is not specific enough.

1. **Filename.** `supabase/migrations/<UTC-timestamp>_<snake_case_slug>.sql`
   using the format of existing files (e.g. `20260516000000_phase66_backfill_…`).
   Run `ls supabase/migrations/ | tail -5` first to match the timestamp scheme
   and avoid collisions.

2. **Body — mandatory conventions** (verify against
   `supabase/migrations/00000000000000_baseline_schema.sql` before writing):
   - Wrap everything in `BEGIN;` … `COMMIT;`.
   - **Idempotent** — every statement must be safe to re-run:
     - DDL: `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`,
       `CREATE INDEX IF NOT EXISTS`, `DROP … IF EXISTS`.
     - Data backfill: guard with `WHERE NOT (…)` so a second run affects 0 rows.
   - Scope to explicitly named tables — no wildcard/catalog-wide changes.
   - Use the `||` JSONB merge operator for JSONB column updates — never a bare
     `column = '{…}'` assignment that would wipe sibling keys.
   - Lead with a comment block: what it does, why, and the post-migrate
     verification query (a `SELECT count(*)` that should return 0).

3. **After scaffolding**, remind the user:
   - The migration auto-applies to the **production** database when the PR
     merges to `main` (Supabase GitHub integration) — and to a preview branch
     on PR open. Treat the merge as a production data change.
   - Schedule risky changes outside AU/NZ business hours (live tenants: Dragon,
     IICT, JDS, Fit2Shine).
   - Verify idempotency on the preview branch by running the migration twice —
     the second run must report 0 rows affected.

Write only the migration file. Do not apply it.
