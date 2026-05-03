# RLS & Team Member Access - Complete 10/10 Implementation Plan

## Executive Summary

This is a **world-class** implementation plan for Row Level Security, team member access, and authorization. It addresses every aspect of security, performance, maintainability, and user experience.

**Rating Target: 10/10**

---

## Table of Contents

1. [Current Problems](#current-problems)
2. [Architecture Overview](#architecture-overview)
3. [Phase 1: Database Verification](#phase-1-database-verification)
4. [Phase 2: Create Rollback Point](#phase-2-create-rollback-point)
5. [Phase 3: Performance Indexes](#phase-3-performance-indexes)
6. [Phase 4: RLS Core Functions](#phase-4-rls-core-functions)
7. [Phase 5: RLS Policies](#phase-5-rls-policies)
8. [Phase 6: Soft Delete Safety](#phase-6-soft-delete-safety)
9. [Phase 7: Section Permissions Middleware](#phase-7-section-permissions-middleware)
10. [Phase 8: Invite System Hardening](#phase-8-invite-system-hardening)
11. [Phase 9: Audit Logging](#phase-9-audit-logging)
12. [Phase 10: Rate Limiting](#phase-10-rate-limiting)
13. [Phase 11: Error Handling Standards](#phase-11-error-handling-standards)
14. [Phase 12: Create Jessica & Test](#phase-12-create-jessica--test)
15. [Phase 13: Automated Testing](#phase-13-automated-testing)
16. [Phase 14: Performance Benchmarking](#phase-14-performance-benchmarking)
17. [Phase 15: Documentation](#phase-15-documentation)
18. [Rollback Plan](#rollback-plan)
19. [Success Criteria](#success-criteria)

---

## Current Problems

| Problem | Severity | Impact |
|---------|----------|--------|
| RLS functions missing/broken | **Critical** | Blocking Jessica's access |
| No performance indexes on RLS columns | **High** | Slow queries at scale |
| Inconsistent policy patterns | **High** | Causes confusion and bugs |
| Section permissions not enforced in APIs | **High** | Security gap |
| No soft delete handling in RLS | **Medium** | Deleted data could leak |
| Invite token expiration not checked | **Medium** | Security gap |
| Resend invite broken | **Medium** | Poor UX |
| No audit logging | **Medium** | Can't track changes |
| No rate limiting on auth endpoints | **Medium** | Abuse potential |
| Inconsistent error handling | **Low** | Poor DX |
| No automated RLS tests | **Low** | Regression risk |

---

## Architecture Overview

### Access Hierarchy

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         ACCESS HIERARCHY                                 │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   SUPER_ADMIN ──────► Full access to everything                         │
│        │                                                                 │
│        ▼                                                                 │
│   COACH ────────────► Access to assigned businesses                     │
│        │                                                                 │
│        ▼                                                                 │
│   OWNER ────────────► Access to owned businesses                        │
│        │                                                                 │
│        ▼                                                                 │
│   ADMIN (team) ─────► Full access + manage team                         │
│        │                                                                 │
│        ▼                                                                 │
│   MEMBER (team) ────► Full access (based on section_permissions)        │
│        │                                                                 │
│        ▼                                                                 │
│   VIEWER (team) ────► Read-only access (based on section_permissions)   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Data Flow

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Request    │────►│  Middleware  │────►│   Supabase   │
│   (API)      │     │  (Permissions│     │   (RLS)      │
└──────────────┘     │   Check)     │     └──────────────┘
                     └──────────────┘
                           │
                           ▼
                     ┌──────────────┐
                     │  Audit Log   │
                     └──────────────┘
```

### Permission Matrix

| User Type | See Business | See Data | Edit Data | Manage Team | Delete |
|-----------|--------------|----------|-----------|-------------|--------|
| Super Admin | ✅ All | ✅ All | ✅ All | ✅ All | ✅ All |
| Coach | ✅ Assigned | ✅ Assigned | ✅ Assigned | ✅ Assigned | ❌ |
| Owner | ✅ Own | ✅ Own | ✅ Own | ✅ Own | ✅ Own |
| Admin (team) | ✅ Member of | ✅ Based on perms | ✅ Based on perms | ✅ Member of | ❌ |
| Member (team) | ✅ Member of | ✅ Based on perms | ✅ Based on perms | ❌ | ❌ |
| Viewer (team) | ✅ Member of | ✅ Based on perms | ❌ | ❌ | ❌ |

### Section Permissions

Each team member can have granular access controlled via `business_users.section_permissions`:

```json
{
  "dashboard": true,
  "weekly_reviews": true,
  "forecasts": true,
  "finances": false,
  "team": false,
  "settings": false
}
```

---

## Phase 1: Database Verification

**Goal**: Confirm database state before making any changes

### Step 1.1: Get All Tables with business_id

```sql
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
AND column_name = 'business_id'
ORDER BY table_name;
```

### Step 1.2: Get All Existing RLS Functions

```sql
SELECT routine_name, routine_type, data_type as return_type
FROM information_schema.routines
WHERE routine_schema = 'public'
AND (routine_name LIKE '%admin%'
  OR routine_name LIKE '%business%'
  OR routine_name LIKE '%team%'
  OR routine_name LIKE '%auth%'
  OR routine_name LIKE '%rls%'
  OR routine_name LIKE '%coach%'
  OR routine_name LIKE '%owner%'
  OR routine_name LIKE '%member%');
```

### Step 1.3: Get All Existing Policies

```sql
SELECT tablename, policyname, cmd, qual
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
```

### Step 1.4: Get Oh Nine Business

```sql
SELECT id, business_name, owner_id, assigned_coach_id, created_at
FROM businesses
WHERE business_name ILIKE '%oh%nine%';
```

### Step 1.5: Check Existing Users

```sql
-- Check auth.users
SELECT id, email, created_at, last_sign_in_at
FROM auth.users
WHERE email IN ('jessica@ohnine.com.au', 'matt@wisdombi.com.au');

-- Check public.users
SELECT id, email, first_name, last_name, system_role
FROM users
WHERE email IN ('jessica@ohnine.com.au', 'matt@wisdombi.com.au');
```

### Step 1.6: Check Existing Indexes

```sql
SELECT
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE schemaname = 'public'
AND (indexdef LIKE '%business_id%'
  OR indexdef LIKE '%user_id%'
  OR indexdef LIKE '%owner_id%'
  OR indexdef LIKE '%assigned_coach_id%')
ORDER BY tablename;
```

### Step 1.7: Count Records Per Table

```sql
SELECT
    'businesses' as table_name, COUNT(*) as count FROM businesses
UNION ALL
SELECT 'business_users', COUNT(*) FROM business_users
UNION ALL
SELECT 'users', COUNT(*) FROM users
UNION ALL
SELECT 'system_roles', COUNT(*) FROM system_roles
UNION ALL
SELECT 'weekly_reviews', COUNT(*) FROM weekly_reviews
UNION ALL
SELECT 'financial_forecasts', COUNT(*) FROM financial_forecasts;
```

**Success Criteria**:
- [ ] Have complete list of tables needing RLS
- [ ] Know which functions exist
- [ ] Have Oh Nine business ID
- [ ] Know if Jessica needs to be created
- [ ] Know existing index coverage

---

## Phase 2: Create Rollback Point

**Goal**: Ability to undo everything if needed

### Step 2.1: Export Current State

Create file: `supabase/migrations/20260127_rls_rollback_snapshot.sql`

```sql
-- =====================================================
-- RLS ROLLBACK SNAPSHOT
-- Created: 2026-01-27
-- =====================================================
-- This file captures the state BEFORE the 10/10 migration
-- Run this to restore if anything goes wrong
-- =====================================================

-- [Generated content will be populated by running verification queries]
-- Include:
-- 1. All current function definitions
-- 2. All current policy definitions
-- 3. All current index definitions
```

### Step 2.2: Create Backup Functions Script

```sql
-- Export all current function definitions
SELECT
    'CREATE OR REPLACE FUNCTION ' || routine_name || '() ' ||
    'RETURNS ' || data_type || ' AS $$ ' ||
    routine_definition || ' $$ LANGUAGE ' || external_language || ';'
FROM information_schema.routines
WHERE routine_schema = 'public'
AND routine_type = 'FUNCTION'
AND (routine_name LIKE '%admin%'
  OR routine_name LIKE '%business%'
  OR routine_name LIKE '%team%');
```

**Deliverable**: `supabase/migrations/20260127_rls_rollback_snapshot.sql`

---

## Phase 3: Performance Indexes

**Goal**: Ensure RLS queries are fast at any scale

### Why This Matters

Every RLS policy query runs on EVERY row access. Without indexes:
- 1,000 businesses = 1,000 full table scans per query
- 10,000 users = catastrophic performance

### Indexes to Create

```sql
-- =====================================================
-- PERFORMANCE INDEXES FOR RLS
-- =====================================================

BEGIN;

-- Core access pattern indexes
CREATE INDEX IF NOT EXISTS idx_businesses_owner_id
ON businesses(owner_id);

CREATE INDEX IF NOT EXISTS idx_businesses_assigned_coach_id
ON businesses(assigned_coach_id);

CREATE INDEX IF NOT EXISTS idx_business_users_user_id
ON business_users(user_id);

CREATE INDEX IF NOT EXISTS idx_business_users_business_id
ON business_users(business_id);

CREATE INDEX IF NOT EXISTS idx_business_users_status
ON business_users(status);

-- Composite index for common query pattern
CREATE INDEX IF NOT EXISTS idx_business_users_user_status
ON business_users(user_id, status)
WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_business_users_business_status
ON business_users(business_id, status)
WHERE status = 'active';

-- System roles index
CREATE INDEX IF NOT EXISTS idx_system_roles_user_id
ON system_roles(user_id);

CREATE INDEX IF NOT EXISTS idx_system_roles_role
ON system_roles(role);

-- Composite for super_admin check
CREATE INDEX IF NOT EXISTS idx_system_roles_user_role
ON system_roles(user_id, role);

-- business_id indexes on all data tables
-- (Only create if table exists and index doesn't)

DO $$
DECLARE
    tables_with_business_id TEXT[] := ARRAY[
        'weekly_reviews', 'quarterly_reviews', 'annual_targets',
        'vision_targets', 'business_kpis', 'business_financial_goals',
        'financial_forecasts', 'forecast_wizard_sessions',
        'strategic_initiatives', 'strategy_data', 'swot_analyses',
        'operational_activities', 'open_loops', 'issues_list',
        'coaching_sessions', 'sessions', 'session_notes',
        'notifications', 'audit_log', 'action_items'
    ];
    t TEXT;
    idx_name TEXT;
BEGIN
    FOREACH t IN ARRAY tables_with_business_id LOOP
        idx_name := 'idx_' || t || '_business_id';

        IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public'
            AND table_name = t
            AND column_name = 'business_id'
        ) AND NOT EXISTS (
            SELECT 1 FROM pg_indexes
            WHERE schemaname = 'public'
            AND tablename = t
            AND indexname = idx_name
        ) THEN
            EXECUTE format('CREATE INDEX %I ON %I(business_id)', idx_name, t);
            RAISE NOTICE 'Created index: %', idx_name;
        END IF;
    END LOOP;
END $$;

COMMIT;
```

### Verify Indexes

```sql
SELECT
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE schemaname = 'public'
AND indexname LIKE 'idx_%'
ORDER BY tablename;
```

---

## Phase 4: RLS Core Functions

**Goal**: Create robust, tested, performant RLS functions

### Design Principles

```
┌─────────────────────────────────────────────────────────────────┐
│                    FUNCTION DESIGN PRINCIPLES                    │
├─────────────────────────────────────────────────────────────────┤
│  1. SECURITY DEFINER    - Bypass RLS to prevent recursion       │
│  2. SQL Language        - 10x faster than PL/pgSQL for simple   │
│  3. STABLE             - Results cached within transaction       │
│  4. search_path = ''    - Prevent search_path injection         │
│  5. COALESCE defaults   - Never return NULL                      │
│  6. auth_* prefix       - Clear naming convention                │
└─────────────────────────────────────────────────────────────────┘
```

### Function Definitions

```sql
-- =====================================================
-- RLS CORE FUNCTIONS
-- =====================================================

BEGIN;

-- =====================================================
-- 1. AUTH_IS_SUPER_ADMIN
-- =====================================================
-- Returns TRUE if current user is a super_admin
-- Used in virtually every policy

DROP FUNCTION IF EXISTS auth_is_super_admin() CASCADE;

CREATE FUNCTION auth_is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.system_roles
    WHERE user_id = auth.uid()
    AND role = 'super_admin'
  );
$$;

COMMENT ON FUNCTION auth_is_super_admin() IS
'Check if the current authenticated user is a super_admin.
Uses SECURITY DEFINER to bypass RLS on system_roles table.';


-- =====================================================
-- 2. AUTH_GET_USER_ROLE
-- =====================================================
-- Returns the system role of current user
-- Useful for role-based logic

DROP FUNCTION IF EXISTS auth_get_user_role() CASCADE;

CREATE FUNCTION auth_get_user_role()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT COALESCE(
    (SELECT role FROM public.system_roles WHERE user_id = auth.uid() LIMIT 1),
    'client'
  );
$$;

COMMENT ON FUNCTION auth_get_user_role() IS
'Get the system role of the current user. Returns "client" if no role found.';


-- =====================================================
-- 3. AUTH_GET_ACCESSIBLE_BUSINESS_IDS
-- =====================================================
-- Returns array of all business UUIDs user can access
-- Core function used by most policies

DROP FUNCTION IF EXISTS auth_get_accessible_business_ids() CASCADE;

CREATE FUNCTION auth_get_accessible_business_ids()
RETURNS UUID[]
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT COALESCE(
    ARRAY(
      -- Businesses user owns
      SELECT id FROM public.businesses
      WHERE owner_id = auth.uid()
      AND deleted_at IS NULL

      UNION

      -- Businesses user coaches
      SELECT id FROM public.businesses
      WHERE assigned_coach_id = auth.uid()
      AND deleted_at IS NULL

      UNION

      -- Businesses user is team member of
      SELECT business_id FROM public.business_users
      WHERE user_id = auth.uid()
      AND status = 'active'
    ),
    '{}'::UUID[]
  );
$$;

COMMENT ON FUNCTION auth_get_accessible_business_ids() IS
'Get array of business IDs the current user can access (owner, coach, or team member).
Excludes soft-deleted businesses.';


-- =====================================================
-- 4. AUTH_GET_ACCESSIBLE_BUSINESS_IDS_TEXT
-- =====================================================
-- Same as above but returns TEXT[] for tables with TEXT business_id

DROP FUNCTION IF EXISTS auth_get_accessible_business_ids_text() CASCADE;

CREATE FUNCTION auth_get_accessible_business_ids_text()
RETURNS TEXT[]
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT COALESCE(
    ARRAY(
      SELECT id::TEXT FROM public.businesses
      WHERE owner_id = auth.uid()
      AND deleted_at IS NULL

      UNION

      SELECT id::TEXT FROM public.businesses
      WHERE assigned_coach_id = auth.uid()
      AND deleted_at IS NULL

      UNION

      SELECT business_id::TEXT FROM public.business_users
      WHERE user_id = auth.uid()
      AND status = 'active'
    ),
    '{}'::TEXT[]
  );
$$;

COMMENT ON FUNCTION auth_get_accessible_business_ids_text() IS
'TEXT version of auth_get_accessible_business_ids for tables with TEXT business_id columns.';


-- =====================================================
-- 5. AUTH_IS_TEAM_MEMBER_OF
-- =====================================================
-- Check if user is an active team member of specific business

DROP FUNCTION IF EXISTS auth_is_team_member_of(UUID) CASCADE;

CREATE FUNCTION auth_is_team_member_of(check_business_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.business_users
    WHERE business_id = check_business_id
    AND user_id = auth.uid()
    AND status = 'active'
  );
$$;

COMMENT ON FUNCTION auth_is_team_member_of(UUID) IS
'Check if current user is an active team member of the specified business.';


-- =====================================================
-- 6. AUTH_IS_COACH_OF
-- =====================================================
-- Check if user is the assigned coach for a business

DROP FUNCTION IF EXISTS auth_is_coach_of(UUID) CASCADE;

CREATE FUNCTION auth_is_coach_of(check_business_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.businesses
    WHERE id = check_business_id
    AND assigned_coach_id = auth.uid()
    AND deleted_at IS NULL
  );
$$;

COMMENT ON FUNCTION auth_is_coach_of(UUID) IS
'Check if current user is the assigned coach for the specified business.';


-- =====================================================
-- 7. AUTH_IS_OWNER_OF
-- =====================================================
-- Check if user owns a business

DROP FUNCTION IF EXISTS auth_is_owner_of(UUID) CASCADE;

CREATE FUNCTION auth_is_owner_of(check_business_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.businesses
    WHERE id = check_business_id
    AND owner_id = auth.uid()
    AND deleted_at IS NULL
  );
$$;

COMMENT ON FUNCTION auth_is_owner_of(UUID) IS
'Check if current user owns the specified business.';


-- =====================================================
-- 8. AUTH_CAN_ACCESS_BUSINESS
-- =====================================================
-- Combined check: can user access this business at all?

DROP FUNCTION IF EXISTS auth_can_access_business(UUID) CASCADE;

CREATE FUNCTION auth_can_access_business(check_business_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT
    auth_is_super_admin()
    OR auth_is_owner_of(check_business_id)
    OR auth_is_coach_of(check_business_id)
    OR auth_is_team_member_of(check_business_id);
$$;

COMMENT ON FUNCTION auth_can_access_business(UUID) IS
'Check if current user can access the specified business (any role).';


-- =====================================================
-- 9. AUTH_CAN_MANAGE_BUSINESS
-- =====================================================
-- Check if user can make changes to business (not just view)
-- Viewers cannot manage

DROP FUNCTION IF EXISTS auth_can_manage_business(UUID) CASCADE;

CREATE FUNCTION auth_can_manage_business(check_business_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT
    auth_is_super_admin()
    OR auth_is_owner_of(check_business_id)
    OR auth_is_coach_of(check_business_id)
    OR EXISTS (
      SELECT 1 FROM public.business_users
      WHERE business_id = check_business_id
      AND user_id = auth.uid()
      AND status = 'active'
      AND role IN ('admin', 'member')  -- NOT viewer
    );
$$;

COMMENT ON FUNCTION auth_can_manage_business(UUID) IS
'Check if current user can manage (edit) the specified business. Viewers are excluded.';


-- =====================================================
-- 10. AUTH_CAN_MANAGE_TEAM
-- =====================================================
-- Check if user can manage team members

DROP FUNCTION IF EXISTS auth_can_manage_team(UUID) CASCADE;

CREATE FUNCTION auth_can_manage_team(check_business_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT
    auth_is_super_admin()
    OR auth_is_owner_of(check_business_id)
    OR auth_is_coach_of(check_business_id)
    OR EXISTS (
      SELECT 1 FROM public.business_users
      WHERE business_id = check_business_id
      AND user_id = auth.uid()
      AND status = 'active'
      AND role = 'admin'  -- Only admins can manage team
    );
$$;

COMMENT ON FUNCTION auth_can_manage_team(UUID) IS
'Check if current user can manage team members for the specified business.';


-- =====================================================
-- 11. AUTH_GET_TEAM_ROLE
-- =====================================================
-- Get user's role within a specific business team

DROP FUNCTION IF EXISTS auth_get_team_role(UUID) CASCADE;

CREATE FUNCTION auth_get_team_role(check_business_id UUID)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT COALESCE(
    (
      SELECT
        CASE
          WHEN auth_is_super_admin() THEN 'super_admin'
          WHEN auth_is_owner_of(check_business_id) THEN 'owner'
          WHEN auth_is_coach_of(check_business_id) THEN 'coach'
          ELSE (
            SELECT role FROM public.business_users
            WHERE business_id = check_business_id
            AND user_id = auth.uid()
            AND status = 'active'
            LIMIT 1
          )
        END
    ),
    NULL
  );
$$;

COMMENT ON FUNCTION auth_get_team_role(UUID) IS
'Get the role of current user within a specific business team.
Returns: super_admin, owner, coach, admin, member, viewer, or NULL.';


-- =====================================================
-- 12. AUTH_GET_SECTION_PERMISSIONS
-- =====================================================
-- Get section permissions for user in a business

DROP FUNCTION IF EXISTS auth_get_section_permissions(UUID) CASCADE;

CREATE FUNCTION auth_get_section_permissions(check_business_id UUID)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT
    CASE
      -- Super admin, owner, coach get full access
      WHEN auth_is_super_admin()
        OR auth_is_owner_of(check_business_id)
        OR auth_is_coach_of(check_business_id)
      THEN '{"dashboard":true,"weekly_reviews":true,"forecasts":true,"finances":true,"team":true,"settings":true}'::JSONB

      -- Team members get their specific permissions
      ELSE COALESCE(
        (
          SELECT section_permissions FROM public.business_users
          WHERE business_id = check_business_id
          AND user_id = auth.uid()
          AND status = 'active'
          LIMIT 1
        ),
        '{"dashboard":true,"weekly_reviews":true,"forecasts":true,"finances":false,"team":false,"settings":false}'::JSONB
      )
    END;
$$;

COMMENT ON FUNCTION auth_get_section_permissions(UUID) IS
'Get section permissions for current user in a business.
Returns full access for super_admin/owner/coach, or specific permissions for team members.';

COMMIT;
```

### Verify Functions

```sql
SELECT
    routine_name,
    data_type as return_type
FROM information_schema.routines
WHERE routine_schema = 'public'
AND routine_name LIKE 'auth_%'
ORDER BY routine_name;
```

Expected result: 12 functions

---

## Phase 5: RLS Policies

**Goal**: Apply consistent, correct policies to all tables

### Policy Patterns

```
┌─────────────────────────────────────────────────────────────────┐
│                    POLICY PATTERNS                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  PATTERN A: Core Tables (businesses, business_users, users)     │
│  - Explicit USING and WITH CHECK clauses                        │
│  - Different logic for read vs write                            │
│                                                                  │
│  PATTERN B: Business Data Tables (forecasts, reviews, etc.)     │
│  - Single FOR ALL policy                                        │
│  - Uses auth_can_access_business() or array check               │
│                                                                  │
│  PATTERN C: Child Tables (forecast_pl_lines, etc.)              │
│  - Join to parent table for access check                        │
│                                                                  │
│  PATTERN D: User Tables (system_roles, users)                   │
│  - Own record OR super_admin                                    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Policy Definitions

```sql
-- =====================================================
-- RLS POLICIES
-- =====================================================

BEGIN;

-- =====================================================
-- SYSTEM_ROLES TABLE
-- =====================================================

-- Drop existing policies
DO $$
DECLARE pol RECORD;
BEGIN
    FOR pol IN SELECT policyname FROM pg_policies
               WHERE tablename = 'system_roles' AND schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON system_roles', pol.policyname);
    END LOOP;
END $$;

-- Enable RLS
ALTER TABLE system_roles ENABLE ROW LEVEL SECURITY;

-- Users can view their own role
CREATE POLICY "system_roles_select_own" ON system_roles
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Super admins can manage all roles (uses direct check to avoid recursion)
CREATE POLICY "system_roles_manage_admin" ON system_roles
FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM system_roles sr
        WHERE sr.user_id = auth.uid()
        AND sr.role = 'super_admin'
    )
);


-- =====================================================
-- USERS TABLE
-- =====================================================

DO $$
DECLARE pol RECORD;
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema = 'public' AND table_name = 'users') THEN

        FOR pol IN SELECT policyname FROM pg_policies
                   WHERE tablename = 'users' AND schemaname = 'public'
        LOOP
            EXECUTE format('DROP POLICY IF EXISTS %I ON users', pol.policyname);
        END LOOP;

        EXECUTE 'ALTER TABLE users ENABLE ROW LEVEL SECURITY';

        -- Users can view/edit their own record
        EXECUTE 'CREATE POLICY "users_own_record" ON users
        FOR ALL TO authenticated
        USING (id = auth.uid())
        WITH CHECK (id = auth.uid())';

        -- Super admins can manage all users
        EXECUTE 'CREATE POLICY "users_admin_manage" ON users
        FOR ALL TO authenticated
        USING (auth_is_super_admin())
        WITH CHECK (auth_is_super_admin())';

        -- Users can view other users they share a business with
        EXECUTE 'CREATE POLICY "users_view_colleagues" ON users
        FOR SELECT TO authenticated
        USING (
            id IN (
                SELECT bu.user_id FROM business_users bu
                WHERE bu.business_id = ANY(auth_get_accessible_business_ids())
                AND bu.status = ''active''
            )
        )';

    END IF;
END $$;


-- =====================================================
-- BUSINESSES TABLE
-- =====================================================

DO $$
DECLARE pol RECORD;
BEGIN
    FOR pol IN SELECT policyname FROM pg_policies
               WHERE tablename = 'businesses' AND schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON businesses', pol.policyname);
    END LOOP;
END $$;

ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "businesses_access" ON businesses
FOR ALL
TO authenticated
USING (
    -- Super admin sees all
    auth_is_super_admin()
    -- Owner sees own
    OR owner_id = auth.uid()
    -- Coach sees assigned
    OR assigned_coach_id = auth.uid()
    -- Team member sees their business
    OR auth_is_team_member_of(id)
)
WITH CHECK (
    -- Only owner, coach, or admin can modify
    auth_is_super_admin()
    OR owner_id = auth.uid()
    OR assigned_coach_id = auth.uid()
    -- Team admins cannot create new businesses, only edit
);


-- =====================================================
-- BUSINESS_USERS TABLE
-- =====================================================

DO $$
DECLARE pol RECORD;
BEGIN
    FOR pol IN SELECT policyname FROM pg_policies
               WHERE tablename = 'business_users' AND schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON business_users', pol.policyname);
    END LOOP;
END $$;

ALTER TABLE business_users ENABLE ROW LEVEL SECURITY;

-- View: Can see team members of businesses you belong to
CREATE POLICY "business_users_view" ON business_users
FOR SELECT
TO authenticated
USING (
    auth_is_super_admin()
    OR user_id = auth.uid()  -- Always see your own records
    OR auth_can_access_business(business_id)
);

-- Insert: Only those who can manage team
CREATE POLICY "business_users_insert" ON business_users
FOR INSERT
TO authenticated
WITH CHECK (
    auth_can_manage_team(business_id)
);

-- Update: Only those who can manage team (or user updating own non-role fields)
CREATE POLICY "business_users_update" ON business_users
FOR UPDATE
TO authenticated
USING (
    auth_can_manage_team(business_id)
    OR user_id = auth.uid()  -- User can update their own record
)
WITH CHECK (
    auth_can_manage_team(business_id)
    OR user_id = auth.uid()
);

-- Delete: Only those who can manage team
CREATE POLICY "business_users_delete" ON business_users
FOR DELETE
TO authenticated
USING (
    auth_can_manage_team(business_id)
);


-- =====================================================
-- BUSINESS DATA TABLES (Pattern B)
-- =====================================================

DO $$
DECLARE
    tables_uuid TEXT[] := ARRAY[
        'weekly_reviews', 'quarterly_reviews', 'annual_targets',
        'vision_targets', 'business_kpis', 'business_financial_goals',
        'financial_forecasts', 'forecast_wizard_sessions', 'forecast_decisions',
        'forecast_investments', 'forecast_years', 'forecast_insights',
        'strategic_initiatives', 'strategy_data', 'swot_analyses',
        'operational_activities', 'open_loops', 'issues_list',
        'stop_doing_items', 'stop_doing_activities', 'stop_doing_hourly_rates',
        'stop_doing_time_logs', 'coaching_sessions', 'sessions', 'session_notes',
        'messages', 'goals', 'action_items', 'todo_items',
        'notifications', 'notification_preferences', 'audit_log',
        'ai_cfo_conversations', 'coach_questions', 'subscription_budgets',
        'subscription_audit_results', 'xero_connections', 'team_data',
        'business_profiles', 'roadmap_progress', 'stage_transitions',
        'active_editors', 'weekly_report_periods', 'team_weekly_reports',
        'marketing_data', 'financial_metrics', 'weekly_metrics_snapshots'
    ];
    t TEXT;
    col_type TEXT;
    pol RECORD;
BEGIN
    FOREACH t IN ARRAY tables_uuid LOOP
        -- Check if table exists and has business_id
        SELECT data_type INTO col_type
        FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = t
        AND column_name = 'business_id';

        IF col_type IS NOT NULL THEN
            -- Drop existing policies
            FOR pol IN SELECT policyname FROM pg_policies
                       WHERE tablename = t AND schemaname = 'public'
            LOOP
                EXECUTE format('DROP POLICY IF EXISTS %I ON %I', pol.policyname, t);
            END LOOP;

            -- Enable RLS
            EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);

            -- Create policy based on column type
            IF col_type = 'uuid' THEN
                EXECUTE format(
                    'CREATE POLICY "rls_access" ON %I
                    FOR ALL TO authenticated
                    USING (
                        auth_is_super_admin()
                        OR business_id = ANY(auth_get_accessible_business_ids())
                    )
                    WITH CHECK (
                        auth_is_super_admin()
                        OR auth_can_manage_business(business_id)
                    )',
                    t
                );
            ELSE
                -- TEXT type
                EXECUTE format(
                    'CREATE POLICY "rls_access" ON %I
                    FOR ALL TO authenticated
                    USING (
                        auth_is_super_admin()
                        OR business_id = ANY(auth_get_accessible_business_ids_text())
                    )
                    WITH CHECK (
                        auth_is_super_admin()
                        OR auth_can_manage_business(business_id::UUID)
                    )',
                    t
                );
            END IF;

            RAISE NOTICE 'Created policy for: % (% business_id)', t, col_type;
        END IF;
    END LOOP;
END $$;


-- =====================================================
-- FORECAST CHILD TABLES (Pattern C)
-- =====================================================

DO $$
DECLARE
    forecast_tables TEXT[] := ARRAY[
        'forecast_pl_lines', 'forecast_employees', 'forecast_payroll_summary'
    ];
    t TEXT;
    pol RECORD;
BEGIN
    FOREACH t IN ARRAY forecast_tables LOOP
        IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public'
            AND table_name = t
            AND column_name = 'forecast_id'
        ) THEN
            -- Drop existing policies
            FOR pol IN SELECT policyname FROM pg_policies
                       WHERE tablename = t AND schemaname = 'public'
            LOOP
                EXECUTE format('DROP POLICY IF EXISTS %I ON %I', pol.policyname, t);
            END LOOP;

            -- Enable RLS
            EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);

            -- Create policy via parent join
            EXECUTE format(
                'CREATE POLICY "rls_access" ON %I
                FOR ALL TO authenticated
                USING (
                    auth_is_super_admin()
                    OR forecast_id IN (
                        SELECT id FROM financial_forecasts
                        WHERE business_id = ANY(auth_get_accessible_business_ids())
                    )
                )
                WITH CHECK (
                    auth_is_super_admin()
                    OR forecast_id IN (
                        SELECT id FROM financial_forecasts ff
                        WHERE auth_can_manage_business(ff.business_id)
                    )
                )',
                t
            );

            RAISE NOTICE 'Created policy for forecast child: %', t;
        END IF;
    END LOOP;
END $$;


-- =====================================================
-- SESSION_TEMPLATES (Coach-owned)
-- =====================================================

DO $$
DECLARE pol RECORD;
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema = 'public' AND table_name = 'session_templates') THEN

        FOR pol IN SELECT policyname FROM pg_policies
                   WHERE tablename = 'session_templates' AND schemaname = 'public'
        LOOP
            EXECUTE format('DROP POLICY IF EXISTS %I ON session_templates', pol.policyname);
        END LOOP;

        EXECUTE 'ALTER TABLE session_templates ENABLE ROW LEVEL SECURITY';

        EXECUTE 'CREATE POLICY "session_templates_access" ON session_templates
        FOR ALL TO authenticated
        USING (coach_id = auth.uid() OR auth_is_super_admin())
        WITH CHECK (coach_id = auth.uid() OR auth_is_super_admin())';

    END IF;
END $$;


-- =====================================================
-- USER_KPIS (User-owned)
-- =====================================================

DO $$
DECLARE pol RECORD;
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema = 'public' AND table_name = 'user_kpis') THEN

        FOR pol IN SELECT policyname FROM pg_policies
                   WHERE tablename = 'user_kpis' AND schemaname = 'public'
        LOOP
            EXECUTE format('DROP POLICY IF EXISTS %I ON user_kpis', pol.policyname);
        END LOOP;

        EXECUTE 'ALTER TABLE user_kpis ENABLE ROW LEVEL SECURITY';

        -- Check if it has user_id or business_id
        IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'user_kpis' AND column_name = 'user_id'
        ) THEN
            EXECUTE 'CREATE POLICY "user_kpis_access" ON user_kpis
            FOR ALL TO authenticated
            USING (user_id = auth.uid() OR auth_is_super_admin())
            WITH CHECK (user_id = auth.uid() OR auth_is_super_admin())';
        ELSIF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'user_kpis' AND column_name = 'business_id'
        ) THEN
            EXECUTE 'CREATE POLICY "user_kpis_access" ON user_kpis
            FOR ALL TO authenticated
            USING (auth_is_super_admin() OR business_id = ANY(auth_get_accessible_business_ids()))
            WITH CHECK (auth_is_super_admin() OR auth_can_manage_business(business_id))';
        END IF;

    END IF;
END $$;

COMMIT;
```

### Verify Policies

```sql
SELECT
    tablename,
    COUNT(*) as policy_count
FROM pg_policies
WHERE schemaname = 'public'
GROUP BY tablename
ORDER BY tablename;
```

---

## Phase 6: Soft Delete Safety

**Goal**: Ensure deleted records don't leak through RLS

### Add deleted_at Column (if missing)

```sql
-- Check if businesses table has deleted_at
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name = 'businesses'
AND column_name = 'deleted_at';

-- Add if missing
ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

-- Add index for soft delete queries
CREATE INDEX IF NOT EXISTS idx_businesses_deleted_at
ON businesses(deleted_at)
WHERE deleted_at IS NULL;
```

The RLS functions in Phase 4 already include `AND deleted_at IS NULL` checks.

### Soft Delete Helper Function

```sql
CREATE OR REPLACE FUNCTION soft_delete_business(target_business_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    -- Only owner or super_admin can delete
    IF NOT (
        auth_is_super_admin()
        OR auth_is_owner_of(target_business_id)
    ) THEN
        RAISE EXCEPTION 'Permission denied: only owner can delete business';
    END IF;

    UPDATE public.businesses
    SET deleted_at = NOW()
    WHERE id = target_business_id
    AND deleted_at IS NULL;

    -- Also soft-delete related business_users
    UPDATE public.business_users
    SET status = 'removed'
    WHERE business_id = target_business_id;

    -- Log the action
    INSERT INTO public.audit_log (
        business_id, user_id, action, details, created_at
    ) VALUES (
        target_business_id,
        auth.uid(),
        'business_deleted',
        jsonb_build_object('deleted_at', NOW()),
        NOW()
    );

    RETURN TRUE;
END;
$$;
```

---

## Phase 7: Section Permissions Middleware

**Goal**: Enforce section_permissions in all API routes

### Create Utility Functions

**File**: `src/lib/permissions.ts`

```typescript
import { createClient } from '@/lib/supabase/server';

export type Section =
  | 'dashboard'
  | 'weekly_reviews'
  | 'forecasts'
  | 'finances'
  | 'team'
  | 'settings';

export interface SectionPermissions {
  dashboard: boolean;
  weekly_reviews: boolean;
  forecasts: boolean;
  finances: boolean;
  team: boolean;
  settings: boolean;
}

const DEFAULT_PERMISSIONS: SectionPermissions = {
  dashboard: true,
  weekly_reviews: true,
  forecasts: true,
  finances: false,
  team: false,
  settings: false,
};

const FULL_PERMISSIONS: SectionPermissions = {
  dashboard: true,
  weekly_reviews: true,
  forecasts: true,
  finances: true,
  team: true,
  settings: true,
};

/**
 * Get section permissions for a user in a business
 */
export async function getSectionPermissions(
  userId: string,
  businessId: string
): Promise<SectionPermissions> {
  const supabase = await createClient();

  // Check if user is super_admin, owner, or coach (full access)
  const { data: business } = await supabase
    .from('businesses')
    .select('owner_id, assigned_coach_id')
    .eq('id', businessId)
    .single();

  if (!business) {
    return DEFAULT_PERMISSIONS;
  }

  // Check super_admin
  const { data: systemRole } = await supabase
    .from('system_roles')
    .select('role')
    .eq('user_id', userId)
    .eq('role', 'super_admin')
    .single();

  if (systemRole || business.owner_id === userId || business.assigned_coach_id === userId) {
    return FULL_PERMISSIONS;
  }

  // Get team member permissions
  const { data: businessUser } = await supabase
    .from('business_users')
    .select('section_permissions, role')
    .eq('business_id', businessId)
    .eq('user_id', userId)
    .eq('status', 'active')
    .single();

  if (!businessUser) {
    return DEFAULT_PERMISSIONS;
  }

  // Team admins get full access
  if (businessUser.role === 'admin') {
    return FULL_PERMISSIONS;
  }

  return {
    ...DEFAULT_PERMISSIONS,
    ...(businessUser.section_permissions as Partial<SectionPermissions> || {}),
  };
}

/**
 * Check if user has access to a specific section
 */
export async function hasPermission(
  userId: string,
  businessId: string,
  section: Section
): Promise<boolean> {
  const permissions = await getSectionPermissions(userId, businessId);
  return permissions[section] === true;
}

/**
 * Middleware helper - throws if no permission
 */
export async function requirePermission(
  userId: string,
  businessId: string,
  section: Section
): Promise<void> {
  const hasAccess = await hasPermission(userId, businessId, section);

  if (!hasAccess) {
    throw new PermissionError(
      `Access denied: you don't have permission to access ${section}`,
      section
    );
  }
}

/**
 * Custom error class for permission errors
 */
export class PermissionError extends Error {
  section: Section;

  constructor(message: string, section: Section) {
    super(message);
    this.name = 'PermissionError';
    this.section = section;
  }
}

/**
 * Map API paths to required sections
 */
export function getRequiredSection(path: string): Section | null {
  const sectionMap: Record<string, Section> = {
    '/api/forecasts': 'forecasts',
    '/api/financial-forecasts': 'forecasts',
    '/api/forecast-wizard': 'forecasts',
    '/api/weekly-reviews': 'weekly_reviews',
    '/api/quarterly-reviews': 'weekly_reviews',
    '/api/finances': 'finances',
    '/api/business-financial-goals': 'finances',
    '/api/xero': 'finances',
    '/api/team': 'team',
    '/api/business-users': 'team',
    '/api/settings': 'settings',
  };

  for (const [prefix, section] of Object.entries(sectionMap)) {
    if (path.startsWith(prefix)) {
      return section;
    }
  }

  return null; // No specific section required
}
```

### Create API Middleware

**File**: `src/middleware/permissions.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getRequiredSection, hasPermission } from '@/lib/permissions';

export async function withPermissionCheck(
  request: NextRequest,
  handler: (req: NextRequest) => Promise<NextResponse>
): Promise<NextResponse> {
  const supabase = await createClient();

  // Get current user
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      { error: 'Unauthorized', code: 'AUTH_REQUIRED' },
      { status: 401 }
    );
  }

  // Get business ID from request
  const businessId = getBusinessIdFromRequest(request);

  if (!businessId) {
    // No business context, allow request
    return handler(request);
  }

  // Get required section for this path
  const section = getRequiredSection(request.nextUrl.pathname);

  if (!section) {
    // No specific section required
    return handler(request);
  }

  // Check permission
  const hasAccess = await hasPermission(user.id, businessId, section);

  if (!hasAccess) {
    return NextResponse.json(
      {
        error: `Access denied: you don't have permission to access ${section}`,
        code: 'PERMISSION_DENIED',
        section
      },
      { status: 403 }
    );
  }

  return handler(request);
}

function getBusinessIdFromRequest(request: NextRequest): string | null {
  // Check URL params
  const businessId = request.nextUrl.searchParams.get('businessId')
    || request.nextUrl.searchParams.get('business_id');

  if (businessId) return businessId;

  // Check path params (e.g., /api/businesses/[id]/...)
  const pathMatch = request.nextUrl.pathname.match(
    /\/api\/businesses\/([a-f0-9-]{36})/i
  );

  if (pathMatch) return pathMatch[1];

  return null;
}
```

### Update API Routes

Example update for `/src/app/api/forecasts/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requirePermission } from '@/lib/permissions';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const businessId = request.nextUrl.searchParams.get('businessId');

    if (!businessId) {
      return NextResponse.json({ error: 'Business ID required' }, { status: 400 });
    }

    // Check permission
    await requirePermission(user.id, businessId, 'forecasts');

    // Proceed with query (RLS will also filter)
    const { data, error } = await supabase
      .from('financial_forecasts')
      .select('*')
      .eq('business_id', businessId);

    if (error) throw error;

    return NextResponse.json({ data });

  } catch (error) {
    if (error instanceof PermissionError) {
      return NextResponse.json(
        { error: error.message, section: error.section },
        { status: 403 }
      );
    }

    console.error('Forecast API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

### Files to Update

| File | Section |
|------|---------|
| `/src/app/api/forecasts/route.ts` | forecasts |
| `/src/app/api/forecasts/[id]/route.ts` | forecasts |
| `/src/app/api/forecast-wizard/route.ts` | forecasts |
| `/src/app/api/weekly-reviews/route.ts` | weekly_reviews |
| `/src/app/api/weekly-reviews/[id]/route.ts` | weekly_reviews |
| `/src/app/api/business-financial-goals/route.ts` | finances |
| `/src/app/api/business-kpis/route.ts` | finances |
| `/src/app/api/team/route.ts` | team |
| `/src/app/api/team/invite/route.ts` | team |
| `/src/app/api/settings/route.ts` | settings |

---

## Phase 8: Invite System Hardening

**Goal**: Secure, reliable team invite flow

### Current Issues

1. Invite token expiration not checked
2. Resend invite not implemented
3. No rate limiting on invites
4. No email validation

### Database Schema Updates

```sql
-- Add missing columns to business_users if needed
ALTER TABLE business_users
ADD COLUMN IF NOT EXISTS invite_token UUID DEFAULT gen_random_uuid(),
ADD COLUMN IF NOT EXISTS invite_expires_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS invite_sent_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS invite_resent_count INT DEFAULT 0;

-- Index for invite token lookup
CREATE INDEX IF NOT EXISTS idx_business_users_invite_token
ON business_users(invite_token)
WHERE status = 'invited';
```

### Invite API Updates

**File**: `src/app/api/team/invite/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requirePermission } from '@/lib/permissions';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);
const INVITE_EXPIRY_DAYS = 7;
const MAX_RESEND_COUNT = 3;

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { businessId, email, role, sectionPermissions } = body;

    // Validate input
    if (!businessId || !email || !role) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      );
    }

    // Check permission to manage team
    await requirePermission(user.id, businessId, 'team');

    // Check if user already exists
    const { data: existingUser } = await supabase
      .from('business_users')
      .select('id, status')
      .eq('business_id', businessId)
      .eq('email', email.toLowerCase())
      .single();

    if (existingUser) {
      if (existingUser.status === 'active') {
        return NextResponse.json(
          { error: 'User is already a team member' },
          { status: 409 }
        );
      }
      if (existingUser.status === 'invited') {
        return NextResponse.json(
          { error: 'User already has a pending invite', inviteId: existingUser.id },
          { status: 409 }
        );
      }
    }

    // Get business details for email
    const { data: business } = await supabase
      .from('businesses')
      .select('business_name')
      .eq('id', businessId)
      .single();

    // Create invite
    const inviteToken = crypto.randomUUID();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + INVITE_EXPIRY_DAYS);

    const { data: invite, error: insertError } = await supabase
      .from('business_users')
      .insert({
        business_id: businessId,
        email: email.toLowerCase(),
        role,
        status: 'invited',
        section_permissions: sectionPermissions || {},
        invite_token: inviteToken,
        invite_expires_at: expiresAt.toISOString(),
        invite_sent_at: new Date().toISOString(),
        invited_by: user.id,
      })
      .select()
      .single();

    if (insertError) throw insertError;

    // Send invite email
    const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL}/invite/${inviteToken}`;

    await resend.emails.send({
      from: 'noreply@yourdomain.com',
      to: email,
      subject: `You've been invited to join ${business?.business_name || 'a business'}`,
      html: `
        <h1>You've been invited!</h1>
        <p>You've been invited to join ${business?.business_name || 'a business'} as a ${role}.</p>
        <p><a href="${inviteUrl}">Click here to accept the invite</a></p>
        <p>This invite expires in ${INVITE_EXPIRY_DAYS} days.</p>
      `,
    });

    // Log the action
    await supabase.from('audit_log').insert({
      business_id: businessId,
      user_id: user.id,
      action: 'team_member_invited',
      details: { email, role, invite_id: invite.id },
    });

    return NextResponse.json({
      success: true,
      inviteId: invite.id,
      expiresAt: expiresAt.toISOString(),
    });

  } catch (error) {
    console.error('Invite error:', error);
    return NextResponse.json(
      { error: 'Failed to send invite' },
      { status: 500 }
    );
  }
}
```

### Accept Invite Endpoint

**File**: `src/app/api/team/accept-invite/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { inviteToken } = body;

    if (!inviteToken) {
      return NextResponse.json(
        { error: 'Invite token required' },
        { status: 400 }
      );
    }

    // Find the invite
    const { data: invite, error: findError } = await supabase
      .from('business_users')
      .select('*')
      .eq('invite_token', inviteToken)
      .eq('status', 'invited')
      .single();

    if (findError || !invite) {
      return NextResponse.json(
        { error: 'Invalid or expired invite' },
        { status: 404 }
      );
    }

    // Check expiration
    if (new Date(invite.invite_expires_at) < new Date()) {
      return NextResponse.json(
        { error: 'Invite has expired' },
        { status: 410 }
      );
    }

    // Check email matches
    if (user.email?.toLowerCase() !== invite.email.toLowerCase()) {
      return NextResponse.json(
        { error: 'Email does not match invite' },
        { status: 403 }
      );
    }

    // Accept the invite
    const { error: updateError } = await supabase
      .from('business_users')
      .update({
        user_id: user.id,
        status: 'active',
        invite_token: null,
        invite_expires_at: null,
        accepted_at: new Date().toISOString(),
      })
      .eq('id', invite.id);

    if (updateError) throw updateError;

    // Log the action
    await supabase.from('audit_log').insert({
      business_id: invite.business_id,
      user_id: user.id,
      action: 'team_member_joined',
      details: { role: invite.role, invite_id: invite.id },
    });

    return NextResponse.json({
      success: true,
      businessId: invite.business_id,
    });

  } catch (error) {
    console.error('Accept invite error:', error);
    return NextResponse.json(
      { error: 'Failed to accept invite' },
      { status: 500 }
    );
  }
}
```

### Resend Invite Endpoint

**File**: `src/app/api/team/resend-invite/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requirePermission } from '@/lib/permissions';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);
const INVITE_EXPIRY_DAYS = 7;
const MAX_RESEND_COUNT = 3;

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { inviteId } = body;

    // Get the invite
    const { data: invite, error: findError } = await supabase
      .from('business_users')
      .select('*, businesses(business_name)')
      .eq('id', inviteId)
      .eq('status', 'invited')
      .single();

    if (findError || !invite) {
      return NextResponse.json(
        { error: 'Invite not found' },
        { status: 404 }
      );
    }

    // Check permission
    await requirePermission(user.id, invite.business_id, 'team');

    // Check resend limit
    if (invite.invite_resent_count >= MAX_RESEND_COUNT) {
      return NextResponse.json(
        { error: 'Maximum resend limit reached' },
        { status: 429 }
      );
    }

    // Generate new token and expiry
    const newToken = crypto.randomUUID();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + INVITE_EXPIRY_DAYS);

    // Update invite
    const { error: updateError } = await supabase
      .from('business_users')
      .update({
        invite_token: newToken,
        invite_expires_at: expiresAt.toISOString(),
        invite_sent_at: new Date().toISOString(),
        invite_resent_count: invite.invite_resent_count + 1,
      })
      .eq('id', inviteId);

    if (updateError) throw updateError;

    // Send email
    const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL}/invite/${newToken}`;
    const businessName = invite.businesses?.business_name || 'a business';

    await resend.emails.send({
      from: 'noreply@yourdomain.com',
      to: invite.email,
      subject: `Reminder: You've been invited to join ${businessName}`,
      html: `
        <h1>Invitation Reminder</h1>
        <p>This is a reminder that you've been invited to join ${businessName} as a ${invite.role}.</p>
        <p><a href="${inviteUrl}">Click here to accept the invite</a></p>
        <p>This invite expires in ${INVITE_EXPIRY_DAYS} days.</p>
      `,
    });

    // Log the action
    await supabase.from('audit_log').insert({
      business_id: invite.business_id,
      user_id: user.id,
      action: 'invite_resent',
      details: { invite_id: inviteId, resend_count: invite.invite_resent_count + 1 },
    });

    return NextResponse.json({
      success: true,
      expiresAt: expiresAt.toISOString(),
      resendsRemaining: MAX_RESEND_COUNT - invite.invite_resent_count - 1,
    });

  } catch (error) {
    console.error('Resend invite error:', error);
    return NextResponse.json(
      { error: 'Failed to resend invite' },
      { status: 500 }
    );
  }
}
```

---

## Phase 9: Audit Logging

**Goal**: Track all important actions for security and debugging

### Audit Log Schema

```sql
-- Ensure audit_log table exists with proper structure
CREATE TABLE IF NOT EXISTS audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID REFERENCES businesses(id),
    user_id UUID REFERENCES auth.users(id),
    action TEXT NOT NULL,
    details JSONB DEFAULT '{}',
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for querying
CREATE INDEX IF NOT EXISTS idx_audit_log_business_id ON audit_log(business_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_user_id ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at DESC);

-- RLS policy
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_log_access" ON audit_log
FOR ALL TO authenticated
USING (
    auth_is_super_admin()
    OR business_id = ANY(auth_get_accessible_business_ids())
)
WITH CHECK (
    auth_is_super_admin()
    OR auth_can_manage_business(business_id)
);
```

### Audit Log Utility

**File**: `src/lib/audit.ts`

```typescript
import { createClient } from '@/lib/supabase/server';
import { headers } from 'next/headers';

export type AuditAction =
  | 'team_member_invited'
  | 'team_member_joined'
  | 'team_member_removed'
  | 'team_member_role_changed'
  | 'invite_resent'
  | 'invite_cancelled'
  | 'business_created'
  | 'business_updated'
  | 'business_deleted'
  | 'forecast_created'
  | 'forecast_updated'
  | 'forecast_deleted'
  | 'settings_updated'
  | 'permissions_changed'
  | 'login_success'
  | 'login_failed';

interface AuditLogEntry {
  businessId?: string;
  userId: string;
  action: AuditAction;
  details?: Record<string, unknown>;
}

export async function logAudit(entry: AuditLogEntry): Promise<void> {
  try {
    const supabase = await createClient();
    const headersList = await headers();

    const ipAddress = headersList.get('x-forwarded-for')?.split(',')[0]
      || headersList.get('x-real-ip')
      || null;
    const userAgent = headersList.get('user-agent') || null;

    await supabase.from('audit_log').insert({
      business_id: entry.businessId || null,
      user_id: entry.userId,
      action: entry.action,
      details: entry.details || {},
      ip_address: ipAddress,
      user_agent: userAgent,
    });
  } catch (error) {
    // Don't throw - audit logging should not break the main flow
    console.error('Audit log error:', error);
  }
}

export async function getAuditLog(
  businessId: string,
  options?: {
    limit?: number;
    offset?: number;
    action?: AuditAction;
    userId?: string;
    startDate?: Date;
    endDate?: Date;
  }
): Promise<{ data: any[]; count: number }> {
  const supabase = await createClient();

  let query = supabase
    .from('audit_log')
    .select('*, users(email, first_name, last_name)', { count: 'exact' })
    .eq('business_id', businessId)
    .order('created_at', { ascending: false });

  if (options?.action) {
    query = query.eq('action', options.action);
  }

  if (options?.userId) {
    query = query.eq('user_id', options.userId);
  }

  if (options?.startDate) {
    query = query.gte('created_at', options.startDate.toISOString());
  }

  if (options?.endDate) {
    query = query.lte('created_at', options.endDate.toISOString());
  }

  if (options?.limit) {
    query = query.limit(options.limit);
  }

  if (options?.offset) {
    query = query.range(options.offset, options.offset + (options.limit || 50) - 1);
  }

  const { data, error, count } = await query;

  if (error) throw error;

  return { data: data || [], count: count || 0 };
}
```

### Actions to Audit

| Action | Where | Details |
|--------|-------|---------|
| team_member_invited | POST /api/team/invite | email, role |
| team_member_joined | POST /api/team/accept-invite | role |
| team_member_removed | DELETE /api/team/[id] | email, role |
| team_member_role_changed | PATCH /api/team/[id] | old_role, new_role |
| invite_resent | POST /api/team/resend-invite | resend_count |
| business_updated | PATCH /api/businesses/[id] | changed_fields |
| forecast_created | POST /api/forecasts | forecast_type |
| settings_updated | PATCH /api/settings | changed_fields |
| permissions_changed | PATCH /api/team/[id]/permissions | old_permissions, new_permissions |

---

## Phase 10: Rate Limiting

**Goal**: Prevent abuse of sensitive endpoints

### Rate Limiting Implementation

**File**: `src/lib/rate-limit.ts`

```typescript
import { Redis } from '@upstash/redis';
import { Ratelimit } from '@upstash/ratelimit';

// Initialize Redis (using Upstash for serverless)
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

// Different rate limiters for different endpoints
export const rateLimiters = {
  // Auth endpoints: 5 requests per minute
  auth: new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(5, '1m'),
    analytics: true,
    prefix: 'ratelimit:auth',
  }),

  // Invite endpoints: 10 requests per hour
  invite: new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(10, '1h'),
    analytics: true,
    prefix: 'ratelimit:invite',
  }),

  // General API: 100 requests per minute
  api: new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(100, '1m'),
    analytics: true,
    prefix: 'ratelimit:api',
  }),
};

export type RateLimitType = keyof typeof rateLimiters;

export async function checkRateLimit(
  type: RateLimitType,
  identifier: string
): Promise<{ success: boolean; remaining: number; reset: number }> {
  const limiter = rateLimiters[type];
  const { success, limit, remaining, reset } = await limiter.limit(identifier);

  return {
    success,
    remaining,
    reset,
  };
}
```

### Apply Rate Limiting

**File**: `src/middleware.ts` (or apply per-route)

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, RateLimitType } from '@/lib/rate-limit';

const RATE_LIMITED_PATHS: Record<string, RateLimitType> = {
  '/api/auth': 'auth',
  '/api/team/invite': 'invite',
  '/api/team/resend-invite': 'invite',
  '/api/team/accept-invite': 'auth',
};

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // Check if this path needs rate limiting
  let rateLimitType: RateLimitType | null = null;

  for (const [prefix, type] of Object.entries(RATE_LIMITED_PATHS)) {
    if (path.startsWith(prefix)) {
      rateLimitType = type;
      break;
    }
  }

  if (rateLimitType) {
    // Use IP + path as identifier
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]
      || request.headers.get('x-real-ip')
      || 'unknown';

    const identifier = `${ip}:${path}`;
    const { success, remaining, reset } = await checkRateLimit(rateLimitType, identifier);

    if (!success) {
      return NextResponse.json(
        {
          error: 'Too many requests',
          code: 'RATE_LIMITED',
          retryAfter: reset,
        },
        {
          status: 429,
          headers: {
            'X-RateLimit-Remaining': remaining.toString(),
            'X-RateLimit-Reset': reset.toString(),
            'Retry-After': Math.ceil((reset - Date.now()) / 1000).toString(),
          },
        }
      );
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: '/api/:path*',
};
```

---

## Phase 11: Error Handling Standards

**Goal**: Consistent, informative error responses

### Error Types

**File**: `src/lib/errors.ts`

```typescript
export type ErrorCode =
  | 'AUTH_REQUIRED'
  | 'PERMISSION_DENIED'
  | 'NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR'
  | 'INVITE_EXPIRED'
  | 'INVITE_INVALID';

export interface ApiError {
  error: string;
  code: ErrorCode;
  details?: Record<string, unknown>;
  field?: string;
}

export class AppError extends Error {
  code: ErrorCode;
  statusCode: number;
  details?: Record<string, unknown>;
  field?: string;

  constructor(
    message: string,
    code: ErrorCode,
    statusCode: number = 500,
    details?: Record<string, unknown>,
    field?: string
  ) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    this.field = field;
  }

  toJSON(): ApiError {
    return {
      error: this.message,
      code: this.code,
      ...(this.details && { details: this.details }),
      ...(this.field && { field: this.field }),
    };
  }
}

// Common errors
export const Errors = {
  unauthorized: () => new AppError('Authentication required', 'AUTH_REQUIRED', 401),
  forbidden: (message = 'Permission denied') => new AppError(message, 'PERMISSION_DENIED', 403),
  notFound: (resource = 'Resource') => new AppError(`${resource} not found`, 'NOT_FOUND', 404),
  validation: (message: string, field?: string) => new AppError(message, 'VALIDATION_ERROR', 400, undefined, field),
  conflict: (message: string) => new AppError(message, 'CONFLICT', 409),
  rateLimited: (retryAfter: number) => new AppError('Too many requests', 'RATE_LIMITED', 429, { retryAfter }),
  internal: (message = 'Internal server error') => new AppError(message, 'INTERNAL_ERROR', 500),
  inviteExpired: () => new AppError('Invite has expired', 'INVITE_EXPIRED', 410),
  inviteInvalid: () => new AppError('Invalid or already used invite', 'INVITE_INVALID', 404),
};
```

### Error Handler Wrapper

**File**: `src/lib/api-handler.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { AppError } from './errors';
import { logAudit } from './audit';

type ApiHandler = (request: NextRequest) => Promise<NextResponse>;

export function withErrorHandling(handler: ApiHandler): ApiHandler {
  return async (request: NextRequest) => {
    try {
      return await handler(request);
    } catch (error) {
      if (error instanceof AppError) {
        return NextResponse.json(error.toJSON(), { status: error.statusCode });
      }

      // Log unexpected errors
      console.error('Unhandled API error:', error);

      // Don't expose internal errors to clients
      return NextResponse.json(
        { error: 'Internal server error', code: 'INTERNAL_ERROR' },
        { status: 500 }
      );
    }
  };
}
```

---

## Phase 12: Create Jessica & Test

**Goal**: Prove team member access works end-to-end

### Step 12.1: Create Jessica in Supabase Auth Dashboard

1. Go to Supabase Dashboard → Authentication → Users
2. Click "Add user"
3. Enter:
   - Email: `jessica@ohnine.com.au`
   - Password: `TempPass123!`
   - Check "Auto Confirm User"
4. Click "Create user"
5. Copy the generated UUID

### Step 12.2: Add Jessica to public.users

```sql
-- Replace JESSICA_AUTH_ID with the UUID from step 1
INSERT INTO users (id, email, first_name, last_name, system_role)
VALUES (
  'JESSICA_AUTH_ID',
  'jessica@ohnine.com.au',
  'Jessica',
  'Molloy',
  'client'
);
```

### Step 12.3: Add Jessica to system_roles

```sql
INSERT INTO system_roles (user_id, role)
VALUES ('JESSICA_AUTH_ID', 'client');
```

### Step 12.4: Add Jessica to Oh Nine business

```sql
-- Get Oh Nine business ID first
SELECT id FROM businesses WHERE business_name ILIKE '%oh%nine%';

-- Add Jessica as team member
INSERT INTO business_users (
  business_id,
  user_id,
  role,
  status,
  section_permissions,
  invited_at
)
VALUES (
  'OH_NINE_BUSINESS_ID',
  'JESSICA_AUTH_ID',
  'member',
  'active',
  '{"dashboard":true,"weekly_reviews":true,"forecasts":true,"finances":false,"team":false,"settings":false}',
  NOW()
);
```

### Step 12.5: Test Login

1. Open browser incognito window
2. Go to app login page
3. Enter:
   - Email: `jessica@ohnine.com.au`
   - Password: `TempPass123!`
4. Should redirect to dashboard

### Step 12.6: Verify Access

| Test | Expected Result |
|------|-----------------|
| See Oh Nine in business selector | ✅ Only Oh Nine visible |
| View dashboard | ✅ Can see dashboard |
| View weekly reviews | ✅ Can see reviews |
| View forecasts | ✅ Can see forecasts |
| View finances | ❌ Access denied or hidden |
| View team settings | ❌ Access denied or hidden |
| Edit weekly review | ✅ Can edit |
| Create forecast | ✅ Can create |

---

## Phase 13: Automated Testing

**Goal**: Prevent RLS regressions with automated tests

### Test File

**File**: `src/__tests__/rls.test.ts`

```typescript
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY!;

// Create admin client (bypasses RLS)
const adminClient = createClient(supabaseUrl, supabaseServiceKey);

// Test data
let testBusinessId: string;
let testUserId: string;
let testTeamMemberId: string;

describe('RLS Policies', () => {
  beforeAll(async () => {
    // Create test data using admin client
    // ...setup code...
  });

  afterAll(async () => {
    // Clean up test data
    // ...cleanup code...
  });

  describe('auth_is_super_admin()', () => {
    it('returns true for super_admin', async () => {
      const client = await createAuthenticatedClient('super_admin@test.com');
      const { data, error } = await client.rpc('auth_is_super_admin');
      expect(error).toBeNull();
      expect(data).toBe(true);
    });

    it('returns false for regular user', async () => {
      const client = await createAuthenticatedClient('user@test.com');
      const { data, error } = await client.rpc('auth_is_super_admin');
      expect(error).toBeNull();
      expect(data).toBe(false);
    });
  });

  describe('businesses table', () => {
    it('owner can see their business', async () => {
      const client = await createAuthenticatedClient('owner@test.com');
      const { data, error } = await client
        .from('businesses')
        .select('*')
        .eq('id', testBusinessId);

      expect(error).toBeNull();
      expect(data).toHaveLength(1);
    });

    it('team member can see their business', async () => {
      const client = await createAuthenticatedClient('team@test.com');
      const { data, error } = await client
        .from('businesses')
        .select('*')
        .eq('id', testBusinessId);

      expect(error).toBeNull();
      expect(data).toHaveLength(1);
    });

    it('unrelated user cannot see business', async () => {
      const client = await createAuthenticatedClient('other@test.com');
      const { data, error } = await client
        .from('businesses')
        .select('*')
        .eq('id', testBusinessId);

      expect(error).toBeNull();
      expect(data).toHaveLength(0);
    });
  });

  describe('weekly_reviews table', () => {
    it('team member can view reviews', async () => {
      const client = await createAuthenticatedClient('team@test.com');
      const { data, error } = await client
        .from('weekly_reviews')
        .select('*')
        .eq('business_id', testBusinessId);

      expect(error).toBeNull();
      // Should return data (not empty if reviews exist)
    });

    it('viewer cannot edit reviews', async () => {
      const client = await createAuthenticatedClient('viewer@test.com');
      const { error } = await client
        .from('weekly_reviews')
        .update({ notes: 'hacked' })
        .eq('business_id', testBusinessId);

      // Should fail due to WITH CHECK
      expect(error).not.toBeNull();
    });
  });

  describe('section permissions', () => {
    it('member without finance permission cannot access finances API', async () => {
      const response = await fetch('/api/business-financial-goals?businessId=' + testBusinessId, {
        headers: {
          'Authorization': 'Bearer ' + teamMemberToken,
        },
      });

      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data.code).toBe('PERMISSION_DENIED');
    });
  });
});

// Helper function
async function createAuthenticatedClient(email: string) {
  // ... create client authenticated as specific user
}
```

### Run Tests in CI

**File**: `.github/workflows/test-rls.yml`

```yaml
name: RLS Tests

on:
  push:
    paths:
      - 'supabase/migrations/**'
      - 'src/lib/permissions.ts'
      - 'src/__tests__/rls.test.ts'
  pull_request:
    paths:
      - 'supabase/migrations/**'

jobs:
  test:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node
        uses: actions/setup-node@v3
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci

      - name: Start Supabase local
        run: npx supabase start

      - name: Run migrations
        run: npx supabase db reset

      - name: Run RLS tests
        run: npm run test:rls
        env:
          SUPABASE_URL: http://localhost:54321
          SUPABASE_SERVICE_KEY: ${{ secrets.SUPABASE_SERVICE_KEY }}
```

---

## Phase 14: Performance Benchmarking

**Goal**: Ensure RLS doesn't cause performance issues at scale

### Benchmark Queries

```sql
-- Test query performance with EXPLAIN ANALYZE

-- Test 1: Super admin listing all businesses
EXPLAIN ANALYZE
SELECT * FROM businesses
WHERE auth_is_super_admin();

-- Test 2: Team member listing their businesses
EXPLAIN ANALYZE
SELECT * FROM businesses
WHERE id = ANY(auth_get_accessible_business_ids());

-- Test 3: Accessing weekly_reviews
EXPLAIN ANALYZE
SELECT * FROM weekly_reviews
WHERE business_id = ANY(auth_get_accessible_business_ids())
LIMIT 100;

-- Test 4: Complex join with RLS
EXPLAIN ANALYZE
SELECT
  b.business_name,
  wr.period_start,
  wr.notes
FROM businesses b
JOIN weekly_reviews wr ON wr.business_id = b.id
WHERE b.id = ANY(auth_get_accessible_business_ids())
ORDER BY wr.period_start DESC
LIMIT 50;
```

### Performance Targets

| Query | Target | Acceptable |
|-------|--------|------------|
| List businesses | < 50ms | < 200ms |
| List weekly reviews | < 100ms | < 500ms |
| Complex joins | < 200ms | < 1000ms |
| Any query | - | Never timeout |

### Load Test Script

**File**: `scripts/benchmark-rls.ts`

```typescript
import { createClient } from '@supabase/supabase-js';

async function benchmark() {
  const client = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!
  );

  // Login as test user
  await client.auth.signInWithPassword({
    email: 'test@example.com',
    password: 'testpass',
  });

  const iterations = 100;
  const results: number[] = [];

  for (let i = 0; i < iterations; i++) {
    const start = performance.now();

    await client
      .from('weekly_reviews')
      .select('*')
      .limit(50);

    const end = performance.now();
    results.push(end - start);
  }

  const avg = results.reduce((a, b) => a + b, 0) / results.length;
  const max = Math.max(...results);
  const min = Math.min(...results);
  const p95 = results.sort((a, b) => a - b)[Math.floor(iterations * 0.95)];

  console.log(`
RLS Performance Benchmark Results
=================================
Iterations: ${iterations}
Average: ${avg.toFixed(2)}ms
Min: ${min.toFixed(2)}ms
Max: ${max.toFixed(2)}ms
P95: ${p95.toFixed(2)}ms
  `);
}

benchmark();
```

---

## Phase 15: Documentation

**Goal**: Complete, maintainable documentation

### Update RLS_ARCHITECTURE.md

**File**: `docs/RLS_ARCHITECTURE.md`

```markdown
# RLS Architecture

## Overview

This document describes the Row Level Security (RLS) implementation for the business coaching platform.

## Functions

| Function | Purpose | Returns |
|----------|---------|---------|
| auth_is_super_admin() | Check if super_admin | BOOLEAN |
| auth_get_user_role() | Get system role | TEXT |
| auth_get_accessible_business_ids() | Get accessible business UUIDs | UUID[] |
| auth_get_accessible_business_ids_text() | Same for TEXT columns | TEXT[] |
| auth_is_team_member_of(UUID) | Check team membership | BOOLEAN |
| auth_is_coach_of(UUID) | Check coach assignment | BOOLEAN |
| auth_is_owner_of(UUID) | Check ownership | BOOLEAN |
| auth_can_access_business(UUID) | Combined access check | BOOLEAN |
| auth_can_manage_business(UUID) | Check write access | BOOLEAN |
| auth_can_manage_team(UUID) | Check team management | BOOLEAN |
| auth_get_team_role(UUID) | Get role in business | TEXT |
| auth_get_section_permissions(UUID) | Get section permissions | JSONB |

## Policy Patterns

### Pattern A: Core Tables
Used for: businesses, business_users, users

### Pattern B: Business Data Tables
Used for: weekly_reviews, forecasts, etc.

### Pattern C: Child Tables
Used for: forecast_pl_lines, etc.

### Pattern D: User Tables
Used for: system_roles

## Testing

Run `npm run test:rls` to test all RLS policies.

## Troubleshooting

### Common Issues

1. **Infinite recursion**: Check that SECURITY DEFINER is set
2. **Type mismatch**: Check if using UUID or TEXT version
3. **Permission denied**: Check section_permissions in business_users

### Debug Queries

```sql
-- Check user's accessible businesses
SELECT auth_get_accessible_business_ids();

-- Check if user is super_admin
SELECT auth_is_super_admin();

-- Check section permissions
SELECT auth_get_section_permissions('business-uuid-here');
```
```

### Create TEAM_MEMBER_GUIDE.md

**File**: `docs/TEAM_MEMBER_GUIDE.md`

```markdown
# Team Member Access Guide

## Adding a Team Member

1. Go to Business Settings → Team
2. Click "Invite Team Member"
3. Enter email and select role
4. Configure section permissions
5. Click "Send Invite"

## Roles

| Role | Permissions |
|------|-------------|
| Admin | Full access, can manage team |
| Member | Full access based on section permissions |
| Viewer | Read-only access based on section permissions |

## Section Permissions

- Dashboard: View main dashboard
- Weekly Reviews: View/edit weekly reviews
- Forecasts: View/edit financial forecasts
- Finances: View/edit financial data
- Team: Manage team members
- Settings: Modify business settings

## Troubleshooting

### "Access Denied" Error
- Check that user has correct role
- Check section_permissions in database
- Verify user status is 'active'

### User Can't Login
- Verify user exists in auth.users
- Check if email matches exactly
- Verify password is correct
```

---

## Rollback Plan

If anything goes wrong at any phase:

### Immediate Rollback

```sql
-- Run the snapshot rollback script
\i supabase/migrations/20260127_rls_rollback_snapshot.sql
```

### Manual Rollback Steps

1. **Functions**: Drop new auth_* functions, restore old is_* functions
2. **Policies**: Drop new policies, restore old policies
3. **Indexes**: Indexes can stay (they don't affect correctness)
4. **Code**: Revert Git commits for API changes

### Rollback Script Template

```sql
-- =====================================================
-- EMERGENCY ROLLBACK
-- =====================================================

BEGIN;

-- Drop new functions
DROP FUNCTION IF EXISTS auth_is_super_admin() CASCADE;
DROP FUNCTION IF EXISTS auth_get_user_role() CASCADE;
DROP FUNCTION IF EXISTS auth_get_accessible_business_ids() CASCADE;
DROP FUNCTION IF EXISTS auth_get_accessible_business_ids_text() CASCADE;
DROP FUNCTION IF EXISTS auth_is_team_member_of(UUID) CASCADE;
DROP FUNCTION IF EXISTS auth_is_coach_of(UUID) CASCADE;
DROP FUNCTION IF EXISTS auth_is_owner_of(UUID) CASCADE;
DROP FUNCTION IF EXISTS auth_can_access_business(UUID) CASCADE;
DROP FUNCTION IF EXISTS auth_can_manage_business(UUID) CASCADE;
DROP FUNCTION IF EXISTS auth_can_manage_team(UUID) CASCADE;
DROP FUNCTION IF EXISTS auth_get_team_role(UUID) CASCADE;
DROP FUNCTION IF EXISTS auth_get_section_permissions(UUID) CASCADE;

-- Restore from backup...
-- [Content from rollback snapshot file]

COMMIT;
```

---

## Success Criteria

### Must Pass (Critical)

| Criteria | How to Verify |
|----------|---------------|
| No 500 errors | Load any page as any user |
| Super admin sees all | Dashboard shows all clients |
| Team member sees their business | Jessica sees Oh Nine |
| Team member can view data | Jessica can view weekly reviews |
| Viewer cannot edit | Test with viewer role |
| No infinite recursion | Check Supabase logs |
| All 12 functions exist | Run verification query |
| All tables have policies | Run verification query |

### Should Pass (Important)

| Criteria | How to Verify |
|----------|---------------|
| Indexes exist | Run EXPLAIN ANALYZE |
| Query times < 200ms | Run benchmark |
| Section permissions enforced | Test API as restricted user |
| Invite flow works | Send and accept invite |
| Audit logs created | Check audit_log table |

### Nice to Have (Future)

| Criteria | How to Verify |
|----------|---------------|
| Rate limiting works | Spam endpoint |
| Automated tests pass | Run test suite |
| Documentation complete | Review docs |

---

## Execution Checklist

- [ ] **Phase 1**: Run verification queries
- [ ] **Phase 2**: Create rollback snapshot
- [ ] **Phase 3**: Create performance indexes
- [ ] **Phase 4**: Create RLS functions
- [ ] **Phase 5**: Apply RLS policies
- [ ] **Phase 6**: Add soft delete safety
- [ ] **Phase 7**: Implement section permissions middleware
- [ ] **Phase 8**: Harden invite system
- [ ] **Phase 9**: Add audit logging
- [ ] **Phase 10**: Implement rate limiting
- [ ] **Phase 11**: Standardize error handling
- [ ] **Phase 12**: Create Jessica and test
- [ ] **Phase 13**: Add automated tests
- [ ] **Phase 14**: Run performance benchmarks
- [ ] **Phase 15**: Complete documentation

---

## Questions Before Proceeding

1. **Do you have a staging environment?** (Recommended to test there first)
2. **What's Jessica's full name?** (For user record)
3. **Should Jessica have any sections disabled?** (Default: finances, team, settings disabled)
4. **Do you want rate limiting?** (Requires Upstash Redis or similar)
5. **Do you want automated tests?** (Requires test environment setup)

---

## Approval

Please confirm:
- [ ] Plan reviewed and understood
- [ ] Ready to proceed with Phase 1 verification
- [ ] Understand rollback process
- [ ] Have Supabase dashboard access for manual steps
