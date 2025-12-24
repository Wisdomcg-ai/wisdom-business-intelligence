-- Fix xero_connections foreign key to reference 'businesses' table instead of 'business_profiles'
-- The code uses 'businesses' table but FK was pointing to 'business_profiles'

-- First, drop the existing foreign key constraint
ALTER TABLE xero_connections
  DROP CONSTRAINT IF EXISTS xero_connections_business_id_fkey;

-- Add the correct foreign key referencing 'businesses' table
ALTER TABLE xero_connections
  ADD CONSTRAINT xero_connections_business_id_fkey
  FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;

-- Also fix user_id FK if needed (should reference profiles or auth.users)
-- The current constraint references auth.users which is correct
