-- =====================================================
-- CREATE JESSICA MOLLOY AS OH NINE PARTNER
-- =====================================================
-- Run this in Supabase Dashboard > SQL Editor
--
-- STEP 1: First create Jessica in Authentication tab:
--   1. Go to Authentication > Users > Add User
--   2. Email: jessica@ohnine.com.au
--   3. Password: (your chosen secure password)
--   4. Check "Auto-confirm" email
--   5. Click "Create user"
--   6. Copy her User UID from the Users list
--
-- STEP 2: Then run this SQL with her User UID:
-- =====================================================

-- Replace these values:
-- JESSICA_AUTH_ID = The UUID you copied from step 1

DO $$
DECLARE
  v_jessica_id UUID := 'PASTE_JESSICA_AUTH_ID_HERE';  -- <- Replace this!
  v_oh_nine_business_id UUID;
BEGIN
  -- Find Oh Nine business
  SELECT id INTO v_oh_nine_business_id
  FROM businesses
  WHERE business_name ILIKE '%oh%nine%'
     OR business_name ILIKE '%ohnine%'
  LIMIT 1;

  IF v_oh_nine_business_id IS NULL THEN
    RAISE EXCEPTION 'Could not find Oh Nine business!';
  END IF;

  RAISE NOTICE 'Found Oh Nine business: %', v_oh_nine_business_id;

  -- 1. Create or update user in public.users table
  INSERT INTO users (id, email, first_name, last_name, created_at, updated_at)
  VALUES (
    v_jessica_id,
    'jessica@ohnine.com.au',
    'Jessica',
    'Molloy',
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    first_name = 'Jessica',
    last_name = 'Molloy',
    updated_at = NOW();

  RAISE NOTICE 'Created/updated user record';

  -- 2. Set system role as client
  INSERT INTO system_roles (user_id, role, created_at)
  VALUES (v_jessica_id, 'client', NOW())
  ON CONFLICT (user_id) DO UPDATE SET
    role = 'client';

  RAISE NOTICE 'Set system role to client';

  -- 3. Add to business_users with admin role (full partner access)
  INSERT INTO business_users (
    business_id,
    user_id,
    role,
    status,
    section_permissions,
    invited_at
  )
  VALUES (
    v_oh_nine_business_id,
    v_jessica_id,
    'admin',  -- Full access as partner
    'active',
    '{
      "dashboard": true,
      "weekly_reviews": true,
      "forecasts": true,
      "finances": true,
      "team": true,
      "settings": true,
      "business_plan": true,
      "business_engines": true,
      "coaching": true
    }'::jsonb,
    NOW()
  )
  ON CONFLICT (business_id, user_id) DO UPDATE SET
    role = 'admin',
    status = 'active',
    section_permissions = '{
      "dashboard": true,
      "weekly_reviews": true,
      "forecasts": true,
      "finances": true,
      "team": true,
      "settings": true,
      "business_plan": true,
      "business_engines": true,
      "coaching": true
    }'::jsonb;

  RAISE NOTICE 'Added Jessica to Oh Nine business as admin';
  RAISE NOTICE '✅ SUCCESS! Jessica Molloy can now log in and access Oh Nine';
END $$;

-- =====================================================
-- VERIFICATION QUERIES (run after the above)
-- =====================================================

-- Check Jessica's user record:
SELECT id, email, first_name, last_name
FROM users
WHERE email = 'jessica@ohnine.com.au';

-- Check Jessica's system role:
SELECT user_id, role
FROM system_roles
WHERE user_id IN (SELECT id FROM users WHERE email = 'jessica@ohnine.com.au');

-- Check Jessica's business access:
SELECT
  b.business_name,
  bu.role,
  bu.status,
  bu.section_permissions
FROM business_users bu
JOIN businesses b ON b.id = bu.business_id
WHERE bu.user_id IN (SELECT id FROM users WHERE email = 'jessica@ohnine.com.au');
