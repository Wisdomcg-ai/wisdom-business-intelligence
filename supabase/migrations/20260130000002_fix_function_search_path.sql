-- Fix function search_path security warnings
-- These trigger functions auto-update `updated_at` columns
-- Adding search_path doesn't change behavior - just hardens security
-- ZERO user impact

-- Fix update_updated_at_column
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

-- Fix update_subscription_budgets_updated_at
CREATE OR REPLACE FUNCTION public.update_subscription_budgets_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;
