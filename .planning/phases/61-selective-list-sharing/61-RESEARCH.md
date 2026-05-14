# Phase 61: Selective List Sharing — Research

**Compiled:** 2026-05-14
**Source:** Codebase audit performed via Explore agent before planning. Captures every reference to `daily_tasks` and `ideas` to inform the plan.

---

## 1. Current visibility model

### `daily_tasks` (strict per-user)

RLS (from `supabase/migrations/00000000000000_baseline_schema.sql`):
```sql
CREATE POLICY "Users can view their own tasks"   ON daily_tasks FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own tasks" ON daily_tasks FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own tasks" ON daily_tasks FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own tasks" ON daily_tasks FOR DELETE USING (auth.uid() = user_id);
```
Every row visible to the owner only. `business_id` is populated on insert but not used in any query. No super_admin clause.

### `ideas` (per-user with coach/super_admin overrides)

```sql
CREATE POLICY "ideas_select_consolidated" ON ideas FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM system_roles WHERE user_id = auth.uid() AND role = 'super_admin')
  OR user_id IN (SELECT b.owner_id FROM businesses b WHERE /* business-membership / coaching check */)
);
-- INSERT/UPDATE/DELETE policies follow the same shape
```
Also separately: the ideas page already supports a **business-wide "shared board" mode** that queries by `business_id` — that mode coexists with the new per-item `shared_with` mechanism and is **out of scope to modify**.

### Supporting helper
`auth_get_accessible_business_ids()` returns the array of business IDs the requester can access (owner OR coach OR active `business_users` member). The new SELECT policies should compose with this rather than re-implementing the check.

---

## 2. Every code site that touches the tables

### `daily_tasks`

| Site | File | Lines | Filter | Type | Notes |
|------|------|-------|--------|------|-------|
| `getTodaysTasks` | `src/lib/services/dailyTasksService.ts` | 251 | `user_id` EQ | READ | active, not completed, not archived |
| `getTodaysCompletedTasks` | `dailyTasksService.ts` | 274 | `user_id` EQ | READ | completed today |
| `getArchivedTasks` | `dailyTasksService.ts` | 298 | `user_id` EQ | READ | archived |
| `getAllTasks` | `dailyTasksService.ts` | 320 | `user_id` EQ | READ | all states |
| `createTask` | `dailyTasksService.ts` | 359 | inserts `user_id` + optional `business_id` | WRITE | |
| `updateTaskStatus` | `dailyTasksService.ts` | 393 | `user_id` + id | UPDATE | mark done / undo / archive timestamps |
| `updateTaskPriority` | `dailyTasksService.ts` | 411 | `user_id` + id | UPDATE | |
| `updateTaskDueDate` | `dailyTasksService.ts` | 436 | `user_id` + id | UPDATE | |
| `deleteTask` | `dailyTasksService.ts` | 458 | `user_id` + id | DELETE | |
| `deleteArchivedTasks` | `dailyTasksService.ts` | 476 | `user_id` + NOT archived | DELETE | bulk cleanup |
| Page render | `src/app/todo/page.tsx` | full file | — | UI | calls service only |
| Stats badge | `src/app/todo/page.tsx` | ~71, ~357-370 | client-side | UI | derived from already-fetched arrays |

No API routes, no tests, no crons, no exports, no JOINs.

### `ideas`

| Site | File | Lines | Filter | Type | Notes |
|------|------|-------|--------|------|-------|
| `getActiveIdeas` (shared mode) | `src/lib/services/ideasService.ts` | 69-74 | `business_id` EQ | READ | when `businessId` passed |
| `getActiveIdeas` (legacy mode) | `ideasService.ts` | 87-92 | `user_id` EQ | READ | when no `businessId` |
| `getIdeasByStatus` | `ideasService.ts` | 112-118 | `user_id` EQ + status | READ | **NO `businessId` support** (inconsistent with `getActiveIdeas`) |
| `getIdeaById` | `ideasService.ts` | 135-139 | id only | READ | **no ownership filter** — relies on RLS only |
| `createIdea` | `ideasService.ts` | 162-178 | inserts `user_id` + optional `business_id` | WRITE | |
| `updateIdea` | `ideasService.ts` | 192-200 | id only | UPDATE | **no `user_id` filter** — RLS-only protection |
| `archiveIdea` | `ideasService.ts` | 214-222 | id only | UPDATE | **no `user_id` filter** — RLS-only protection |
| `deleteIdea` | `ideasService.ts` | 250-266 | conditional by role | DELETE | `canDeleteAll` bypasses owner check |
| `getIdeasStats` | `ideasService.ts` | 287 | delegates | READ | calls `getActiveIdeas` |
| `getIdeasFilterByIdeaId` | `ideasService.ts` | 402-406 | `idea_id` EQ | READ | evaluation record |
| `upsertIdeasFilter` | `ideasService.ts` | 461-465 | `idea_id` + `user_id` | WRITE | per-user evaluation |
| `getIdeasWithFilters` | `ideasService.ts` | 482-490 | `user_id` EQ + JOIN | READ | only intra-service JOIN |
| Page (list + stats) | `src/app/ideas/page.tsx` | ~536 | via service | UI | `getActiveIdeas(undefined, businessId)` + `getIdeasStats(undefined, businessId)` |
| Evaluation page | `src/app/ideas/[id]/evaluate/page.tsx` | — | via service | UI | single idea + filter form |
| Coach client page | `src/app/coach/clients/[id]/page.tsx` | 606-621 | `business_id` EQ | UI | counts: total / captured / under_review / approved |
| Coach completion API | `src/app/api/coach/client-completion/route.ts` | 354-359 | `user_id IN ownerIds` OR `business_id IN businessIds` | API | OR-based count for coach dashboard |
| Test cleanup | `src/__tests__/migrations/db-04-set-null-batch-1.test.ts` | ~40-63 | DELETE on `ideas_filter` | TEST | self-owned rows |

No crons. No exports. No service-role bypass on these tables.

---

## 3. Pre-existing gaps that this phase should fix on the way in

1. **`ideasService.updateIdea` (192-200)** — mutation by `id` only. RLS blocks unauthorized writes today, but service code should defensively `.eq('user_id', userId)`.
2. **`ideasService.archiveIdea` (214-222)** — same shape. Same fix.
3. **`ideasService.getIdeaById` (132-139)** — no ownership filter. Add `.eq('user_id', userId)` or accept `viewerId` and check via RLS-aligned logic.
4. **`getIdeasByStatus` (106-118)** — no `businessId` support, inconsistent with `getActiveIdeas`. Out of scope for this phase but flagged for follow-up.

---

## 4. Behavior-change predictions when the feature lands

| Surface | Behavior today | After this phase |
|---------|----------------|-----------------|
| Personal todo list | Owner's items only | Owner's items + shared-with-me items, badged "Shared by …" |
| Personal todo stats badge | % of my items done | % of items visible to me done (denominator grows) |
| Ideas list (per-user mode) | Owner's items only | Owner's items + shared-with-me items |
| Ideas list (business-wide mode) | All ideas in business | Unchanged — RLS for shared-with-me items still allows them through the same way |
| Coach client page idea counts | Total business-wide ideas | Same total + new owned/team-shared breakdown |
| `daily_tasks` updates by non-owner | Not possible (RLS) | Still not possible for general updates. **One exception:** status flip ("mark complete") needs a carve-out so recipients can act on their shared todos. |

---

## 5. Architectural risks the planner must address

### Risk 1 — Asymmetric RLS for status sync ⚠️ tricky
Status sync (decision #2) means a recipient marking a shared todo complete must update the row. But the narrow UPDATE policy ("owner only") blocks them.

**Three options for the planner to evaluate:**

**A. Column-restricted policy.** Allow non-owner UPDATEs that touch only `status` / `completed_at` / `completed_by`. Postgres RLS doesn't have native per-column UPDATE policies, so this needs either a SECURITY DEFINER RPC or a CHECK constraint trick. RPC is cleaner.

**B. Dedicated RPC.** `mark_task_complete(task_id uuid, completed boolean)` — SECURITY DEFINER, checks (owner OR visible-to-viewer), updates only the status columns. UI calls this RPC instead of a generic UPDATE. **Probably the right answer.**

**C. Separate column for per-user completion.** Each viewer has their own complete/incomplete state stored in a join table or JSONB on the row. Diverges from "single status, status sync" decision (#2). Out — rejected.

Recommend Option B unless the planner finds a reason to prefer A.

### Risk 2 — Optimistic UI under shared edits
If two recipients open the same shared todo and one marks it complete, the other's UI shows stale state until refresh. For a coaching context this is fine (low concurrency). Worth noting; no real-time sync needed.

### Risk 3 — Index strategy
Querying `auth.uid() = ANY(shared_with)` on a uuid[] column without an index will table-scan once volume grows. Add a `GIN (shared_with)` index from day one.

### Risk 4 — Existing pre-phase ownership gaps in `ideas`
RLS protects today, but the audit found three service functions that don't include `user_id` filters. Fixing them is in scope (61-03 in the roadmap). Verify the planner doesn't miss this.

---

## 6. Test matrix the planner should anticipate

Each table × each visibility mode × each viewer role:

| Mode | Owner | Recipient (in `shared_with`) | Other team member | Non-member | Coach | Super_admin |
|------|-------|------------------------------|--------------------|------------|-------|-------------|
| Private | see/edit/delete | ❌ | ❌ | ❌ | see (via coach RLS) | see |
| Team-wide | see/edit/delete | n/a (all are "any team member") | see, mark complete only | ❌ | see | see |
| Specific | see/edit/delete | see, mark complete only | ❌ | ❌ | see | see |

12 scenarios per table × 2 tables = 24 cases for the manual matrix. Integration tests can cover the RLS path with 6-8 representative cases.

---

## 7. Open questions for the planner

None — all design decisions are locked in CONTEXT.md. If the planner hits ambiguity, it should flag back rather than guess (per Matt's "go deep before deploying" preference).

---

*Phase: 61-selective-list-sharing*
*Research compiled from chat-driven audit on 2026-05-14*
