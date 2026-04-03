-- =====================================================
-- ADD MISSING COLUMNS TO BUSINESS_PROFILES
-- These columns are used by the business profile page
-- =====================================================

ALTER TABLE public.business_profiles
  ADD COLUMN IF NOT EXISTS company_name TEXT,
  ADD COLUMN IF NOT EXISTS name TEXT,
  ADD COLUMN IF NOT EXISTS years_in_operation INTEGER,
  ADD COLUMN IF NOT EXISTS employee_count INTEGER,
  ADD COLUMN IF NOT EXISTS annual_revenue NUMERIC(15,2),
  ADD COLUMN IF NOT EXISTS gross_profit NUMERIC(15,2),
  ADD COLUMN IF NOT EXISTS gross_profit_margin NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS net_profit NUMERIC(15,2),
  ADD COLUMN IF NOT EXISTS net_profit_margin NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS cash_in_bank NUMERIC(15,2),
  ADD COLUMN IF NOT EXISTS owner_info JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS key_roles JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS contractors_count INTEGER,
  ADD COLUMN IF NOT EXISTS reporting_structure TEXT,
  ADD COLUMN IF NOT EXISTS top_challenges TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS growth_opportunities TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS current_priorities TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS social_media JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS locations TEXT[] DEFAULT '{}';

-- Add comments for documentation
COMMENT ON COLUMN public.business_profiles.company_name IS 'Display name of the business';
COMMENT ON COLUMN public.business_profiles.owner_info IS 'JSON object containing owner details (owner_name, owner_email, owner_phone, owner_role, ownership_percentage)';
COMMENT ON COLUMN public.business_profiles.key_roles IS 'JSON array of key roles [{title, name, status}]';
COMMENT ON COLUMN public.business_profiles.locations IS 'Array of business locations or service areas';
COMMENT ON COLUMN public.business_profiles.social_media IS 'JSON object containing social media links (linkedin, facebook, instagram, twitter)';
