---
phase: 21-kpi-dashboards
plan: 03
subsystem: ui
tags: [xero, sync, dashboard, weekly-review, navigation]

# Dependency graph
requires:
  - phase: 21-kpi-dashboards
    plan: 01
    provides: useXeroActuals hook, FinancialSummaryCharts component, business dashboard page
affects:
  - src/app/business-dashboard/hooks/useXeroActuals.ts (refreshTrigger param added)
  - src/app/business-dashboard/components/FinancialSummaryCharts.tsx (refreshTrigger prop added)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "XeroSyncButton: manual POST trigger pattern with isSyncing + lastResult state machine"
    - "refreshKey counter incremented by onSyncComplete — propagates down to useXeroActuals via refreshTrigger"
    - "Additive hook signature extension: refreshTrigger optional param, default undefined (falsy = no change to existing callers)"

key-files:
  created:
    - src/app/business-dashboard/components/XeroSyncButton.tsx
  modified:
    - src/app/business-dashboard/hooks/useXeroActuals.ts
    - src/app/business-dashboard/components/FinancialSummaryCharts.tsx
    - src/app/business-dashboard/page.tsx
    - src/app/reviews/weekly/page.tsx

key-decisions:
  - "XeroSyncButton exported as named export (consistent with FinancialSummaryCharts pattern)"
  - "refreshTrigger added as optional param to useXeroActuals — zero breaking change to existing callers"
  - "FinancialSummaryCharts passes refreshTrigger through to useXeroActuals — chart component owns the fetch"
  - "KPI Dashboard link placed above 'Mark as Complete' button — natural next-step after completing review"
  - "BarChart2 icon used for KPI link (TrendingUp already used in business-dashboard page header)"

requirements-completed: [KPI-03]

# Metrics
duration: 8min
completed: 2026-04-08
---

# Phase 21 Plan 03: KPI Dashboards — Xero Sync Button + Weekly Review Link Summary

**Manual Xero sync button added to business dashboard header with loading/success state, and a 'View KPI Dashboard' link card added to weekly review page as a natural post-review next step**

## Performance

- **Duration:** 8 min
- **Started:** 2026-04-08T04:23:00Z
- **Completed:** 2026-04-08T04:31:09Z
- **Tasks:** 1
- **Files modified:** 5

## Accomplishments

- New `XeroSyncButton` component: POST to `/api/Xero/sync`, loading spinner, success checkmark (3s flash), sonner toast notifications, disabled state during sync
- `useXeroActuals` hook extended with optional `refreshTrigger?: number` param — included in useEffect deps so incrementing it forces a refetch
- `FinancialSummaryCharts` updated to accept and forward `refreshTrigger` prop
- Business dashboard page wires a `refreshKey` counter through `onSyncComplete` callback — sync button increment triggers chart re-fetch automatically
- `XeroSyncButton` rendered in page header before Lock/Unlock button, guarded by `businessId` existence check
- Weekly review page gets a gradient link card below the Plan Forward section, pointing to `/business-dashboard` with `BarChart2` icon and `ArrowRight` chevron

## Task Commits

1. **Task 1: XeroSyncButton + weekly review KPI link + page integration** - `badc4ef` (feat)

## Files Created/Modified

- `src/app/business-dashboard/components/XeroSyncButton.tsx` — New: manual Xero sync button with isSyncing/lastResult state, sonner toasts
- `src/app/business-dashboard/hooks/useXeroActuals.ts` — Modified: `refreshTrigger?: number` param added to signature and useEffect deps
- `src/app/business-dashboard/components/FinancialSummaryCharts.tsx` — Modified: `refreshTrigger?: number` prop forwarded to useXeroActuals
- `src/app/business-dashboard/page.tsx` — Modified: `useState` + `XeroSyncButton` import, `refreshKey` state wired to header and charts
- `src/app/reviews/weekly/page.tsx` — Modified: `BarChart2` icon import added, KPI dashboard link card inserted above Mark as Complete

## Decisions Made

- `refreshTrigger` as an optional number (default `undefined`) — zero breaking change, existing `FinancialSummaryCharts` callers outside business-dashboard page are unaffected
- `XeroSyncButton` renders sync icon, but no `lastSyncedAt` display in the button — that info is shown in the chart card below (from `useXeroActuals`)
- Weekly review link placed before "Mark as Complete" so it's visible at the natural end of the review workflow regardless of completion state

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all data flows are wired. XeroSyncButton posts to live `/api/Xero/sync` endpoint. Chart refresh uses live `useXeroActuals` hook.

## Self-Check: PASSED

- `src/app/business-dashboard/components/XeroSyncButton.tsx` — FOUND
- Commit `badc4ef` — FOUND
- `grep "Xero/sync" XeroSyncButton.tsx` — PASS
- `grep "XeroSyncButton" page.tsx` — PASS
- `grep "business-dashboard" weekly/page.tsx` — PASS
- Build: 0 errors, all pages compiled

---
*Phase: 21-kpi-dashboards*
*Completed: 2026-04-08*
