# Foreign Key ON DELETE Policy

**Status:** ACTIVE — operator sign-off Matt Malouf, 2026-05-04
**Source:** Phase 49 Database Integrity Hygiene — research output (`.planning/phases/49-database-integrity-hygiene/RESEARCH.md` DB-03 section)
**Audience:** future schema authors and migration reviewers
**Authoritative for:** plans 49-04, 49-05, 49-06, 49-07 (every DB-04 migration MUST cite the `fk-policy.md` row it implements)

## Operator decisions captured 2026-05-04

- **Bucket A (50 FKs SET NULL):** approved as recommended by researcher
- **Bucket B (4 FKs CASCADE):** approved as recommended; `session_attendees.user_id` moved from Bucket B → Bucket A (now SET NULL) per operator preference to preserve attendance counts when a user is deleted
- **`businesses.owner_id`:** RESTRICT (force manual ownership transfer / business archival before user deletion)
- **`custom_kpis_library.business_id`:** CASCADE (mirror existing `business_id` FK convention)
- **Bucket C-3 placeholder:** not used; no FKs re-bucketed during operator review

---

## TL;DR — the audit was wrong about `businesses.id`

The 56 orphan-prone FKs surfaced by the 2026-04-28 codebase audit are **NOT** predominantly on `businesses.id` as the audit summary suggested. Every existing `business_id` FK already has `ON DELETE CASCADE` in `supabase/migrations/00000000000000_baseline_schema.sql`. The actual breakdown — verified by `grep -nE "ADD CONSTRAINT .* FOREIGN KEY" supabase/migrations/00000000000000_baseline_schema.sql | grep -v "ON DELETE"` against the live baseline — is:

| Bucket | Count | Behaviour | Triggers |
|--------|-------|-----------|----------|
| **A — SET NULL** | 50 | Audit / attribution FKs | Deleting a user (coach, owner, team member) preserves the dependent record with the FK column nulled |
| **B — CASCADE** | 4 | Tightly-coupled children | Deleting the parent (process diagram, process step) deletes the child |
| **C — RESTRICT / manual** | 2 | Sole-relationship / dual-id / load-bearing FKs | Deletion blocked or requires manual product judgement |
| **Total** | **56** | | |

**Implication for testing.** The DB-04 preview-branch tests (49-04 through 49-07) seed an `auth.users` row, populate dependent records across multiple tables, then call `supabase.auth.admin.deleteUser` and assert each FK column is NULL (Bucket A), the row is gone (Bucket B), or the deletion was blocked (Bucket C — RESTRICT only). **Delete a test USER, not a test business.**

> **Note on baseline line numbers.** Cited line numbers below refer to `supabase/migrations/00000000000000_baseline_schema.sql`. RESEARCH.md DB-03 enumerated all 56 FKs from that file via `grep -nE`; this doc carries the enumeration forward verbatim. Spot-checks against the live baseline at the time of authoring confirmed every line cite within ±2 lines.

---

## Principles

These five principles are binding for all future schema authors. New migrations MUST include an explicit `ON DELETE` clause; the principle determines which clause.

1. **`business_id` → `businesses.id` always `CASCADE`.** Established convention; every existing `business_id` FK in `baseline_schema.sql` already follows this. New tables MUST.
2. **`*_by`, `*_id` → `auth.users.id` (audit attribution) → `SET NULL`.** Records survive user deletion; the attribution is nulled. This protects audit trails (a coach leaving must not erase their historical work).
3. **Owner / sole-relationship FKs → `RESTRICT`.** When a user IS the primary owner of a record (e.g., `businesses.owner_id`), block the deletion until ownership is transferred or the dependent is archived.
4. **Tightly-coupled child tables → `CASCADE`.** Tables that have NO meaning without their parent (process_flows without process_diagrams, forecast lines without forecasts) cascade. The test: "would a `SELECT` on this child table without the parent make any sense?"
5. **Self-references → `SET NULL`.** Self-FKs (`parent_task_id`, `carried_from_item_id`) preserve the child while losing the ancestry pointer.

---

## Bucket A — SET NULL (50 FKs)

Audit / attribution FKs. When the user is deleted, the dependent record is preserved with the FK column nulled.

The `Status` column tracks per-FK lifecycle: `proposed` → `approved` (after Matt signs off this doc) → `applied:<migration-filename>` (after the corresponding 49-04/05 migration ships).

| # | Source `table.column` | Referenced | Baseline line | Recommended ON DELETE | Justification | Sign-off | Status |
|---|----------------------|------------|---------------|----------------------|---------------|----------|--------|
| 1 | `action_items.assigned_to` | `auth.users.id` | 8445 | SET NULL | Action item survives user deletion; assignee becomes "unassigned" | [x] | approved |
| 2 | `action_items.created_by` | `auth.users.id` | 8455 | SET NULL | Same — preserve action item, lose creator attribution | [x] | approved |
| 3 | `business_financial_goals.user_id` | `auth.users.id` | 8555 | SET NULL | Goal belongs to business; user attribution lost on deletion | [x] | approved |
| 4 | `business_kpis.user_id` | `auth.users.id` | 8560 | SET NULL | Same — KPI belongs to business | [x] | approved |
| 5 | `business_users.invited_by` | `auth.users.id` | 8590 | SET NULL | Membership record retained; inviter ref nulled | [x] | approved |
| 6 | `businesses.assigned_coach_id` | `auth.users.id` | 8600 | SET NULL | Business survives coach deletion (coach unassigned) | [x] | approved |
| 7 | `businesses.created_by` | `auth.users.id` | 8605 | SET NULL | Business creator may leave | [x] | approved |
| 8 | `chat_messages.sender_id` | `auth.users.id` | 8660 | SET NULL | Message history preserved | [x] | approved |
| 9 | `client_error_logs.user_id` | `auth.users.id` | 8665 | SET NULL | Error logs retained for diagnostics | [x] | approved |
| 10 | `client_invitations.invited_by` | `auth.users.id` | 8670 | SET NULL | Invite history retained | [x] | approved |
| 11 | `coach_audit_log.coach_id` | `auth.users.id` | 8680 | SET NULL | **AUDIT LOG — must preserve**; coach attribution nulled | [x] | approved |
| 12 | `coaching_sessions.coach_id` | `auth.users.id` | 8700 | SET NULL | Session history preserved | [x] | approved |
| 13 | `custom_kpis_library.approved_by` | `auth.users.id` | 8710 | SET NULL | KPI definition survives approver deletion | [x] | approved |
| 14 | `custom_kpis_library.created_by` | `auth.users.id` | 8720 | SET NULL | Same — KPI definition survives creator deletion | [x] | approved |
| 15 | `forecast_scenarios.created_by` | `auth.users.id` | 8875 | SET NULL | Scenario survives author deletion | [x] | approved |
| 16 | `forecasts.created_by` | `public.profiles.id` | 8910 | SET NULL | Note: → `profiles`, not `auth.users` (variant test pattern). Same logic — forecast survives. | [x] | approved |
| 17 | `ideas_filter.evaluated_by` | `auth.users.id` | 8930 | SET NULL | Idea filter result preserved | [x] | approved |
| 18 | `messages.recipient_id` | `auth.users.id` | 9025 | SET NULL | Both sides preserved | [x] | approved |
| 19 | `messages.sender_id` | `auth.users.id` | 9030 | SET NULL | Same | [x] | approved |
| 20 | `monthly_reviews.created_by` | `auth.users.id` | 9060 | SET NULL | Review preserved | [x] | approved |
| 21 | `process_comments.commented_by` | `auth.users.id` | 9100 | SET NULL | Comment preserved | [x] | approved |
| 22 | `process_comments.commented_to` | `auth.users.id` | 9105 | SET NULL | Same | [x] | approved |
| 23 | `roadmap_completions.user_id` | `public.profiles.id` | 9230 | SET NULL | Note: → `profiles`. Completion record preserved | [x] | approved |
| 24 | `session_actions.created_by` | `auth.users.id` | 9255 | SET NULL | Session action preserved | [x] | approved |
| 25 | `session_attendees.added_by` | `auth.users.id` | 9275 | SET NULL | Attendance record preserved (note: `session_attendees.user_id` is in Bucket B — different semantics) | [x] | approved |
| 26 | `session_notes.coach_id` | `auth.users.id` | 9295 | SET NULL | Notes preserved | [x] | approved |
| 27 | `session_prep.client_id` | `auth.users.id` | 9305 | SET NULL | Prep preserved | [x] | approved |
| 28 | `sessions.coach_id` | `auth.users.id` | 9325 | SET NULL | Session preserved | [x] | approved |
| 29 | `shared_documents.uploaded_by` | `auth.users.id` | 9335 | SET NULL | Doc preserved | [x] | approved |
| 30 | `sprint_actions.user_id` | `auth.users.id` | 9340 | SET NULL | Sprint history preserved | [x] | approved |
| 31 | `sprint_key_actions.user_id` | `auth.users.id` | 9345 | SET NULL | Same | [x] | approved |
| 32 | `strategic_initiatives.user_id` | `auth.users.id` | 9415 | SET NULL | Initiative preserved | [x] | approved |
| 33 | `strategic_todos.created_by` | `auth.users.id` | 9440 | SET NULL | Todo preserved | [x] | approved |
| 34 | `strategic_todos.owner_id` | `auth.users.id` | 9445 | SET NULL | Owner unassigned on deletion (NB: this is `strategic_todos.owner_id`, NOT `businesses.owner_id` — see Bucket C-1 for the latter) | [x] | approved |
| 35 | `system_roles.created_by` | `auth.users.id` | 9550 | SET NULL | Role assignment audit preserved | [x] | approved |
| 36 | `team_invites.accepted_by` | `auth.users.id` | 9570 | SET NULL | Invite history preserved | [x] | approved |
| 37 | `team_invites.invited_by` | `auth.users.id` | 9580 | SET NULL | Same | [x] | approved |
| 38 | `todo_items.created_by` | `auth.users.id` | 9590 | SET NULL | Todo preserved | [x] | approved |
| 39 | `user_roles.granted_by` | `auth.users.id` | 9640 | SET NULL | **AUDIT LOG — must preserve** | [x] | approved |
| 40 | `weekly_checkins.created_by` | `auth.users.id` | 9675 | SET NULL | Check-in preserved | [x] | approved |
| 41 | `annual_snapshots.q1_snapshot_id` | `quarterly_snapshots.id` | 8495 | SET NULL | Annual snapshot survives quarterly deletion; q-pointer nulled. **Variant test:** create OTHER parent (not user) — see RESEARCH.md DB-04 batch-2 notes. | [x] | approved |
| 42 | `annual_snapshots.q2_snapshot_id` | `quarterly_snapshots.id` | 8500 | SET NULL | Same | [x] | approved |
| 43 | `annual_snapshots.q3_snapshot_id` | `quarterly_snapshots.id` | 8505 | SET NULL | Same | [x] | approved |
| 44 | `annual_snapshots.q4_snapshot_id` | `quarterly_snapshots.id` | 8510 | SET NULL | Same | [x] | approved |
| 45 | `swot_items.carried_from_item_id` | `swot_items.id` | 9540 | SET NULL | **Self-FK** — preserve current item, lose ancestry pointer (Principle 5) | [x] | approved |
| 46 | `todo_items.parent_task_id` | `todo_items.id` | 9595 | SET NULL | **Self-FK** — child becomes top-level if parent deleted (Principle 5) | [x] | approved |
| 47 | `coach_benchmarks.source_interaction_id` | `ai_interactions.id` | 8690 | SET NULL | Benchmark loses source ref but is retained. **Variant test:** create OTHER parent. | [x] | approved |
| 48 | `monthly_report_settings.budget_forecast_id` | `financial_forecasts.id` | 9040 | SET NULL | Settings retained, forecast ref nulled. **Variant test:** create OTHER parent. | [x] | approved |
| 49 | `session_actions.strategic_initiative_id` | `strategic_initiatives.id` | 9270 | SET NULL | Action preserved, initiative ref nulled. **Variant test:** create OTHER parent. | [x] | approved |
| 50 | `session_attendees.user_id` | `auth.users.id` | 9285 | SET NULL | **Moved from Bucket B per operator decision 2026-05-04.** Preserve attendance counts when a user is deleted; the attendee row survives with `user_id = NULL`. | [x] | approved |

**Confidence (per RESEARCH.md):** HIGH. The pattern matches the established convention already in baseline (`audit_log_user_id_fkey ... ON DELETE SET NULL` at baseline:8545; `cfo_email_log.triggered_by ... ON DELETE SET NULL`; `cfo_report_status.approved_by ... ON DELETE SET NULL` at baseline:8645).

---

## Bucket B — CASCADE (4 FKs)

Tightly-coupled children that have no meaning without their parent. **CASCADE is irreversible if a delete fires in production** — these get the most thorough preview-branch testing in plan 49-06 (3 assertions per FK: cascade fires, unrelated rows survive, grandparent survives).

| # | Source `table.column` | Referenced | Baseline line | Recommended ON DELETE | Justification | Sign-off | Status |
|---|----------------------|------------|---------------|----------------------|---------------|----------|--------|
| 1 | `process_flows.from_step_id` | `process_steps.id` | 9130 | CASCADE | If a step is deleted, its inbound flow is nonsensical (a flow with no source step has no meaning) | [x] | approved |
| 2 | `process_flows.to_step_id` | `process_steps.id` | 9140 | CASCADE | Same — outbound flow nonsensical without target step | [x] | approved |
| 3 | `process_flows.process_id` | `process_diagrams.id` | 9135 | CASCADE | Diagram deleted → all its flows must go (no orphan flows pointing at deleted diagram) | [x] | approved |
| 4 | `process_phases.process_id` | `process_diagrams.id` | 9145 | CASCADE | Diagram deleted → all its phases must go | [x] | approved |

**Note (operator decision 2026-05-04):** `session_attendees.user_id` (originally proposed Bucket B with MEDIUM confidence) was moved to Bucket A SET NULL. Operator preference: preserve attendance counts when a user is deleted. The migration in plan 49-04 or 49-05 will SET NULL this FK, not CASCADE.

**Confidence (per RESEARCH.md):** HIGH for all four `process_*` FKs.

---

## Bucket C — RESTRICT or manual review (2 FKs + optional 3rd)

These require explicit product judgement. **Operator must decide each before plan 49-07 ships.**

### C-1: `businesses.owner_id` → `auth.users.id` (baseline:8610)

**The single highest-stakes FK in this phase.** Cascading existing `ON DELETE CASCADE` chains via `business_id` means deleting an owner could trigger destruction of forecasts, Xero sync state, monthly reports, and ~26 other child tables in one statement.

**Options** (verbatim from RESEARCH.md DB-03 Bucket C, line 307):

| Option | What happens when owner is deleted | Pros | Cons |
|--------|-----------------------------------|------|------|
| **CASCADE** | Business is deleted | Clean — no orphans | **Destructive.** A user-deletion event silently destroys a business and (via the existing `business_id` CASCADE chain) all 26 child tables of business data — forecasts, monthly reports, Xero sync state, everything. |
| **SET NULL** | Business survives with `owner_id = NULL` | Preserves audit trail | Business is orphaned; no clear UI/access semantics for an owner-less business. May confuse RLS policies that key off `owner_id`. |
| **RESTRICT** | User deletion is blocked | Forces manual ownership transfer or business archival before deletion | Adds a manual step to user deactivation; coach offboarding becomes a 2-step process. **Researcher recommendation.** |

**Researcher recommendation:** RESTRICT (force manual reassignment / archival before user deletion).

**Operator decision:** RESTRICT
**Reasoning:** Deleting a coaching client's account must NOT silently destroy their financial data (forecasts, monthly reports, Xero sync state). Orphaning the business via SET NULL creates ambiguous auth/RLS state. RESTRICT forces an explicit ownership-transfer or archival step — an admin must do the right thing.
**Sign-off date:** 2026-05-04

**Status:** approved

---

### C-2: `custom_kpis_library.business_id` → `business_profiles.id` (baseline:8715)

**Note:** this FK references `business_profiles` (the dual-id ambiguity from MEMORY.md `project_dual_id` — `businesses.id` vs `business_profiles.id`), NOT `businesses`. Researcher recommends CASCADE to mirror other `business_id` FKs (which all CASCADE), but flags for verification given the dual-id wrinkle — confirm that deleting a `business_profiles` row should destroy the custom KPI library entry, vs. preserving it (SET NULL) or blocking (RESTRICT).

**Researcher recommendation:** CASCADE (mirror existing `business_id` FK convention).

**Operator decision:** CASCADE
**Reasoning:** Mirror the existing `business_id` FK convention — every other `business_id` FK in the baseline already CASCADEs. Custom KPI library entries belong to their business; deleting the business should remove its KPI definitions.
**Sign-off date:** 2026-05-04

**Status:** approved

---

### C-3: (not used)

Slot reserved during 49-02 sign-off for any FK Matt re-buckets from A or B during review. **Not used** — operator review on 2026-05-04 did not surface any third C-item. Plan 49-07 ships with 2 Bucket C migrations.

**Status:** N/A — not used

---

## Process for new FKs (going forward)

Every new FK in a future migration MUST include an explicit `ON DELETE` clause. The CI migration-check step in `.github/workflows/supabase-preview.yml` will be tightened (separate follow-up phase) to reject FKs without an explicit `ON DELETE` clause for newly-added constraints.

The five Principles (above) are the decision tree:
1. Pointing at `businesses.id`? → `CASCADE`
2. Pointing at `auth.users.id` for attribution (`*_by`, `*_id`)? → `SET NULL`
3. Sole-relationship / ownership FK? → `RESTRICT`
4. Child-without-parent makes no sense? → `CASCADE`
5. Self-FK? → `SET NULL`

---

## How DB-04 plans cite this doc

Each migration in plans 49-04 / 49-05 / 49-06 / 49-07 MUST include a header `COMMENT` pointing to the row(s) of this doc it implements. Example:

```sql
-- Phase 49 DB-04: SET NULL on action_items.assigned_to FK.
-- Per docs/db/fk-policy.md Bucket A row #1.
-- Tested via src/__tests__/migrations/db-04-set-null-batch-1.test.ts.
```

After each DB-04 migration ships, the corresponding row in this doc moves from `proposed` → `approved` → `applied:<migration-filename>`. Plans 49-04 (Task 4), 49-05 (Task 4), 49-06 (Task 3), 49-07 (Task 4) are responsible for that update.

---

## Migration history (running log)

This section is appended to by every Phase 49 DB-04 plan as migrations land. Until 49-04 starts, this section is empty.

| Date | Migration filename | Bucket | FKs covered | Plan |
|------|-------------------|--------|-------------|------|
| _(none yet — Phase 49 in progress)_ | | | | |

---

## Sign-off

- [x] Matt confirms every Bucket A row's SET NULL recommendation is correct — approved as researcher recommended (2026-05-04).
- [x] Matt confirms every Bucket B row's CASCADE recommendation is correct — `session_attendees.user_id` moved B → A (SET NULL); 4 `process_*` FKs approved CASCADE (2026-05-04).
- [x] Matt records a decision for `businesses.owner_id` (Bucket C-1) — RESTRICT (2026-05-04).
- [x] Matt records a decision for `custom_kpis_library.business_id` (Bucket C-2) — CASCADE (2026-05-04).
- [x] Matt either fills in or removes Bucket C-3 (optional placeholder) — N/A; not used.
- [x] Doc Status changed from PROPOSED to ACTIVE 2026-05-04; plans 49-04..49-07 cleared to start.
