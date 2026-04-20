-- ============================================================================
-- COMPLETE FIX: Goals Wizard Save for Coach Users
-- ============================================================================
-- Run this SQL in your Supabase SQL Editor (https://supabase.com/dashboard)
--
-- This migration fixes coach saves in the Goals Wizard by:
-- 1. Adding coach INSERT/UPDATE/DELETE RLS policies on all goals-related tables
-- 2. Ensuring business_financial_goals has the business_id column the code uses
-- 3. Dropping FK constraints that block saves with business_profiles.id values
--
-- Safe to run multiple times (idempotent).
-- ============================================================================

-- ============================================================================
-- PART 1: Coach RLS Policies for business_kpis
-- ============================================================================

DROP POLICY IF EXISTS "Coaches can view client KPIs" ON business_kpis;
DROP POLICY IF EXISTS "Coaches can insert client KPIs" ON business_kpis;
DROP POLICY IF EXISTS "Coaches can update client KPIs" ON business_kpis;
DROP POLICY IF EXISTS "Coaches can delete client KPIs" ON business_kpis;

CREATE POLICY "Coaches can view client KPIs" ON business_kpis
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM businesses b
            WHERE b.id::text = business_kpis.business_id::text
            AND b.assigned_coach_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM business_profiles bp
            JOIN businesses b ON b.id = bp.business_id
            WHERE bp.id::text = business_kpis.business_id::text
            AND b.assigned_coach_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM system_roles sr
            WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin'
        )
    );

CREATE POLICY "Coaches can insert client KPIs" ON business_kpis
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM businesses b
            WHERE b.id::text = business_kpis.business_id::text
            AND b.assigned_coach_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM business_profiles bp
            JOIN businesses b ON b.id = bp.business_id
            WHERE bp.id::text = business_kpis.business_id::text
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
            SELECT 1 FROM businesses b
            WHERE b.id::text = business_kpis.business_id::text
            AND b.assigned_coach_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM business_profiles bp
            JOIN businesses b ON b.id = bp.business_id
            WHERE bp.id::text = business_kpis.business_id::text
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
            SELECT 1 FROM businesses b
            WHERE b.id::text = business_kpis.business_id::text
            AND b.assigned_coach_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM business_profiles bp
            JOIN businesses b ON b.id = bp.business_id
            WHERE bp.id::text = business_kpis.business_id::text
            AND b.assigned_coach_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM system_roles sr
            WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin'
        )
    );

-- ============================================================================
-- PART 2: Coach RLS Policies for strategic_initiatives
-- ============================================================================

DROP POLICY IF EXISTS "Coaches can insert strategic initiatives v2" ON strategic_initiatives;
DROP POLICY IF EXISTS "Coaches can update strategic initiatives v2" ON strategic_initiatives;
DROP POLICY IF EXISTS "Coaches can delete strategic initiatives v2" ON strategic_initiatives;

CREATE POLICY "Coaches can insert strategic initiatives v2" ON strategic_initiatives
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM businesses b
            WHERE b.id::text = strategic_initiatives.business_id::text
            AND b.assigned_coach_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM business_profiles bp
            JOIN businesses b ON b.id = bp.business_id
            WHERE bp.id::text = strategic_initiatives.business_id::text
            AND b.assigned_coach_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM system_roles sr
            WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin'
        )
    );

CREATE POLICY "Coaches can update strategic initiatives v2" ON strategic_initiatives
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM businesses b
            WHERE b.id::text = strategic_initiatives.business_id::text
            AND b.assigned_coach_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM business_profiles bp
            JOIN businesses b ON b.id = bp.business_id
            WHERE bp.id::text = strategic_initiatives.business_id::text
            AND b.assigned_coach_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM system_roles sr
            WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin'
        )
    );

CREATE POLICY "Coaches can delete strategic initiatives v2" ON strategic_initiatives
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM businesses b
            WHERE b.id::text = strategic_initiatives.business_id::text
            AND b.assigned_coach_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM business_profiles bp
            JOIN businesses b ON b.id = bp.business_id
            WHERE bp.id::text = strategic_initiatives.business_id::text
            AND b.assigned_coach_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM system_roles sr
            WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin'
        )
    );

-- ============================================================================
-- PART 3: Coach RLS Policies for business_financial_goals
-- ============================================================================

DROP POLICY IF EXISTS "Coaches can insert business financial goals v2" ON business_financial_goals;
DROP POLICY IF EXISTS "Coaches can update business financial goals v2" ON business_financial_goals;

CREATE POLICY "Coaches can insert business financial goals v2" ON business_financial_goals
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM businesses b
            WHERE b.id::text = business_financial_goals.business_id::text
            AND b.assigned_coach_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM business_profiles bp
            JOIN businesses b ON b.id = bp.business_id
            WHERE bp.id::text = business_financial_goals.business_id::text
            AND b.assigned_coach_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM system_roles sr
            WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin'
        )
    );

CREATE POLICY "Coaches can update business financial goals v2" ON business_financial_goals
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM businesses b
            WHERE b.id::text = business_financial_goals.business_id::text
            AND b.assigned_coach_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM business_profiles bp
            JOIN businesses b ON b.id = bp.business_id
            WHERE bp.id::text = business_financial_goals.business_id::text
            AND b.assigned_coach_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM system_roles sr
            WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin'
        )
    );

-- ============================================================================
-- PART 4: Coach RLS Policies for sprint_key_actions
-- ============================================================================

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'sprint_key_actions') THEN
    EXECUTE 'DROP POLICY IF EXISTS "Coaches can view client sprint actions" ON sprint_key_actions';
    EXECUTE 'DROP POLICY IF EXISTS "Coaches can insert client sprint actions" ON sprint_key_actions';
    EXECUTE 'DROP POLICY IF EXISTS "Coaches can update client sprint actions" ON sprint_key_actions';
    EXECUTE 'DROP POLICY IF EXISTS "Coaches can delete client sprint actions" ON sprint_key_actions';

    EXECUTE '
      CREATE POLICY "Coaches can view client sprint actions" ON sprint_key_actions
          FOR SELECT USING (
              EXISTS (SELECT 1 FROM businesses b WHERE b.id::text = sprint_key_actions.business_id::text AND b.assigned_coach_id = auth.uid())
              OR EXISTS (SELECT 1 FROM business_profiles bp JOIN businesses b ON b.id = bp.business_id WHERE bp.id::text = sprint_key_actions.business_id::text AND b.assigned_coach_id = auth.uid())
              OR EXISTS (SELECT 1 FROM system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = ''super_admin'')
          )';

    EXECUTE '
      CREATE POLICY "Coaches can insert client sprint actions" ON sprint_key_actions
          FOR INSERT WITH CHECK (
              EXISTS (SELECT 1 FROM businesses b WHERE b.id::text = sprint_key_actions.business_id::text AND b.assigned_coach_id = auth.uid())
              OR EXISTS (SELECT 1 FROM business_profiles bp JOIN businesses b ON b.id = bp.business_id WHERE bp.id::text = sprint_key_actions.business_id::text AND b.assigned_coach_id = auth.uid())
              OR EXISTS (SELECT 1 FROM system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = ''super_admin'')
          )';

    EXECUTE '
      CREATE POLICY "Coaches can update client sprint actions" ON sprint_key_actions
          FOR UPDATE USING (
              EXISTS (SELECT 1 FROM businesses b WHERE b.id::text = sprint_key_actions.business_id::text AND b.assigned_coach_id = auth.uid())
              OR EXISTS (SELECT 1 FROM business_profiles bp JOIN businesses b ON b.id = bp.business_id WHERE bp.id::text = sprint_key_actions.business_id::text AND b.assigned_coach_id = auth.uid())
              OR EXISTS (SELECT 1 FROM system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = ''super_admin'')
          )';

    EXECUTE '
      CREATE POLICY "Coaches can delete client sprint actions" ON sprint_key_actions
          FOR DELETE USING (
              EXISTS (SELECT 1 FROM businesses b WHERE b.id::text = sprint_key_actions.business_id::text AND b.assigned_coach_id = auth.uid())
              OR EXISTS (SELECT 1 FROM business_profiles bp JOIN businesses b ON b.id = bp.business_id WHERE bp.id::text = sprint_key_actions.business_id::text AND b.assigned_coach_id = auth.uid())
              OR EXISTS (SELECT 1 FROM system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = ''super_admin'')
          )';
  END IF;
END $$;

-- ============================================================================
-- PART 5: Coach RLS Policies for operational_activities
-- ============================================================================

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'operational_activities') THEN
    EXECUTE 'DROP POLICY IF EXISTS "Coaches can view client operational activities" ON operational_activities';
    EXECUTE 'DROP POLICY IF EXISTS "Coaches can insert client operational activities" ON operational_activities';
    EXECUTE 'DROP POLICY IF EXISTS "Coaches can update client operational activities" ON operational_activities';
    EXECUTE 'DROP POLICY IF EXISTS "Coaches can delete client operational activities" ON operational_activities';

    EXECUTE '
      CREATE POLICY "Coaches can view client operational activities" ON operational_activities
          FOR SELECT USING (
              EXISTS (SELECT 1 FROM businesses b WHERE b.id::text = operational_activities.business_id::text AND b.assigned_coach_id = auth.uid())
              OR EXISTS (SELECT 1 FROM business_profiles bp JOIN businesses b ON b.id = bp.business_id WHERE bp.id::text = operational_activities.business_id::text AND b.assigned_coach_id = auth.uid())
              OR EXISTS (SELECT 1 FROM system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = ''super_admin'')
          )';

    EXECUTE '
      CREATE POLICY "Coaches can insert client operational activities" ON operational_activities
          FOR INSERT WITH CHECK (
              EXISTS (SELECT 1 FROM businesses b WHERE b.id::text = operational_activities.business_id::text AND b.assigned_coach_id = auth.uid())
              OR EXISTS (SELECT 1 FROM business_profiles bp JOIN businesses b ON b.id = bp.business_id WHERE bp.id::text = operational_activities.business_id::text AND b.assigned_coach_id = auth.uid())
              OR EXISTS (SELECT 1 FROM system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = ''super_admin'')
          )';

    EXECUTE '
      CREATE POLICY "Coaches can update client operational activities" ON operational_activities
          FOR UPDATE USING (
              EXISTS (SELECT 1 FROM businesses b WHERE b.id::text = operational_activities.business_id::text AND b.assigned_coach_id = auth.uid())
              OR EXISTS (SELECT 1 FROM business_profiles bp JOIN businesses b ON b.id = bp.business_id WHERE bp.id::text = operational_activities.business_id::text AND b.assigned_coach_id = auth.uid())
              OR EXISTS (SELECT 1 FROM system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = ''super_admin'')
          )';

    EXECUTE '
      CREATE POLICY "Coaches can delete client operational activities" ON operational_activities
          FOR DELETE USING (
              EXISTS (SELECT 1 FROM businesses b WHERE b.id::text = operational_activities.business_id::text AND b.assigned_coach_id = auth.uid())
              OR EXISTS (SELECT 1 FROM business_profiles bp JOIN businesses b ON b.id = bp.business_id WHERE bp.id::text = operational_activities.business_id::text AND b.assigned_coach_id = auth.uid())
              OR EXISTS (SELECT 1 FROM system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = ''super_admin'')
          )';
  END IF;
END $$;

-- ============================================================================
-- PART 6: Coach RLS Policy for activity_log (KPI service logs here)
-- ============================================================================

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'activity_log') THEN
    EXECUTE 'DROP POLICY IF EXISTS "Coaches can insert client activity log" ON activity_log';
    EXECUTE '
      CREATE POLICY "Coaches can insert client activity log" ON activity_log
          FOR INSERT WITH CHECK (
              EXISTS (SELECT 1 FROM businesses b WHERE b.id::text = activity_log.business_id::text AND b.assigned_coach_id = auth.uid())
              OR EXISTS (SELECT 1 FROM business_profiles bp JOIN businesses b ON b.id = bp.business_id WHERE bp.id::text = activity_log.business_id::text AND b.assigned_coach_id = auth.uid())
              OR EXISTS (SELECT 1 FROM system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = ''super_admin'')
          )';
  END IF;
END $$;

-- ============================================================================
-- PART 7: Ensure business_financial_goals has business_id column
-- The FinancialService saves to business_id, but the original table only has
-- business_profile_id. Add the column if missing.
-- ============================================================================

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'business_financial_goals' AND column_name = 'business_id'
  ) THEN
    ALTER TABLE business_financial_goals ADD COLUMN business_id TEXT;

    -- Copy existing data from business_profile_id if available
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'business_financial_goals' AND column_name = 'business_profile_id'
    ) THEN
      UPDATE business_financial_goals
      SET business_id = business_profile_id::text
      WHERE business_id IS NULL AND business_profile_id IS NOT NULL;
    END IF;

    RAISE NOTICE 'Added business_id column to business_financial_goals';
  END IF;
END $$;

-- Add UNIQUE constraint for upsert onConflict: 'business_id'
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'business_financial_goals_business_id_unique'
  ) THEN
    -- Remove duplicates before adding unique constraint
    DELETE FROM business_financial_goals a
    USING business_financial_goals b
    WHERE a.id < b.id
      AND a.business_id = b.business_id
      AND a.business_id IS NOT NULL;

    ALTER TABLE business_financial_goals
      ADD CONSTRAINT business_financial_goals_business_id_unique UNIQUE (business_id);
    RAISE NOTICE 'Added UNIQUE constraint on business_financial_goals.business_id';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not add UNIQUE constraint: %', SQLERRM;
END $$;

-- ============================================================================
-- PART 8: Drop FK constraints that block saves
-- business_kpis.business_id has REFERENCES businesses(id), but the code may
-- store business_profiles.id — drop the FK to allow both ID types.
-- ============================================================================

DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  -- Drop FK on business_kpis.business_id
  SELECT tc.constraint_name INTO constraint_name
  FROM information_schema.table_constraints tc
  JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
  WHERE tc.table_name = 'business_kpis'
    AND tc.constraint_type = 'FOREIGN KEY'
    AND ccu.column_name = 'business_id'
    AND ccu.table_name = 'businesses'
  LIMIT 1;

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE business_kpis DROP CONSTRAINT %I', constraint_name);
    RAISE NOTICE 'Dropped FK constraint % on business_kpis.business_id', constraint_name;
  ELSE
    RAISE NOTICE 'No FK constraint found on business_kpis.business_id -> businesses';
  END IF;
END $$;

-- ============================================================================
-- Done! The Goals Wizard should now save correctly for coach users.
-- ============================================================================
