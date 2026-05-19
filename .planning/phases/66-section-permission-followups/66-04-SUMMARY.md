---
phase: 66-section-permission-followups
plan: "04"
subsystem: permissions
tags: [section-permissions, admin, cron, coach, audit, decision-document]
dependency_graph:
  requires: [65-02-SUMMARY]
  provides: [66-OPS-ADMIN-SECTION-PERMISSION-AUDIT.md]
  affects: [Phase 65 Wave 65-04 readiness]
tech_stack:
  added: []
  patterns: [decision-document-only, read-only-audit]
key_files:
  created:
    - .planning/phases/66-section-permission-followups/66-OPS-ADMIN-SECTION-PERMISSION-AUDIT.md
  modified: []
decisions:
  - "D-07 confirmed: no admin/cron/coach ops route needs the finances section-permission gate"
  - "Phase 65 ops-routes-out-of-scope stance is verified correct — no follow-up plan required for item 4"
metrics:
  duration: ~15min
  completed: 2026-05-17
  tasks_completed: 2
  tasks_total: 2
  files_created: 1
  files_modified: 0
---

# Phase 66 Plan 04: Ops/Admin Section-Permission Audit Summary

**One-liner:** Decision document confirming all 16 admin/cron/coach ops routes need no `finances` section-permission gate — none surface P&L amounts to potentially-restricted callers.

---

## What Was Done

Produced the decision document `.planning/phases/66-section-permission-followups/66-OPS-ADMIN-SECTION-PERMISSION-AUDIT.md` required by D-07.

**Task 1:** Read the four routes left as "Unknown — needs check" in research section D, recorded findings for each.

**Task 2:** Completed the full per-route decision document covering all 16 admin/cron/coach routes, with a recommendation (`no gate needed` / `gate recommended` / `flag-for-followup`) and rationale for every row.

No route code was changed. `git status --porcelain src/app/api/` is empty.

---

## Resolved Unknowns

### `coach/clients/[id]/route.ts`
- **Surfaces $ data:** NO. Returns business metadata (name, status, program_type, enabled_modules) + session/action/message counts. No P&L or forecast amounts.
- **Client:** Auth-bound only (`createRouteHandlerClient()`). Requires coach or super_admin role.
- **Recommendation:** no gate needed.

### `cron/weekly-digest/route.ts`
- **Surfaces $ data:** NO. Reads session schedules, pending/overdue action counts, login recency, message counts. Sends coach email digest. No P&L, forecast, or Xero monetary values anywhere.
- **Client:** Service-role (required for cross-coach data access). CRON_SECRET protected — no member can call it.
- **Recommendation:** no gate needed.

### `admin/demo-client/route.ts`
- **Surfaces $ data:** Indirect — seeds fictitious demo `forecast_pl_lines` amounts. Response returns only creation metadata, not financial figures. Super-admin-only role enforced.
- **Client:** Service-role (required for auth user creation and cross-table inserts). Requires super_admin.
- **Recommendation:** no gate needed.

### `admin/activity/route.ts`
- **Surfaces $ data:** NO. Returns per-business operational activity feed: last_login timestamps, audit log action types, weekly review status, profile completion flags. No P&L amounts or financial figures anywhere in the response.
- **Client:** Service-role (required for unrestricted cross-business reads on super-admin dashboard). Requires super_admin.
- **Recommendation:** no gate needed.

---

## Decision

**All 16 admin/cron/coach routes carry the recommendation: `no gate needed`.**

The Phase 65 decision to scope `requireSectionPermission` to user-facing finance routes only is confirmed correct. No follow-up plan is required for Phase 66 item 4.

Two structural reasons hold uniformly across all routes:
1. **Admin and cron routes are inaccessible to restricted members** — admin routes require `super_admin` (unconditionally allowed by the helper's allow-list), cron routes require `CRON_SECRET`.
2. **No route returns actual financial $ figures** — even routes that touch `financial_forecasts` or Xero tables do so for existence checks, seeding, or sync triggering, not for reading P&L amounts back to callers.

---

## Deviations from Plan

None — plan executed exactly as written. This plan was document-only by design (D-07); no route code was changed.

---

## Known Stubs

None. This plan produces only a decision document — there are no UI components or data wiring to stub.

---

## Self-Check: PASSED

File exists:
- FOUND: `.planning/phases/66-section-permission-followups/66-OPS-ADMIN-SECTION-PERMISSION-AUDIT.md`

Commit exists:
- FOUND: `fc94196d` — docs(66-04): ops/admin section-permission decision audit (D-07)

Route code unchanged:
- `git status --porcelain src/app/api/` — empty (confirmed)
