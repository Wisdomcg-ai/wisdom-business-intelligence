---
phase: 66-section-permission-followups
plan: "03"
subsystem: api-auth
tags: [section-permissions, service-role, audit, report-only]
dependency_graph:
  requires: []
  provides: [service-role-disposition-inventory]
  affects: [future-service-role-conversion-phase]
tech_stack:
  added: []
  patterns: [keep/convert/carve disposition classification for service-role data-fetching clients]
key_files:
  created:
    - .planning/phases/66-section-permission-followups/66-SERVICE-ROLE-AUDIT.md
  modified: []
decisions:
  - "11 of 21 service-role routes classified as keep — all are cross-tenant aggregation (Dragon/IICT), Xero connection/token reads, or RLS-bypassed writes; converting any would break live tenants"
  - "10 of 21 service-role routes classified as convert — all are own-business reads where auth-bound + RLS would be equivalent; xero_pl_lines RLS dual-ID alignment is the key pre-conversion check"
  - "0 carve candidates — no route mixes user-facing and ops concerns in a way that warrants endpoint splitting"
  - "sync-xero, templates, debug acknowledged as out-of-band known service-role users outside Phase 65-02 scope"
  - "Keep decisions are final unless cross-tenant RLS policies change materially"
metrics:
  duration_minutes: 8
  completed_date: "2026-05-17"
  tasks_completed: 1
  files_changed: 1
---

# Phase 66 Plan 03: Service-Role Disposition Audit Summary

**One-liner:** Per-route service-role disposition document for all 32 Phase 65-02 finance routes — 11 `keep` (cross-tenant/writes), 10 `convert` (own-business reads), 0 `carve`, with conversion risk ratings and a prioritized conversion roadmap for the future phase.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Author the service-role disposition document | 96debb6a | .planning/phases/66-section-permission-followups/66-SERVICE-ROLE-AUDIT.md |

## What Was Built

### 66-SERVICE-ROLE-AUDIT.md

A single markdown disposition document covering all 32 Phase 65-02 finance routes, structured as:

1. **Purpose statement** — scope of document, deferred-conversions rationale (D-05)
2. **Policy recap** — quotes revised service-role bypass policy from 65-CONTEXT.md; establishes `Xero/reconciliation` as the canonical `keep` exemplar (auth-bound gate + service-role data coexistence)
3. **Disposition legend** — defines `keep`, `convert`, `carve`
4. **Section A** — 11 fully auth-bound routes, no action required
5. **Section B** — 21 service-role routes with full per-route table: disposition, rationale, conversion risk (LOW/MED/HIGH)
6. **Section C** — Out-of-band known routes (`sync-xero`, `templates`, `debug`) acknowledged but out of scope
7. **Recommendation** — prioritized conversion order, per-route checklist for the executing phase

### Disposition breakdown

**`keep` (11 routes):** The three consolidated routes (`consolidated`, `consolidated-bs`, `consolidated-cashflow`) serve Dragon (2 entities) and IICT (3 entities) — cross-tenant aggregation cannot be done with an auth-bound client that hits per-tenant RLS on sibling rows. `Xero/reconciliation` is the canonical write pattern. The five Xero-connection-reading routes (`bank-balances`, `capex`, `sync-balances`, `xero-actuals`, `balance-sheet`, `subscription-transactions`) read `xero_connections` across entities. `snapshot` performs writes.

**`convert` (10 routes):** The ten remaining routes (`profiles`, `forecast/cashflow/settings`, `monthly-report/settings`, `commentary`, `subscription-detail`, `wages-detail`, `full-year`, `account-mappings`, `auto-map`, `generate`) all read only the authenticated user's own business data. Auth-bound + RLS would be equivalent. The key pre-conversion check for the generate/full-year/account-mappings group is confirming `xero_pl_lines` RLS SELECT policies align with the dual-ID system (`business_profiles.id` scoping).

**`carve` (0):** No routes identified as mixing user-facing and ops concerns.

## Deviations from Plan

None — plan executed exactly as written. Document authored per task specification; no route code changes made.

## Known Stubs

None — this is a report-only plan. The document is complete and actionable.

## Self-Check: PASSED

- [x] `.planning/phases/66-section-permission-followups/66-SERVICE-ROLE-AUDIT.md` exists
- [x] `grep -c "keep|convert|carve"` returns 34 (well above the 21 minimum)
- [x] `grep -q "Xero/reconciliation"` succeeds
- [x] `grep -q "sync-xero|templates|debug"` succeeds
- [x] `git status --porcelain src/app/api/` is empty — REPORT ONLY confirmed
- [x] Commit 96debb6a exists
