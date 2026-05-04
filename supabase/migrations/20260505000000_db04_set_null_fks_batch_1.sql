-- ============================================================================
-- Phase 49 DB-04: SET NULL on Bucket A audit-attribution FKs (batch 1 of 2)
-- ============================================================================
-- Per docs/db/fk-policy.md Bucket A rows 1-24 (operator sign-off Matt 2026-05-04).
--
-- The 2026-04-28 codebase audit Section D #1 surfaced 56 FKs without ON DELETE
-- clauses. RESEARCH.md DB-03 confirmed ~77% reference auth.users.id (audit
-- attribution: who created/assigned/sent/approved X), NOT businesses.id as
-- the audit summary suggested. Bucket A applies SET NULL to preserve the
-- record while nulling the user attribution when a coach/user is deleted.
--
-- Pattern: DROP CONSTRAINT IF EXISTS + ADD CONSTRAINT (PostgreSQL does not
-- support ALTER CONSTRAINT … SET ON DELETE). Atomic in this migration's
-- transaction.
--
-- NOT NULL relaxation (deviation per .planning/phases/49-database-integrity-hygiene/
-- 49-04-DEVIATION.md): 6 of the 24 columns are declared NOT NULL in baseline.
-- ON DELETE SET NULL on a NOT NULL column would fail at delete time with a
-- not-null violation, leaving the policy decision decorative. This migration
-- relaxes NOT NULL on those 6 columns as part of the same transaction. The
-- columns are: chat_messages.sender_id, client_invitations.invited_by,
-- coach_audit_log.coach_id, coaching_sessions.coach_id,
-- custom_kpis_library.created_by, process_comments.commented_by.
--
-- Tested via src/__tests__/migrations/db-04-set-null-batch-1.test.ts:
-- each FK has a paired test that creates a user, inserts a dependent row,
-- deletes the user, and asserts the FK column becomes NULL.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- action_items (rows #1, #2)
-- ----------------------------------------------------------------------------
-- Per docs/db/fk-policy.md Bucket A row #1
ALTER TABLE "public"."action_items"
  DROP CONSTRAINT IF EXISTS "action_items_assigned_to_fkey";
ALTER TABLE "public"."action_items"
  ADD  CONSTRAINT "action_items_assigned_to_fkey"
       FOREIGN KEY ("assigned_to") REFERENCES "auth"."users"("id")
       ON DELETE SET NULL;

-- Per docs/db/fk-policy.md Bucket A row #2
ALTER TABLE "public"."action_items"
  DROP CONSTRAINT IF EXISTS "action_items_created_by_fkey";
ALTER TABLE "public"."action_items"
  ADD  CONSTRAINT "action_items_created_by_fkey"
       FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id")
       ON DELETE SET NULL;

-- ----------------------------------------------------------------------------
-- business_financial_goals (row #3)
-- ----------------------------------------------------------------------------
-- Per docs/db/fk-policy.md Bucket A row #3
ALTER TABLE "public"."business_financial_goals"
  DROP CONSTRAINT IF EXISTS "business_financial_goals_user_id_fkey";
ALTER TABLE "public"."business_financial_goals"
  ADD  CONSTRAINT "business_financial_goals_user_id_fkey"
       FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id")
       ON DELETE SET NULL;

-- ----------------------------------------------------------------------------
-- business_kpis (row #4) — NOT NULL relaxed (see header)
-- ----------------------------------------------------------------------------
-- Per docs/db/fk-policy.md Bucket A row #4
ALTER TABLE "public"."business_kpis"
  ALTER COLUMN "user_id" DROP NOT NULL;
ALTER TABLE "public"."business_kpis"
  DROP CONSTRAINT IF EXISTS "business_kpis_user_id_fkey";
ALTER TABLE "public"."business_kpis"
  ADD  CONSTRAINT "business_kpis_user_id_fkey"
       FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id")
       ON DELETE SET NULL;

-- ----------------------------------------------------------------------------
-- business_users (row #5)
-- ----------------------------------------------------------------------------
-- Per docs/db/fk-policy.md Bucket A row #5
ALTER TABLE "public"."business_users"
  DROP CONSTRAINT IF EXISTS "business_users_invited_by_fkey";
ALTER TABLE "public"."business_users"
  ADD  CONSTRAINT "business_users_invited_by_fkey"
       FOREIGN KEY ("invited_by") REFERENCES "auth"."users"("id")
       ON DELETE SET NULL;

-- ----------------------------------------------------------------------------
-- businesses (rows #6, #7)
-- ----------------------------------------------------------------------------
-- Per docs/db/fk-policy.md Bucket A row #6
ALTER TABLE "public"."businesses"
  DROP CONSTRAINT IF EXISTS "businesses_assigned_coach_id_fkey";
ALTER TABLE "public"."businesses"
  ADD  CONSTRAINT "businesses_assigned_coach_id_fkey"
       FOREIGN KEY ("assigned_coach_id") REFERENCES "auth"."users"("id")
       ON DELETE SET NULL;

-- Per docs/db/fk-policy.md Bucket A row #7
ALTER TABLE "public"."businesses"
  DROP CONSTRAINT IF EXISTS "businesses_created_by_fkey";
ALTER TABLE "public"."businesses"
  ADD  CONSTRAINT "businesses_created_by_fkey"
       FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id")
       ON DELETE SET NULL;

-- ----------------------------------------------------------------------------
-- chat_messages (row #8) — NOT NULL relaxed (see header)
-- ----------------------------------------------------------------------------
-- Per docs/db/fk-policy.md Bucket A row #8
ALTER TABLE "public"."chat_messages"
  ALTER COLUMN "sender_id" DROP NOT NULL;
ALTER TABLE "public"."chat_messages"
  DROP CONSTRAINT IF EXISTS "chat_messages_sender_id_fkey";
ALTER TABLE "public"."chat_messages"
  ADD  CONSTRAINT "chat_messages_sender_id_fkey"
       FOREIGN KEY ("sender_id") REFERENCES "auth"."users"("id")
       ON DELETE SET NULL;

-- ----------------------------------------------------------------------------
-- client_error_logs (row #9)
-- ----------------------------------------------------------------------------
-- Per docs/db/fk-policy.md Bucket A row #9
ALTER TABLE "public"."client_error_logs"
  DROP CONSTRAINT IF EXISTS "client_error_logs_user_id_fkey";
ALTER TABLE "public"."client_error_logs"
  ADD  CONSTRAINT "client_error_logs_user_id_fkey"
       FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id")
       ON DELETE SET NULL;

-- ----------------------------------------------------------------------------
-- client_invitations (row #10) — NOT NULL relaxed (see header)
-- ----------------------------------------------------------------------------
-- Per docs/db/fk-policy.md Bucket A row #10
ALTER TABLE "public"."client_invitations"
  ALTER COLUMN "invited_by" DROP NOT NULL;
ALTER TABLE "public"."client_invitations"
  DROP CONSTRAINT IF EXISTS "client_invitations_invited_by_fkey";
ALTER TABLE "public"."client_invitations"
  ADD  CONSTRAINT "client_invitations_invited_by_fkey"
       FOREIGN KEY ("invited_by") REFERENCES "auth"."users"("id")
       ON DELETE SET NULL;

-- ----------------------------------------------------------------------------
-- coach_audit_log (row #11) — NOT NULL relaxed; AUDIT LOG must preserve
-- ----------------------------------------------------------------------------
-- Per docs/db/fk-policy.md Bucket A row #11
ALTER TABLE "public"."coach_audit_log"
  ALTER COLUMN "coach_id" DROP NOT NULL;
ALTER TABLE "public"."coach_audit_log"
  DROP CONSTRAINT IF EXISTS "coach_audit_log_coach_id_fkey";
ALTER TABLE "public"."coach_audit_log"
  ADD  CONSTRAINT "coach_audit_log_coach_id_fkey"
       FOREIGN KEY ("coach_id") REFERENCES "auth"."users"("id")
       ON DELETE SET NULL;

-- ----------------------------------------------------------------------------
-- coach_benchmarks (row #12) — non-auth.users variant (→ ai_interactions)
-- ----------------------------------------------------------------------------
-- Per docs/db/fk-policy.md Bucket A row #12
ALTER TABLE "public"."coach_benchmarks"
  DROP CONSTRAINT IF EXISTS "coach_benchmarks_source_interaction_id_fkey";
ALTER TABLE "public"."coach_benchmarks"
  ADD  CONSTRAINT "coach_benchmarks_source_interaction_id_fkey"
       FOREIGN KEY ("source_interaction_id") REFERENCES "public"."ai_interactions"("id")
       ON DELETE SET NULL;

-- ----------------------------------------------------------------------------
-- coaching_sessions (row #13) — NOT NULL relaxed (see header)
-- ----------------------------------------------------------------------------
-- Per docs/db/fk-policy.md Bucket A row #13
ALTER TABLE "public"."coaching_sessions"
  ALTER COLUMN "coach_id" DROP NOT NULL;
ALTER TABLE "public"."coaching_sessions"
  DROP CONSTRAINT IF EXISTS "coaching_sessions_coach_id_fkey";
ALTER TABLE "public"."coaching_sessions"
  ADD  CONSTRAINT "coaching_sessions_coach_id_fkey"
       FOREIGN KEY ("coach_id") REFERENCES "auth"."users"("id")
       ON DELETE SET NULL;

-- ----------------------------------------------------------------------------
-- custom_kpis_library (rows #14, #15) — created_by NOT NULL relaxed
-- ----------------------------------------------------------------------------
-- Per docs/db/fk-policy.md Bucket A row #14
ALTER TABLE "public"."custom_kpis_library"
  DROP CONSTRAINT IF EXISTS "custom_kpis_library_approved_by_fkey";
ALTER TABLE "public"."custom_kpis_library"
  ADD  CONSTRAINT "custom_kpis_library_approved_by_fkey"
       FOREIGN KEY ("approved_by") REFERENCES "auth"."users"("id")
       ON DELETE SET NULL;

-- Per docs/db/fk-policy.md Bucket A row #15
ALTER TABLE "public"."custom_kpis_library"
  ALTER COLUMN "created_by" DROP NOT NULL;
ALTER TABLE "public"."custom_kpis_library"
  DROP CONSTRAINT IF EXISTS "custom_kpis_library_created_by_fkey";
ALTER TABLE "public"."custom_kpis_library"
  ADD  CONSTRAINT "custom_kpis_library_created_by_fkey"
       FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id")
       ON DELETE SET NULL;

-- ----------------------------------------------------------------------------
-- forecast_scenarios (row #16)
-- ----------------------------------------------------------------------------
-- Per docs/db/fk-policy.md Bucket A row #16
ALTER TABLE "public"."forecast_scenarios"
  DROP CONSTRAINT IF EXISTS "forecast_scenarios_created_by_fkey";
ALTER TABLE "public"."forecast_scenarios"
  ADD  CONSTRAINT "forecast_scenarios_created_by_fkey"
       FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id")
       ON DELETE SET NULL;

-- ----------------------------------------------------------------------------
-- forecasts (row #17) — non-auth.users variant (→ public.profiles)
-- ----------------------------------------------------------------------------
-- Per docs/db/fk-policy.md Bucket A row #17
ALTER TABLE "public"."forecasts"
  DROP CONSTRAINT IF EXISTS "forecasts_created_by_fkey";
ALTER TABLE "public"."forecasts"
  ADD  CONSTRAINT "forecasts_created_by_fkey"
       FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id")
       ON DELETE SET NULL;

-- ----------------------------------------------------------------------------
-- ideas_filter (row #18)
-- ----------------------------------------------------------------------------
-- Per docs/db/fk-policy.md Bucket A row #18
ALTER TABLE "public"."ideas_filter"
  DROP CONSTRAINT IF EXISTS "ideas_filter_evaluated_by_fkey";
ALTER TABLE "public"."ideas_filter"
  ADD  CONSTRAINT "ideas_filter_evaluated_by_fkey"
       FOREIGN KEY ("evaluated_by") REFERENCES "auth"."users"("id")
       ON DELETE SET NULL;

-- ----------------------------------------------------------------------------
-- messages (rows #19, #20)
-- ----------------------------------------------------------------------------
-- Per docs/db/fk-policy.md Bucket A row #19
ALTER TABLE "public"."messages"
  DROP CONSTRAINT IF EXISTS "messages_recipient_id_fkey";
ALTER TABLE "public"."messages"
  ADD  CONSTRAINT "messages_recipient_id_fkey"
       FOREIGN KEY ("recipient_id") REFERENCES "auth"."users"("id")
       ON DELETE SET NULL;

-- Per docs/db/fk-policy.md Bucket A row #20
ALTER TABLE "public"."messages"
  DROP CONSTRAINT IF EXISTS "messages_sender_id_fkey";
ALTER TABLE "public"."messages"
  ADD  CONSTRAINT "messages_sender_id_fkey"
       FOREIGN KEY ("sender_id") REFERENCES "auth"."users"("id")
       ON DELETE SET NULL;

-- ----------------------------------------------------------------------------
-- monthly_report_settings (row #21) — non-auth.users variant (→ financial_forecasts)
-- ----------------------------------------------------------------------------
-- Per docs/db/fk-policy.md Bucket A row #21
ALTER TABLE "public"."monthly_report_settings"
  DROP CONSTRAINT IF EXISTS "monthly_report_settings_budget_forecast_id_fkey";
ALTER TABLE "public"."monthly_report_settings"
  ADD  CONSTRAINT "monthly_report_settings_budget_forecast_id_fkey"
       FOREIGN KEY ("budget_forecast_id") REFERENCES "public"."financial_forecasts"("id")
       ON DELETE SET NULL;

-- ----------------------------------------------------------------------------
-- monthly_reviews (row #22)
-- ----------------------------------------------------------------------------
-- Per docs/db/fk-policy.md Bucket A row #22
ALTER TABLE "public"."monthly_reviews"
  DROP CONSTRAINT IF EXISTS "monthly_reviews_created_by_fkey";
ALTER TABLE "public"."monthly_reviews"
  ADD  CONSTRAINT "monthly_reviews_created_by_fkey"
       FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id")
       ON DELETE SET NULL;

-- ----------------------------------------------------------------------------
-- process_comments (rows #23, #24) — commented_by NOT NULL relaxed
-- ----------------------------------------------------------------------------
-- Per docs/db/fk-policy.md Bucket A row #23
ALTER TABLE "public"."process_comments"
  ALTER COLUMN "commented_by" DROP NOT NULL;
ALTER TABLE "public"."process_comments"
  DROP CONSTRAINT IF EXISTS "process_comments_commented_by_fkey";
ALTER TABLE "public"."process_comments"
  ADD  CONSTRAINT "process_comments_commented_by_fkey"
       FOREIGN KEY ("commented_by") REFERENCES "auth"."users"("id")
       ON DELETE SET NULL;

-- Per docs/db/fk-policy.md Bucket A row #24
ALTER TABLE "public"."process_comments"
  DROP CONSTRAINT IF EXISTS "process_comments_commented_to_fkey";
ALTER TABLE "public"."process_comments"
  ADD  CONSTRAINT "process_comments_commented_to_fkey"
       FOREIGN KEY ("commented_to") REFERENCES "auth"."users"("id")
       ON DELETE SET NULL;

COMMIT;
