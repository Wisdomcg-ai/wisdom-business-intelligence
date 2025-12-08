-- Create daily_tasks table for To-Do list persistence
-- Replaces localStorage storage with Supabase

CREATE TABLE IF NOT EXISTS daily_tasks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  priority TEXT NOT NULL CHECK (priority IN ('critical', 'important', 'nice-to-do')),
  status TEXT NOT NULL DEFAULT 'to-do' CHECK (status IN ('to-do', 'in-progress', 'done')),
  due_date TEXT NOT NULL CHECK (due_date IN ('today', 'tomorrow', 'this-week', 'next-week', 'custom')),
  specific_date DATE,
  open_loop_id UUID REFERENCES open_loops(id) ON DELETE SET NULL,
  completed_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_daily_tasks_user_id ON daily_tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_daily_tasks_status ON daily_tasks(status);
CREATE INDEX IF NOT EXISTS idx_daily_tasks_created_at ON daily_tasks(created_at);

-- Enable RLS
ALTER TABLE daily_tasks ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own tasks"
  ON daily_tasks FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own tasks"
  ON daily_tasks FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own tasks"
  ON daily_tasks FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own tasks"
  ON daily_tasks FOR DELETE
  USING (auth.uid() = user_id);

-- Add comment
COMMENT ON TABLE daily_tasks IS 'Daily to-do tasks for users, replaces localStorage storage';
