-- =====================================================
-- BASELINE SCHEMA (Minimal Prerequisites)
-- =====================================================
-- This creates ONLY the core tables that other migrations
-- reference but don't create themselves.
-- =====================================================

-- =====================================================
-- SYSTEM ROLES TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS system_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('super_admin', 'coach', 'client')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, role)
);

ALTER TABLE system_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "temp_allow_all" ON system_roles FOR ALL TO authenticated USING (true);

-- =====================================================
-- USERS TABLE (public mirror of auth.users)
-- =====================================================
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE,
    first_name TEXT,
    last_name TEXT,
    avatar_url TEXT,
    system_role TEXT DEFAULT 'client',
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "temp_allow_all" ON users FOR ALL TO authenticated USING (true);

-- =====================================================
-- BUSINESSES TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS businesses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_name TEXT NOT NULL,
    owner_id UUID REFERENCES auth.users(id),
    owner_email TEXT,
    assigned_coach_id UUID REFERENCES auth.users(id),
    industry TEXT,
    description TEXT,
    website TEXT,
    phone TEXT,
    address TEXT,
    city TEXT,
    state TEXT,
    country TEXT,
    postal_code TEXT,
    logo_url TEXT,
    timezone TEXT DEFAULT 'Australia/Sydney',
    currency TEXT DEFAULT 'AUD',
    financial_year_end_month INT DEFAULT 6,
    employee_count INT,
    annual_revenue DECIMAL,
    stage TEXT DEFAULT 'onboarding',
    status TEXT DEFAULT 'active',
    onboarding_completed BOOLEAN DEFAULT FALSE,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "temp_allow_all" ON businesses FOR ALL TO authenticated USING (true);

-- =====================================================
-- BUSINESS PROFILES TABLE
-- Referenced by xero_connections and financial_forecasts
-- =====================================================
CREATE TABLE IF NOT EXISTS business_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
    legal_name TEXT,
    trading_name TEXT,
    abn TEXT,
    acn TEXT,
    primary_contact_name TEXT,
    primary_contact_email TEXT,
    primary_contact_phone TEXT,
    default_tax_rate DECIMAL DEFAULT 10,
    payment_terms INT DEFAULT 30,
    vision TEXT,
    mission TEXT,
    values TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE business_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "temp_allow_all" ON business_profiles FOR ALL TO authenticated USING (true);

-- =====================================================
-- BUSINESS USERS TABLE (Team Members)
-- =====================================================
CREATE TABLE IF NOT EXISTS business_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT,
    role TEXT DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
    status TEXT DEFAULT 'invited' CHECK (status IN ('invited', 'active', 'inactive', 'removed')),
    section_permissions JSONB DEFAULT '{}',
    invited_by UUID REFERENCES auth.users(id),
    invited_at TIMESTAMPTZ DEFAULT NOW(),
    joined_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE business_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "temp_allow_all" ON business_users FOR ALL TO authenticated USING (true);

-- =====================================================
-- DONE - Other tables will be created by migrations
-- =====================================================
DO $$
BEGIN
    RAISE NOTICE 'Minimal baseline schema created - core tables only';
END $$;
