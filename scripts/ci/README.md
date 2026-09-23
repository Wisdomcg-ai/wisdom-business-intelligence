# CI security gates

## `check-migration-security.mjs`

Static gate over `supabase/migrations/*.sql`, run by the **migration security**
job in `.github/workflows/supabase-preview.yml`. It locks in the 23–24 Aug 2026
database security remediation so the class of bug cannot silently return.

Scans **only the migrations added/modified in the PR** (migrations are
append-only, so historical files are never rescanned — that is what lets it
enforce rules the historical baseline would fail). Three rules:

| Rule | Fails when | Why |
|------|-----------|-----|
| **A** | a `GRANT … TO anon` / `TO PUBLIC` (quoted or not) | anon/PUBLIC can call it over the public API, and `SECURITY DEFINER` functions bypass RLS — this is the exact root cause of the 21 revoked RPCs. Grant to `authenticated`/`service_role` instead. |
| **B** | a `SECURITY DEFINER` function without `SET search_path` | search-path hijack hardening. |
| **C** | a new `CREATE TABLE` in `public` with no `ENABLE ROW LEVEL SECURITY` in the same migration | a public table with no RLS is exposed to every API caller. |

### Escape hatches (deliberate exceptions)

Put a marker comment in the migration:

```sql
-- security-allow: anon-grant  <reason>   (rule A — e.g. a new RLS helper that must be anon-callable)
-- security-allow: no-rls      <reason>   (rule C — e.g. a partition child whose parent carries RLS)
```

Rule B has **no** escape hatch — there is no legitimate `SECURITY DEFINER`
without `search_path`.

### Run locally

```bash
node scripts/ci/check-migration-security.mjs                       # diff vs origin/main
node scripts/ci/check-migration-security.mjs supabase/migrations/X.sql   # specific file(s)
```

Logic is unit-tested in `src/__tests__/ci/migration-security.test.ts` (part of
the required `vitest` gate), including a regression test that the real Aug-2026
security migrations pass cleanly.

### To make it blocking

The job runs on every PR but is **advisory** until added to branch protection.
Add **`migration security`** to the required status checks on `main`
(Settings → Branches → main → Require status checks) to block merges on failure.
