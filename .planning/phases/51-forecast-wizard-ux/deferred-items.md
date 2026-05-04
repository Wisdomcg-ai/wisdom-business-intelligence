# Phase 51 — Deferred Items

Out-of-scope discoveries during plan execution. Track here, do NOT fix in the
discovering plan (per gsd executor scope-boundary rule).

## From 51-01 (Step 3 $/% bidirectional parity) — 2026-05-04

- **Pre-existing lint warning in `Step3RevenueCOGS.tsx`** (line 594 on main, now ~712): `React Hook useMemo has a missing dependency: 'calculateCOGSAmount'`. Predates Phase 51 (verified by `git stash` + lint on origin/main). Not related to the $/% editor refactor. Fix in a future cleanup pass.
- **Local `npm run build` fails on missing `supabaseUrl`** during page-data collection for `/api/Xero/reconciliation`. Pre-existing in this worktree (no `.env.local`); Vercel CI builds correctly with proper env. Compilation succeeded; only runtime page-data collection failed. Out of scope for 51-01 (build env, not code).

## From 51-04a (Step 4 termination + PT/casual) — 2026-05-04

- **`renderSalaryInput` is dead code** in `Step4Team.tsx` (defined ~L1752, no
  callers). Pre-existing — not introduced by 51-04a. Leaving in place; the
  active salary cell renders inputs inline at L2053. Safe to delete in a
  future cleanup pass.
