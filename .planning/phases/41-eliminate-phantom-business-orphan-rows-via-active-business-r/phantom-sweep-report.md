# Phase 41 — Phantom Row Sweep Report

Run by: GSD executor (sonnet / Claude Code)
Run at: 2026-04-23T22:27:28Z
DB target: uudfstpvndurzwnapibf (prod, `coaching-platform-prod`, Oceania (Sydney))
Transport: `npx supabase db query --linked -f <file> -o json` — confirmed prod-linked via `supabase projects list` (active row marker on `uudfstpvndurzwnapibf`).

Prerequisite status (must both be TRUE before executing Task 3):

- [ ] Plan 41-01 merged and deployed to prod
- [ ] Plan 41-02 merged and deployed to prod

> **Executor note on prerequisite state at sweep time (human to confirm):** `git log origin/main..HEAD --oneline` shows the local `main` branch is 5 commits ahead of `origin/main`, including:
>
> - `f8b09e8` docs(41-02): complete Plan 41-02
> - `f095f97` feat(41-02): role-gate /business-profile — owner/admin/member/viewer UI modes
> - `24f7b76` refactor(41-02): route /business-profile through BusinessContext, remove owner_id path
> - `d6c6383` docs(41-01): complete Plan 41-01
> - `9a5f34e` refactor(41-01): remove owner_id lazy-create from BusinessProfileService
>
> These commits ARE on local `main` but have NOT yet been pushed to `origin/main`. Vercel prod deploys off `origin/main`, so at sweep time the fixed code may not yet be live on `wisdombi.ai`. **Matt: tick both boxes above only if you have pushed + verified the Vercel prod deploy is green on those commits.** If not deployed, a team-member visiting `/business-profile` between now and the DELETE could re-spawn a fresh phantom — the sweep would still work, but a new one could arrive before you read this report. Recommended path: push + deploy first, then reply with the confirmation string.

## Phantom Businesses (SELECT query)

Raw query result (JSON output, untrusted-data envelope stripped):

```json
{
  "rows": [
    {
      "id": "9797a7cc-6e86-4b18-895c-ba5f70f6427e",
      "name": "My Business",
      "business_name": "My Business",
      "owner_id": "1004d7ae-b409-4550-aa36-68419d81d7b3",
      "email": "jessica@ohnine.com.au",
      "created_at": "2026-01-26 23:20:56.069",
      "xero_n": 0,
      "forecast_n": 0,
      "team_n": 0
    }
  ]
}
```

Row count: 1

## Orphan Business Profiles (SELECT query)

Raw query result:

```json
{
  "rows": []
}
```

Row count: 0

## Proposed Deletion

If user approves, the following will be executed IN ORDER inside a single transaction:

```sql
BEGIN;

-- 1. Orphan business_profiles (business_id IS NULL, listed in the orphan table above).
--    None found — this statement is a no-op but included verbatim for audit completeness
--    and to keep the DELETE script structurally identical to the plan.
DELETE FROM business_profiles
WHERE id IN ( NULL );  -- <-- orphan profile IDs (no rows to delete; filter evaluates to empty set)

-- 2. business_profiles that cascade from phantom businesses (business_id points at a phantom).
--    Required to avoid FK violations on step 3. One row matched:
--      id=fa83cc7a-e638-4582-a230-1c33a6dd7410 (user_id=1004d7ae-b409-4550-aa36-68419d81d7b3,
--      business_id=9797a7cc-6e86-4b18-895c-ba5f70f6427e, created 2026-01-26 23:20:56,
--      same user/time as the phantom business — classic lazy-create signature).
DELETE FROM business_profiles
WHERE business_id IN ( '9797a7cc-6e86-4b18-895c-ba5f70f6427e' );

-- 3. The phantom businesses themselves.
DELETE FROM businesses
WHERE id IN ( '9797a7cc-6e86-4b18-895c-ba5f70f6427e' );

COMMIT;
```

All three DELETE statements are shown so the user approves the FULL picture — not just the headline phantom-businesses delete. Review every ID list before confirming.

> Note on statement #1 (orphan profiles): row count was 0, so the IN-list has no IDs. I've written it as `IN ( NULL )` which evaluates to an empty set and affects 0 rows (safe — a literal `NULL` comparison is never true in SQL). At execution time Task 3 will skip this statement entirely rather than sending the no-op (equivalent outcome, cleaner log).

## Pre-delete Safety Checks (evidence)

One-line confirmation for every business ID in the phantom list:

| id | xero_connections | financial_forecasts | non_owner_active_members | owner_elsewhere_active | business_profiles_cascade |
|----|------------------|---------------------|--------------------------|------------------------|---------------------------|
| 9797a7cc-6e86-4b18-895c-ba5f70f6427e | 0 | 0 | 0 | 1 (Oh Nine, admin role, status=active, created 2026-01-26 23:19:54 — i.e. 62 seconds BEFORE the phantom business below) | 1 (id=fa83cc7a-e638-4582-a230-1c33a6dd7410 — will be removed by DELETE #2) |

Owner context (why this is a phantom and not a legitimate business):

- `owner_id=1004d7ae-b409-4550-aa36-68419d81d7b3` → `jessica@ohnine.com.au`.
- Jessica is `admin` of `Oh Nine` (`0bfbc81f-4467-4123-9cec-b188e496c2ff`) via `business_users`, status=active.
- Oh Nine team-membership row created at `2026-01-26 23:19:54.68979+00`.
- Phantom business `9797a7cc-...` created at `2026-01-26 23:20:56.069+00` — **62 seconds later**.
- Cascade `business_profiles` row `fa83cc7a-...` created at `2026-01-26 23:20:56.267+00` — **0.2 seconds after** the phantom business, same lazy-create transaction.
- Zero Xero connections, zero financial forecasts, zero team members on the phantom.

This is exactly the Jessica @ Oh Nine incident pattern that triggered Phase 41: a coach/admin team-member logged in, visited `/business-profile`, and the old `getOrCreateBusinessProfile` path silently created a blank "My Business" owned by them that then polluted the coach's client list.

### Bystander row sanity check — NOT deleted

`mattmalouf@wisdomcg.com.au` owns a row with `name='My Business'` (`f672b1bf-7fa7-4abe-b544-d1d4ed9ab7ee`, `business_name='[DO NOT USE — coach placeholder, auto-created on signup]'`). The sweep correctly EXCLUDES this row because Matt has no `business_users` rows linking him to any other business (owner-elsewhere check returns NULL). The name pattern matches but the "team-member elsewhere" gate holds. Matt's row is left alone — consistent with the orchestrator's known_preview guidance.

## Awaiting User Confirmation

Review the lists above. If all rows are correctly identified as phantoms, reply with `confirm delete phantoms` to proceed. Any other reply will abort.

If you determine no rows should be deleted (e.g. deploy prerequisite not yet met), reply `no phantoms to delete` and this plan exits clean. You can re-run the plan later after the prerequisites are in place.
