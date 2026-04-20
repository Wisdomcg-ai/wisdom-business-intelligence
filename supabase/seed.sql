-- Preview-branch seed data. Runs on every fresh preview branch and on local
-- `supabase db reset`. Contains ONLY synthetic data — never real client PII.
--
-- Scope: public-schema rows only. We DON'T insert into auth.users here because
-- direct auth.users inserts are fragile (require pgcrypto + bcrypt + matching
-- Supabase auth hooks) and preview branches don't need login capability for
-- the kinds of testing they're used for. Use the SQL Editor with the
-- service_role to exercise things that need a user_id.
--
-- If a future workflow needs seeded logins, create them via the Supabase
-- dashboard's Auth UI on the preview branch (one-click), or scripted via
-- the Admin API with the preview branch's API URL.

BEGIN;

-- ==========================================================================
-- 1. DEMO BUSINESSES (orphaned — no auth.users, but that's fine for schema testing)
-- ==========================================================================
INSERT INTO public.businesses (
  id, name, business_name,
  owner_name, owner_email,
  enabled_modules, status, created_at, updated_at
) VALUES
  (
    '00000000-0000-0000-0000-bbbb00000001',
    'Demo Single-Tenant Co',
    'Demo Single-Tenant Co',
    'Single Owner', 'single@example.com',
    '{"plan": true, "forecast": true, "goals": true, "chat": true, "documents": true}',
    'active', NOW(), NOW()
  ),
  (
    '00000000-0000-0000-0000-bbbb00000002',
    'Demo Consolidation Group',
    'Demo Consolidation Group',
    'Multi Owner', 'multi@example.com',
    '{"plan": true, "forecast": true, "goals": true, "chat": true, "documents": true}',
    'active', NOW(), NOW()
  )
ON CONFLICT (id) DO NOTHING;

-- ==========================================================================
-- 2. MOCK XERO CONNECTIONS (for multi-tenant consolidation UI testing)
-- user_id is nullable-compatible — the FK to auth.users doesn't have to resolve
-- for schema / UI tests; actual OAuth flows will populate real rows.
-- ==========================================================================
-- Use the postgres role as a stable user_id placeholder so the FK is satisfied.
-- If auth.users is empty, these inserts would fail on the FK — so we skip them
-- gracefully.
DO $$
DECLARE
  placeholder_user UUID;
BEGIN
  SELECT id INTO placeholder_user FROM auth.users LIMIT 1;
  IF placeholder_user IS NULL THEN
    RAISE NOTICE 'No auth.users present — skipping xero_connections seed. Create a user via dashboard Auth UI if needed.';
    RETURN;
  END IF;

  INSERT INTO public.xero_connections (
    id, business_id, user_id, tenant_id, tenant_name, display_name,
    display_order, functional_currency, include_in_consolidation,
    access_token, refresh_token, expires_at, is_active, created_at, updated_at
  ) VALUES
    (
      '00000000-0000-0000-0000-cccc00000001',
      '00000000-0000-0000-0000-bbbb00000002',
      placeholder_user,
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
      placeholder_user,
      'tenant-demo-secondary',
      'Demo Secondary Co Pty Ltd',
      'Demo Secondary Co Pty Ltd',
      1, 'AUD', true,
      'seed-placeholder-access', 'seed-placeholder-refresh',
      NOW() + INTERVAL '30 days', true, NOW(), NOW()
    )
  ON CONFLICT (business_id, tenant_id) DO NOTHING;
END $$;

-- ==========================================================================
-- 3. DEMO FX RATES (HKD/AUD — no FKs, always safe)
-- ==========================================================================
INSERT INTO public.fx_rates (currency_pair, rate_type, period, rate, source) VALUES
  ('HKD/AUD', 'monthly_average', '2026-03-01', 0.1925, 'manual'),
  ('HKD/AUD', 'monthly_average', '2026-02-01', 0.1920, 'manual')
ON CONFLICT DO NOTHING;

COMMIT;
