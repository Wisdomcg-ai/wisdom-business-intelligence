-- ============================================================================
-- Phase 49 DB-04: SET NULL on Bucket A FKs (batch 2 of 2)
-- ============================================================================
-- Per docs/db/fk-policy.md Bucket A rows 23-46 + 49-50 (operator sign-off
-- Matt 2026-05-04). Completes Bucket A coverage — after this migration, all
-- 50 SET NULL FKs are converted (24 from 49-04 batch 1 + 26 from 49-05 batch 2).
--
-- This batch includes 6 non-auth.users FKs (variant test patterns):
--   - roadmap_completions.user_id → public.profiles.id
--   - session_actions.strategic_initiative_id → strategic_initiatives.id
--   - annual_snapshots.q[1-4]_snapshot_id → quarterly_snapshots.id (×4)
--   - swot_items.carried_from_item_id → swot_items.id (self-FK)
--   - todo_items.parent_task_id → todo_items.id (self-FK)
--
-- Pattern: DROP CONSTRAINT IF EXISTS + ADD CONSTRAINT (PostgreSQL does not
-- support ALTER CONSTRAINT … SET ON DELETE). Atomic in this migration's
-- transaction.
--
-- NOT NULL relaxation (deviation pattern continued from 49-04): 8 of the 26
-- columns are declared NOT NULL in baseline. ON DELETE SET NULL on a NOT NULL
-- column would fail at delete time with a not-null violation, leaving the
-- policy decision decorative. This migration relaxes NOT NULL on those 8
-- columns as part of the same transaction. The columns are:
--   roadmap_completions.user_id, session_actions.created_by,
--   session_attendees.user_id, session_notes.coach_id,
--   shared_documents.uploaded_by, sprint_actions.user_id,
--   strategic_initiatives.user_id, todo_items.created_by.
--
-- Tested via src/__tests__/migrations/db-04-set-null-batch-2.test.ts.
--
-- After this migration ships, RESEARCH.md Sentinel 1 (count of NO ACTION
-- FKs in information_schema.referential_constraints) drops by ~26 from the
-- post-49-04 state, and ~50 from the pre-Phase-49 baseline.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- roadmap_completions (row #23) — variant: → profiles; NOT NULL relaxed
-- ----------------------------------------------------------------------------
-- Per docs/db/fk-policy.md Bucket A row #23
ALTER TABLE "public"."roadmap_completions"
  ALTER COLUMN "user_id" DROP NOT NULL;
ALTER TABLE "public"."roadmap_completions"
  DROP CONSTRAINT IF EXISTS "roadmap_completions_user_id_fkey";
ALTER TABLE "public"."roadmap_completions"
  ADD  CONSTRAINT "roadmap_completions_user_id_fkey"
       FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id")
       ON DELETE SET NULL;

-- ----------------------------------------------------------------------------
-- session_actions (rows #24, #49) — created_by NOT NULL relaxed
-- ----------------------------------------------------------------------------
-- Per docs/db/fk-policy.md Bucket A row #24
ALTER TABLE "public"."session_actions"
  ALTER COLUMN "created_by" DROP NOT NULL;
ALTER TABLE "public"."session_actions"
  DROP CONSTRAINT IF EXISTS "session_actions_created_by_fkey";
ALTER TABLE "public"."session_actions"
  ADD  CONSTRAINT "session_actions_created_by_fkey"
       FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id")
       ON DELETE SET NULL;

-- Per docs/db/fk-policy.md Bucket A row #49 (variant: → strategic_initiatives)
ALTER TABLE "public"."session_actions"
  DROP CONSTRAINT IF EXISTS "session_actions_strategic_initiative_id_fkey";
ALTER TABLE "public"."session_actions"
  ADD  CONSTRAINT "session_actions_strategic_initiative_id_fkey"
       FOREIGN KEY ("strategic_initiative_id") REFERENCES "public"."strategic_initiatives"("id")
       ON DELETE SET NULL;

-- ----------------------------------------------------------------------------
-- session_attendees (rows #25, #50) — user_id NOT NULL relaxed
-- ----------------------------------------------------------------------------
-- Per docs/db/fk-policy.md Bucket A row #25
ALTER TABLE "public"."session_attendees"
  DROP CONSTRAINT IF EXISTS "session_attendees_added_by_fkey";
ALTER TABLE "public"."session_attendees"
  ADD  CONSTRAINT "session_attendees_added_by_fkey"
       FOREIGN KEY ("added_by") REFERENCES "auth"."users"("id")
       ON DELETE SET NULL;

-- Per docs/db/fk-policy.md Bucket A row #50 (moved B → A per operator decision 2026-05-04)
ALTER TABLE "public"."session_attendees"
  ALTER COLUMN "user_id" DROP NOT NULL;
ALTER TABLE "public"."session_attendees"
  DROP CONSTRAINT IF EXISTS "session_attendees_user_id_fkey";
ALTER TABLE "public"."session_attendees"
  ADD  CONSTRAINT "session_attendees_user_id_fkey"
       FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id")
       ON DELETE SET NULL;

-- ----------------------------------------------------------------------------
-- session_notes (row #26) — coach_id NOT NULL relaxed
-- ----------------------------------------------------------------------------
-- Per docs/db/fk-policy.md Bucket A row #26
ALTER TABLE "public"."session_notes"
  ALTER COLUMN "coach_id" DROP NOT NULL;
ALTER TABLE "public"."session_notes"
  DROP CONSTRAINT IF EXISTS "session_notes_coach_id_fkey";
ALTER TABLE "public"."session_notes"
  ADD  CONSTRAINT "session_notes_coach_id_fkey"
       FOREIGN KEY ("coach_id") REFERENCES "auth"."users"("id")
       ON DELETE SET NULL;

-- ----------------------------------------------------------------------------
-- session_prep (row #27)
-- ----------------------------------------------------------------------------
-- Per docs/db/fk-policy.md Bucket A row #27
ALTER TABLE "public"."session_prep"
  DROP CONSTRAINT IF EXISTS "session_prep_client_id_fkey";
ALTER TABLE "public"."session_prep"
  ADD  CONSTRAINT "session_prep_client_id_fkey"
       FOREIGN KEY ("client_id") REFERENCES "auth"."users"("id")
       ON DELETE SET NULL;

-- ----------------------------------------------------------------------------
-- sessions (row #28)
-- ----------------------------------------------------------------------------
-- Per docs/db/fk-policy.md Bucket A row #28
ALTER TABLE "public"."sessions"
  DROP CONSTRAINT IF EXISTS "sessions_coach_id_fkey";
ALTER TABLE "public"."sessions"
  ADD  CONSTRAINT "sessions_coach_id_fkey"
       FOREIGN KEY ("coach_id") REFERENCES "auth"."users"("id")
       ON DELETE SET NULL;

-- ----------------------------------------------------------------------------
-- shared_documents (row #29) — uploaded_by NOT NULL relaxed
-- ----------------------------------------------------------------------------
-- Per docs/db/fk-policy.md Bucket A row #29
ALTER TABLE "public"."shared_documents"
  ALTER COLUMN "uploaded_by" DROP NOT NULL;
ALTER TABLE "public"."shared_documents"
  DROP CONSTRAINT IF EXISTS "shared_documents_uploaded_by_fkey";
ALTER TABLE "public"."shared_documents"
  ADD  CONSTRAINT "shared_documents_uploaded_by_fkey"
       FOREIGN KEY ("uploaded_by") REFERENCES "auth"."users"("id")
       ON DELETE SET NULL;

-- ----------------------------------------------------------------------------
-- sprint_actions (row #30) — user_id NOT NULL relaxed
-- ----------------------------------------------------------------------------
-- Per docs/db/fk-policy.md Bucket A row #30
ALTER TABLE "public"."sprint_actions"
  ALTER COLUMN "user_id" DROP NOT NULL;
ALTER TABLE "public"."sprint_actions"
  DROP CONSTRAINT IF EXISTS "sprint_actions_user_id_fkey";
ALTER TABLE "public"."sprint_actions"
  ADD  CONSTRAINT "sprint_actions_user_id_fkey"
       FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id")
       ON DELETE SET NULL;

-- ----------------------------------------------------------------------------
-- sprint_key_actions (row #31)
-- ----------------------------------------------------------------------------
-- Per docs/db/fk-policy.md Bucket A row #31
ALTER TABLE "public"."sprint_key_actions"
  DROP CONSTRAINT IF EXISTS "sprint_key_actions_user_id_fkey";
ALTER TABLE "public"."sprint_key_actions"
  ADD  CONSTRAINT "sprint_key_actions_user_id_fkey"
       FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id")
       ON DELETE SET NULL;

-- ----------------------------------------------------------------------------
-- strategic_initiatives (row #32) — user_id NOT NULL relaxed
-- ----------------------------------------------------------------------------
-- Per docs/db/fk-policy.md Bucket A row #32
ALTER TABLE "public"."strategic_initiatives"
  ALTER COLUMN "user_id" DROP NOT NULL;
-- Orphan pre-clean: this FK was never enforced in production (the only
-- strategic_initiatives_user_id_fkey constraint lived on the *_backup table),
-- so user_id accumulated rows referencing deleted auth.users. The ADD
-- CONSTRAINT below validates existing rows and would abort on those orphans.
-- Nulling them is exactly what ON DELETE SET NULL would have done had the FK
-- been enforced. No-op on clean/fresh databases (forks, new tenants).
UPDATE "public"."strategic_initiatives" si
   SET "user_id" = NULL
 WHERE si."user_id" IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM "auth"."users" u WHERE u.id = si."user_id");
ALTER TABLE "public"."strategic_initiatives"
  DROP CONSTRAINT IF EXISTS "strategic_initiatives_user_id_fkey";
ALTER TABLE "public"."strategic_initiatives"
  ADD  CONSTRAINT "strategic_initiatives_user_id_fkey"
       FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id")
       ON DELETE SET NULL;

-- ----------------------------------------------------------------------------
-- strategic_todos (rows #33, #34)
-- ----------------------------------------------------------------------------
-- Per docs/db/fk-policy.md Bucket A row #33
ALTER TABLE "public"."strategic_todos"
  DROP CONSTRAINT IF EXISTS "strategic_todos_created_by_fkey";
ALTER TABLE "public"."strategic_todos"
  ADD  CONSTRAINT "strategic_todos_created_by_fkey"
       FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id")
       ON DELETE SET NULL;

-- Per docs/db/fk-policy.md Bucket A row #34
-- (NB: strategic_todos.owner_id, NOT businesses.owner_id — Bucket C-1 covers the latter)
ALTER TABLE "public"."strategic_todos"
  DROP CONSTRAINT IF EXISTS "strategic_todos_owner_id_fkey";
ALTER TABLE "public"."strategic_todos"
  ADD  CONSTRAINT "strategic_todos_owner_id_fkey"
       FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id")
       ON DELETE SET NULL;

-- ----------------------------------------------------------------------------
-- system_roles (row #35)
-- ----------------------------------------------------------------------------
-- Per docs/db/fk-policy.md Bucket A row #35
ALTER TABLE "public"."system_roles"
  DROP CONSTRAINT IF EXISTS "system_roles_created_by_fkey";
ALTER TABLE "public"."system_roles"
  ADD  CONSTRAINT "system_roles_created_by_fkey"
       FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id")
       ON DELETE SET NULL;

-- ----------------------------------------------------------------------------
-- team_invites (rows #36, #37)
-- ----------------------------------------------------------------------------
-- Per docs/db/fk-policy.md Bucket A row #36
ALTER TABLE "public"."team_invites"
  DROP CONSTRAINT IF EXISTS "team_invites_accepted_by_fkey";
ALTER TABLE "public"."team_invites"
  ADD  CONSTRAINT "team_invites_accepted_by_fkey"
       FOREIGN KEY ("accepted_by") REFERENCES "auth"."users"("id")
       ON DELETE SET NULL;

-- Per docs/db/fk-policy.md Bucket A row #37
ALTER TABLE "public"."team_invites"
  DROP CONSTRAINT IF EXISTS "team_invites_invited_by_fkey";
ALTER TABLE "public"."team_invites"
  ADD  CONSTRAINT "team_invites_invited_by_fkey"
       FOREIGN KEY ("invited_by") REFERENCES "auth"."users"("id")
       ON DELETE SET NULL;

-- ----------------------------------------------------------------------------
-- todo_items (rows #38, #46) — created_by NOT NULL relaxed; parent_task_id self-FK
-- ----------------------------------------------------------------------------
-- Per docs/db/fk-policy.md Bucket A row #38
ALTER TABLE "public"."todo_items"
  ALTER COLUMN "created_by" DROP NOT NULL;
ALTER TABLE "public"."todo_items"
  DROP CONSTRAINT IF EXISTS "todo_items_created_by_fkey";
ALTER TABLE "public"."todo_items"
  ADD  CONSTRAINT "todo_items_created_by_fkey"
       FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id")
       ON DELETE SET NULL;

-- Per docs/db/fk-policy.md Bucket A row #46 (self-FK, Principle 5)
ALTER TABLE "public"."todo_items"
  DROP CONSTRAINT IF EXISTS "todo_items_parent_task_id_fkey";
ALTER TABLE "public"."todo_items"
  ADD  CONSTRAINT "todo_items_parent_task_id_fkey"
       FOREIGN KEY ("parent_task_id") REFERENCES "public"."todo_items"("id")
       ON DELETE SET NULL;

-- ----------------------------------------------------------------------------
-- user_roles (row #39) — AUDIT LOG — must preserve
-- ----------------------------------------------------------------------------
-- Per docs/db/fk-policy.md Bucket A row #39
ALTER TABLE "public"."user_roles"
  DROP CONSTRAINT IF EXISTS "user_roles_granted_by_fkey";
ALTER TABLE "public"."user_roles"
  ADD  CONSTRAINT "user_roles_granted_by_fkey"
       FOREIGN KEY ("granted_by") REFERENCES "auth"."users"("id")
       ON DELETE SET NULL;

-- ----------------------------------------------------------------------------
-- weekly_checkins (row #40)
-- ----------------------------------------------------------------------------
-- Per docs/db/fk-policy.md Bucket A row #40
ALTER TABLE "public"."weekly_checkins"
  DROP CONSTRAINT IF EXISTS "weekly_checkins_created_by_fkey";
ALTER TABLE "public"."weekly_checkins"
  ADD  CONSTRAINT "weekly_checkins_created_by_fkey"
       FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id")
       ON DELETE SET NULL;

-- ----------------------------------------------------------------------------
-- annual_snapshots (rows #41-#44) — variant: → quarterly_snapshots
-- ----------------------------------------------------------------------------
-- Per docs/db/fk-policy.md Bucket A row #41
ALTER TABLE "public"."annual_snapshots"
  DROP CONSTRAINT IF EXISTS "annual_snapshots_q1_snapshot_id_fkey";
ALTER TABLE "public"."annual_snapshots"
  ADD  CONSTRAINT "annual_snapshots_q1_snapshot_id_fkey"
       FOREIGN KEY ("q1_snapshot_id") REFERENCES "public"."quarterly_snapshots"("id")
       ON DELETE SET NULL;

-- Per docs/db/fk-policy.md Bucket A row #42
ALTER TABLE "public"."annual_snapshots"
  DROP CONSTRAINT IF EXISTS "annual_snapshots_q2_snapshot_id_fkey";
ALTER TABLE "public"."annual_snapshots"
  ADD  CONSTRAINT "annual_snapshots_q2_snapshot_id_fkey"
       FOREIGN KEY ("q2_snapshot_id") REFERENCES "public"."quarterly_snapshots"("id")
       ON DELETE SET NULL;

-- Per docs/db/fk-policy.md Bucket A row #43
ALTER TABLE "public"."annual_snapshots"
  DROP CONSTRAINT IF EXISTS "annual_snapshots_q3_snapshot_id_fkey";
ALTER TABLE "public"."annual_snapshots"
  ADD  CONSTRAINT "annual_snapshots_q3_snapshot_id_fkey"
       FOREIGN KEY ("q3_snapshot_id") REFERENCES "public"."quarterly_snapshots"("id")
       ON DELETE SET NULL;

-- Per docs/db/fk-policy.md Bucket A row #44
ALTER TABLE "public"."annual_snapshots"
  DROP CONSTRAINT IF EXISTS "annual_snapshots_q4_snapshot_id_fkey";
ALTER TABLE "public"."annual_snapshots"
  ADD  CONSTRAINT "annual_snapshots_q4_snapshot_id_fkey"
       FOREIGN KEY ("q4_snapshot_id") REFERENCES "public"."quarterly_snapshots"("id")
       ON DELETE SET NULL;

-- ----------------------------------------------------------------------------
-- swot_items (row #45) — self-FK, Principle 5
-- ----------------------------------------------------------------------------
-- Per docs/db/fk-policy.md Bucket A row #45
ALTER TABLE "public"."swot_items"
  DROP CONSTRAINT IF EXISTS "swot_items_carried_from_item_id_fkey";
ALTER TABLE "public"."swot_items"
  ADD  CONSTRAINT "swot_items_carried_from_item_id_fkey"
       FOREIGN KEY ("carried_from_item_id") REFERENCES "public"."swot_items"("id")
       ON DELETE SET NULL;

COMMIT;
