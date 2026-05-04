-- ============================================================================
-- Phase 49 DB-04: CASCADE on Bucket B tightly-coupled child FKs (4 FKs)
-- ============================================================================
-- Per docs/db/fk-policy.md Bucket B (signed off by Matt 2026-05-04).
--
-- WHY CASCADE: each child row in this batch has NO meaning without its parent.
-- SET NULL would leave referential junk (a process_flow pointing at nothing
-- has no UX or business semantics); RESTRICT would block legitimate parent
-- deletes (a coach should be able to delete an obsolete process diagram
-- without first hand-removing each flow and phase).
--
-- The 4 FKs:
--
--   process_flows.from_step_id  → process_steps.id    (flow without source step)
--   process_flows.to_step_id    → process_steps.id    (flow without target step)
--   process_flows.process_id    → process_diagrams.id (flow without diagram)
--   process_phases.process_id   → process_diagrams.id (phase without diagram)
--
-- NOTE on Bucket B count: this is **4 FKs**, not the 5 the original 49-06
-- plan assumed. `session_attendees.user_id` was moved B → A per operator
-- decision 2026-05-04 (preserve attendance counts when a user is deleted)
-- and shipped in plan 49-05 batch 2 as ON DELETE SET NULL.
--
-- ─── IRREVERSIBILITY WARNING ────────────────────────────────────────────────
-- Once these CASCADEs are live, deleting a parent in production destroys the
-- children. Recovery requires a database backup. PR review confirmed:
--
--   (a) The cascade chain is bounded — preview-branch tests in
--       db-04-cascade-batch.test.ts assert grandparent rows (process_diagrams,
--       auth.users) survive and unrelated rows (flows in other diagrams,
--       phases in other diagrams) are unaffected.
--   (b) The parent tables (process_diagrams, process_steps) are NOT routinely
--       deleted in app code without explicit user intent. Deletion is a
--       deliberate coach action, not an automated cleanup pathway.
--   (c) Existing baseline cascades extend cleanly: process_diagrams.user_id
--       → auth.users CASCADE (baseline) and process_steps.process_id →
--       process_diagrams CASCADE (baseline) are unchanged. After this
--       migration, deleting a process_diagrams cascades to its steps
--       (baseline) AND to its flows + phases (this migration). Deleting a
--       process_steps cascades to its inbound + outbound flows (this
--       migration).
--
-- Pattern: DROP CONSTRAINT IF EXISTS + ADD CONSTRAINT (PostgreSQL does not
-- support ALTER CONSTRAINT … SET ON DELETE). Atomic in this migration's
-- transaction.
--
-- Tested via src/__tests__/migrations/db-04-cascade-batch.test.ts.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- process_flows.from_step_id → process_steps.id  (Bucket B row #1)
-- ----------------------------------------------------------------------------
-- Rationale: a process_flow whose source step has been deleted is a
-- referential dangler — the flow describes a transition starting from a
-- step that no longer exists. There is no UX (the diagram editor would draw
-- a flow from nowhere) and no business meaning. CASCADE removes the now-
-- meaningless flow when the source step is removed.
ALTER TABLE "public"."process_flows"
  DROP CONSTRAINT IF EXISTS "process_flows_from_step_id_fkey";
ALTER TABLE "public"."process_flows"
  ADD  CONSTRAINT "process_flows_from_step_id_fkey"
       FOREIGN KEY ("from_step_id") REFERENCES "public"."process_steps"("id")
       ON DELETE CASCADE;

-- ----------------------------------------------------------------------------
-- process_flows.to_step_id → process_steps.id  (Bucket B row #2)
-- ----------------------------------------------------------------------------
-- Rationale: mirror of from_step_id. A flow with a deleted target step is
-- equally meaningless — the diagram editor cannot render an arrow ending at
-- a non-existent step.
ALTER TABLE "public"."process_flows"
  DROP CONSTRAINT IF EXISTS "process_flows_to_step_id_fkey";
ALTER TABLE "public"."process_flows"
  ADD  CONSTRAINT "process_flows_to_step_id_fkey"
       FOREIGN KEY ("to_step_id") REFERENCES "public"."process_steps"("id")
       ON DELETE CASCADE;

-- ----------------------------------------------------------------------------
-- process_flows.process_id → process_diagrams.id  (Bucket B row #3)
-- ----------------------------------------------------------------------------
-- Rationale: a process_flow belongs to one specific process_diagram. When
-- the diagram is deleted, every flow that was part of it must be removed
-- atomically — the flow has no parent diagram to render against. This
-- CASCADE complements the existing baseline CASCADE on process_steps.
-- process_id; together, deleting a process_diagram now cleans up its full
-- structural tree (steps + flows + phases) in one operation.
ALTER TABLE "public"."process_flows"
  DROP CONSTRAINT IF EXISTS "process_flows_process_id_fkey";
ALTER TABLE "public"."process_flows"
  ADD  CONSTRAINT "process_flows_process_id_fkey"
       FOREIGN KEY ("process_id") REFERENCES "public"."process_diagrams"("id")
       ON DELETE CASCADE;

-- ----------------------------------------------------------------------------
-- process_phases.process_id → process_diagrams.id  (Bucket B row #4)
-- ----------------------------------------------------------------------------
-- Rationale: a process_phase is a structural element of one specific
-- diagram (a band/swimlane the steps are grouped under). A phase orphaned
-- from its diagram has no rendering context. Same reasoning as
-- process_flows.process_id; both belong to the diagram and must travel
-- with it.
ALTER TABLE "public"."process_phases"
  DROP CONSTRAINT IF EXISTS "process_phases_process_id_fkey";
ALTER TABLE "public"."process_phases"
  ADD  CONSTRAINT "process_phases_process_id_fkey"
       FOREIGN KEY ("process_id") REFERENCES "public"."process_diagrams"("id")
       ON DELETE CASCADE;

COMMIT;
