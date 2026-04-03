-- Add missing columns to existing tables
-- Run this BEFORE the other migrations if you get "column does not exist" errors

-- Add business_profile_id to business_kpis if missing
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'business_kpis' AND column_name = 'business_profile_id') THEN
    ALTER TABLE business_kpis ADD COLUMN business_profile_id UUID;
  END IF;
END $$;

-- Add business_profile_id to business_financial_goals if missing
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'business_financial_goals' AND column_name = 'business_profile_id') THEN
    ALTER TABLE business_financial_goals ADD COLUMN business_profile_id UUID;
  END IF;
END $$;

-- Add business_id columns where missing
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'business_kpis' AND column_name = 'business_id') THEN
    ALTER TABLE business_kpis ADD COLUMN business_id UUID;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'business_profiles' AND column_name = 'business_id') THEN
    ALTER TABLE business_profiles ADD COLUMN business_id UUID;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'strategy_data' AND column_name = 'business_id') THEN
    ALTER TABLE strategy_data ADD COLUMN business_id UUID;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'open_loops' AND column_name = 'business_id') THEN
    ALTER TABLE open_loops ADD COLUMN business_id UUID;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'issues_list' AND column_name = 'business_id') THEN
    ALTER TABLE issues_list ADD COLUMN business_id UUID;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'marketing_data' AND column_name = 'business_id') THEN
    ALTER TABLE marketing_data ADD COLUMN business_id UUID;
  END IF;
END $$;

-- Add user_id to business_profiles if missing
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'business_profiles' AND column_name = 'user_id') THEN
    ALTER TABLE business_profiles ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Add user_id to strategy_data if missing
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'strategy_data' AND column_name = 'user_id') THEN
    ALTER TABLE strategy_data ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Add user_id to swot_analyses if missing
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'swot_analyses' AND column_name = 'user_id') THEN
    ALTER TABLE swot_analyses ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Add user_id to business_kpis if missing
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'business_kpis' AND column_name = 'user_id') THEN
    ALTER TABLE business_kpis ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Add user_id to business_financial_goals if missing
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'business_financial_goals' AND column_name = 'user_id') THEN
    ALTER TABLE business_financial_goals ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Add user_id to open_loops if missing
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'open_loops' AND column_name = 'user_id') THEN
    ALTER TABLE open_loops ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Add user_id to issues_list if missing
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'issues_list' AND column_name = 'user_id') THEN
    ALTER TABLE issues_list ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Add user_id to vision_targets if missing
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'vision_targets' AND column_name = 'user_id') THEN
    ALTER TABLE vision_targets ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Add user_id to weekly_metrics_snapshots if missing
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'weekly_metrics_snapshots' AND column_name = 'user_id') THEN
    ALTER TABLE weekly_metrics_snapshots ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Add user_id to annual_targets if missing
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'annual_targets' AND column_name = 'user_id') THEN
    ALTER TABLE annual_targets ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Add user_id to user_kpis if missing
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_kpis' AND column_name = 'user_id') THEN
    ALTER TABLE user_kpis ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Add user_id to marketing_data if missing
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'marketing_data' AND column_name = 'user_id') THEN
    ALTER TABLE marketing_data ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Create indexes on new user_id columns (if not exists)
CREATE INDEX IF NOT EXISTS idx_business_profiles_user_id ON business_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_strategy_data_user_id ON strategy_data(user_id);
CREATE INDEX IF NOT EXISTS idx_swot_analyses_user_id ON swot_analyses(user_id);
CREATE INDEX IF NOT EXISTS idx_business_kpis_user_id ON business_kpis(user_id);
CREATE INDEX IF NOT EXISTS idx_business_financial_goals_user ON business_financial_goals(user_id);
CREATE INDEX IF NOT EXISTS idx_open_loops_user_id ON open_loops(user_id);
CREATE INDEX IF NOT EXISTS idx_issues_list_user_id ON issues_list(user_id);
CREATE INDEX IF NOT EXISTS idx_vision_targets_user_id ON vision_targets(user_id);
CREATE INDEX IF NOT EXISTS idx_weekly_metrics_user ON weekly_metrics_snapshots(user_id);
CREATE INDEX IF NOT EXISTS idx_annual_targets_user ON annual_targets(user_id);
CREATE INDEX IF NOT EXISTS idx_user_kpis_user_id ON user_kpis(user_id);
CREATE INDEX IF NOT EXISTS idx_marketing_data_user_id ON marketing_data(user_id);
