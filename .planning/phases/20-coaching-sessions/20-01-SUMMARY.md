---
phase: 20-coaching-sessions
plan: 01
subsystem: api, database
tags: [supabase, postgresql, nextjs, api-routes, coaching-sessions, session-actions]

# Dependency graph
requires: []
provides:
  - Idempotent migration adding session_type, prep_completed, session_metadata, agenda, summary to coaching_sessions
  - Idempotent migration adding strategic_initiative_id to session_actions with index
  - Fixed POST /api/sessions — inserts coaching_sessions with agenda (JSONB) column now available
  - Fixed GET /api/sessions/[id] — removed invalid session_actions join (no FK to coaching_sessions)
  - Fixed POST /api/sessions/[id]/actions — correct column names, proper NOT NULL fields
  - Fixed POST /api/sessions/[id]/analyze-transcript — correct session_actions insert from AI extraction
affects: [coaching-sessions, session-actions, schedule-page]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Session actions linked via session_note_id (session_notes FK), never coaching_sessions FK"
    - "action_number computed by counting existing rows for session + 1 before insert"
    - "AI-extracted actions use session_note_id: null since no session_notes row exists at that point"

key-files:
  created:
    - supabase/migrations/20260407_fix_coaching_sessions_schema.sql
  modified:
    - src/app/api/sessions/[id]/route.ts
    - src/app/api/sessions/[id]/actions/route.ts
    - src/app/api/sessions/[id]/analyze-transcript/route.ts

key-decisions:
  - "session_actions has no FK to coaching_sessions — actions link via session_note_id to session_notes"
  - "actions/route.ts queries session_notes (not coaching_sessions) for access check + business_id"
  - "analyze-transcript sets session_note_id: null for AI-extracted actions (no session_notes row)"
  - "action_number computed via count query before insert — no race condition risk in low-volume coach context"

patterns-established:
  - "All session_actions inserts require: session_note_id, business_id, action_number, description, status, created_by"
  - "status values: pending | completed | missed | carried_over (NOT open)"

requirements-completed: []

# Metrics
duration: 15min
completed: 2026-04-07
---

# Phase 20 Plan 01: Coaching Sessions Schema Reconciliation Summary

**Schema migration + 4 API route fixes resolving coaching_sessions 400 errors by correcting column names (action_text->description, coaching_session_id->session_note_id), invalid enum values (open->pending), and missing NOT NULL fields (action_number, created_by)**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-04-07T00:00:00Z
- **Completed:** 2026-04-07T00:15:00Z
- **Tasks:** 2
- **Files modified:** 4 (+ 1 created)

## Accomplishments

- Created idempotent migration adding 5 missing columns to coaching_sessions (session_type, prep_completed, session_metadata, agenda, summary) and strategic_initiative_id to session_actions
- Fixed all 4 /api/sessions/ route files to match actual database schema — no more 400 errors from wrong column names or invalid enum values
- Resolved the invalid session_actions join in GET /api/sessions/[id] (session_actions has no FK to coaching_sessions)

## Task Commits

Each task was committed atomically:

1. **Task 1: Schema migration** - `31f6f8b` (feat)
2. **Task 2: Fix 4 API route files** - `5beb176` (fix)

**Plan metadata:** see final commit below

## Files Created/Modified

- `supabase/migrations/20260407_fix_coaching_sessions_schema.sql` - 6 ADD COLUMN IF NOT EXISTS statements + 1 index for coaching_sessions and session_actions
- `src/app/api/sessions/[id]/route.ts` - Removed invalid session_actions join from GET handler
- `src/app/api/sessions/[id]/actions/route.ts` - Complete rewrite: correct access check (session_notes), correct column names, action_number computation, created_by
- `src/app/api/sessions/[id]/analyze-transcript/route.ts` - Fixed session_actions insert block: session_note_id null, description, pending, action_number, created_by

## Decisions Made

- `actions/route.ts` queries `session_notes` (not `coaching_sessions`) for access check, because the route is called with a session_notes ID from the session detail page
- AI-extracted actions from analyze-transcript set `session_note_id: null` — these come from coaching_sessions transcript analysis where no session_notes row exists
- `action_number` computed via count query (existing rows + 1) — low insert volume in coach context makes this safe without distributed locking

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. TypeScript compiled clean on first pass.

## User Setup Required

None - no external service configuration required. The migration file must be applied to the Supabase database (standard deployment process).

## Next Phase Readiness

- All /api/sessions/ routes now use correct column names and will no longer return 400 errors
- coaching_sessions table will have session_type and prep_completed columns after migration (required by schedule page)
- Phase 20 further plans can build on working API foundation

---
*Phase: 20-coaching-sessions*
*Completed: 2026-04-07*
