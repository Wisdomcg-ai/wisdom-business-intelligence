-- Fix Custom KPIs Library Foreign Keys
-- Date: 2025-12-08
-- Problem: created_by references profiles(id), but user may not have a profiles row
-- Solution: Reference auth.users(id) directly instead

-- Drop existing foreign key constraint on created_by
ALTER TABLE custom_kpis_library
DROP CONSTRAINT IF EXISTS custom_kpis_library_created_by_fkey;

-- Add new foreign key referencing auth.users directly
ALTER TABLE custom_kpis_library
ADD CONSTRAINT custom_kpis_library_created_by_fkey
FOREIGN KEY (created_by) REFERENCES auth.users(id);

-- Also fix approved_by if it has the same issue
ALTER TABLE custom_kpis_library
DROP CONSTRAINT IF EXISTS custom_kpis_library_approved_by_fkey;

ALTER TABLE custom_kpis_library
ADD CONSTRAINT custom_kpis_library_approved_by_fkey
FOREIGN KEY (approved_by) REFERENCES auth.users(id);

-- Verify the table structure
COMMENT ON TABLE custom_kpis_library IS 'Custom KPIs library - created_by and approved_by now reference auth.users directly';
