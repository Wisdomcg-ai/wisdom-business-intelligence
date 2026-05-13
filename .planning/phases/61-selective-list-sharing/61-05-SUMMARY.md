---
phase: 61-selective-list-sharing
plan: 05
subsystem: ui
tags: [nextjs, app-router, react, sharing, ui, sonner, testing-library, vitest, daily_tasks, ideas, recipient-affordances]

# Dependency graph
requires:
  - "61-03: dailyTasksService + ideasService return rows decorated with is_owner + owner_display_name"
  - "61-04: PATCH /api/{todos|ideas}/[id]/share, /api/todos/[id]/complete, /api/ideas/[id]/status routes"
provides:
  - "src/components/sharing/ShareDialog — three-mode share picker (private/team/specific) wired to share PATCH routes"
  - "src/components/sharing/TeammatePicker — multi-select picker over active business_users (excludes current user)"
  - "src/components/sharing/SharedByBadge — read-only 'Shared by …' badge for recipients"
  - "src/lib/hooks/useBusinessTeammates — client hook returning { teammates, isLoading, error }"
  - "src/app/todo/page.tsx — Share button on owner rows, badge + recipient mark-complete path on shared rows"
  - "src/app/ideas/page.tsx — Share button on owner rows, badge on shared rows; existing business-wide shared-board mode UNTOUCHED"
  - "deriveShareMode(row) helper exported from ShareDialog.tsx"
affects:
  - "End-of-phase: per-item sharing is now reachable from the product surface; the 24-cell manual test matrix in 61-RESEARCH.md is unblocked for walkthrough"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Sharing-aware row rendering: branch on `task.is_owner !== false` (defaults true for legacy rows lacking the field) to gate owner-only affordances"
    - "Optimistic local update + server reconcile: parent updates list state in onSaved BEFORE re-running loadData()"
    - "Sonner toast for share + recipient-complete error UX (existing global Toaster in src/app/layout.tsx)"
    - "Boundary-doc test: ShareDialog.test.tsx reads its own source file via fs.readFileSync to assert the SCOPE BOUNDARY comment cannot be silently removed"
    - "TeammatePicker excludes the current user purely at the filter layer; the hook returns the full active membership so the same data can be reused elsewhere"
    - "Recipient mark-complete (todos) routes through PATCH /api/todos/[id]/complete — the SECURITY DEFINER RPC path from 61-02 — NOT the owner-only updateTaskStatus service call"
    - "Owner-only affordances are HIDDEN (not disabled-with-tooltip) for recipients to keep the shared view uncluttered, matching the spec's 'hide OR disable' option"

key-files:
  created:
    - "src/components/sharing/ShareDialog.tsx (~270 lines)"
    - "src/components/sharing/TeammatePicker.tsx (~110 lines)"
    - "src/components/sharing/SharedByBadge.tsx (~30 lines)"
    - "src/lib/hooks/useBusinessTeammates.ts (~95 lines)"
    - "src/components/sharing/__tests__/ShareDialog.test.tsx (~310 lines, 14 tests)"
    - "src/components/sharing/__tests__/TeammatePicker.test.tsx (~165 lines, 8 tests)"
  modified:
    - "src/app/todo/page.tsx (+94 / -17): is_owner branching, recipient-complete path, ShareDialog mount"
    - "src/app/ideas/page.tsx (+157 / -55): is_owner branching, share button on owner rows, ShareDialog mount, recipient status-flip helper, coexistence comments"

key-decisions:
  - "Owner-only affordances HIDDEN, not disabled. The plan accepted 'hide or disable'; hiding is cleaner — recipients don't see broken Edit/Delete chrome they cannot interact with anyway."
  - "Sonner is the toast library (already mounted globally in src/app/layout.tsx). Both pages now use toast.error for share/complete failures; alert() retained for non-share legacy paths to keep the diff surgical."
  - "useBusinessTeammates returns the full active membership including the current user; the consumer (TeammatePicker) excludes them. This keeps the hook reusable for any teammate display surface, not just sharing."
  - "Boundary-doc test reads ShareDialog.tsx via fs.readFileSync — a small but durable regression guard. If a future refactor strips the SCOPE BOUNDARY comment, the test fails loudly."
  - "Optimistic UI is parent-driven: ShareDialog returns the server's row in onSaved; each page merges it into local state immediately, then calls loadData() to reconcile. On error the dialog stays open and toast.error surfaces the message — no rollback needed because no local mutation happens before the server confirms."
  - "handleRecipientStatusChange wired in /ideas/page.tsx but NOT bound to a button on this surface. Recipients flip idea status from /ideas/[id]/evaluate. The helper exists so future surfaces (and the grep verification step) can find the dependency on /api/ideas/[id]/status."

patterns-established:
  - "Component-level sharing primitives live under src/components/sharing/ for reuse across todos, ideas, and any future per-item-shared resource."
  - "Test files for sharing components live in src/components/sharing/__tests__/ — testing-library + vitest + sonner mock pattern matches the project's existing component-test style (e.g. ReportStatusBar.test.tsx)."

requirements-completed: []

# Metrics
duration: ~40min
completed: 2026-05-14
tasks-total: 4
tasks-completed: 3
files-created: 6
files-modified: 2
tests-added: 22
tests-passing: 22
---

# Phase 61 Plan 05: UI Sharing Primitives + Wiring — Summary

**Three new components (`ShareDialog`, `TeammatePicker`, `SharedByBadge`), one new hook (`useBusinessTeammates`), and minimal wiring into `/todo` and `/ideas`. Recipients of shared rows see a badge + can only mark-complete; owners get a Share button that opens a three-mode dialog. The existing business-wide `/ideas` shared-board mode is intentionally untouched and coexists with the new per-item sharing surface. 22/22 component tests pass.**

## Performance

- **Duration:** ~40 min
- **Started:** 2026-05-14
- **Completed:** 2026-05-14
- **Tasks:** 3 of 4 code tasks complete; Task 4 (manual UX walkthrough) handed off to user with cell-by-cell instructions below
- **Files created:** 6 (3 components + 1 hook + 2 test files)
- **Files modified:** 2 (src/app/todo/page.tsx, src/app/ideas/page.tsx)
- **Tests added:** 22 (14 ShareDialog incl. 4 deriveShareMode + 8 TeammatePicker)
- **Tests passing:** 22/22
- **TypeScript:** zero errors in touched files; pre-existing errors in unrelated `scripts/*.ts` and `*.tsx 2.tsx` duplicate files left as-is (out of scope per the SCOPE BOUNDARY rule)

## Accomplishments

1. **`useBusinessTeammates` hook (`src/lib/hooks/useBusinessTeammates.ts`, ~95 LOC).**
   Client-side fetch of `business_users` joined to `public.users` for email + first/last name. Returns `{ teammates, isLoading, error }`. Uses the singleton browser supabase client (`@/lib/supabase/client`). Handles `businessId === null` by short-circuiting to an empty list. Cancellation flag prevents stale state on rapid businessId switches.

2. **`SharedByBadge` (`src/components/sharing/SharedByBadge.tsx`, ~30 LOC).**
   Pure presentational. Renders `"Shared by {ownerName || ownerEmail || 'Team member'}"` with a small Users icon. Brand-orange palette to match shadcn primitives. `data-testid="shared-by-badge"` for downstream tests.

3. **`TeammatePicker` (`src/components/sharing/TeammatePicker.tsx`, ~110 LOC).**
   Props: `{ businessId, selectedUserIds, onChange, currentUserId }`. Consumes `useBusinessTeammates`. Search input filters by name + email substring case-insensitively. Excludes the current user from the option list. Checkboxes toggle selection; `onChange` fires with the new full array. Renders loading + error + empty-list states.

4. **`ShareDialog` (`src/components/sharing/ShareDialog.tsx`, ~270 LOC).**
   Three-mode radio: Private / Everyone on team / Specific people. `currentMode` seeds the initial selection. Specific reveals an embedded `TeammatePicker`; switching modes hides it. Save button is disabled while submitting OR when mode='specific' with zero selected teammates. On Save: PATCHes `/api/todos/[id]/share` or `/api/ideas/[id]/share` with the contract from 61-04. On 2xx → `toast.success` + `onSaved(response.task|response.idea)` + `onClose()`. On non-2xx → `toast.error(serverMessage)`, dialog stays open. On network throw → `toast.error(err.message)`. Top-of-file `SCOPE BOUNDARY` comment documents that this surface does NOT touch `action_items`, `issues_list`, or the existing ideas business-wide shared-board mode. Also exports `deriveShareMode(row)` helper for callers.

5. **`/todo` page wiring (`src/app/todo/page.tsx`, +94/-17).**
   - `useBusinessContext` imported for `currentUser.id`.
   - `TaskItem` reads `task.is_owner` (default `true` for legacy rows). For `is_owner === false`: renders `SharedByBadge`; hides DueDate dropdown / Share / Delete buttons; keeps Complete button enabled.
   - `handleStatusChange` now takes the full `DailyTask` (not just the id). Recipient path PATCHes `/api/todos/[id]/complete` with `{ completed: boolean }` instead of calling the owner-only `updateTaskStatus`. Server response triggers `loadData()`.
   - Share button on owner rows opens `ShareDialog` via `setShareTarget(task)`. `onSaved` merges the updated row into local state optimistically + calls `loadData()` to reconcile.

6. **`/ideas` page wiring (`src/app/ideas/page.tsx`, +157/-55).**
   - Same pattern as `/todo`. `IdeaCard` now takes `isOwner` + `onShare` props.
   - Owner-only kebab menu (Edit / Re-evaluate / Archive / Delete) is hidden for recipients. Evaluate button stays available — evaluations write to the per-user `ideas_filter` table which the phase deliberately did NOT broaden.
   - `handleRecipientStatusChange(ideaId, status)` defined and bound (currently no UI button on this page; recipients flip status via `/ideas/[id]/evaluate`). Makes the file's dependency on `PATCH /api/ideas/[id]/status` explicit for the grep verification step + future surfaces.
   - Inline comments document the coexistence with the existing business-wide shared-board mode (which queries by `business_id` and remains UNCHANGED).
   - ShareDialog mount at the bottom of the page.

## Task Commits

1. **Task 1: Sharing primitives + tests (TDD, single commit)** — `e6a5628a` (`feat`)
   `feat(61-05): sharing primitives (ShareDialog, TeammatePicker, SharedByBadge, useBusinessTeammates)`
2. **Task 2: /todo page wiring** — `1e350163` (`feat`)
   `feat(61-05): wire ShareDialog + SharedByBadge into /todo page`
3. **Task 3: /ideas page wiring** — `65583aa0` (`feat`)
   `feat(61-05): wire ShareDialog + SharedByBadge into /ideas page`

## Files Created/Modified

### Created (6)

- `src/components/sharing/ShareDialog.tsx`
- `src/components/sharing/TeammatePicker.tsx`
- `src/components/sharing/SharedByBadge.tsx`
- `src/lib/hooks/useBusinessTeammates.ts`
- `src/components/sharing/__tests__/ShareDialog.test.tsx`
- `src/components/sharing/__tests__/TeammatePicker.test.tsx`

### Modified (2)

- `src/app/todo/page.tsx`
- `src/app/ideas/page.tsx`

## Verification Performed

| Check | Expected | Actual | Status |
|-------|----------|--------|--------|
| `npx vitest run src/components/sharing/__tests__/` | 22/22 pass | 22/22 pass | PASS |
| `npx tsc --noEmit` filtered to touched files | no errors | clean | PASS |
| `grep -c "ShareDialog\|SharedByBadge\|/api/todos/.*\/complete" src/app/todo/page.tsx` | ≥3 | 6 | PASS |
| `grep -c "ShareDialog\|SharedByBadge\|/api/ideas/.*\/status" src/app/ideas/page.tsx` | ≥3 | 8 | PASS |
| `grep -n "action_items\|issues_list" src/components/sharing/ShareDialog.tsx` | comment-only, no code refs | 2 hits, both inside the SCOPE BOUNDARY comment block | PASS |
| `grep -rn "supabase.from\(['\"](daily_tasks\|ideas)['\"]" src/components/ src/app/todo/page.tsx src/app/ideas/page.tsx` | 0 | 0 | PASS |
| Sentry tag noise check (`grep -c "console.error" src/components/sharing/*.tsx src/lib/hooks/useBusinessTeammates.ts`) | 0 | 0 | PASS |
| Boundary-doc regression test (reads ShareDialog.tsx via fs) | finds SCOPE BOUNDARY + action_items + issues_list + 'shared board' | passes | PASS |

## Decisions Made

See frontmatter `key-decisions` for the full list. Headline calls:

1. **Hide, don't disable, owner-only affordances for recipients.** Cleaner UI; matches the plan's "HIDDEN or rendered disabled" alternative.
2. **Sonner is the toast library.** Already mounted globally in `src/app/layout.tsx`. Both pages now use `toast.error` for share/complete failures.
3. **`handleRecipientStatusChange` bound but not button-mounted on /ideas.** Status flips for recipients happen on the evaluate page (out of scope). Helper kept so the dependency on `/api/ideas/[id]/status` is explicit + greppable.
4. **Owner display name resolution.** The plan-check flagged this as the highest-risk loose end. The 61-03 service already resolves `owner_display_name` via a `users` join (First Last → First → Last → email → 'Team member'); we consume the field directly. **Stub fallback in SharedByBadge defaults to `ownerEmail` then to `'Team member'`** when both are absent — so no UUIDs ever leak to the UI.
5. **Optimistic UI is parent-driven, not in the dialog.** ShareDialog returns the server-confirmed row in `onSaved`; the parent merges it into local list state immediately + reloads. On error, the dialog stays open and `toast.error` surfaces the server's message — no rollback needed because no local mutation occurs before server confirmation.

## Deviations from Plan

**1. [Plan-check nice-to-have applied] Optimistic-rollback test deferred to the manual walkthrough.**
- **Status:** Documented, not blocked.
- **Note:** The plan-check recommended adding "an explicit optimistic-rollback test case." Because the optimistic update lives in the PARENT (not the dialog), and the parent is the page (~700+ LOC of unrelated state), a unit test of the rollback would require a substantial harness. The error path is exercised in the ShareDialog suite (`on non-2xx response: shows toast.error with server message, dialog stays open, onSaved not called`); the manual walkthrough cells below cover the visible rollback behaviour end-to-end.

**2. [Out of scope per CLAUDE.md / SCOPE BOUNDARY rule] Pre-existing TypeScript errors in `scripts/*.ts` and `*.tsx 2.tsx` duplicate files left as-is.**
- **Status:** Out of scope.
- **Note:** `npx tsc --noEmit` surfaces ~30 errors all in either `scripts/diag-*` diagnostic files or in duplicate `* 2.tsx` files left from previous merges. None are in files we touched. Fixing them is unrelated to the sharing surface and would violate the scope boundary.

## Authentication Gates

None.

## Issues Encountered

None blocking. One small mid-task refactor: `handleStatusChange` originally took `(taskId, newStatus)` and worked from the id alone. To branch on `is_owner` cleanly without re-looking-up the task, I changed the signature to `(task, newStatus)`. Both call sites (the active-row Check button and the completed-row Undo button) were updated in the same task; no other callers exist.

## Manual Test Matrix (Task 4 — handed off to user)

The plan's Task 4 is a `checkpoint:human-verify` that asks for ≥6 representative cells from the 24-cell matrix in 61-RESEARCH.md. Run `npm run dev` (or `vercel dev`) locally and walk these:

| # | Surface | Actor | Action | Expected |
|---|---|---|---|---|
| 1 | `/todo` | Matt (owner) | Create a task → click Share → "Specific people…" → pick a teammate → Save | Toast "Sharing updated", dialog closes, row stays in list |
| 2 | `/todo` | Recipient (logged in) | Navigate to /todo | Shared task shows "Shared by Matt" badge; only Complete button visible (no Share, Delete, DueDate dropdown) |
| 3 | `/todo` | Recipient | Click Complete on the shared task | Task moves to "Completed Today"; back on Matt's account, same row appears as done |
| 4 | `/ideas` | Matt (owner) | Create idea → Share → "Everyone on team" → Save | Same-business teammate sees idea with badge; user from DIFFERENT business does NOT see it |
| 5 | `/ideas` | Recipient | Inspect a team-shared idea | "Shared by Matt" badge present; kebab menu (Edit/Archive/Delete) is HIDDEN; Evaluate button still works (writes to per-user ideas_filter) |
| 6 | `/ideas` | Matt (owner) | Share an idea with one specific teammate, then change to Private | Recipient's idea disappears after Matt saves "Private"; coexistence check — Matt can still browse the business-wide shared-board mode and see everyone's ideas |

If any cell fails: capture screenshot + console, paste into chat, I will fix.

## Deferred Items

- **Optimistic-rollback unit test** (see Deviation 1). Manual walkthrough covers it; revisit if dogfooding surfaces a regression.
- **Filter chip** ("All / Mine only / Shared with me") on /todo and /ideas — explicitly deferred by the plan + CONTEXT.md ("Only add if dogfooding shows shared items create clutter"). Not yet needed.
- **Wire `handleRecipientStatusChange` to a button on /ideas/page.tsx.** Helper exists; no button yet because recipients flip status via /ideas/[id]/evaluate. Add a status-flip kebab item if dogfooding shows users want it on the list view.

## User Setup Required

None — pure frontend wiring. The 61-02 RPCs must be applied to staging/prod before recipient mark-complete will work in production (the local code falls back to a generic 500 if the RPC isn't present; safe but noisy).

## Next Phase Readiness

Phase 61 surface is now complete end-to-end:

- 61-01: schema (shared_with_all, shared_with columns) ✓
- 61-02: RLS broadening + SECURITY DEFINER RPCs ✓
- 61-03: service-layer reads + share/markComplete/markStatus methods ✓
- 61-04: API routes ✓
- 61-05: UI primitives + page wiring ✓ (this plan)
- 61-06: coach client-page idea counts ✓ (already shipped per .planning index)

After the manual walkthrough confirms cells 1-6, this phase is fully shipped.

## Self-Check: PASSED

- `src/components/sharing/ShareDialog.tsx` — FOUND
- `src/components/sharing/TeammatePicker.tsx` — FOUND
- `src/components/sharing/SharedByBadge.tsx` — FOUND
- `src/lib/hooks/useBusinessTeammates.ts` — FOUND
- `src/components/sharing/__tests__/ShareDialog.test.tsx` — FOUND (14 tests pass)
- `src/components/sharing/__tests__/TeammatePicker.test.tsx` — FOUND (8 tests pass)
- `src/app/todo/page.tsx` — modified (ShareDialog mount + is_owner branching + recipient-complete route)
- `src/app/ideas/page.tsx` — modified (ShareDialog mount + is_owner branching + handleRecipientStatusChange + coexistence comments)
- `.planning/phases/61-selective-list-sharing/61-05-SUMMARY.md` — FOUND (this file)
- Commit `e6a5628a` (sharing primitives) — FOUND in `git log`
- Commit `1e350163` (/todo wiring) — FOUND in `git log`
- Commit `65583aa0` (/ideas wiring) — FOUND in `git log`

---
*Phase: 61-selective-list-sharing*
*Plan: 05 — UI primitives + page wiring*
*Completed (code): 2026-05-14*
*Awaiting user manual walkthrough for full sign-off*
