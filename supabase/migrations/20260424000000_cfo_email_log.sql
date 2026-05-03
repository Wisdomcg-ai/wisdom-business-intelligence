-- Phase 35 D-14: Append-only audit log of Resend email send attempts
CREATE TABLE IF NOT EXISTS "public"."cfo_email_log" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  "cfo_report_status_id" uuid NOT NULL REFERENCES "public"."cfo_report_status"(id) ON DELETE CASCADE,
  "business_id" uuid NOT NULL REFERENCES "public"."businesses"(id) ON DELETE CASCADE,
  "period_month" date NOT NULL,
  "attempted_at" timestamptz NOT NULL DEFAULT now(),
  "triggered_by" uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  "recipient_email" text NOT NULL,
  "resend_message_id" text,
  "status_code" integer,
  "error_message" text
);

CREATE INDEX "idx_cfo_email_log_business_period"
  ON "public"."cfo_email_log"(business_id, period_month);

ALTER TABLE "public"."cfo_email_log" ENABLE ROW LEVEL SECURITY;

-- Coach reads only their assigned-client rows (mirrors cfo_report_status pattern)
CREATE POLICY "cfo_email_log_coach_select"
  ON "public"."cfo_email_log" FOR SELECT
  TO authenticated
  USING (
    business_id IN (
      SELECT id FROM "public"."businesses" WHERE assigned_coach_id = auth.uid()
    )
  );

-- Super admin reads all
CREATE POLICY "cfo_email_log_super_admin_select"
  ON "public"."cfo_email_log" FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM "public"."system_roles"
      WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  );

-- Service role: full access (API routes write via service client)
CREATE POLICY "cfo_email_log_service_role_all"
  ON "public"."cfo_email_log"
  TO service_role
  USING (true)
  WITH CHECK (true);

-- NOTE: No INSERT / UPDATE / DELETE policies for `authenticated` role.
-- Append-only semantics enforced by absence of authenticated write policies.
-- All inserts happen via service_role from /api/cfo/report-status.

COMMENT ON TABLE "public"."cfo_email_log" IS
  'Phase 35 — append-only log of every Resend send attempt for a monthly CFO report. One row per attempt (success or failure).';
