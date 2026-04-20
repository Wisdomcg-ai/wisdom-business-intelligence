-- Preview-branch seed data. Runs automatically when Supabase creates a preview
-- branch for a PR, and locally via `supabase db reset`.
--
-- CRITICAL: This file contains ONLY synthetic/fake data. Never commit real
-- client PII here — it gets applied to every preview branch. If you need
-- realistic data for testing, use fake names and emails at @example.com.
--
-- What this seeds:
--   1. One super_admin user
--   2. One coach user
--   3. One client user (Demo Client Pty Ltd owner)
--   4. One single-tenant business (no consolidation — typical case)
--   5. One multi-tenant business (the "Dragon-style" consolidation case) with
--      2 mock Xero connections for consolidation UI testing

BEGIN;

-- ==========================================================================
-- 1. AUTH USERS
-- ==========================================================================
-- Supabase auth.users allows direct insert via migrations/seeds (admin-only).
-- Passwords are bcrypt-hashed 'demo1234' (dev only).

INSERT INTO auth.users (
  id, instance_id, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, aud, role, created_at, updated_at
) VALUES
  (
    '00000000-0000-0000-0000-aaaa00000001',
    '00000000-0000-0000-0000-000000000000',
    'admin@example.com',
    crypt('demo1234', gen_salt('bf')),
    NOW(),
    '{"provider": "email", "providers": ["email"]}',
    '{"first_name": "Demo", "last_name": "Admin"}',
    'authenticated', 'authenticated', NOW(), NOW()
  ),
  (
    '00000000-0000-0000-0000-aaaa00000002',
    '00000000-0000-0000-0000-000000000000',
    'coach@example.com',
    crypt('demo1234', gen_salt('bf')),
    NOW(),
    '{"provider": "email", "providers": ["email"]}',
    '{"first_name": "Demo", "last_name": "Coach"}',
    'authenticated', 'authenticated', NOW(), NOW()
  ),
  (
    '00000000-0000-0000-0000-aaaa00000003',
    '00000000-0000-0000-0000-000000000000',
    'single@example.com',
    crypt('demo1234', gen_salt('bf')),
    NOW(),
    '{"provider": "email", "providers": ["email"]}',
    '{"first_name": "Single", "last_name": "Owner"}',
    'authenticated', 'authenticated', NOW(), NOW()
  ),
  (
    '00000000-0000-0000-0000-aaaa00000004',
    '00000000-0000-0000-0000-000000000000',
    'multi@example.com',
    crypt('demo1234', gen_salt('bf')),
    NOW(),
    '{"provider": "email", "providers": ["email"]}',
    '{"first_name": "Multi", "last_name": "Owner"}',
    'authenticated', 'authenticated', NOW(), NOW()
  )
ON CONFLICT (id) DO NOTHING;

-- ==========================================================================
-- 2. PUBLIC USERS (mirror rows)
-- ==========================================================================
INSERT INTO public.users (id, email, first_name, last_name, created_at, updated_at) VALUES
  ('00000000-0000-0000-0000-aaaa00000001', 'admin@example.com',  'Demo',   'Admin',  NOW(), NOW()),
  ('00000000-0000-0000-0000-aaaa00000002', 'coach@example.com',  'Demo',   'Coach',  NOW(), NOW()),
  ('00000000-0000-0000-0000-aaaa00000003', 'single@example.com', 'Single', 'Owner',  NOW(), NOW()),
  ('00000000-0000-0000-0000-aaaa00000004', 'multi@example.com',  'Multi',  'Owner',  NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- ==========================================================================
-- 3. SYSTEM ROLES
-- ==========================================================================
INSERT INTO public.system_roles (user_id, role, created_at) VALUES
  ('00000000-0000-0000-0000-aaaa00000001', 'super_admin', NOW()),
  ('00000000-0000-0000-0000-aaaa00000002', 'coach',       NOW()),
  ('00000000-0000-0000-0000-aaaa00000003', 'client',      NOW()),
  ('00000000-0000-0000-0000-aaaa00000004', 'client',      NOW())
ON CONFLICT (user_id) DO NOTHING;

-- ==========================================================================
-- 4. BUSINESSES
-- ==========================================================================
INSERT INTO public.businesses (
  id, name, business_name, owner_id, owner_name, owner_email,
  assigned_coach_id, enabled_modules, status, created_at, updated_at
) VALUES
  (
    '00000000-0000-0000-0000-bbbb00000001',
    'Demo Single-Tenant Co',
    'Demo Single-Tenant Co',
    '00000000-0000-0000-0000-aaaa00000003',
    'Single Owner',
    'single@example.com',
    '00000000-0000-0000-0000-aaaa00000002',
    '{"plan": true, "forecast": true, "goals": true, "chat": true, "documents": true}',
    'active', NOW(), NOW()
  ),
  (
    '00000000-0000-0000-0000-bbbb00000002',
    'Demo Consolidation Group',
    'Demo Consolidation Group',
    '00000000-0000-0000-0000-aaaa00000004',
    'Multi Owner',
    'multi@example.com',
    '00000000-0000-0000-0000-aaaa00000002',
    '{"plan": true, "forecast": true, "goals": true, "chat": true, "documents": true}',
    'active', NOW(), NOW()
  )
ON CONFLICT (id) DO NOTHING;

-- ==========================================================================
-- 5. MOCK XERO CONNECTIONS (for multi-tenant UI testing)
-- ==========================================================================
-- Access/refresh tokens are placeholder gibberish — actual sync calls to Xero
-- will fail, but UI + consolidation engine logic can be exercised end-to-end.
INSERT INTO public.xero_connections (
  id, business_id, user_id, tenant_id, tenant_name, display_name,
  display_order, functional_currency, include_in_consolidation,
  access_token, refresh_token, expires_at, is_active, created_at, updated_at
) VALUES
  (
    '00000000-0000-0000-0000-cccc00000001',
    '00000000-0000-0000-0000-bbbb00000002',
    '00000000-0000-0000-0000-aaaa00000004',
    'tenant-demo-primary',
    'Demo Primary Co Pty Ltd',
    'Demo Primary Co Pty Ltd',
    0, 'AUD', true,
    'seed-placeholder-access', 'seed-placeholder-refresh',
    NOW() + INTERVAL '30 days', true, NOW(), NOW()
  ),
  (
    '00000000-0000-0000-0000-cccc00000002',
    '00000000-0000-0000-0000-bbbb00000002',
    '00000000-0000-0000-0000-aaaa00000004',
    'tenant-demo-secondary',
    'Demo Secondary Co Pty Ltd',
    'Demo Secondary Co Pty Ltd',
    1, 'AUD', true,
    'seed-placeholder-access', 'seed-placeholder-refresh',
    NOW() + INTERVAL '30 days', true, NOW(), NOW()
  )
ON CONFLICT (business_id, tenant_id) DO NOTHING;

-- ==========================================================================
-- 6. DEMO FX RATES (so FX code path compiles cleanly in preview)
-- ==========================================================================
INSERT INTO public.fx_rates (currency_pair, rate_type, period, rate, source) VALUES
  ('HKD/AUD', 'monthly_average', '2026-03-01', 0.1925, 'manual'),
  ('HKD/AUD', 'monthly_average', '2026-02-01', 0.1920, 'manual')
ON CONFLICT DO NOTHING;

COMMIT;

-- Reminder for future contributors:
-- DO NOT add real client data. This file runs on EVERY preview branch.
-- If you need production-like volume, use a separate fixture-generation script.
