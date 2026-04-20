-- Phase 13: Year Type Foundation
-- Add configurable fiscal year start month to business_profiles
-- and fiscal_year column to strategic_initiatives

-- 1. Add fiscal_year_start to business_profiles
-- 1-12 representing the starting calendar month (7 = July for AU FY, 1 = January for CY)
ALTER TABLE business_profiles
  ADD COLUMN IF NOT EXISTS fiscal_year_start INTEGER DEFAULT 7
    CHECK (fiscal_year_start >= 1 AND fiscal_year_start <= 12);

COMMENT ON COLUMN business_profiles.fiscal_year_start IS
  'Month number (1-12) when the fiscal year begins. 7=July (AU FY), 1=January (CY).';

-- 2. Add fiscal_year to strategic_initiatives
ALTER TABLE strategic_initiatives
  ADD COLUMN IF NOT EXISTS fiscal_year INTEGER;

COMMENT ON COLUMN strategic_initiatives.fiscal_year IS
  'The fiscal year this initiative belongs to (e.g., 2026 for FY2026).';
