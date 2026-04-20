-- ============================================================
-- Phase 34 Iteration 34.1 — Balance Sheet consolidation support
--
-- Creates xero_balance_sheet_lines storage (analogous to xero_pl_lines)
-- to back the consolidated Balance Sheet engine. The single-entity BS tab
-- remains a Xero live pass-through (/api/Xero/balance-sheet); the
-- consolidated path pulls from this new persisted table, one row per
-- (business_id, tenant_id, account_name).
--
-- Also adds a clarifying COMMENT on fx_rates.rate_type — 'monthly_average'
-- is consumed by the P&L consolidation engine; 'closing_spot' is consumed
-- by the new BS consolidation engine introduced in this iteration.
--
-- Idempotent: CREATE TABLE IF NOT EXISTS + DO $$ blocks guarded by
-- pg_policies/pg_indexes lookups.
-- ============================================================

-- ---------- fx_rates documentation ----------
COMMENT ON COLUMN "public"."fx_rates"."rate_type" IS
  '''monthly_average'' for P&L translation (Iteration 34.0); ''closing_spot'' for Balance Sheet translation (Iteration 34.1). Period stores first-of-month for monthly_average, month-end date for closing_spot.';

-- ---------- xero_balance_sheet_lines table ----------
CREATE TABLE IF NOT EXISTS "public"."xero_balance_sheet_lines" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "tenant_id" "text",
    "account_name" "text" NOT NULL,
    "account_code" "text",
    "account_type" "text" NOT NULL,
    "section" "text" DEFAULT ''::"text" NOT NULL,
    "monthly_values" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "xero_balance_sheet_lines_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "xero_balance_sheet_lines_account_type_check"
      CHECK (("account_type" = ANY (ARRAY['asset'::"text", 'liability'::"text", 'equity'::"text"])))
);

ALTER TABLE "public"."xero_balance_sheet_lines" OWNER TO "postgres";

-- Foreign key to businesses — mirror xero_pl_lines pattern (cascade on delete)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'xero_balance_sheet_lines_business_id_fkey'
  ) THEN
    ALTER TABLE "public"."xero_balance_sheet_lines"
      ADD CONSTRAINT "xero_balance_sheet_lines_business_id_fkey"
      FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;
  END IF;
END $$;

-- Indexes: business_id filter, tenant_id filter (for consolidation grouping)
CREATE INDEX IF NOT EXISTS "xero_balance_sheet_lines_business_idx"
  ON "public"."xero_balance_sheet_lines" USING "btree" ("business_id");

CREATE INDEX IF NOT EXISTS "xero_balance_sheet_lines_business_tenant_idx"
  ON "public"."xero_balance_sheet_lines" USING "btree" ("business_id", "tenant_id");

-- Updated-at trigger (reuse the generic updater if present, otherwise create an inline one)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'update_xero_balance_sheet_lines_updated_at'
  ) THEN
    CREATE OR REPLACE FUNCTION "public"."update_xero_balance_sheet_lines_updated_at"()
      RETURNS "trigger"
      LANGUAGE "plpgsql"
      AS $fn$
      BEGIN
        NEW.updated_at = now();
        RETURN NEW;
      END;
      $fn$;
  END IF;
END $$;

DROP TRIGGER IF EXISTS "xero_balance_sheet_lines_updated_at"
  ON "public"."xero_balance_sheet_lines";
CREATE TRIGGER "xero_balance_sheet_lines_updated_at"
  BEFORE UPDATE ON "public"."xero_balance_sheet_lines"
  FOR EACH ROW
  EXECUTE FUNCTION "public"."update_xero_balance_sheet_lines_updated_at"();

-- ---------- RLS (trifecta: coach, service_role, super_admin) ----------
ALTER TABLE "public"."xero_balance_sheet_lines" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'xero_balance_sheet_lines'
      AND policyname = 'xero_balance_sheet_lines_coach_all'
  ) THEN
    CREATE POLICY "xero_balance_sheet_lines_coach_all"
      ON "public"."xero_balance_sheet_lines"
      USING (EXISTS (
        SELECT 1 FROM "public"."businesses" "b"
        WHERE "b"."id" = "xero_balance_sheet_lines"."business_id"
          AND ("b"."owner_id" = "auth"."uid"() OR "b"."assigned_coach_id" = "auth"."uid"())
      ));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'xero_balance_sheet_lines'
      AND policyname = 'xero_balance_sheet_lines_service_role'
  ) THEN
    CREATE POLICY "xero_balance_sheet_lines_service_role"
      ON "public"."xero_balance_sheet_lines"
      USING ("auth"."role"() = 'service_role'::"text")
      WITH CHECK ("auth"."role"() = 'service_role'::"text");
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'xero_balance_sheet_lines'
      AND policyname = 'xero_balance_sheet_lines_super_admin_all'
  ) THEN
    CREATE POLICY "xero_balance_sheet_lines_super_admin_all"
      ON "public"."xero_balance_sheet_lines"
      USING (EXISTS (
        SELECT 1 FROM "public"."system_roles"
        WHERE "system_roles"."user_id" = "auth"."uid"()
          AND "system_roles"."role" = 'super_admin'::"text"
      ));
  END IF;
END $$;

-- Grants — match xero_pl_lines access pattern
GRANT ALL ON TABLE "public"."xero_balance_sheet_lines" TO "anon";
GRANT ALL ON TABLE "public"."xero_balance_sheet_lines" TO "authenticated";
GRANT ALL ON TABLE "public"."xero_balance_sheet_lines" TO "service_role";
