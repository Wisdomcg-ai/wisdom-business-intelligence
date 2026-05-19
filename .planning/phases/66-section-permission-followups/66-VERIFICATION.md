---
phase: 66-section-permission-followups
verified: 2026-05-17T00:00:00Z
status: passed
score: 4/4 must-haves verified
re_verification: false
gaps: []
human_verification: []
---

# Phase 66: Section-Permission Follow-ups Verification Report

**Phase Goal:** Close the four follow-up items surfaced by Phase 65 so the SECTION_PERMISSION_ENFORCE cutover is safe: (1) audit/migrate business_users rows carrying only the legacy financials JSONB key; (2) normalize business-ID resolution across the consolidated routes; (3) per-route disposition of service-role data-fetching clients left in the 32 finance routes; (4) decide whether ops/admin service-role routes that surface $ data should also run the section-permission check.
**Verified:** 2026-05-17
**Status:** PASSED
**Re-verification:** No — initial verification
**Deployed:** Yes — PR #198, squash commit 0cd6bcd2, on main

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Legacy-key migration exists, is idempotent, transaction-wrapped, covers both tables, and (per authorized deviation) also fixes column DEFAULTs | VERIFIED | `20260516000000_phase66_backfill_finances_section_key.sql` — 2 UPDATE statements guarded by `WHERE NOT (section_permissions ? 'finances')`, wrapped in `BEGIN/COMMIT`, using `||` merge operator; `ALTER COLUMN SET DEFAULT` authorized per 66-01-DEVIATION.md; production audit confirmed 0 rows affected post-deploy |
| 2 | Audit script exists and reports rows missing the canonical `finances` key | VERIFIED | `scripts/audit-section-permissions-legacy-key.ts` — queries both `business_users` and `team_invites`, filters in TypeScript for `'finances' in sp`, exit codes 0/1/2, confirmed no writes |
| 3 | All three consolidated routes call `resolveBusinessIds` and use `ids.bizId` in the access check, section-permission gate, business_profiles lookup, and engine call | VERIFIED | All three routes import and call `resolveBusinessIds(supabase, business_id)`; `requireSectionPermission` receives `ids.bizId` as third argument (confirmed at line 118 in consolidated, line 115 in consolidated-bs, line 107 in consolidated-cashflow); regression test `business-id-resolution.test.ts` exists and pins this behaviour |
| 4 | Service-role disposition document covers all 32 Phase 65-02 finance routes with keep/convert/carve per route — REPORT ONLY, no code changed | VERIFIED | `66-SERVICE-ROLE-AUDIT.md` — 34 occurrences of keep/convert/carve (exceeds the 21-route minimum), covers 11 auth-bound + 21 service-role routes, Xero/reconciliation canonical pattern referenced, out-of-band routes (sync-xero, templates, debug) acknowledged; commits 96debb6a confirms only the planning doc was touched |
| 4b | Ops/admin decision document covers all 16 admin/cron/coach routes, every route receives a recommendation, explicit conclusion reached | VERIFIED | `66-OPS-ADMIN-SECTION-PERMISSION-AUDIT.md` — 16 routes enumerated, all carry `no gate needed`, four previously-unknown routes resolved, explicit conclusion: "No follow-up plan is required for item 4"; commit fc94196d confirms only the planning doc was touched |

**Score:** 4/4 truths verified (item 4 spans two related deliverables, both confirmed)

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `scripts/audit-section-permissions-legacy-key.ts` | Operator-run prod audit of legacy-key drift in business_users + team_invites | VERIFIED | Exists; contains `finances` key checks (23 occurrences), `team_invites` query, `process.exit` codes 0/1/2, `createClient` service-role connection; no write operations |
| `supabase/migrations/20260516000000_phase66_backfill_finances_section_key.sql` | Idempotent transaction-wrapped backfill of the finances key | VERIFIED | Exists; 5 occurrences of `WHERE NOT (section_permissions ? 'finances')` (2 on UPDATE guards + 3 in comments), 2 `UPDATE public` statements, `BEGIN;`/`COMMIT;` present, `||` merge operator used; `ALTER COLUMN SET DEFAULT` present per authorized deviation in 66-01-DEVIATION.md |
| `src/app/api/monthly-report/consolidated/route.ts` | Consolidated P&L route with resolveBusinessIds normalization | VERIFIED | Import confirmed; `ids.bizId` used in access check, `requireSectionPermission` (line 118), and engine call |
| `src/app/api/monthly-report/consolidated-bs/route.ts` | Consolidated balance-sheet route with resolveBusinessIds normalization | VERIFIED | Import confirmed; `ids.bizId` used in `requireSectionPermission` (line 115) and engine call |
| `src/app/api/monthly-report/consolidated-cashflow/route.ts` | Consolidated cashflow route with resolveBusinessIds normalization | VERIFIED | Import confirmed; `ids.bizId` used in `requireSectionPermission` (line 107) and engine call |
| `src/app/api/monthly-report/consolidated/__tests__/business-id-resolution.test.ts` | Regression test pinning ids.bizId usage in access check + section gate | VERIFIED | Exists; contains `resolveBusinessIds` and `bizId` assertions; two tests (business_profiles.id input, businesses.id input) |
| `.planning/phases/66-section-permission-followups/66-SERVICE-ROLE-AUDIT.md` | Per-route service-role disposition document for the 32 finance routes | VERIFIED | Exists; 34 keep/convert/carve occurrences; 11 auth-bound routes in Section A; 21 service-role routes in Section B; Section C acknowledges out-of-band routes |
| `.planning/phases/66-section-permission-followups/66-OPS-ADMIN-SECTION-PERMISSION-AUDIT.md` | Per-route section-permission recommendation for ops/admin/cron routes | VERIFIED | Exists; 16 routes enumerated; all `no gate needed`; conclusion explicit; no route code changed |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| Audit script | `business_users.section_permissions` | TypeScript filter `'finances' in sp` | WIRED | Pattern confirmed in file (23 hits for "finances") |
| Migration UPDATE | `business_users.section_permissions` | `section_permissions \|\| jsonb_build_object(...)` | WIRED | `||` operator confirmed at line 66 and 79 of migration |
| Migration UPDATE | `team_invites.section_permissions` | `WHERE NOT (section_permissions ? 'finances')` | WIRED | Both UPDATE statements guarded; confirmed 5 total guard occurrences |
| `consolidated/route.ts` | `resolveBusinessIds` | `resolveBusinessIds(supabase, business_id)` | WIRED | Import present; call confirmed using service-role `supabase` client |
| `requireSectionPermission` call | `ids.bizId` | Third argument to gate | WIRED | Confirmed at line 118 (consolidated), 115 (bs), 107 (cashflow) |
| `66-SERVICE-ROLE-AUDIT.md` | 32 Phase 65-02 finance routes | Per-route disposition table | WIRED | 21 service-role routes classified; 11 auth-bound listed; counts match plan spec |
| `66-OPS-ADMIN-SECTION-PERMISSION-AUDIT.md` | Admin/cron/coach routes | Per-route recommendation table | WIRED | 16 routes enumerated with recommendations and rationale |

---

### Data-Flow Trace (Level 4)

Not applicable to this phase. Phase 66 produces: a read-only operator script (no rendering pipeline), a SQL migration (no data rendering), three updated API routes (unchanged data-fetching logic — only the business-ID parameter passed to existing queries changed), and two planning documents. No new dynamic data rendering introduced.

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Audit script has no write operations | `grep -v "\.update\|\.insert\|\.delete" scripts/audit-section-permissions-legacy-key.ts` | No write calls found | PASS |
| Migration idempotency guard on both UPDATEs | `grep -c "WHERE NOT (section_permissions ? 'finances')" migration.sql` | 5 (2 on UPDATE lines + 3 in comments) | PASS |
| Migration uses merge operator, not bare assignment | `grep "section_permissions \|\|" migration.sql` | Both UPDATEs use `||` operator | PASS |
| All 3 consolidated routes use `ids.bizId` in section gate | grep on each route file | `ids.bizId` confirmed as third argument in all three | PASS |
| Items 3 and 4 are report-only (no route code changes) | `git log --name-only 96debb6a` and `fc94196d` | Each commit touched only its planning document | PASS |
| PR #198 squash commit is on main | `git log --oneline` | `0cd6bcd2` confirmed at commit position 3 on main | PASS |
| Production migration confirmed applied | Operator re-ran audit post-deploy (per verification context) | 0 affected rows (down from 23) | PASS — human-confirmed |

---

### Requirements Coverage

No formal requirement IDs mapped to Phase 66. The four-item goal from ROADMAP.md is verified directly:

| Item | Goal Component | Status | Evidence |
|------|---------------|--------|----------|
| 1 | Audit/migrate business_users rows carrying only the legacy financials JSONB key | SATISFIED | Audit script + migration both exist; migration applied to production; 0 rows remain affected |
| 2 | Normalize business-ID resolution across the consolidated routes | SATISFIED | All 3 consolidated routes use `resolveBusinessIds` + `ids.bizId`; regression test pins this |
| 3 | Per-route disposition of service-role data-fetching clients in 32 finance routes | SATISFIED | `66-SERVICE-ROLE-AUDIT.md` delivers complete disposition; no route code changed (confirmed via git) |
| 4 | Decide whether ops/admin service-role routes surfacing $ data should also run the section-permission check | SATISFIED | `66-OPS-ADMIN-SECTION-PERMISSION-AUDIT.md` delivers per-route decisions; conclusion: no gate needed for any ops/admin route; no follow-up phase required |

---

### Authorized Deviation

**66-01-DEVIATION.md** records an operator-authorized scope expansion: the migration also runs `ALTER COLUMN section_permissions SET DEFAULT` on both `business_users` and `team_invites`, replacing the legacy `financials` key in the column defaults with the canonical `finances` key. This supersedes the 66-01-PLAN Task 2 acceptance criterion that expected no DDL. The deviation is recorded, authorized by Matt (operator), and applied to production. The `||` merge operator and `WHERE NOT` idempotency guard on the data backfill portion are unaffected.

The deviation also reclassified 66-01's urgency: the production audit showed all 23 affected rows were owner/active or admin/active — roles that bypass `requireSectionPermission` unconditionally — so the legacy-key gap created no live ENFORCE-cutover security exposure. Phase 65 Wave 65-04 is unblocked independently of this migration.

---

### Anti-Patterns Found

None. The three route files use `ids.bizId` consistently (not the raw `business_id`). The migration uses the `||` merge operator with no bare JSONB assignment. The audit script makes no write calls. The two report documents contain no code stubs.

---

### Human Verification Required

None. All critical acceptance criteria are machine-verifiable. The one human element — the production audit confirming 0 rows affected post-deploy — is already completed and recorded in the verification context.

---

### Gaps Summary

No gaps. All four goal items are delivered and verified against the codebase:

- Item 1: Both artifacts exist and pass all structural checks. Migration is in the codebase and confirmed applied to production.
- Item 2: All three consolidated routes are wired. The regression test exists.
- Item 3: The service-role disposition document exists with 34 keep/convert/carve classifications across 32 routes. No route code was modified (confirmed via git commit content).
- Item 4: The ops/admin decision document exists covering 16 routes. Explicit conclusion recorded. No route code modified.

Phase 66 goal is achieved. The SECTION_PERMISSION_ENFORCE cutover (Phase 65 Wave 65-04) is safe to proceed.

---

_Verified: 2026-05-17_
_Verifier: Claude (gsd-verifier)_
