# Phase 51 — Deferred items

Items discovered during plan execution but out of scope for the current plan. Filed here so they aren't lost.

## 51-01 — discovered 2026-05-04

- **Pre-existing lint warning in `Step3RevenueCOGS.tsx`** (line 594 on main, now ~712): `React Hook useMemo has a missing dependency: 'calculateCOGSAmount'`. Predates Phase 51 (verified by `git stash` + lint on origin/main). Not related to the $/% editor refactor. Fix in a future cleanup pass.
- **Local `npm run build` fails on missing `supabaseUrl`** during page-data collection for `/api/Xero/reconciliation`. Pre-existing in this worktree (no `.env.local`); Vercel CI builds correctly with proper env. Compilation succeeded; only runtime page-data collection failed. Out of scope for 51-01 (build env, not code).
