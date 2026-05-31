# Audit Pass 2 — Consolidated Net-New Gap Report

**Date:** 2026-05-31
**Branch/commit:** `main` @ `e1b4e7c7` (Phase 70 merged)
**Method:** Static, read-only. No code changed, no DB queried, no network. Four parallel lane audits
(Security / Data-Money / Reliability / Maintainability), each spot-checked against source by the
orchestrator before inclusion.
**Purpose:** Second-pass "did we miss anything before we start" audit. Captures only NET-NEW findings
beyond the first pass (C-01..C-40 / R1..R28), plus how each folds into the existing roadmap.

> **Diagnosis only.** Nothing here changes code or data. Every item is a finding + a proposed
> roadmap placement, for Matt to approve before any implementation begins.

---

## Verification status (orchestrator spot-checks)

The four highest-impact claims were re-read against source and **all confirmed**:

| Finding | Claim | Verified at |
|---|---|---|
| SEC-N1 / MNT-N1 | `Xero/employees` GET is unauthenticated service-role | `Xero/employees/route.ts:108-119` — query `business_id`, `getSupabaseAdmin()`, no `getUser`/`verifyBusinessAccess` |
| SEC-N2 | Section-permission gate is LOG_ONLY by default | `sectionPermissionConfig.ts:18` default `false`; `:51` returns `null`; `:68` 403 only if env set |
| REL-N1 | Xero health check selects a non-existent column, swallows the error to `status:"ok"` | `health-checks.ts:92` selects `token_expires_at`; `:94-95` `if (error) return {status:"ok"}` |
| DM-N1 | Two contradictory FKs on `xero_pl_lines.business_id`; prod convention is `business_profiles.id` | baseline `:9685` →businesses CASCADE; `20260430000002:48-52` →business_profiles RESTRICT (pre-flight comment confirms prod = profiles.id) |

---

## The one finding that changes the existing plan

**DM-N1 corrects R1/R3's canonical-ID assumption.** The first-pass roadmap said "collapse the triple-ID
system onto `businesses.id` as the tenancy root." The schema + Phase-70 prod snapshot prove the **core
money tables are keyed to `business_profiles.id`**, not `businesses.id`:

- `xero_pl_lines`, `xero_bs_lines` → written with `profileId`, FK-enforced to `business_profiles(id)` (RESTRICT).
- `xero_balance_sheet_lines` (the *other* BS table) → written with `bizId`, FK to `businesses(id)` (CASCADE).
- `xero_pl_lines` carries **both** FKs at once (an unresolved schema contradiction).

So canonicalization (R1) is a **schema migration that must pick `business_profiles.id` for the money
tables**, not a resolver swap onto `businesses.id`. Any plan that assumed otherwise would have re-keyed
data the wrong way. This is the single most important output of pass 2.

---

## Net-new findings → roadmap placement

Severity uses the same scale as pass 1. "Fold" = extend an existing R-item; "NEW" = needs its own item.

### CRITICAL — fork-blocking / live exposure

| ID | One-line | Roadmap action |
|---|---|---|
| **SEC-N1 / MNT-N1** | `Xero/employees` GET leaks live payroll PII (names, salaries, emails) to any unauthenticated caller with a `business_id`. | **Fold into R24** — ship the auth-gate fix for `templates` AND `employees` together. R24 scope was too narrow. |
| **SEC-N2** | 8 monthly-report service-role routes (account-mappings, auto-map, commentary, settings, snapshot, wages-detail, subscription-detail, full-year) are cross-tenant IDOR because the only gate is the section layer, which is LOG_ONLY by default. | **NEW R29** — either flip `SECTION_PERMISSION_ENFORCE=true` (fast mitigation) AND/OR add `verifyBusinessAccess` hard-gates to those 8 routes (durable fix, fork-safe). Hard-gate is the real fix; the env flip is a same-day stopgap. |
| **DM-N1** | `xero_pl_lines.business_id` has two contradictory FKs; prod keys money tables to `business_profiles.id`. | **Corrects R1 + R3.** Resolve to ONE FK (`business_profiles(id)` RESTRICT) and re-base R1 on `business_profiles.id` for money tables. Needs a read-only prod check of which FK is actually live. |
| **REL-N1** | Xero health check + daily-health-report query a non-existent column → error swallowed → always reports "ok". The product's #1 incident class (connected-but-not-syncing) has a dark detector. | **NEW R30** — fix column (`expires_at`), make the error path return `warning`/`error` not `ok`, add a column-exists test. Pairs with REL-N2. |

### HIGH

| ID | One-line | Roadmap action |
|---|---|---|
| **SEC-N3** | `monthly-report/debug` dumps a tenant's full P&L with auth-only, no access check, no section gate. | **Fold into R29** (same auth-gate sweep). |
| **SEC-N4** | Split-brain super-admin: 4 high-privilege routes (incl. `admin/reset-password`) gate on `users.system_role` while everything else uses the `system_roles` table. Two drift-prone authz stores. | **NEW R31** — single source of super-admin truth; repoint the 4 routes to `system_roles`. |
| **SEC-N5** | `email/send` lets any authenticated user send WisdomBI-branded "password-reset"/"invitation" email to an arbitrary recipient with attacker-controlled links — a phishing primitive on a trusted sender. | **NEW R32** — restrict recipient/params to the caller's own business or super-admin. |
| **DM-N2 / DM-N3** | Two balance-sheet tables (`xero_balance_sheet_lines` vs `xero_bs_lines`) in opposite id-spaces with opposite delete semantics and no sync between them → report BS and reconciliation BS can silently diverge; one has no RLS. | **Expand R1 + R14 + R19** — pick ONE canonical BS table + id-space as part of canonicalization. |
| **DM-N4** | `unique_active_forecast_per_fy` is defeated by dual-ID pollution — two "active" forecasts for the same real business pass the unique index under different id-spaces. | **Fold into R14** — the dual-ID cleanse must restore this invariant. |
| **DM-N5** | `xero_balance_sheet_lines` BS sync deletes across `ids.all` but re-inserts under a single `bizId` → id-space asymmetry on top of R25's non-atomicity. | **Fold into R25.** |
| **REL-N5** | `refreshTokenWithRetry` returns `success:true` after a failed DB save of a rotated token → next refresh uses the now-invalid old token → healthy tenant deactivated by a transient write blip. | **Fold into R8** (Xero durability) — highest-danger silent disconnect. |
| **REL-N2** | Nightly cron sync never updates `xero_connections.last_synced_at`; once REL-N1 is fixed, the stale-sync detector false-positives on cron-only tenants. | **Fold into R30** (with REL-N1) — derive freshness from `sync_jobs.finished_at`. |
| **MNT-N6** | Brand coupling is ~3x wider than R7 stated: 40+ files / 121 hits (layout metadata, marketing funnels, UI chrome, ICS calendar generator). | **Expand R7** scope. |
| **MNT-N11** | `zod` is installed but imported in 0 files; 107/130 routes parse a body unvalidated. No reference route exists. | **Sharpens R5** — pattern is greenfield, lib already vendored. |

### MEDIUM / LOW (fold or backlog)

| ID | One-line | Roadmap action |
|---|---|---|
| SEC-N6 | `xero_balance_sheet_lines` RLS omits the canonical `auth_get_accessible_business_ids()` bridge → team members blind, dual-ID rows invisible. | Fold into R2. |
| SEC-N7 | CSRF enforced on 5/80 mutating routes (defense-in-depth gap; mitigated by sameSite strict). | NEW R33 (low priority). |
| SEC-N8 | Any coach can PATCH any tenant's Xero connection mapping (intra-coach horizontal IDOR; marked "intentional"). | Decision item — surface to Matt. |
| SEC-N9 | Xero access-token 20-char prefix logged. | Fold into R-hygiene. |
| DM-N6 | Cashflow `getLineValue` treats a genuine $0 actual as "no actual" → substitutes forecast → overstates actualized cash. | Fold into R6. |
| DM-N7 | Xero parsers key accounts by display name → same-named accounts overwrite. | Fold into R6. |
| DM-N8 | FX skipped when `functional_currency` is NULL→AUD default → non-AUD tenant summed 1:1. | Fold into R6. |
| DM-N9 | Reconciliation gates match equity/earnings by name substring + drop unclassified BS rows. | NEW R34 (verifier hardening). |
| DM-N10/N11/N12 | Forecast-delete CASCADE wipes all child money rows; budget/forecast SET-NULL unlink provenance. | Expand R27 (delete-safety) to the forecast-delete path. |
| REL-N3/N4 | Token-refresh path ignores Xero `Retry-After`; lock-contention 2s fixed wait can stampede refresh. | Fold into R8. |
| REL-N6 | `sync-all-xero` 300s budget vs ~52-call/tenant × 27 tenants; mid-run kill loses end-of-run heartbeat (looks like non-invocation). | Fold into R8. |
| REL-N7/N8 | Per-item email failures + 429s produce no Sentry signal / pollute token-health invariant. | NEW R35 (ops signal hygiene). |
| MNT-N2/N3/N4 | KPI concept = 13 tables (~9 dead); 15 abandoned tables; goals = 6 tables. | Expand R15 / R19 (schema rationalization before fork). |
| MNT-N5 | Legal entity + ABN hardcoded in privacy/terms (and the entity name collides with a live tenant "Envisage"). | Expand R7 + legal review. |
| MNT-N7/N8/N9/N10/N12/N13 | Stale CSP grants, sender-domain sprawl, demo default password, `NEXT_PUBLIC_APP_URL` localhost OAuth fallback, no Node pin, payroll-summary script-only write path. | Fork-readiness backlog; fold into R7/R5/R17. |

---

## Phase-70 drift (favorable / neutral)

- **Security:** crons now use the negated-compare form → fail-CLOSED for normal/empty requests even with
  `CRON_SECRET` unset. R4 is **largely mitigated in code**; residual is the literal `Bearer undefined`
  edge on 4 routes (1-line hardening, not a live critical).
- **Data / Reliability / Maintainability:** **zero `src/` or schema drift.** Phase 70 touched only
  `.planning/` docs and one-off `scripts/*.mjs`. Every pass-1 code finding stands exactly as written.
- **Phase-70 snapshot is positive evidence** confirming DM-N1/DM-N2 (prod money tables keyed to
  `business_profiles.id`).
- **One nit:** `forecast/cashflow/settings/route.ts:34` still defaults `super_rate: 0.115` (old SG rate),
  not the locked 0.12. Low-sev stale default for new forecasts.

---

## Proposed new roadmap items (summary)

| New ID | Title | Sev | Folds in |
|---|---|---|---|
| **R24 (expanded)** | Auth-gate `templates` **and** `Xero/employees` | CRITICAL | SEC-N1, MNT-N1 |
| **R29** | Hard-gate the 8 LOG_ONLY monthly-report routes + `debug` (and/or flip ENFORCE) | CRITICAL | SEC-N2, SEC-N3 |
| **R30** | Fix dead Xero health check + freshness source | CRITICAL | REL-N1, REL-N2 |
| **R31** | Single super-admin source of truth | HIGH | SEC-N4 |
| **R32** | Lock down `email/send` recipient authorization | HIGH | SEC-N5 |
| **R33** | Extend CSRF to mutating routes | MED | SEC-N7 |
| **R34** | Reconciliation-gate classification hardening | MED | DM-N9 |
| **R35** | Cron per-item failure → Sentry signal | LOW-MED | REL-N7, REL-N8 |
| **R1/R3 (corrected)** | Canonical money-table id = `business_profiles.id`; resolve `xero_pl_lines` dual-FK | CRITICAL | DM-N1, DM-N2, DM-N3, DM-N4 |

---

## Bottom line

Pass 2 surfaced **two new live, unauthenticated data-exposure holes** (`Xero/employees` payroll PII;
the 8 LOG_ONLY monthly-report routes), **one dark safety detector** (the Xero health check), and **one
roadmap-correcting fact** (money tables are keyed to `business_profiles.id`, not `businesses.id`). None
were in the first-pass plan. Everything else folds cleanly into existing R-items. The orphan-remediation
first fix and the R24 auth-gate work are still the right small first steps — but R24 must now also cover
`Xero/employees`, and R29/R30 join the fork-blocking tier.
