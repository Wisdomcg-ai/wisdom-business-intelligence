# Live-User Impact & Safe-Rollout Assessment

**Generated:** 2026-05-31
**Audience:** Matt (go/no-go decisions) — you have live active users RIGHT NOW (coaches, clients, team members, super-admins across ~27 business tenants with real Xero financial data).
**Hard requirement:** nothing should break or degrade for live users.
**Status:** Diagnosis/planning only. No code changed. Nothing here is applied.

This document answers: *for each fix, what could a live user see or lose, and how do we ship it without anyone noticing?*

---

## The one-minute version

**Most fixes are invisible to users and safe to ship anytime.** The danger is concentrated in a small set:

- **🔴 Ship FIRST, but carefully (it's a live hole AND a user-facing surface):** R24 — lock down the unauthenticated `monthly-report/templates` route (C-36). Pure auth-add, zero-downtime, but test that legitimate template editing still works for coaches.
- **🔴 The single most dangerous sequencing rule in the whole program:** never remove the `auth.uid()::TEXT` RLS mask (C-32) **before** the data cleanse (R14). Get this wrong and live users' rows visibly "disappear."
- **🟠 Never add a constraint to a dirty table:** do not add any FK/NOT NULL to the 12 MIXED tables until R14 re-keys them. The migration will either fail or lock the table.
- **🟠 One mandatory pre-flight query before R16:** tightening the membership check to `status='active'` could lock out a live team member if any active user has an unexpected status string. Must check prod data first.
- **🟡 Two fixes change numbers users see** (R6 cashflow reclassification, R13 widget stubs) — not dangerous, but coordinate timing/messaging so a coach isn't surprised.

Everything else: zero-downtime code deploys with no user impact.

---

## Pre-flight data checks to run against prod (READ-ONLY) BEFORE the risky fixes

Run these first; they're all read-only and decide go/no-go on the constrained items:

| Before… | Run this check | Go condition |
|---|---|---|
| R3 (FK on xero_connections) | `xero_connections.business_id NOT IN (SELECT id FROM businesses)` | returns 0 rows |
| R16/C-34 (membership status) | `SELECT DISTINCT status FROM business_users` + count non-`'active'` rows tied to people actively using the app | no active user has a non-`'active'`/non-standard status |
| R14 (data cleanse) | re-run `scripts/audit-dual-id-full.mjs` to snapshot current MIXED/orphan counts | snapshot taken + full DB backup confirmed |
| R2/C-32 (mask removal) | confirm R14 completed and orphan/user-ID rows re-keyed | R14 verified done |
| R24/C-36 (templates auth) | confirm which roles legitimately edit templates (coach? super-admin?) so the new check doesn't block them | access matrix confirmed |
| C-39 (delete cascade) | verify manual-delete table names (`kpis`, `messages`, `annual_goals`) exist in live schema | confirm real vs legacy tables |

---

## Per-item impact table

Legend — **Migration:** none / additive (safe) / constrained (can fail/lock) / destructive. **Risk:** Low/Med/High to live users.

| Item | Migration | User-visible change (role) | Risk | Safe rollout |
|---|---|---|---|---|
| **R24 · Auth-guard templates route (C-36)** | none | none if coaches/admins still pass; **functional** if check is too tight | Med | Add `getUser`+`verifyBusinessAccess` to all 4 verbs; confirm template editors' roles first; zero-downtime deploy. **Ship first.** |
| **R25 · Atomic BS sync (C-37)** | none | none (fixes a silent failure) | Low | Make insert-before-delete or transactional; return `success:false` on insert error. Pure correctness win. |
| R1 · Canonical id / one resolver | none (rows change only in R14) | functional, all roles, if regressed → wrong/blank tenant data | **High** | 4×2 characterization tests first; dark-launch/flag; low-traffic deploy; revert-ready. No DB rows touched here. |
| R2 · RLS fix + C-32 mask removal | SQL policy change | none for clean rows; orphan rows vanish if ordered wrong | **High (ordering)** | Policy-standardization is safe anytime; **mask removal gated on R14 done**. |
| R3 · FK on xero_connections | additive (can fail if orphans) | none | Med | Pre-flight orphan check → `ADD … NOT VALID` → `VALIDATE` off-peak. |
| R4 · Cron fail-closed auth | none | none | Low | 4-line defense-in-depth deploy. Prod likely already safe (CRON_SECRET set). |
| R5 · Zod validation | none | none (valid traffic unchanged) | Low | Incremental, money-write routes first. |
| R6 · Cashflow reclassification + currency | none | **functional, client+coach** — cashflow numbers change | Med | Notify coaches; no migration; classify by `xero_type`. Coordinate timing. |
| R7 · Brand/URL decouple | none | none (WisdomBI values become env defaults) | Low | Anytime. |
| R8 · Xero refresh parallelization | none | none (background) | Med | Keep sequential path behind flag; `Promise.allSettled` + concurrency cap; monitor `is_active` 24h. |
| R9 · Report-token expiry | additive (nullable col) | none (null = still valid) | Low | Expand-migrate-contract; existing links stay valid. |
| R10 · Raw-client cache fix | none | possibly fresher data | Low | Anytime; watch for pre-existing data issues surfacing. |
| R11 · Redis rate limiter | none | none | Low | Fallback to in-memory if Redis down. |
| R12 · Drop schema probe | none | none (latency win) | Low | Anytime. |
| R13 · Widget stubs (YTD, snapshot) | none | **functional, client+coach** — 0% becomes real numbers | Low | Review real YTD with Matt before clients see it. |
| R14 · Cleanse 12 MIXED tables | **destructive backfill** | functional, all roles; masked rows move; orphans may blink during window | **High** | Backup; transaction + rollback test; R1/R2/R3 live first; role-aware re-key; quarantine (don't delete); maintenance window. |
| R15 · Drop backup/legacy tables | destructive | none (unused) | Low | Archive-export; verify zero FK refs; off-peak. |
| R16 · One role+status-aware verifyBusinessAccess (C-12+C-34) | none | **functional, team members** — deactivated members lose access (correct); active members on KPIs gain access | Med | **Mandatory pre-flight status query**; then zero-downtime. |
| R17 · Validate Xero cred env | none | none | Low | Anytime. |
| R18 · Unify encryption key env | none | none in prod (if key set) | Low | Verify Vercel env before removing fallback. |
| R19 · Resolve duplicate forecasts tables | possibly destructive | functional (forecast users) | Med | Full row/route inventory before any DROP. |
| R20 · Fix `api/Xero/` casing | none (rename) | none; routing break risk on Linux | Low | Stage on Vercel (case-sensitive) before prod. |
| R21 · Remove vestigial RLS branches | SQL policy change | same dependency as R2/C-32 | **High (ordering)** | Gate on R14 done. |
| R22 · Delete dead files | none | none | Low | Grep for imports; anytime. |
| R23 · Coach single-column → join table (fork decision) | destructive if changed | functional, coach role | High if changed | Only if join-table chosen → Tier-0 scope w/ R1, maintenance window. |
| R26 · Forecast-ownership check on scenarios POST (C-38) | none | none (blocks cross-tenant write) | Low | Add access check mirroring GET; anytime. |
| R27 · Soft-delete clients + backup-before-cascade (C-39) | additive (`deleted_at`) | none (super-admin op safer) | Low | Add soft-delete + export; audit manual-delete table names. |
| R28 · Guard KPI div-by-zero (C-40) | none | cosmetic (better warning) | Low | Anytime. |

---

## Go/No-Go buckets

**✅ Safe to ship anytime — zero user impact, no migration:**
R4, R5, R7, R10, R11, R12, R17, R22, R25, R26, R28. (Plus R24 — ship *first*, just confirm template-editor roles.)

**🔍 Ship with a prod pre-flight data check (no migration, verify first):**
R16 (mandatory `business_users.status` query — lockout risk), R18 (confirm env var set), R20 (stage on Linux).

**📣 Coordinate timing/messaging (numbers users see change):**
R6 (cashflow reclassification), R13 (widget real numbers), R8 (Xero refresh — monitor connections 24h).

**🛠 Maintenance window + pre-flight + staged (migration with lockout/data-loss risk):**
R3 (FK orphan check), R14 (the 12-table cleanse — most dangerous), R2/R21 (mask removal — HARD gate on R14), R15 (drop tables), R19 (forecasts consolidation), R27's hard-delete path, R23 if join-table chosen.

---

## The three rules that protect live users

1. **Order before the mask.** R14 (cleanse) → verify → *then* C-32/R21 (remove the `auth.uid()::TEXT` mask). Reverse this and rows vanish from the users who created them.
2. **Never constrain a dirty table.** No FK/NOT NULL/unique on any of the 12 MIXED tables until R14 re-keys them. `xero_connections` is the one exception — audit-proven 100% clean, so R3's FK is safe after the orphan pre-flight.
3. **Test the 4×2 matrix before any resolver/RLS/access change.** Owner, team member (active only), coach (assigned only), super-admin × `businesses.id` and `business_profiles.id` inputs. A resolver regression is a silent 200-with-wrong-numbers, not a loud 500 — only the test matrix catches it.
