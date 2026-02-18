-- Create xero_pl_lines table
-- Stores P&L account data synced from Xero with monthly values
-- Populated by /api/Xero/sync-all (daily cron) and /api/monthly-report/sync-xero (manual)

CREATE TABLE IF NOT EXISTS public.xero_pl_lines (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  account_name text NOT NULL,
  account_type text,         -- 'revenue', 'cogs', 'opex', 'other_income', 'other_expense', 'other'
  section text,              -- Original Xero section title (e.g. 'Income', 'Cost of Sales')
  monthly_values jsonb,      -- { "2024-07": 10000, "2024-08": 12000, ... }
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_xero_pl_lines_business ON xero_pl_lines(business_id);

-- RLS: same pattern as other business-scoped tables
ALTER TABLE xero_pl_lines ENABLE ROW LEVEL SECURITY;

-- Service role key bypasses RLS, so this policy is for authenticated users
CREATE POLICY "xero_pl_lines_access" ON xero_pl_lines
  FOR ALL TO authenticated
  USING (
    auth_is_super_admin()
    OR business_id = ANY(auth_get_accessible_business_ids())
  )
  WITH CHECK (
    auth_is_super_admin()
    OR auth_can_manage_business(business_id)
  );
