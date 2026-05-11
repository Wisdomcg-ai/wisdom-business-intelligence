-- Phase 63: capture the renewal month for annually-paid subscriptions.
--
-- Subscriptions paid annually (e.g. Adobe $1,200/yr) currently get smoothed
-- into a monthly_budget of $100/mo for forecasting purposes. That's correct
-- for P&L but wrong for cashflow — the $1,200 actually hits in ONE month,
-- not 12. Persisting the renewal month enables (now) native-rhythm display
-- in Step 5 and (later, Phase 64) accurate cashflow bursting.
--
-- NULL means "not annual / month doesn't apply" (monthly, quarterly, ad-hoc).

ALTER TABLE public.subscription_budgets
  ADD COLUMN IF NOT EXISTS renewal_month smallint;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'subscription_budgets_renewal_month_check'
  ) THEN
    ALTER TABLE public.subscription_budgets
      ADD CONSTRAINT subscription_budgets_renewal_month_check
      CHECK (renewal_month IS NULL OR (renewal_month >= 1 AND renewal_month <= 12));
  END IF;
END $$;

COMMENT ON COLUMN public.subscription_budgets.renewal_month IS
  'Calendar month (1-12) the annual subscription renews. NULL when frequency != ''annual''. Used for native-rhythm display + cashflow burst.';
