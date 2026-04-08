# Phase 20: Coaching Sessions - Research

**Researched:** 2026-04-07
**Domain:** Supabase schema reconciliation, Next.js API routes, session management UI
**Confidence:** HIGH — all findings are from direct code inspection, no external sources needed

---

## Summary

Phase 20 has a pre-existing "coaching_sessions 400 error" that has a clear root cause: the codebase contains two completely separate, conflicting session systems that have never been unified. The `/api/sessions/` API routes query a `coaching_sessions` table (a simple scheduling table created in migration `20251209_create_missing_tables.sql`), while the actual session notes UI (`/coach/sessions/`, `/sessions/`) queries `session_notes` and `session_actions` tables (created in migrations `20251129_session_notes.sql` and `20251129_session_actions.sql`). The API inserts columns that do not exist on the DB tables it targets.

The session notes system (what the coach actually uses today) is largely functional at the UI layer. The problem is that the `/api/sessions/` routes — used by the schedule page and transcript analysis — query the wrong table structure and insert mismatched column names, producing 400/500 errors. Additionally, the `coaching_sessions` table is missing columns (`session_type`, `prep_completed`, `session_metadata`) that the schedule page and AI analysis route expect.

There is no existing link between sessions and quarterly rocks (strategic_initiatives). That linkage does not yet exist in the schema or UI and would need to be built from scratch.

**Primary recommendation:** Reconcile the two session systems. The `session_notes` + `session_actions` schema is the richer, more mature design. Fix the `/api/sessions/` routes to either point to `session_notes` or add missing columns to `coaching_sessions`. Do NOT rebuild what already works in the `session_notes` UI.

---

## Standard Stack

This phase is pure code-fix and schema-extension. No new libraries required.

| Component | Current State | Purpose |
|-----------|--------------|---------|
| `session_notes` table | Exists, working | Rich session notes (coach + client fields, attendees, transcript) |
| `session_actions` table | Exists, column mismatches | Per-session action items with carry-forward tracking |
| `coaching_sessions` table | Exists, incomplete schema | Calendar/scheduled sessions (missing columns) |
| `/api/sessions/` routes | Broken (wrong table + columns) | REST API for session CRUD |
| `/coach/sessions/` pages | Working | Coach UI for session notes list + detail |
| `/sessions/` pages | Working | Client UI for session notes |

---

## Architecture Patterns

### Existing Pattern: Two-Table Session Design

The `session_notes` + `session_actions` design is the project's mature pattern:

```
session_notes
  id, business_id, coach_id, session_date, status
  discussion_points, client_commitments, coach_action_items (TEXT free-form coach notes)
  private_observations, next_session_prep (coach-private)
  client_takeaways, client_notes, client_rating, client_feedback (client fields)
  transcript_url, transcript_name
  visible_to_all_users
  UNIQUE(business_id, session_date)

session_attendees
  session_note_id -> session_notes.id

session_actions  (structured accountability items)
  session_note_id -> session_notes.id  (nullable — persists after session deleted)
  business_id, action_number, description, due_date
  status: pending | completed | missed | carried_over
  carried_over_from_id, carried_over_to_id (self-referential carry-forward chain)
  reviewed_in_session_id -> session_notes.id
  created_by
```

### Existing Pattern: coaching_sessions (Calendar/Schedule)

```
coaching_sessions
  id, coach_id, client_id, business_id
  title, description, scheduled_at, duration_minutes
  status: scheduled | completed | cancelled | no_show
  meeting_url, location, notes
  (MISSING: session_type, prep_completed, session_metadata — used by schedule UI)
```

### Pattern: "Quarterly Rocks" = strategic_initiatives

Rocks are not a separate table. The quarterly review and one-page-plan use `strategic_initiatives` filtered by `step_type = 'q1' | 'q2' | 'q3' | 'q4'`. The `business_id` on `strategic_initiatives` is `business_profiles.id` (not `businesses.id`) — the dual-ID pattern applies here.

```typescript
// RocksReviewStep pattern for loading rocks:
supabase
  .from('strategic_initiatives')
  .select('*')
  .eq('business_id', profileId)       // business_profiles.id, NOT businesses.id
  .eq('step_type', quarterKey)         // 'q1' | 'q2' | 'q3' | 'q4'
  .order('created_at', { ascending: true })
```

### Anti-Patterns to Avoid

- **Mixing business_id types:** `session_notes.business_id` is `businesses.id`. `strategic_initiatives.business_id` is `business_profiles.id`. A session-to-rock link needs to bridge these via a join through `business_profiles`.
- **Rebuilding session_notes UI:** The coach UI (`/coach/sessions/[id]/page.tsx`) already has a working action items panel querying `session_actions` directly from Supabase client. Do not replace it with API calls without verifying the API routes are fixed first.
- **Using `action_text` column:** `session_actions` uses `description`, not `action_text`. The `/api/sessions/[id]/actions/route.ts` inserts `action_text` — this will fail.
- **Using `status: 'open'`:** `session_actions` status enum is `'pending' | 'completed' | 'missed' | 'carried_over'`. The actions API inserts `'open'` — this violates the CHECK constraint.

---

## Root Cause Analysis: The 400 Error

### Problem 1: `/api/sessions/` routes query `coaching_sessions` but UI uses `session_notes`

The `/api/sessions/route.ts` (GET + POST) queries `coaching_sessions`. But:
- The coach sessions list page (`/coach/sessions/page.tsx`) queries `session_notes` directly via Supabase client
- The coach sessions detail page (`/coach/sessions/[id]/page.tsx`) queries `session_notes` directly
- There is no page that actually calls `/api/sessions/`

The schedule page (`/coach/schedule/page.tsx`) calls `coaching_sessions` directly for the calendar view — this is a different use case (future sessions), and the table exists, but is missing columns.

### Problem 2: `/api/sessions/[id]/actions/route.ts` — column name mismatches

The actions API inserts into `session_actions` with wrong column names:

| API inserts | DB column | Mismatch |
|------------|-----------|---------|
| `session_id` | `session_note_id` | Wrong column name |
| `action_text` | `description` | Wrong column name |
| `status: 'open'` | `status` CHECK: `pending\|completed\|missed\|carried_over` | Invalid enum value |
| (missing) | `action_number` NOT NULL | Required field absent |
| (missing) | `created_by` NOT NULL | Required field absent |
| `assigned_to` | (not in schema) | Column does not exist |

### Problem 3: `analyze-transcript` route inserts `coaching_session_id` into `session_actions`

`/api/sessions/[id]/analyze-transcript/route.ts` inserts into `session_actions` with column `coaching_session_id` — this column does not exist. The correct column is `session_note_id`.

Also, this route updates `coaching_sessions.session_metadata` — a column that does not exist in the `coaching_sessions` migration.

### Problem 4: `coaching_sessions` missing columns used by schedule page

`/coach/schedule/page.tsx` selects `session_type`, `prep_completed` from `coaching_sessions`. Neither column exists in the migration.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead |
|---------|-------------|-------------|
| Action item carry-forward chain | Custom linked list logic | `carried_over_from_id` / `carried_over_to_id` already on `session_actions` |
| Session-to-business lookup | New join table | `session_notes.business_id` is already `businesses.id` |
| Rock-to-session lookup | Complex join service | Add `strategic_initiative_id UUID REFERENCES strategic_initiatives(id)` to `session_actions` |
| Change detection (last_reviewed_at) | New polling mechanism | `financial_forecasts.last_reviewed_at` already updated by `forecast-service.ts` |

---

## Common Pitfalls

### Pitfall 1: Fixing the API routes but not the columns
**What goes wrong:** You fix column names in the actions API but `session_actions.action_number` is NOT NULL with no default — every insert will still fail.
**How to avoid:** Either add `DEFAULT nextval()` / auto-increment for `action_number`, or compute it in the route as `(SELECT COUNT(*) + 1 FROM session_actions WHERE business_id = $1)`.
**Warning sign:** PostgreSQL error `null value in column "action_number" violates not-null constraint`

### Pitfall 2: Dual-ID confusion on rock linkage
**What goes wrong:** Linking sessions to rocks via `businesses.id` when `strategic_initiatives.business_id` is `business_profiles.id`.
**How to avoid:** Follow the RocksReviewStep pattern — resolve `business_profiles.id` from `user_id` first, use that for strategic_initiatives queries.
**Warning sign:** Rock query returns 0 results even though rocks exist in the Goals Wizard

### Pitfall 3: The `coaching_sessions` table has client_id but `session_notes` does not
**What goes wrong:** Access control code that works for `coaching_sessions` (checks `client_id = auth.uid()`) won't work for `session_notes` (uses business ownership / business_users patterns).
**How to avoid:** For session_notes access, always follow the RLS pattern: coach_id OR assigned_coach_id OR business owner_id OR business_users.
**Warning sign:** Client sees 403 on session notes they should be able to read

### Pitfall 4: One session per business per day constraint
**What goes wrong:** Attempting to create a session for a business that already has one today causes a unique constraint violation on `session_notes`.
**How to avoid:** The coach page already handles this (checks for existing, joins if found). Any new code creating session_notes must do the same.
**Warning sign:** `duplicate key value violates unique constraint "session_notes_business_id_session_date_key"`

---

## Code Examples

### Correct session_actions insert pattern (from session detail page)
```typescript
// Source: src/app/coach/sessions/[id]/page.tsx (direct Supabase client)
// The UI inserts actions directly — the /api/sessions/[id]/actions route is NOT used by the UI
await supabase
  .from('session_actions')
  .insert({
    session_note_id: sessionId,
    business_id: session.business_id,
    action_number: nextNumber,          // must compute this
    description: action.description,    // NOT action_text
    due_date: action.due_date || null,
    status: 'pending',                  // NOT 'open'
    created_by: user.id                 // required NOT NULL
  })
```

### Correct rock loading pattern (from RocksReviewStep)
```typescript
// Source: src/app/quarterly-review/components/steps/RocksReviewStep.tsx
// Rocks are strategic_initiatives filtered by step_type
const { data: profile } = await supabase
  .from('business_profiles')
  .select('id')
  .eq('user_id', targetUserId)
  .maybeSingle()

const { data: rocks } = await supabase
  .from('strategic_initiatives')
  .select('*')
  .eq('business_id', profile.id)   // business_profiles.id, not businesses.id
  .eq('step_type', 'q1')           // or q2/q3/q4
  .order('created_at', { ascending: true })
```

### Linking session actions to a rock (proposed pattern)
```sql
-- Migration: add strategic_initiative_id to session_actions
ALTER TABLE session_actions
  ADD COLUMN IF NOT EXISTS strategic_initiative_id UUID
  REFERENCES strategic_initiatives(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_session_actions_initiative
  ON session_actions(strategic_initiative_id);
```

### Correct coaching_sessions schema additions (for schedule page)
```sql
-- Migration: add missing columns to coaching_sessions
ALTER TABLE coaching_sessions
  ADD COLUMN IF NOT EXISTS session_type TEXT DEFAULT 'video'
    CHECK (session_type IN ('video', 'phone', 'in-person')),
  ADD COLUMN IF NOT EXISTS prep_completed BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS session_metadata JSONB DEFAULT '{}';
```

---

## Schema Inventory

### Tables confirmed to exist (from migrations)
| Table | Migration | Status |
|-------|-----------|--------|
| `session_notes` | 20251129_session_notes.sql / 20251129_session_notes_complete.sql | Exists, RLS working |
| `session_attendees` | 20251129_session_notes.sql | Exists, RLS working |
| `session_actions` | 20251129_session_actions.sql | Exists, column mismatches in API |
| `coaching_sessions` | 20251209_create_missing_tables.sql | Exists, missing 3 columns |
| `strategic_initiatives` | Referenced by RLS migrations | Exists (Goals Wizard) |

### Tables referenced in API but NOT in migrations
| Table reference | Where used | Status |
|----------------|-----------|--------|
| `coaching_sessions.session_type` | /coach/schedule/page.tsx | Column missing |
| `coaching_sessions.prep_completed` | /coach/schedule/page.tsx | Column missing |
| `coaching_sessions.session_metadata` | analyze-transcript/route.ts | Column missing |
| `session_actions.coaching_session_id` | analyze-transcript/route.ts | Column doesn't exist (should be session_note_id) |

---

## Phase 12 Change Tracking Relationship

Phase 12 added `last_reviewed_at TIMESTAMPTZ` to `financial_forecasts`. This is used to show a "Modified since last review" badge on the forecast page (`/finances/forecast/page.tsx`).

The relationship to sessions: after a coaching session where the coach reviews the forecast, `last_reviewed_at` should be updated. Currently `forecast-service.ts` does this on `completeWizard()`. A future enhancement (not in scope for Phase 20) would be to auto-update `last_reviewed_at` when a session is marked complete. For Phase 20, this is informational only — the existing badge mechanism already works.

---

## Environment Availability

Step 2.6: SKIPPED — phase is pure code/schema changes, no new external dependencies.

---

## Validation Architecture

`workflow.nyquist_validation` is not set to false in `.planning/config.json` (key absent), so validation is enabled.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Manual + TypeScript compilation (no automated test suite detected) |
| Config file | none |
| Quick run command | `npx tsc --noEmit` |
| Full suite command | `npx tsc --noEmit` |

### Phase Requirements → Test Map
| Req | Behavior | Test Type | Automated Command |
|-----|----------|-----------|-------------------|
| Fix 400 error | POST /api/sessions creates a session without error | manual smoke test | curl or browser |
| Fix actions API | POST /api/sessions/[id]/actions creates an action | manual smoke test | curl |
| Session notes | Coach can view/edit session notes for a client | manual | browser |
| Action items | Actions visible in session detail and client dashboard | manual | browser |
| Rock linkage | Session action can be linked to a quarterly rock | manual | browser |

### Wave 0 Gaps
- [ ] TypeScript compilation check: `npx tsc --noEmit` — verify all route files type-check after column rename fixes
- [ ] No automated test files exist for sessions — all validation is manual

*(Note: The codebase has no test framework. All verification is TypeScript compilation + manual browser testing. This matches patterns established in all previous phases.)*

---

## Recommended Implementation Scope

Based on the research, Phase 20 breaks naturally into these units:

**Unit 1 — Schema fixes (migration):**
- Add `session_type`, `prep_completed`, `session_metadata` to `coaching_sessions`
- Add `strategic_initiative_id` to `session_actions`

**Unit 2 — Fix `/api/sessions/[id]/actions/route.ts`:**
- Rename `session_id` → `session_note_id`
- Rename `action_text` → `description`
- Change `status: 'open'` → `status: 'pending'`
- Add `action_number` computation
- Add `created_by: user.id`
- Remove `assigned_to` (not in schema)

**Unit 3 — Fix `analyze-transcript` route:**
- Change `coaching_session_id` → `session_note_id` in session_actions insert
- Remove `session_metadata` update from coaching_sessions (or add via migration)
- Verify the route queries the right table for session access check

**Unit 4 — Rock linkage UI (new feature):**
- In session detail page, add a "Link to Rock" selector on each action item
- Load current quarter's `strategic_initiatives` for the client
- Save `strategic_initiative_id` on `session_actions`

**Unit 5 — Follow-ups / carry-forward UI (existing schema, no UI yet):**
- In session start flow, show `session_actions` for the business with `status = 'pending'` from prior sessions
- Allow marking each as `completed`, `missed`, or `carried_over`
- This already exists in the detail page (`loadSession` already loads previous actions)

---

## Open Questions

1. **Should `/api/sessions/` route be reconciled to use `session_notes` or kept as a separate scheduling system?**
   - What we know: The UI doesn't currently call `/api/sessions/` — it uses Supabase client directly
   - What's unclear: Whether anything calls this API in production
   - Recommendation: Reconcile — rename the API route's target to `session_notes` for consistency, or delete the `/api/sessions/` routes if they are unused

2. **Should `coaching_sessions` (schedule/calendar) and `session_notes` (notes/actions) remain separate tables?**
   - What we know: They model different things — a future appointment vs. a completed session record
   - What's unclear: The product intent — are these always 1:1, or can you have a session note without a prior scheduled session?
   - Recommendation: Keep separate. Add a `coaching_session_id UUID REFERENCES coaching_sessions(id)` nullable FK on `session_notes` to optionally link them.

3. **Is `session_actions.action_number` needed?**
   - What we know: It is NOT NULL with no default, making every API insert fail
   - What's unclear: Whether it serves a display purpose (sorted list) or uniqueness constraint
   - Recommendation: Add `DEFAULT nextval(sequence)` or auto-compute in route as `(SELECT COALESCE(MAX(action_number), 0) + 1 FROM session_actions WHERE business_id = $1)`

---

## Sources

### Primary (HIGH confidence)
- Direct migration file inspection: `20251129_session_notes.sql`, `20251129_session_actions.sql`, `20251209_create_missing_tables.sql`
- Direct API route inspection: `src/app/api/sessions/route.ts`, `src/app/api/sessions/[id]/route.ts`, `src/app/api/sessions/[id]/actions/route.ts`, `src/app/api/sessions/[id]/analyze-transcript/route.ts`
- Direct UI inspection: `src/app/coach/sessions/page.tsx`, `src/app/coach/sessions/[id]/page.tsx`
- Direct schedule page: `src/app/coach/schedule/page.tsx`
- Rock pattern: `src/app/quarterly-review/components/steps/RocksReviewStep.tsx`
- Change tracking migration: `supabase/migrations/20260407_forecast_change_tracking.sql`

### Secondary (MEDIUM confidence)
- `src/app/dashboard/components/SessionActionsCard.tsx` — confirms `session_actions` schema from frontend perspective
- `supabase/migrations/20251129_session_notes_fix_rls.sql` — confirms RLS pattern history

---

## Metadata

**Confidence breakdown:**
- Schema issues (400 error root cause): HIGH — verified by direct inspection of migrations vs. API routes
- Rock linkage pattern: HIGH — verified from RocksReviewStep.tsx
- Missing columns list: HIGH — cross-referenced migration vs. schedule page queries
- `last_reviewed_at` relationship: HIGH — migration and forecast page both inspected

**Research date:** 2026-04-07
**Valid until:** 2026-05-07 (stable schema, no fast-moving dependencies)
