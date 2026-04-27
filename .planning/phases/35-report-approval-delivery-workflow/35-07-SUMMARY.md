---
plan: 35-07
phase: 35-report-approval-delivery-workflow
status: complete
wave: 4
autonomous: false
started: 2026-04-23
completed: 2026-04-27
---

# Plan 35-07 SUMMARY — Edit-revert wiring + ROADMAP update

## Outcome

`revertReportIfApproved()` is wired into all three coach-initiated save paths (commentary, snapshot, settings). Editing an approved/sent report on any of those paths silently reverts the row to `draft`, preserving `snapshot_data` so previously-sent emails keep rendering the version the client received. ROADMAP.md §Phase 35 is now consistent with the as-built scope (Resend direct email + single SaaS sender + token-signed snapshot view + edit-revert).

The pill in the UI now auto-refreshes via window-focus and a 10s poll, so server-side reverts surface in the UI without requiring a manual page refresh.

## Tasks

| Task | Name | Commit | Status |
|---|---|---|---|
| 1 | Wire revertReportIfApproved into 3 save routes + pass `report_month` through call sites | `b7eae1f` | ✓ |
| 2 | ROADMAP.md §Phase 35 rewrite to match as-built scope | `c6175d5` | ✓ |
| 2.5 | UAT-surfaced: revert observability + pill auto-refresh | `079864c` | ✓ (unplanned) |
| 3 | Manual UAT — revert flow end-to-end | — | ⚠️ Wiring verified; UX trigger requires Phase 42 cleanup |

## Files

### Modified (planned, Task 1)
- `src/app/api/monthly-report/commentary/route.ts` — calls revertReportIfApproved after save
- `src/app/api/monthly-report/snapshot/route.ts` — calls revertReportIfApproved after save
- `src/app/api/monthly-report/settings/route.ts` — calls revertReportIfApproved when caller passes `report_month`
- `src/app/finances/monthly-report/components/ReportSettingsPanel.tsx` — accepts + forwards `reportMonth` prop
- `src/app/finances/monthly-report/hooks/usePDFLayout.ts` — accepts + forwards `reportMonth` arg
- `src/app/finances/monthly-report/page.tsx` — threads `selectedMonth` into both call sites

### Modified (planned, Task 2)
- `.planning/ROADMAP.md` — §Phase 35 rewritten

### Modified (unplanned, Task 2.5)
- `src/app/api/monthly-report/commentary/route.ts` — logs revert outcome (business_id, periodMonth, reverted, previous_status)
- `src/app/finances/monthly-report/hooks/useReportStatus.ts` — window-focus refetch + 10s poll

## UAT Results (Task 3)

| # | Check | Result |
|---|---|---|
| Revert wiring (server-side) | Direct call to `revertReportIfApproved` flips `sent → draft`, preserves `snapshot_data` | ✓ Verified via `scripts/test-revert.ts` |
| Commentary save → revert (route logs) | POST /api/monthly-report/commentary writes log line `reverted: true, previous_status: 'sent'` | ✓ Confirmed in server log |
| Pill auto-refresh | useReportStatus polls every 10s; window-focus re-fetches | ✓ Pill flips visibly to `Draft` within 10s of save |
| End-to-end UX flow (full UAT) | Type note → save persists → pill reverts | ⚠️ See "Known UX Gap" below |

## Known UX Gap (handed off to Phase 42)

Coach notes have **two save actions** — a per-note green ✓ button (saves to local React state only) and a page-level **"Save Draft"** button (POSTs to `/api/monthly-report/snapshot` and persists to DB). Phase 35's revert is wired correctly to the snapshot save, but only fires when the page-level button is clicked. The per-note ✓ button does NOT trigger persistence.

This pre-existing two-step save pattern surfaces as "comments aren't saving" until the coach clicks **Save Draft** in the top-right toolbar. The revert wiring is correct; the trigger UX is not.

**Resolution path:** Phase 42 — Monthly Report Save Flow Consolidation. Scope: collapse multiple save buttons to a single auto-save-on-blur path, eliminate the local-state-only intermediate save, surface the pill state as the source of truth.

For Phase 35 sign-off purposes, the revert is verified working end-to-end **at the wire level** (server log + DB state confirm `sent → draft` on every snapshot POST). The visible UX cleanup is deferred to Phase 42 by mutual agreement (see roadmap).

## Verification (automated)

- `npx tsc --noEmit` → exits 0
- Server log confirms `[monthly-report/commentary] revert { reverted: true, previous_status: 'sent' }` after Approve & Send → snapshot save
- `scripts/test-revert.ts` directly calls the helper with same args as the route → row flips, `updated_at` advances
- Helper preserves `snapshot_data` and `snapshot_taken_at` on revert (D-18 satisfied)

## Verification (manual)

- Open `/reports/view/[token]` for a previously-sent report after revert → snapshot still renders (D-18)
- Pill polls and reflects DB status within 10s without manual refresh

## Commits

- `b7eae1f` — feat(35-07): wire revertReportIfApproved into save routes (D-16)
- `c6175d5` — docs(35-07): rewrite Phase 35 roadmap entry to match actual implementation
- `079864c` — chore(35-07): observability + pill auto-refresh

## Forward to Phase 42

The next phase will:
1. Collapse the per-note ✓ button + "Save Draft" button into a single auto-save-on-blur
2. Treat `cfo_report_status` as the source of truth for "is this draft / approved / sent"
3. Remove or repurpose the standalone "Finalise" button (currently does the same thing as Save Draft with `status='final'`)
4. Test that Phase 35's revert wiring naturally fires on every coach edit without UX choreography
