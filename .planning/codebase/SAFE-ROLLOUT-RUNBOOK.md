# Safe-Rollout Runbook — WisdomBI Remediation

**Purpose:** A checklist the executor (you or an agent) follows so that implementing the remediation roadmap (`REMEDIATION-ROADMAP.md`) **breaks nothing live and loses no data.** 27 production tenants hold financial data; treat every change as if Dragon / JDS / IICT are watching.

**Golden rule:** *Never make a change that can't be reversed and can't be measured.* Nothing destructive runs until the additive version has proven itself in prod, and nothing runs at all until you've proven you can restore.

**Reusable cycle for every change:** `BACKUP → MEASURE → EXPAND (never drop) → VERIFY against invariants → CANARY one tenant → WIDEN → CONTRACT`.

---

## 0. Repo tooling you already have (use these, don't reinvent)

| Tool | What it does | Invocation |
|---|---|---|
| `scripts/audit-dual-id-distribution.mjs` | READ-ONLY: classifies every `business_id` value as BIZ / PROFILE / ORPHAN per table; flags "dirty" (mixed) tables | `node scripts/audit-dual-id-distribution.mjs` |
| `scripts/audit-dual-id-full.mjs` | Fuller dual-ID distribution audit | `node scripts/audit-dual-id-full.mjs` |
| `scripts/verify-production-migration.ts` | 4-gate reconciliation verifier vs LIVE Xero+Supabase (read-only). Exit 0 = all gates pass | `npx tsx scripts/verify-production-migration.ts --business-id=<uuid> --tenant-id=<uuid> --balance-date=YYYY-MM-DD --fy-end=YYYY-MM-DD --fy-start-month-key=YYYY-MM-01` |
| `scripts/verify-xero-tokens-encrypted.ts` | Confirms tokens are encrypted at rest | `npx tsx scripts/verify-xero-tokens-encrypted.ts` |
| CI: `supabase-preview.yml` | Per-PR preview DB + lint/typecheck/vitest/build/migration gates | runs on PR to `main` |
| Supabase GitHub integration | Applies `supabase/migrations/*.sql` on merge to `main`; preview branch per PR | automatic |

> Migrations are SQL files in `supabase/migrations/` applied by the Supabase GitHub integration. Backfill/data scripts run locally via `npx tsx` against `.env.local` (which points at prod — **read-only unless explicitly mutating**).

---

## 1. Pre-flight (do ONCE, before the first change)

- [ ] **Confirm PITR + on-demand backup.** Verify Supabase Point-in-Time-Recovery retention covers your rollback-decision window. Take a manual backup before each data migration.
- [ ] **Run one real restore drill** into a throwaway Supabase project. An untested backup is a hope, not a safety net. (Also closes part of the Reliability/DR grade.)
- [ ] **Write down RPO/RTO** you can actually meet (e.g. RPO 24h via daily backup / minutes via PITR; RTO = time the drill took). One sentence in this file is enough to start.
- [ ] **Capture the baseline** (see §2) and commit the output as `baseline-<date>.txt` so "after" comparisons are auditable.

## 2. Measure current state (READ-ONLY) — before EVERY structural change

- [ ] Run `node scripts/audit-dual-id-distribution.mjs` → record which tables are BIZ / PROFILE / **dirty(mixed)** / have **ORPHANs**.
- [ ] Record **row counts per tenant per affected table** (the differential baseline). Any unexpected change post-migration = data loss caught immediately.
- [ ] For any FK you intend to add: **enumerate orphan rows first** (`ADD CONSTRAINT` hard-fails if even one orphan exists).
- [ ] Save all numbers. They are your "after" comparison.

## 3. The migration pattern: EXPAND → MIGRATE → CONTRACT

**Never drop or rename in a single step.** For any column/ID/RLS change:

1. **Expand** — add the new column / new resolver / new policy *alongside* the old. Both coexist. Non-breaking.
2. **Backfill** — populate the new path with a script that is:
   - [ ] **Dry-run first** — prints what it *would* change, changes nothing. Review the diff.
   - [ ] **Idempotent** — safe to run twice.
   - [ ] **Transaction-wrapped** — all-or-nothing.
   - [ ] **Non-destructive** — keeps old data (shadow column / soft-delete) until verified.
3. **Verify** (§5) — invariants + row-count baseline still hold.
4. **Switch reads** — repoint callers to the new path **in small clusters**, not all 55 files at once.
5. **Soak** — let it run in prod, watched, before removing anything.
6. **Contract** — only *after* soak, remove the old column / old resolver / RLS mask.

## 4. Authz changes get a LOG-ONLY dress rehearsal

For R24 (templates auth) and C-34 (`verifyBusinessAccess` tightening) — risk is **locking out a real user**, not data loss:

- [ ] Deploy the new check in **shadow mode**: log `"would deny: user=X business=Y"` but **do not deny yet**.
- [ ] Watch logs against real traffic for several days.
- [ ] If the only "would-deny" entries are the intended ones (unauthenticated / cross-tenant) → flip to enforce.
- [ ] If a legitimate user appears → a frontend isn't sending auth. Fix that **before** enforcing.

## 5. Verification gates (your "definition of done")

A change is **not** done at "deployed." It is done at **"deployed + invariants pass + baseline unchanged."**

- [ ] CI green: `npm run test` (vitest), `next lint`, `tsc --noEmit`, `next build`, migration-filename check.
- [ ] **4×2 role × ID matrix** for any resolver/RLS change: for each role {owner, team-member, coach, super-admin} × each ID-space {`businesses.id`, `business_profiles.id`}, assert the **same set of rows visible before and after**. RLS bugs are invisible except by this differential test.
- [ ] **Reconciliation gates** for any financial/sync change: `npx tsx scripts/verify-production-migration.ts ...` per affected tenant → exit 0.
- [ ] **Row-count baseline** (§2) unchanged per tenant (or changed by exactly the intended delta).

## 6. Roll out one tenant at a time

- [ ] **One change per PR**, atomic commits → clean `git revert` if needed.
- [ ] **Canary**: apply to ONE low-risk tenant first (a test business — *not* Dragon/JDS/IICT). Verify (§5). Then widen.
- [ ] Use Vercel Rolling Releases for code-path changes where available.
- [ ] **Watch during rollout**: Sentry error rate, cron heartbeats (`src/lib/cron/heartbeat.ts`), per-tenant reconciliation. Roll back at the first unexplained delta.

---

## Per-item playbook (risk-tiered)

### Phase 0 — ship this week

**R24 — authenticate `monthly-report/templates`** *(risk: lock out real users)*
1. Add `getUser()` + `verifyBusinessAccess()` to all 4 verbs in **log-only mode** (§4).
2. Soak; confirm only unauthenticated/cross-tenant callers are flagged.
3. 4×2 matrix → enforce. Canary one tenant → widen.

**R25 — atomic BS sync** *(risk: REDUCES risk; the change is the fix)*
1. Wrap delete+insert in a transaction; return real status (no unconditional `success:true`).
2. Verify with a tenant whose BS sync you can re-run; confirm a forced insert-failure now surfaces as an error, not green.

**Dependabot + `npm audit` CI gate** *(risk: none — config only)*
1. Add `.github/dependabot.yml` + `npm audit --audit-level=high` step. Pure config; no runtime path touched.

### Phase 1 — fork gate + authz correctness

**R3 — FK on `xero_connections.business_id`** *(risk: migration hard-fails on orphans)*
1. `node scripts/audit-dual-id-distribution.mjs` → list ORPHAN connection rows.
2. Repoint or delete orphans (backed up first).
3. `ALTER TABLE ... ADD CONSTRAINT ... NOT VALID;` then `VALIDATE CONSTRAINT;` (two-step avoids a long lock + lets you catch stragglers).

**R1 — ID canonicalization onto `resolveBusinessId.ts`** *(risk: wrong tenant's data shown)*
1. Expand: keep the 3 resolvers; introduce canonical path alongside.
2. Switch reads in clusters (start with low-traffic routes).
3. 4×2 matrix after each cluster. Soak. Contract (retire role-blind resolvers) last.

**C-34 — `verifyBusinessAccess` status/role filter** → log-only (§4) → enforce.

### Phase 2 — data integrity cleanse (ORDERING-SENSITIVE)

**R14 — cleanse 12 mixed-ID tables** *(risk: DATA LOSS — highest)*
1. Manual backup + PITR confirmed.
2. Dry-run script prints every row it would change (§3.2). Review.
3. Transaction-wrapped, idempotent backfill. **Keep old values** in a shadow column.
4. Verify: row-count baseline per tenant unchanged; reconciliation gates green.
5. Soak before any cleanup of shadow data.

**C-32 — remove `auth.uid()::TEXT` RLS mask** *(risk: silently hide/expose rows)*
- ⛔ **HARD ORDERING: only AFTER R14 is verified.** Never before.
- Differential row-count per role before/after. If any role's visible set changes, STOP and revert.

> **Two ordering invariants you must never violate:**
> 1. **R14 (cleanse) before C-32 (mask removal).**
> 2. **Never add a constraint to a still-dirty table.**

---

## One-screen checklist (per change)

```
[ ] Backup taken + PITR confirmed
[ ] Baseline measured (audit script + per-tenant row counts saved)
[ ] Change written as EXPAND (additive, nothing dropped)
[ ] Backfill: dry-run reviewed, idempotent, transactional, keeps old data
[ ] CI green (test/lint/typecheck/build/migration)
[ ] 4×2 role×ID matrix unchanged (if resolver/RLS)
[ ] verify-production-migration.ts exit 0 (if financial/sync)
[ ] Row-count baseline unchanged (or == intended delta)
[ ] Canary one NON-critical tenant → watched → widened
[ ] CONTRACT (drop old) only after soak
```

*No application code was changed in producing this runbook — it is process guidance.*
