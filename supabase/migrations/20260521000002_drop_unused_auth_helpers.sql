-- Drop two auth helpers that are defined but have ZERO callers in the codebase
-- as of 2026-05-21:
--
--   * auth_get_section_permissions(uuid) -> jsonb
--     Intent: return the section_permissions JSONB for the current user in a
--     business, with full-access shortcuts for super_admin / owner / coach.
--     Actual usage: none. The section-permission gate is implemented in
--     TypeScript (src/lib/permissions/requireSectionPermission.ts) which
--     queries business_users.section_permissions directly via the auth-bound
--     Supabase client; it does not invoke this RPC.
--
--   * auth_get_team_role(uuid) -> text
--     Intent: return 'super_admin' | 'owner' | 'coach' | 'admin' | 'member' | ...
--     for the current user in a business.
--     Actual usage: none. Equivalent logic is performed in TypeScript at
--     individual route boundaries.
--
-- Both functions also had the same asymmetric-bridge bug as auth_can_manage_business
-- (only matched the businesses.id form, no business_profiles.id bridge). Rather
-- than patch dead code we delete it; if either is needed in the future, a
-- correct implementation should be added with both ID forms supported from
-- day one.
--
-- Verification (the full project tree was grepped for both names, excluding
-- node_modules, .next, and stale .claude worktrees): no RPC callers, no SQL
-- function-body callers, no string references.

DROP FUNCTION IF EXISTS "public"."auth_get_section_permissions"("check_business_id" "uuid");
DROP FUNCTION IF EXISTS "public"."auth_get_team_role"("check_business_id" "uuid");
