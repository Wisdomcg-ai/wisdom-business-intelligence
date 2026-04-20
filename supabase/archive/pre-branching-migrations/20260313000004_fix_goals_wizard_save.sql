-- ============================================================================
-- FIX: Goals Wizard Save - Drop blocking FK constraints + Add Coach RLS
-- ============================================================================
-- Run this SQL in your Supabase SQL Editor (https://supabase.com/dashboard)
--
-- Fixes TWO issues:
-- 1. FK constraints on business_id columns reference businesses(id), but the
--    code stores business_profiles.id — causing FK violations on save
-- 2. Missing coach INSERT/UPDATE RLS policies on several tables
-- ============================================================================

-- ============================================================================
-- PART 1: Drop FK constraints that block saves
-- The code saves business_profiles.id into business_id columns, but these
-- columns have FK references to businesses(id). This causes FK violations.
-- ============================================================================

-- Drop FK on business_kpis.business_id if it references businesses(id)
DO $$
DECLARE
    constraint_name TEXT;
BEGIN
    SELECT tc.constraint_name INTO constraint_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
    JOIN information_schema.constraint_column_usage ccu
        ON ccu.constraint_name = tc.constraint_name
    WHERE tc.table_name = 'business_kpis'
        AND tc.constraint_type = 'FOREIGN KEY'
        AND kcu.column_name = 'business_id'
        AND ccu.table_name = 'businesses'
    LIMIT 1;

    IF constraint_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE business_kpis DROP CONSTRAINT %I', constraint_name);
        RAISE NOTICE 'Dropped FK constraint % on business_kpis.business_id', constraint_name;
    ELSE
        RAISE NOTICE 'No FK constraint found on business_kpis.business_id referencing businesses';
    END IF;
END $$;

-- Drop FK on business_financial_goals.business_id if it references businesses(id)
DO $$
DECLARE
    constraint_name TEXT;
BEGIN
    SELECT tc.constraint_name INTO constraint_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
    JOIN information_schema.constraint_column_usage ccu
        ON ccu.constraint_name = tc.constraint_name
    WHERE tc.table_name = 'business_financial_goals'
        AND tc.constraint_type = 'FOREIGN KEY'
        AND kcu.column_name = 'business_id'
        AND ccu.table_name = 'businesses'
    LIMIT 1;

    IF constraint_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE business_financial_goals DROP CONSTRAINT %I', constraint_name);
        RAISE NOTICE 'Dropped FK constraint % on business_financial_goals.business_id', constraint_name;
    ELSE
        RAISE NOTICE 'No FK constraint found on business_financial_goals.business_id referencing businesses';
    END IF;
END $$;

-- Drop FK on strategic_initiatives.business_id if it references businesses(id)
DO $$
DECLARE
    constraint_name TEXT;
BEGIN
    SELECT tc.constraint_name INTO constraint_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
    JOIN information_schema.constraint_column_usage ccu
        ON ccu.constraint_name = tc.constraint_name
    WHERE tc.table_name = 'strategic_initiatives'
        AND tc.constraint_type = 'FOREIGN KEY'
        AND kcu.column_name = 'business_id'
        AND ccu.table_name = 'businesses'
    LIMIT 1;

    IF constraint_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE strategic_initiatives DROP CONSTRAINT %I', constraint_name);
        RAISE NOTICE 'Dropped FK constraint % on strategic_initiatives.business_id', constraint_name;
    ELSE
        RAISE NOTICE 'No FK constraint found on strategic_initiatives.business_id referencing businesses';
    END IF;
END $$;

-- Drop FK on sprint_key_actions.business_id if it references businesses(id)
DO $$
DECLARE
    constraint_name TEXT;
BEGIN
    SELECT tc.constraint_name INTO constraint_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
    JOIN information_schema.constraint_column_usage ccu
        ON ccu.constraint_name = tc.constraint_name
    WHERE tc.table_name = 'sprint_key_actions'
        AND tc.constraint_type = 'FOREIGN KEY'
        AND kcu.column_name = 'business_id'
        AND ccu.table_name = 'businesses'
    LIMIT 1;

    IF constraint_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE sprint_key_actions DROP CONSTRAINT %I', constraint_name);
        RAISE NOTICE 'Dropped FK constraint % on sprint_key_actions.business_id', constraint_name;
    ELSE
        RAISE NOTICE 'No FK constraint found on sprint_key_actions.business_id referencing businesses';
    END IF;
END $$;

-- Drop FK on operational_activities.business_id if it references businesses(id)
DO $$
DECLARE
    constraint_name TEXT;
BEGIN
    SELECT tc.constraint_name INTO constraint_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
    JOIN information_schema.constraint_column_usage ccu
        ON ccu.constraint_name = tc.constraint_name
    WHERE tc.table_name = 'operational_activities'
        AND tc.constraint_type = 'FOREIGN KEY'
        AND kcu.column_name = 'business_id'
        AND ccu.table_name = 'businesses'
    LIMIT 1;

    IF constraint_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE operational_activities DROP CONSTRAINT %I', constraint_name);
        RAISE NOTICE 'Dropped FK constraint % on operational_activities.business_id', constraint_name;
    ELSE
        RAISE NOTICE 'No FK constraint found on operational_activities.business_id referencing businesses';
    END IF;
END $$;


-- ============================================================================
-- PART 2: Ensure business_id columns exist (some tables may use business_profile_id)
-- ============================================================================

-- business_financial_goals: ensure business_id column exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'business_financial_goals' AND column_name = 'business_id') THEN
        -- Check if business_profile_id exists and rename it
        IF EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'business_financial_goals' AND column_name = 'business_profile_id') THEN
            ALTER TABLE business_financial_goals ADD COLUMN business_id TEXT;
            UPDATE business_financial_goals SET business_id = business_profile_id::text WHERE business_id IS NULL;
            RAISE NOTICE 'Added business_id column to business_financial_goals (copied from business_profile_id)';
        ELSE
            ALTER TABLE business_financial_goals ADD COLUMN business_id TEXT;
            RAISE NOTICE 'Added business_id column to business_financial_goals';
        END IF;
    END IF;
END $$;

-- Ensure UNIQUE constraint on business_financial_goals.business_id for upsert
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE tablename = 'business_financial_goals'
        AND indexdef LIKE '%UNIQUE%'
        AND indexdef LIKE '%business_id%'
    ) THEN
        -- Check if there are duplicate business_ids first
        DELETE FROM business_financial_goals a
        USING business_financial_goals b
        WHERE a.id < b.id AND a.business_id = b.business_id AND a.business_id IS NOT NULL;

        ALTER TABLE business_financial_goals ADD CONSTRAINT business_financial_goals_business_id_unique UNIQUE (business_id);
        RAISE NOTICE 'Added UNIQUE constraint on business_financial_goals.business_id';
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not add UNIQUE constraint on business_financial_goals.business_id: %', SQLERRM;
END $$;


-- ============================================================================
-- PART 3: Coach RLS Policies (from 20260313000003)
-- ============================================================================

-- BUSINESS_KPIS
DROP POLICY IF EXISTS "Coaches can insert client KPIs" ON business_kpis;
DROP POLICY IF EXISTS "Coaches can update client KPIs" ON business_kpis;
DROP POLICY IF EXISTS "Coaches can delete client KPIs" ON business_kpis;

CREATE POLICY "Coaches can insert client KPIs" ON business_kpis
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM business_profiles bp
            JOIN businesses b ON b.id = bp.business_id
            WHERE bp.id::text = business_kpis.business_id::text
            AND b.assigned_coach_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM businesses b
            WHERE b.id::text = business_kpis.business_id::text
            AND b.assigned_coach_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM system_roles sr
            WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin'
        )
    );

CREATE POLICY "Coaches can update client KPIs" ON business_kpis
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM business_profiles bp
            JOIN businesses b ON b.id = bp.business_id
            WHERE bp.id::text = business_kpis.business_id::text
            AND b.assigned_coach_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM businesses b
            WHERE b.id::text = business_kpis.business_id::text
            AND b.assigned_coach_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM system_roles sr
            WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin'
        )
    );

CREATE POLICY "Coaches can delete client KPIs" ON business_kpis
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM business_profiles bp
            JOIN businesses b ON b.id = bp.business_id
            WHERE bp.id::text = business_kpis.business_id::text
            AND b.assigned_coach_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM businesses b
            WHERE b.id::text = business_kpis.business_id::text
            AND b.assigned_coach_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM system_roles sr
            WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin'
        )
    );

-- SPRINT_KEY_ACTIONS
DROP POLICY IF EXISTS "Coaches can view client sprint actions" ON sprint_key_actions;
DROP POLICY IF EXISTS "Coaches can insert client sprint actions" ON sprint_key_actions;
DROP POLICY IF EXISTS "Coaches can update client sprint actions" ON sprint_key_actions;
DROP POLICY IF EXISTS "Coaches can delete client sprint actions" ON sprint_key_actions;

CREATE POLICY "Coaches can view client sprint actions" ON sprint_key_actions
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM business_profiles bp JOIN businesses b ON b.id = bp.business_id WHERE bp.id::text = sprint_key_actions.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM businesses b WHERE b.id::text = sprint_key_actions.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
    );

CREATE POLICY "Coaches can insert client sprint actions" ON sprint_key_actions
    FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM business_profiles bp JOIN businesses b ON b.id = bp.business_id WHERE bp.id::text = sprint_key_actions.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM businesses b WHERE b.id::text = sprint_key_actions.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
    );

CREATE POLICY "Coaches can update client sprint actions" ON sprint_key_actions
    FOR UPDATE USING (
        EXISTS (SELECT 1 FROM business_profiles bp JOIN businesses b ON b.id = bp.business_id WHERE bp.id::text = sprint_key_actions.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM businesses b WHERE b.id::text = sprint_key_actions.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
    );

CREATE POLICY "Coaches can delete client sprint actions" ON sprint_key_actions
    FOR DELETE USING (
        EXISTS (SELECT 1 FROM business_profiles bp JOIN businesses b ON b.id = bp.business_id WHERE bp.id::text = sprint_key_actions.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM businesses b WHERE b.id::text = sprint_key_actions.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
    );

-- OPERATIONAL_ACTIVITIES
DROP POLICY IF EXISTS "Coaches can view client operational activities" ON operational_activities;
DROP POLICY IF EXISTS "Coaches can insert client operational activities" ON operational_activities;
DROP POLICY IF EXISTS "Coaches can update client operational activities" ON operational_activities;
DROP POLICY IF EXISTS "Coaches can delete client operational activities" ON operational_activities;

CREATE POLICY "Coaches can view client operational activities" ON operational_activities
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM business_profiles bp JOIN businesses b ON b.id = bp.business_id WHERE bp.id::text = operational_activities.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM businesses b WHERE b.id::text = operational_activities.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
    );

CREATE POLICY "Coaches can insert client operational activities" ON operational_activities
    FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM business_profiles bp JOIN businesses b ON b.id = bp.business_id WHERE bp.id::text = operational_activities.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM businesses b WHERE b.id::text = operational_activities.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
    );

CREATE POLICY "Coaches can update client operational activities" ON operational_activities
    FOR UPDATE USING (
        EXISTS (SELECT 1 FROM business_profiles bp JOIN businesses b ON b.id = bp.business_id WHERE bp.id::text = operational_activities.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM businesses b WHERE b.id::text = operational_activities.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
    );

CREATE POLICY "Coaches can delete client operational activities" ON operational_activities
    FOR DELETE USING (
        EXISTS (SELECT 1 FROM business_profiles bp JOIN businesses b ON b.id = bp.business_id WHERE bp.id::text = operational_activities.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM businesses b WHERE b.id::text = operational_activities.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
    );

-- Coach v2 policies on financial goals and strategic initiatives (ensure both ID patterns work)
DROP POLICY IF EXISTS "Coaches can insert business financial goals v2" ON business_financial_goals;
DROP POLICY IF EXISTS "Coaches can update business financial goals v2" ON business_financial_goals;

CREATE POLICY "Coaches can insert business financial goals v2" ON business_financial_goals
    FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM business_profiles bp JOIN businesses b ON b.id = bp.business_id WHERE bp.id::text = business_financial_goals.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM businesses b WHERE b.id::text = business_financial_goals.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
    );

CREATE POLICY "Coaches can update business financial goals v2" ON business_financial_goals
    FOR UPDATE USING (
        EXISTS (SELECT 1 FROM business_profiles bp JOIN businesses b ON b.id = bp.business_id WHERE bp.id::text = business_financial_goals.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM businesses b WHERE b.id::text = business_financial_goals.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
    );

DROP POLICY IF EXISTS "Coaches can insert strategic initiatives v2" ON strategic_initiatives;
DROP POLICY IF EXISTS "Coaches can update strategic initiatives v2" ON strategic_initiatives;
DROP POLICY IF EXISTS "Coaches can delete strategic initiatives v2" ON strategic_initiatives;

CREATE POLICY "Coaches can insert strategic initiatives v2" ON strategic_initiatives
    FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM business_profiles bp JOIN businesses b ON b.id = bp.business_id WHERE bp.id::text = strategic_initiatives.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM businesses b WHERE b.id::text = strategic_initiatives.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
    );

CREATE POLICY "Coaches can update strategic initiatives v2" ON strategic_initiatives
    FOR UPDATE USING (
        EXISTS (SELECT 1 FROM business_profiles bp JOIN businesses b ON b.id = bp.business_id WHERE bp.id::text = strategic_initiatives.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM businesses b WHERE b.id::text = strategic_initiatives.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
    );

CREATE POLICY "Coaches can delete strategic initiatives v2" ON strategic_initiatives
    FOR DELETE USING (
        EXISTS (SELECT 1 FROM business_profiles bp JOIN businesses b ON b.id = bp.business_id WHERE bp.id::text = strategic_initiatives.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM businesses b WHERE b.id::text = strategic_initiatives.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
    );

-- ACTIVITY_LOG (KPI service writes here)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'activity_log') THEN
        DROP POLICY IF EXISTS "Coaches can insert client activity log" ON activity_log;
        CREATE POLICY "Coaches can insert client activity log" ON activity_log
            FOR INSERT WITH CHECK (
                EXISTS (SELECT 1 FROM business_profiles bp JOIN businesses b ON b.id = bp.business_id WHERE bp.id::text = activity_log.business_id::text AND b.assigned_coach_id = auth.uid())
                OR EXISTS (SELECT 1 FROM businesses b WHERE b.id::text = activity_log.business_id::text AND b.assigned_coach_id = auth.uid())
                OR EXISTS (SELECT 1 FROM system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
            );
    END IF;
END $$;
