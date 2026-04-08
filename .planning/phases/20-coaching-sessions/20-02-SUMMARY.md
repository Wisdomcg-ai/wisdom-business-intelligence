---
phase: 20-coaching-sessions
plan: 02
subsystem: coaching-sessions, ui
tags: [nextjs, supabase, react, coaching-sessions, strategic-initiatives, rock-linkage]

# Dependency graph
requires:
  - 20-01 (strategic_initiative_id column on session_actions)
provides:
  - Rock linkage UI on session action items in session detail page
  - linkRock() function writing strategic_initiative_id to session_actions
  - Dual-ID rock loading via business_profiles.id
affects: [coaching-sessions, session-actions, strategic-initiatives]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Rock selector grouped by step_type (Q1-Q4) with None unlink option"
    - "autoFocus on select + onBlur to close — no modal, minimal UI overhead"
    - "Teal color used for rock badge/icon to distinguish from orange action UI"

key-files:
  created: []
  modified:
    - src/app/coach/sessions/[id]/page.tsx

key-decisions:
  - "Rock loading uses business_profiles.id (dual-ID pattern) — strategic_initiatives.business_id = business_profiles.id NOT businesses.id"
  - "Rock select uses autoFocus + onBlur dismiss — lightweight, no modal needed"
  - "Rock badge visible on both current session actions AND previous actions review panel"
  - "linkRock() calls loadSession() after update to refresh strategic_initiative_id from DB"

requirements-completed: []

# Metrics
duration: 10min
completed: 2026-04-08
---

# Phase 20 Plan 02: Rock Linkage on Session Action Items Summary

**Rock linkage selector added to session detail page — coach can link any action item to a quarterly rock (strategic initiative) via a grouped dropdown, stored to session_actions.strategic_initiative_id using the correct dual-ID pattern**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-04-08T03:52:38Z
- **Completed:** 2026-04-08T04:00:00Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Extended SessionAction interface with `strategic_initiative_id: string | null`
- Added `rocks` and `rockLinkingActionId` state variables
- Rocks loaded via dual-ID resolution: `business_profiles.select('id').eq('business_id', sessionData.business_id)` then `strategic_initiatives.eq('business_id', profileData.id)`
- Added `linkRock()` async function that updates `session_actions.strategic_initiative_id` via Supabase
- Rock selector UI on current session actions: Target icon toggle opens grouped select (Q1-Q4 optgroups), teal badge shows linked rock title
- Rock selector UI on previous actions panel: same Target icon + select pattern, plus inline teal badge in the metadata row
- TypeScript clean — zero compilation errors

## Task Commits

1. **Task 1: Rock linkage UI** — `3d015f2` (feat)

## Files Created/Modified

- `src/app/coach/sessions/[id]/page.tsx` — SessionAction interface extended, state added, rock loading in loadSession, linkRock function, UI on both action lists

## Decisions Made

- Dual-ID pattern: `strategic_initiatives.business_id` maps to `business_profiles.id`, not `businesses.id`. This is the established pattern from RocksReviewStep and documented in project memory.
- Select uses `autoFocus` + `onBlur` to close automatically — no separate close button needed
- No separate rock editing modal — plan called for minimal UI, a Target icon toggle is sufficient
- Teal used for rock indicator to contrast with orange action theme

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. TypeScript compiled clean on first pass.

## Known Stubs

None — rock loading and persistence are fully wired. `linkRock()` writes to DB and calls `loadSession()` to refresh state.

## Self-Check: PASSED

- `src/app/coach/sessions/[id]/page.tsx` — confirmed modified (209 insertions)
- Commit `3d015f2` — confirmed present in git log
- `strategic_initiative_id` count: 8 (>= 3 required)
- `strategic_initiatives` count: 2 (>= 1 required)
- `business_profiles` count: 2 (>= 1 required)
- `linkRock` count: 3 (>= 2 required)
- TypeScript: clean

---
*Phase: 20-coaching-sessions*
*Completed: 2026-04-08*
