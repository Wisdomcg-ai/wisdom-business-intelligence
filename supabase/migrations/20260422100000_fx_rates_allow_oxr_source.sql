-- Allow 'oxr' (Open Exchange Rates) as a valid fx_rates source.
-- The original constraint only permitted 'manual' and 'rba'.

ALTER TABLE fx_rates
  DROP CONSTRAINT fx_rates_source_check;

ALTER TABLE fx_rates
  ADD CONSTRAINT fx_rates_source_check
  CHECK (source IN ('manual', 'rba', 'oxr'));
