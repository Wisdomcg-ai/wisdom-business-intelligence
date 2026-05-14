# Phase 61: Selective List Sharing — Context

**Gathered:** 2026-05-14
**Status:** Ready for planning
**Source:** Discussion captured in chat (no formal /gsd:discuss-phase run; decisions locked by user)

<domain>
## Phase Boundary

Add per-item sharing controls to `daily_tasks` (todos) and `ideas`. Today both tables are strictly per-user (RLS `user_id = auth.uid()`). After this phase, a user can optionally share a single row with (a) the entire team in that business, or (b) a specific subset of teammates — while keeping unshared items private. The existing team-wide collaboration primitives (`issues_list`, `action_items`, the ideas "shared board" mode) remain untouched and coexist.

**In scope**
- DB: new columns + RLS for `daily_tasks` and `ideas`
- Service / API: share endpoints, broadened reads with `is_owner` flag, ownership gaps fixed
- UI: share dialog with three modes (Private / Everyone on team / Specific people), recipient badges
- Coach dashboard: split idea counts into owned vs team-shared per client

**Out of scope (deferred)**
- Notifications when shared with you (in-app or email)
- Recipient re-sharing onward to a third party
- Comment threads / discussion on items
- Migration of existing `action_items` into `daily_tasks` (coexistence is intentional)
- Per-recipient evaluation state on shared ideas (`ideas_filter` stays per-user)

</domain>

<decisions>
## Implementation Decisions (locked)

### Visibility model
- **Two columns per table:** `shared_with_all boolean DEFAULT false` and `shared_with uuid[] DEFAULT '{}'`.
- **Three logical states:** Private (defaults), Team-wide (`shared_with_all = true`), Specific (`array_length(shared_with) > 0`).
- **Defaults preserve existing behavior:** every existing row becomes Private after the migration — no backfill, no surprise exposure.

### RLS — asymmetric policies
- **SELECT:** owner OR (`shared_with_all = true` AND requester is a member of the business via `business_users`) OR (`auth.uid() = ANY(shared_with)`).
- **INSERT / UPDATE / DELETE:** owner only. Recipients cannot rename, archive, or delete the row.
- **Coach / super_admin visibility:** unchanged (existing RLS clauses are additive ORs, no regression).

### Recipient capabilities
- Recipients **CAN** mark a shared todo complete (decision 1a). Marking complete updates the single shared row — both owner and recipients see the new status (decision 2: status sync).
- Recipients **CANNOT** edit title/notes, archive, or delete. Those mutations are guarded by both RLS and the service layer.
- For shared ideas: same model. Evaluation scores in `ideas_filter` stay per-user (each viewer scores it for themselves) — out of scope for this phase.

### Off-boarding behavior
- When a teammate is removed from `business_users`, their UUID may remain in `shared_with` arrays. This is acceptable (decision 3a) — RLS still blocks them from reading because the business-membership check fails on the SELECT path. A cleanup trigger can be added later if dead UUIDs ever cause problems.

### Existing ownership gaps to fix on the way in
- `ideasService.updateIdea` and `ideasService.archiveIdea` currently mutate by `id` only with no `user_id` filter. RLS blocks the actual mutation today, but the service code should defensively include the owner check.
- `ideasService.getIdeaById` returns any idea without ownership filter. Add defensive `.eq('user_id', userId)` (RLS still enforces, this is belt-and-suspenders).
- These gaps existed pre-phase but matter more once RLS broadens for sharing.

### Counts & dashboards
- Personal todo "progress" / completion-rate badge now reflects items the user can see (owned + shared). Acceptable — sharing increases the user's actionable workload.
- Coach dashboard idea counts (`client-completion` API and `coach/clients/[id]` page) gain an owned-vs-team breakdown. Pre-change behavior already counted business-wide ideas — values won't shift, only the display gains nuance.

### What stays the same (explicit)
- `issues_list` and `action_items` remain business-wide shared boards. No changes.
- The existing ideas "shared board" mode (queries by `businessId` to return everyone's ideas in that business) coexists with the new per-item `shared_with` mechanism. Two valid ways to make an idea team-visible.
- Section permission gates (`finances: false` etc.) are unrelated and untouched.

### Service-role bypass note
- Routes that use `createServiceRoleClient()` bypass RLS. Audit confirmed none of the current `daily_tasks` / `ideas` reads use service-role. Any future code that does must enforce visibility manually.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Current schema and RLS
- `supabase/migrations/00000000000000_baseline_schema.sql` — RLS policies for `daily_tasks`, `ideas`, `ideas_filter`, `business_users`. Search for `daily_tasks` and `ideas_select_consolidated`.

### Service layer
- `src/lib/services/dailyTasksService.ts` — all `daily_tasks` queries (~500 lines, all `user_id`-filtered)
- `src/lib/services/ideasService.ts` — all `ideas` queries; lines 192-200, 214-222, 132 are the ownership gaps to fix

### UI surfaces
- `src/app/todo/page.tsx` — personal todo list page; stats calculated at line ~71 from already-fetched rows
- `src/app/ideas/page.tsx` — ideas board (supports per-user and business-wide shared-board mode)
- `src/app/coach/clients/[id]/page.tsx` — coach client page; idea counts at lines 606-621

### API surfaces
- `src/app/api/coach/client-completion/route.ts` — coach dashboard counts; lines 354-359 query ideas across `user_id` + `business_id`

### Auth and business scope
- `src/lib/business/resolveBusinessId.ts` — business resolution helper, do not bypass
- `business_users` table — source of truth for "is this user a member of this business" (used in RLS via `auth_get_accessible_business_ids()`)

### Existing primitives that coexist
- `action_items` table + service — team-wide shared action list (do NOT touch in this phase)
- `issues_list` table — team-wide IDS-style issues board (do NOT touch)

</canonical_refs>

<specifics>
## Specific Ideas / Concrete Requirements

### UI: share dialog
- One button per item (todo card, idea card) → opens dialog with radio group
  - "Private (only me)" — default
  - "Everyone on team" — sets `shared_with_all = true`, clears `shared_with`
  - "Specific people…" — shows teammate picker (search/select from `business_users` rows with status='active', excluding self), populates `shared_with[]`
- Save closes dialog; row update is optimistic with rollback on error

### UI: recipient badge
- On items the user does NOT own (`is_owner: false` in API response), show a small "Shared by {ownerName}" tag
- Recipients see Complete button enabled; Edit/Delete affordances hidden or disabled with tooltip

### UI: filter chip (defer unless needed)
- "All / Mine only / Shared with me" filter at top of list. Only add if dogfooding shows shared items create clutter.

### API contract
- `PATCH /api/todos/[id]/share` body: `{ mode: 'private' | 'team' | 'specific', userIds?: string[] }`
- Same shape for `/api/ideas/[id]/share`
- 403 if requester is not the row owner; 404 if row not visible

### Status sync
- `PATCH /api/todos/[id]/status` (existing path) — RLS already allows the recipient to update because we narrowed UPDATE to owner-only. **Therefore status updates need a carve-out:** either separate route `/api/todos/[id]/complete` with its own RLS rule, OR a `mark_complete_only` policy that allows non-owner updates restricted to the `status`/`completed_at` columns. **This is the trickiest piece of the phase** — planner must address explicitly.

</specifics>

<deferred>
## Deferred Ideas

- In-app or email notifications when shared with you
- Recipient re-sharing onward to others
- Item-level comment threads
- Per-recipient evaluation state on shared ideas (`ideas_filter` stays per-user)
- Audit log of share changes (who shared what with whom, when)
- Migration of existing `action_items` rows into `daily_tasks` (the two coexist)
- Cleanup trigger that strips removed-teammate UUIDs from `shared_with` arrays

</deferred>

---

*Phase: 61-selective-list-sharing*
*Context captured: 2026-05-14 from chat discussion*
