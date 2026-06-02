-- ============================================================================
-- R27 — deleted_records_archive: recoverable snapshot of hard-deleted records
-- ============================================================================
-- Destructive delete routes (forecast delete, super-admin client delete) hard
-- DELETE a parent row and let ON DELETE CASCADE wipe its child tables with no
-- recoverability. R27 adds an archive table: before a hard delete, the route
-- snapshots the parent row + all cascade-deleted child rows into `payload`, so a
-- deletion can be reconstructed without a full-database point-in-time restore.
--
-- This table holds deleted FINANCIAL data across tenants, so it is locked down:
-- only super_admin can read it; service_role writes it during the delete flow.
-- No regular authenticated/anon access.
--
-- Policy-only + one new table. Idempotent (IF NOT EXISTS + DROP POLICY IF EXISTS).
-- Studio-friendly (no DO blocks / BEGIN-COMMIT) for manual prod apply.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "public"."deleted_records_archive" (
  "id"          "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
  "entity_type" "text" NOT NULL,                 -- 'forecast' | 'business'
  "entity_id"   "text" NOT NULL,                 -- the deleted row's id (id-space agnostic → text)
  "business_id" "text",                          -- owning business, for scoping/audit (nullable)
  "deleted_by"  "uuid",                          -- actor; FK added below (SET NULL)
  "deleted_at"  timestamp with time zone DEFAULT "now"() NOT NULL,
  "payload"     "jsonb" NOT NULL,                -- { parent: {...}, children: { <table>: [...] } }
  "restored_at" timestamp with time zone,
  CONSTRAINT "deleted_records_archive_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "public"."deleted_records_archive"
  DROP CONSTRAINT IF EXISTS "deleted_records_archive_deleted_by_fkey";
ALTER TABLE "public"."deleted_records_archive"
  ADD  CONSTRAINT "deleted_records_archive_deleted_by_fkey"
       FOREIGN KEY ("deleted_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "idx_deleted_records_archive_entity"
  ON "public"."deleted_records_archive" ("entity_type", "entity_id");
CREATE INDEX IF NOT EXISTS "idx_deleted_records_archive_business"
  ON "public"."deleted_records_archive" ("business_id");
CREATE INDEX IF NOT EXISTS "idx_deleted_records_archive_deleted_at"
  ON "public"."deleted_records_archive" ("deleted_at");

ALTER TABLE "public"."deleted_records_archive" ENABLE ROW LEVEL SECURITY;

-- super_admin: full read/manage (the only human-visible access).
DROP POLICY IF EXISTS "deleted_records_archive_super_admin"
  ON "public"."deleted_records_archive";
CREATE POLICY "deleted_records_archive_super_admin"
  ON "public"."deleted_records_archive"
  FOR ALL
  USING ("public"."auth_is_super_admin"());

-- service_role: writes the snapshot during the delete flow.
DROP POLICY IF EXISTS "deleted_records_archive_service_role"
  ON "public"."deleted_records_archive";
CREATE POLICY "deleted_records_archive_service_role"
  ON "public"."deleted_records_archive"
  FOR ALL TO "service_role"
  USING (true) WITH CHECK (true);

COMMENT ON TABLE "public"."deleted_records_archive" IS
  'R27 — recoverable snapshots of hard-deleted records (forecast / business) and their cascade-deleted children. Written by service_role before a hard delete; readable only by super_admin. payload = { parent, children: { table: rows[] } }.';
