-- A subscription can bill every six months.
--
-- The frequency list was monthly / quarterly / annual / ad-hoc, so a half-yearly
-- vendor had to be recorded as something it is not: annual understates the
-- month it renews in by half, and monthly smooths away the lump entirely. The
-- renewal-month field the annual path already carries makes the six-month
-- rhythm expressible; only the vocabulary was missing.
alter table public.subscription_budgets
  drop constraint if exists subscription_budgets_frequency_check;

alter table public.subscription_budgets
  add constraint subscription_budgets_frequency_check
  check (frequency = any (array['monthly'::text, 'quarterly'::text, 'bi-annual'::text, 'annual'::text, 'ad-hoc'::text]));
