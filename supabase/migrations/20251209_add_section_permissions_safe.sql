-- Safe migration: Add section_permissions column to business_users and team_invites tables
-- This version checks for table existence and handles errors gracefully

-- First, ensure business_users table exists (it should from coach_portal_tables migration)
DO $$
BEGIN
    -- Check if business_users table exists
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'business_users') THEN
        -- Add section_permissions column if it doesn't exist
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public'
            AND table_name = 'business_users'
            AND column_name = 'section_permissions'
        ) THEN
            ALTER TABLE public.business_users
            ADD COLUMN section_permissions JSONB DEFAULT '{
              "business_plan": true,
              "my_business": true,
              "vision_mission": true,
              "roadmap": true,
              "goals_rocks": true,
              "one_page_plan": true,
              "financial": true,
              "financial_forecast": true,
              "financial_dashboard": true,
              "execute": true,
              "kpi_dashboard": true,
              "weekly_review": true,
              "quarterly_review": true,
              "actions": true,
              "messages": true
            }'::jsonb;

            RAISE NOTICE 'Added section_permissions column to business_users';
        ELSE
            RAISE NOTICE 'section_permissions column already exists in business_users';
        END IF;
    ELSE
        RAISE NOTICE 'business_users table does not exist - you may need to run coach_portal_tables migration first';
    END IF;
END $$;

-- Add to team_invites if it exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'team_invites') THEN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public'
            AND table_name = 'team_invites'
            AND column_name = 'section_permissions'
        ) THEN
            ALTER TABLE public.team_invites
            ADD COLUMN section_permissions JSONB DEFAULT '{
              "business_plan": true,
              "my_business": true,
              "vision_mission": true,
              "roadmap": true,
              "goals_rocks": true,
              "one_page_plan": true,
              "financial": false,
              "financial_forecast": false,
              "financial_dashboard": false,
              "execute": true,
              "kpi_dashboard": true,
              "weekly_review": true,
              "quarterly_review": true,
              "actions": true,
              "messages": true
            }'::jsonb;

            RAISE NOTICE 'Added section_permissions column to team_invites';
        ELSE
            RAISE NOTICE 'section_permissions column already exists in team_invites';
        END IF;
    ELSE
        RAISE NOTICE 'team_invites table does not exist - skipping';
    END IF;
END $$;

-- Add comments if columns exist
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'business_users'
        AND column_name = 'section_permissions'
    ) THEN
        COMMENT ON COLUMN public.business_users.section_permissions IS
        'JSON object controlling which sidebar sections this user can access';
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'team_invites'
        AND column_name = 'section_permissions'
    ) THEN
        COMMENT ON COLUMN public.team_invites.section_permissions IS
        'JSON object controlling which sidebar sections this invited user will be able to access once they accept';
    END IF;
END $$;
