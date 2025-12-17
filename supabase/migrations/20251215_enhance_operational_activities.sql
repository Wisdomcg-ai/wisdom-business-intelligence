-- Migration: Enhance operational_activities table for Operational Rhythm feature
-- Adds new columns for habit management: name, frequency, recommended_frequency, source

-- Add columns if they don't exist (safe migration)
DO $$
BEGIN
    -- Add name column for habit name
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'operational_activities' AND column_name = 'name'
    ) THEN
        ALTER TABLE operational_activities ADD COLUMN name TEXT;
    END IF;

    -- Add frequency column for user-selected frequency
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'operational_activities' AND column_name = 'frequency'
    ) THEN
        ALTER TABLE operational_activities ADD COLUMN frequency TEXT;
    END IF;

    -- Add recommended_frequency column for suggested frequency
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'operational_activities' AND column_name = 'recommended_frequency'
    ) THEN
        ALTER TABLE operational_activities ADD COLUMN recommended_frequency TEXT;
    END IF;

    -- Add source column to track origin (suggested, custom, step2)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'operational_activities' AND column_name = 'source'
    ) THEN
        ALTER TABLE operational_activities ADD COLUMN source TEXT DEFAULT 'custom';
    END IF;

    -- Add function_id column (engine ID like 'attract', 'convert', etc.)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'operational_activities' AND column_name = 'function_id'
    ) THEN
        ALTER TABLE operational_activities ADD COLUMN function_id TEXT;
    END IF;

    -- Add order_index column for ordering
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'operational_activities' AND column_name = 'order_index'
    ) THEN
        ALTER TABLE operational_activities ADD COLUMN order_index INTEGER DEFAULT 0;
    END IF;

    -- Add updated_at column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'operational_activities' AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE operational_activities ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
    END IF;

    -- Add description column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'operational_activities' AND column_name = 'description'
    ) THEN
        ALTER TABLE operational_activities ADD COLUMN description TEXT;
    END IF;

    -- Add assigned_to column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'operational_activities' AND column_name = 'assigned_to'
    ) THEN
        ALTER TABLE operational_activities ADD COLUMN assigned_to TEXT;
    END IF;
END $$;

-- Add comment explaining the table purpose
COMMENT ON TABLE operational_activities IS 'Stores operational rhythm habits/activities for each business';
COMMENT ON COLUMN operational_activities.name IS 'The name of the operational habit';
COMMENT ON COLUMN operational_activities.frequency IS 'User-selected frequency (daily, 3x_week, weekly, fortnightly, monthly, quarterly)';
COMMENT ON COLUMN operational_activities.recommended_frequency IS 'System-recommended frequency for suggested habits';
COMMENT ON COLUMN operational_activities.source IS 'Origin of the habit: suggested, custom, or step2';
COMMENT ON COLUMN operational_activities.function_id IS 'Business engine ID (attract, convert, deliver, people, systems, finance, leadership, time)';
