-- Fix roadmap_progress table - add missing columns
-- The useRoadmapProgress hook expects these columns

-- Add completion_checks column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'roadmap_progress'
        AND column_name = 'completion_checks'
    ) THEN
        ALTER TABLE roadmap_progress ADD COLUMN completion_checks JSONB DEFAULT '{}';
    END IF;
END $$;

-- Add view_mode column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'roadmap_progress'
        AND column_name = 'view_mode'
    ) THEN
        ALTER TABLE roadmap_progress ADD COLUMN view_mode TEXT DEFAULT 'full';
    END IF;
END $$;

-- Add has_seen_intro column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'roadmap_progress'
        AND column_name = 'has_seen_intro'
    ) THEN
        ALTER TABLE roadmap_progress ADD COLUMN has_seen_intro BOOLEAN DEFAULT false;
    END IF;
END $$;

-- Create table if it doesn't exist at all
CREATE TABLE IF NOT EXISTS roadmap_progress (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    completed_builds TEXT[] DEFAULT '{}',
    completion_checks JSONB DEFAULT '{}',
    view_mode TEXT DEFAULT 'full',
    has_seen_intro BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id)
);

-- Enable RLS
ALTER TABLE roadmap_progress ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to recreate them
DROP POLICY IF EXISTS "Users can view own roadmap progress" ON roadmap_progress;
DROP POLICY IF EXISTS "Users can insert own roadmap progress" ON roadmap_progress;
DROP POLICY IF EXISTS "Users can update own roadmap progress" ON roadmap_progress;
DROP POLICY IF EXISTS "Coaches can view client roadmap progress" ON roadmap_progress;

-- Users can view their own progress
CREATE POLICY "Users can view own roadmap progress" ON roadmap_progress
    FOR SELECT USING (auth.uid() = user_id);

-- Users can insert their own progress
CREATE POLICY "Users can insert own roadmap progress" ON roadmap_progress
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can update their own progress
CREATE POLICY "Users can update own roadmap progress" ON roadmap_progress
    FOR UPDATE USING (auth.uid() = user_id);

-- Coaches can view their clients' roadmap progress
CREATE POLICY "Coaches can view client roadmap progress" ON roadmap_progress
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM businesses b
            WHERE b.assigned_coach_id = auth.uid()
            AND b.owner_id = roadmap_progress.user_id
        )
    );
