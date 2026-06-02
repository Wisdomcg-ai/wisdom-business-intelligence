-- ============================================================================
-- R27 — fk_children_of(): discover a table's FK children at runtime.
-- ============================================================================
-- The generic business-delete archive needs to snapshot EVERY table that
-- cascade-deletes when a business (or its business_profiles row) is deleted.
-- Hand-listing 57+ tables across the dual-ID system is brittle, so this function
-- returns, for a given parent table+column, each child table and the FK column
-- on it that references the parent. The archive helper calls this for
-- businesses(id) AND business_profiles(id), then snapshots each child by id.
--
-- SECURITY DEFINER (owned by postgres) so it can read information_schema;
-- EXECUTE granted only to service_role (used by the delete flow), never to
-- anon/authenticated. Read-only / STABLE. Single-column FKs only (all
-- businesses/business_profiles FKs are single-column).
--
-- Idempotent: CREATE OR REPLACE. Studio-friendly.
-- ============================================================================

CREATE OR REPLACE FUNCTION "public"."fk_children_of"(
  "parent_table" "text",
  "parent_column" "text"
)
RETURNS TABLE("child_table" "text", "child_column" "text")
LANGUAGE "sql"
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT tc.table_name::text  AS child_table,
         kcu.column_name::text AS child_column
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON kcu.constraint_name = tc.constraint_name
   AND kcu.constraint_schema = tc.constraint_schema
  JOIN information_schema.constraint_column_usage ccu
    ON ccu.constraint_name = tc.constraint_name
   AND ccu.constraint_schema = tc.constraint_schema
  WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_schema = 'public'
    AND ccu.table_schema = 'public'
    AND ccu.table_name = parent_table
    AND ccu.column_name = parent_column;
$$;

ALTER FUNCTION "public"."fk_children_of"("text", "text") OWNER TO "postgres";

REVOKE ALL ON FUNCTION "public"."fk_children_of"("text", "text") FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."fk_children_of"("text", "text") FROM "anon";
REVOKE ALL ON FUNCTION "public"."fk_children_of"("text", "text") FROM "authenticated";
GRANT EXECUTE ON FUNCTION "public"."fk_children_of"("text", "text") TO "service_role";

COMMENT ON FUNCTION "public"."fk_children_of"("text", "text") IS
  'R27 — returns (child_table, child_column) for every public FK that references parent_table(parent_column). Used by the business-delete archive to snapshot all cascade children across the dual-ID system. service_role only.';
