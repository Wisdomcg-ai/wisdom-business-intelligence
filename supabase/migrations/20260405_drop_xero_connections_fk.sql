-- =====================================================
-- DROP FK CONSTRAINT ON xero_connections.business_id
-- =====================================================
-- The xero_connections.business_id was FK'd to business_profiles(id),
-- but the app uses businesses.id universally. Not all businesses have
-- a business_profiles record, causing FK violations on INSERT.
-- The resolveXeroBusinessId utility handles lookup ambiguity at the
-- application level — the FK adds no protection.
-- =====================================================

ALTER TABLE xero_connections DROP CONSTRAINT IF EXISTS xero_connections_business_id_fkey;

-- Also drop any variant constraint names that Supabase might have generated
DO $$
BEGIN
  -- Try common constraint name patterns
  EXECUTE 'ALTER TABLE xero_connections DROP CONSTRAINT IF EXISTS xero_connections_business_id_fkey';
  EXECUTE 'ALTER TABLE xero_connections DROP CONSTRAINT IF EXISTS fk_xero_connections_business_id';
EXCEPTION WHEN OTHERS THEN
  -- Ignore if constraints don't exist
  NULL;
END $$;
