-- =====================================================
-- ONBOARDING WIZARD DATABASE UPDATES
-- Run this in your Supabase SQL Editor
-- Adds columns needed for coach client onboarding
-- =====================================================

-- =====================================================
-- SECTION 1: ADD NEW COLUMNS TO BUSINESSES TABLE
-- =====================================================
ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS industry TEXT,
  ADD COLUMN IF NOT EXISTS website TEXT,
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS program_type TEXT,
  ADD COLUMN IF NOT EXISTS session_frequency TEXT,
  ADD COLUMN IF NOT EXISTS custom_frequency TEXT,
  ADD COLUMN IF NOT EXISTS engagement_start_date DATE,
  ADD COLUMN IF NOT EXISTS enabled_modules JSONB DEFAULT '{}'::jsonb;


-- =====================================================
-- SECTION 2: BUSINESS CONTACTS TABLE
-- For storing owner/primary contact info
-- =====================================================
CREATE TABLE IF NOT EXISTS public.business_contacts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id UUID REFERENCES public.businesses(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  role TEXT DEFAULT 'Owner',
  is_primary BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.business_contacts ENABLE ROW LEVEL SECURITY;

-- Policy: Coaches can view contacts for their clients
DROP POLICY IF EXISTS "Coaches can view client contacts" ON public.business_contacts;
CREATE POLICY "Coaches can view client contacts"
  ON public.business_contacts FOR SELECT
  USING (
    business_id IN (
      SELECT id FROM public.businesses WHERE assigned_coach_id = auth.uid()
    )
  );

-- Policy: Coaches can manage contacts for their clients
DROP POLICY IF EXISTS "Coaches can manage client contacts" ON public.business_contacts;
CREATE POLICY "Coaches can manage client contacts"
  ON public.business_contacts FOR ALL
  USING (
    business_id IN (
      SELECT id FROM public.businesses WHERE assigned_coach_id = auth.uid()
    )
  );

-- Policy: Clients can view their own contacts
DROP POLICY IF EXISTS "Clients can view their contacts" ON public.business_contacts;
CREATE POLICY "Clients can view their contacts"
  ON public.business_contacts FOR SELECT
  USING (
    business_id IN (
      SELECT business_id FROM public.business_users WHERE user_id = auth.uid()
    )
  );


-- =====================================================
-- SECTION 3: UPDATE BUSINESS_PROFILES FOR PRE-POPULATION
-- Add fields that can be pre-populated from onboarding
-- =====================================================
ALTER TABLE public.business_profiles
  ADD COLUMN IF NOT EXISTS business_name TEXT,
  ADD COLUMN IF NOT EXISTS industry TEXT,
  ADD COLUMN IF NOT EXISTS website TEXT,
  ADD COLUMN IF NOT EXISTS profile_completed BOOLEAN DEFAULT FALSE;

-- Make user_id nullable so coaches can create placeholder profiles
ALTER TABLE public.business_profiles
  ALTER COLUMN user_id DROP NOT NULL;


-- =====================================================
-- SECTION 4: UPDATE RLS FOR COACHES TO INSERT PROFILES
-- =====================================================

-- Allow coaches to insert business_profiles for their clients
DROP POLICY IF EXISTS "Coaches can insert client profiles" ON public.business_profiles;
CREATE POLICY "Coaches can insert client profiles"
  ON public.business_profiles FOR INSERT
  WITH CHECK (
    business_id IN (
      SELECT id FROM public.businesses WHERE assigned_coach_id = auth.uid()
    )
  );

-- Allow coaches to view client profiles
DROP POLICY IF EXISTS "Coaches can view client profiles" ON public.business_profiles;
CREATE POLICY "Coaches can view client profiles"
  ON public.business_profiles FOR SELECT
  USING (
    business_id IN (
      SELECT id FROM public.businesses WHERE assigned_coach_id = auth.uid()
    )
  );


-- =====================================================
-- SECTION 5: UPDATE BUSINESSES RLS FOR COACHES
-- =====================================================

-- Allow coaches to insert new businesses
DROP POLICY IF EXISTS "Coaches can insert businesses" ON public.businesses;
CREATE POLICY "Coaches can insert businesses"
  ON public.businesses FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.system_roles
      WHERE user_id = auth.uid()
      AND role IN ('coach', 'super_admin')
    )
  );

-- Allow coaches to view their assigned businesses
DROP POLICY IF EXISTS "Coaches can view their businesses" ON public.businesses;
CREATE POLICY "Coaches can view their businesses"
  ON public.businesses FOR SELECT
  USING (
    assigned_coach_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.system_roles
      WHERE user_id = auth.uid()
      AND role = 'super_admin'
    )
  );

-- Allow coaches to update their assigned businesses
DROP POLICY IF EXISTS "Coaches can update their businesses" ON public.businesses;
CREATE POLICY "Coaches can update their businesses"
  ON public.businesses FOR UPDATE
  USING (
    assigned_coach_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.system_roles
      WHERE user_id = auth.uid()
      AND role = 'super_admin'
    )
  );


-- =====================================================
-- SECTION 6: INDEXES
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_business_contacts_business_id ON public.business_contacts(business_id);
CREATE INDEX IF NOT EXISTS idx_business_profiles_business_id ON public.business_profiles(business_id);


-- =====================================================
-- DONE!
-- These changes support the coach onboarding wizard
-- =====================================================
